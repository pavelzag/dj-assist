from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, Future, TimeoutError as FutureTimeoutError
from pathlib import Path
from typing import Callable, Optional

from tqdm import tqdm

from .db import Database
from .media import build_media_links

SUPPORTED_EXTENSIONS = {".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aiff", ".aif"}

_EMPTY_PREVIEWS: dict = {
    "youtube_url": "", "spotify_url": "", "spotify_preview_url": "",
    "spotify_uri": "", "spotify_id": "", "spotify_tempo": 0.0,
    "spotify_key": "", "spotify_mode": "", "album_art_url": "",
    "spotify_album_name": "", "spotify_match_score": 0.0,
    "spotify_high_confidence": False, "spotify_debug": "",
    "spotify_track_number": 0, "spotify_release_year": 0,
    "acoustid_artist": "", "acoustid_title": "", "acoustid_album": "",
    "acoustid_match_score": 0.0, "acoustid_id": "", "acoustid_recording_id": "",
    "acoustid_debug": "",
}

# Max seconds to wait for Spotify before skipping it for a given track.
_SPOTIFY_TIMEOUT = float(os.getenv("SPOTIFY_TIMEOUT", "3"))
_SPOTIFY_TIMEOUT_STREAK_LIMIT = int(os.getenv("SPOTIFY_TIMEOUT_STREAK_LIMIT", "3"))
_ANALYSIS_SUBPROCESS_TIMEOUT = float(os.getenv("ANALYSIS_SUBPROCESS_TIMEOUT", "180"))

_UNKNOWN_ARTIST_VALUES = {"unknown", "unknown artist", "various artists"}
_UPPERCASE_TOKENS = {"DJ", "MC", "UK", "USA", "EDM", "RNB", "EP", "LP", "VIP", "ID"}
_FAST_GENRE_KEYWORDS = {
    "psy", "psytrance", "goa", "fullon", "full on", "darkpsy", "suomisaundi",
    "progressive trance", "trance", "forest", "twilight", "morning", "nitzhonot",
}


def get_file_hash(filepath: str) -> str:
    hash_md5 = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()


def _file_signature(filepath: str) -> tuple[int, float]:
    stat_result = os.stat(filepath)
    return int(stat_result.st_size), float(stat_result.st_mtime)


def _same_file_signature(existing, file_size: int, file_mtime: float) -> bool:
    try:
        existing_size = getattr(existing, "file_size", None)
        existing_mtime = getattr(existing, "file_mtime", None)
        if existing_size is None or existing_mtime is None:
            return False
        return int(existing_size) == int(file_size) and abs(float(existing_mtime) - float(file_mtime)) < 1e-6
    except Exception:
        return False


def _run_isolated_analysis(filepath: str, bpm_lookup: str, auto_double_bpm: bool) -> dict:
    command = [
        sys.executable,
        "-m",
        "dj_assist.cli",
        "analyze-file",
        filepath,
        "--bpm-lookup",
        bpm_lookup,
    ]
    if auto_double_bpm:
        command.append("--auto-double")

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=_ANALYSIS_SUBPROCESS_TIMEOUT,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {
            "bpm": 0.0,
            "bpm_source": "",
            "bpm_error": "analysis_timeout",
            "bpm_confidence": 0.0,
            "decode_failed": True,
            "key": "",
            "key_numeric": "",
            "debug": "analysis_subprocess=timeout",
        }
    except Exception as exc:
        return {
            "bpm": 0.0,
            "bpm_source": "",
            "bpm_error": "analysis_subprocess_error",
            "bpm_confidence": 0.0,
            "decode_failed": True,
            "key": "",
            "key_numeric": "",
            "debug": f"analysis_subprocess_error={exc}",
        }

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        detail = stderr or stdout or f"exit={result.returncode}"
        return {
            "bpm": 0.0,
            "bpm_source": "",
            "bpm_error": "analysis_subprocess_failed",
            "bpm_confidence": 0.0,
            "decode_failed": True,
            "key": "",
            "key_numeric": "",
            "debug": f"analysis_subprocess_failed={detail}",
        }

    try:
        payload = json.loads(result.stdout)
        payload["debug"] = ""
        return payload
    except Exception as exc:
        return {
            "bpm": 0.0,
            "bpm_source": "",
            "bpm_error": "analysis_subprocess_invalid_json",
            "bpm_confidence": 0.0,
            "decode_failed": True,
            "key": "",
            "key_numeric": "",
            "debug": f"analysis_subprocess_invalid_json={exc}",
        }


def _tag_value(tags, *keys: str) -> Optional[str]:
    if not tags:
        return None
    for key in keys:
        value = tags.get(key)
        if value:
            item = value[0] if isinstance(value, list) else value
            return str(item)
    return None


def _normalize_artist(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    cleaned = value.strip()
    if cleaned.lower() in _UNKNOWN_ARTIST_VALUES:
        return None
    return cleaned or None


def _normalize_text(value: Optional[str]) -> str:
    if not value:
        return ""
    value = value.lower()
    value = re.sub(r"\([^)]*\)", " ", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _looks_like_fast_genre(*values: Optional[str]) -> bool:
    haystack = " ".join(_normalize_text(value) for value in values if value).strip()
    if not haystack:
        return False
    return any(keyword in haystack for keyword in _FAST_GENRE_KEYWORDS)


def _folder_context_key(filepath: str, metadata: dict) -> str:
    album = str(metadata.get("album") or "").strip().lower()
    if album:
        return f"{Path(filepath).parent}|album:{album}"
    return str(Path(filepath).parent)


def _context_median(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(float(value) for value in values if value > 0)
    if not ordered:
        return 0.0
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2.0


def _normalize_bpm_with_context(
    filepath: str,
    metadata: dict,
    bpm: float,
    bpm_confidence: float,
    bpm_source: str,
    folder_tempos: list[float],
) -> tuple[float, float, str, str]:
    if bpm <= 0:
        return bpm, bpm_confidence, bpm_source, ""

    median_context = _context_median(folder_tempos)
    fast_genre = _looks_like_fast_genre(
        metadata.get("artist"),
        metadata.get("title"),
        metadata.get("album"),
        filepath,
    ) or (132.0 <= median_context <= 156.0)

    adjusted = bpm
    reason = ""
    if fast_genre and 68.0 <= bpm <= 92.0:
        doubled = bpm * 2.0
        if not median_context or abs(doubled - median_context) <= 10.0:
            adjusted = doubled
            reason = "half_time_corrected"
    elif fast_genre and 176.0 <= bpm <= 210.0:
        halved = bpm / 2.0
        if not median_context or abs(halved - median_context) <= 10.0:
            adjusted = halved
            reason = "double_time_corrected"
    elif median_context:
        doubled = bpm * 2.0
        halved = bpm / 2.0
        if 60.0 <= bpm <= 95.0 and 132.0 <= median_context <= 156.0 and abs(doubled - median_context) <= 10.0:
            adjusted = doubled
            reason = "context_half_time_corrected"
        elif 176.0 <= bpm <= 210.0 and 132.0 <= median_context <= 156.0 and abs(halved - median_context) <= 10.0:
            adjusted = halved
            reason = "context_double_time_corrected"

    if not reason or adjusted == bpm:
        return bpm, bpm_confidence, bpm_source, ""

    adjusted = round(float(adjusted), 1)
    next_source = f"{bpm_source}+sanity" if bpm_source else "sanity"
    next_confidence = max(float(bpm_confidence or 0.0), 0.72 if median_context else 0.62)
    return adjusted, next_confidence, next_source, reason


def _smart_capitalize(value: Optional[str]) -> Optional[str]:
    if not value:
        return value
    cleaned = str(value).strip()
    if not cleaned:
        return None

    letters = [char for char in cleaned if char.isalpha()]
    if letters:
        has_lower = any(char.islower() for char in letters)
        has_upper = any(char.isupper() for char in letters)
        if has_lower and has_upper:
            return cleaned

    def convert_token(token: str) -> str:
        if not token:
            return token
        upper = token.upper()
        if upper in _UPPERCASE_TOKENS:
            return upper
        if "'" in token:
            return "'".join(part[:1].upper() + part[1:].lower() if part else part for part in token.split("'"))
        return token[:1].upper() + token[1:].lower()

    parts = re.split(r"(\s+|[-/&()+[\]{}])", cleaned)
    return "".join(convert_token(part) if part and not re.fullmatch(r"(\s+|[-/&()+[\]{}])", part) else part for part in parts)


def _clean_title(artist: Optional[str], title: Optional[str]) -> Optional[str]:
    if not title:
        return title

    cleaned = title.strip()
    if not cleaned:
        return None

    if not re.search(r"[A-Za-z]", cleaned):
        return None

    parts = [part.strip() for part in cleaned.split(" - ") if part.strip()]
    if not parts:
        return None

    if artist and len(parts) >= 2:
        artist_norm = _normalize_text(artist)
        if _normalize_text(parts[0]) == artist_norm:
            return " - ".join(parts[1:]) or cleaned
        if len(parts) >= 3 and _normalize_text(parts[1]) == artist_norm:
            return " - ".join(parts[2:]) or cleaned

    if len(parts) >= 2 and re.fullmatch(r"\d+", parts[0]):
        return " - ".join(parts[1:]) or cleaned

    return cleaned


def _parse_filename_metadata(filepath: str) -> dict:
    stem = Path(filepath).stem
    stem = re.sub(r"^\d+[\s._-]*", "", stem).strip()
    artist = None
    title = None
    parts = [part.strip() for part in stem.split(" - ") if part.strip()]

    if not parts:
        return {"artist": None, "title": None}

    if len(parts) == 1:
        title = parts[0]
    elif _normalize_artist(parts[0]) is None:
        if len(parts) >= 3:
            artist = _normalize_artist(parts[1])
            title = " - ".join(parts[2:]) or None
        else:
            title = parts[1]
    else:
        artist = _normalize_artist(parts[0])
        title = " - ".join(parts[1:]) or None

    return {"artist": artist, "title": title}


def _parse_int_tag(value: Optional[str]) -> int:
    if not value:
        return 0
    match = re.search(r"(\d+)", value)
    return int(match.group(1)) if match else 0


def _extract_embedded_art(audio) -> tuple[str, str]:
    mime = ""
    data = b""

    try:
        pictures = getattr(audio, "pictures", None) or []
        if pictures:
            picture = pictures[0]
            mime = getattr(picture, "mime", "") or "image/jpeg"
            data = getattr(picture, "data", b"") or b""
    except Exception:
        pass

    tags = getattr(audio, "tags", None)
    if not data and tags:
        try:
            apic_keys = [key for key in tags.keys() if str(key).startswith("APIC")]
            if apic_keys:
                apic = tags.get(apic_keys[0])
                mime = getattr(apic, "mime", "") or "image/jpeg"
                data = getattr(apic, "data", b"") or b""
        except Exception:
            pass

    if not data and tags:
        try:
            covr = tags.get("covr")
            cover = covr[0] if isinstance(covr, list) and covr else covr
            if cover:
                data = bytes(cover)
                imageformat = int(getattr(cover, "imageformat", 0) or 0)
                mime = "image/png" if imageformat == 14 else "image/jpeg"
        except Exception:
            pass

    if not data:
        return "", ""

    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{mime or 'image/jpeg'};base64,{encoded}", mime or "image/jpeg"


def _album_group_key(artist: Optional[str], album: Optional[str]) -> str:
    normalized_artist = _normalize_text(artist)
    normalized_album = _normalize_text(album)
    if not normalized_artist or not normalized_album:
        return ""
    return f"{normalized_artist}::{normalized_album}"


def extract_metadata(filepath: str) -> dict:
    metadata = {
        "title": None,
        "artist": None,
        "album": None,
        "duration": 0.0,
        "bitrate": 0.0,
        "bpm": 0.0,
        "track_number": 0,
        "release_year": 0,
        "embedded_album_art_url": "",
        "embedded_album_art_mime": "",
    }

    try:
        from mutagen import File as MutagenFile

        audio = MutagenFile(filepath)
        if audio is None:
            return metadata

        metadata["title"] = _tag_value(audio.tags, "TIT2", "title")
        metadata["artist"] = _normalize_artist(_tag_value(audio.tags, "TPE1", "artist"))
        metadata["album"] = _tag_value(audio.tags, "TALB", "album")
        metadata["track_number"] = _parse_int_tag(_tag_value(audio.tags, "TRCK", "tracknumber"))
        metadata["release_year"] = _parse_int_tag(_tag_value(audio.tags, "TDRC", "date", "year"))
        bpm_text = _tag_value(audio.tags, "TBPM", "bpm")
        if bpm_text:
            try:
                metadata["bpm"] = float(bpm_text)
            except ValueError:
                metadata["bpm"] = 0.0
        art_url, art_mime = _extract_embedded_art(audio)
        metadata["embedded_album_art_url"] = art_url
        metadata["embedded_album_art_mime"] = art_mime

        info = getattr(audio, "info", None)
        if info and hasattr(info, "length"):
            metadata["duration"] = float(info.length)
        if info and hasattr(info, "bitrate"):
            metadata["bitrate"] = round(float(getattr(info, "bitrate", 0.0) or 0.0) / 1000.0, 1)
    except Exception:
        pass

    filename_metadata = _parse_filename_metadata(filepath)
    if not metadata["artist"]:
        metadata["artist"] = _normalize_artist(filename_metadata["artist"])
    if not metadata["title"]:
        metadata["title"] = filename_metadata["title"] or Path(filepath).stem

    metadata["artist"] = _normalize_artist(metadata["artist"])
    cleaned_title = _clean_title(metadata["artist"], metadata["title"])
    if cleaned_title and cleaned_title != metadata["title"]:
        metadata["title"] = cleaned_title

    if metadata["title"] and metadata["artist"] is None and " - " in metadata["title"]:
        parts = metadata["title"].split(" - ", 1)
        metadata["artist"] = _normalize_artist(parts[0])
        metadata["title"] = parts[1].strip() or metadata["title"]

    metadata["artist"] = _smart_capitalize(metadata["artist"])
    metadata["title"] = _smart_capitalize(metadata["title"])
    metadata["album"] = _smart_capitalize(metadata["album"])

    return metadata


def _art_debug_reason(previews: dict, fetch_album_art: bool) -> str:
    """Return a human-readable explanation for why album art is or isn't present."""
    if not fetch_album_art:
        return "disabled"
    if not previews.get("spotify_id"):
        debug_raw = previews.get("spotify_debug") or ""
        try:
            import json
            d = json.loads(debug_raw)
            queries = d.get("queries", [])
            if not queries:
                return "no spotify queries made (missing title?)"
            hits = [q for q in queries if q.get("items", 0) > 0]
            if not hits:
                return "no spotify results for any query"
            return "spotify results found but score too low to match"
        except Exception:
            return "no spotify match"
    score = float(previews.get("spotify_match_score") or 0.0)
    threshold = 18.0
    if not previews.get("album_art_url"):
        return f"matched (score={score:.1f}) but below art threshold ({threshold})"
    return f"ok (score={score:.1f})"


def _resolve_album_art(
    metadata: dict,
    previews: dict,
    fetch_album_art: bool,
    album_art_cache: dict[str, dict],
) -> dict:
    spotify_album_name = str(previews.get("spotify_album_name") or "")
    album_group_key = _album_group_key(metadata.get("artist"), metadata.get("album") or spotify_album_name)
    embedded_url = str(metadata.get("embedded_album_art_url") or "")
    spotify_url = str(previews.get("album_art_url") or "")
    artist_image_url = str(previews.get("artist_image_url") or "")
    spotify_score = float(previews.get("spotify_match_score") or 0.0)
    cached = album_art_cache.get(album_group_key, {}) if album_group_key else {}

    result = {
        "album_art_url": "",
        "album_art_source": "",
        "album_art_confidence": 0.0,
        "album_art_review_status": "missing" if fetch_album_art else "disabled",
        "album_art_review_notes": "album art lookup disabled" if not fetch_album_art else "no artwork matched",
        "album_group_key": album_group_key,
        "embedded_album_art": False,
    }

    if embedded_url:
        result.update(
            {
                "album_art_url": embedded_url,
                "album_art_source": "embedded",
                "album_art_confidence": 100.0,
                "album_art_review_status": "approved",
                "album_art_review_notes": "embedded artwork extracted from file tags",
                "embedded_album_art": True,
            }
        )
    elif fetch_album_art and cached.get("album_art_url"):
        cached_confidence = float(cached.get("album_art_confidence") or 0.0)
        result.update(
            {
                "album_art_url": str(cached.get("album_art_url") or ""),
                "album_art_source": "album_cache",
                "album_art_confidence": cached_confidence,
                "album_art_review_status": "approved" if cached_confidence >= 18.0 else "needs_review",
                "album_art_review_notes": f"reused artwork from album cluster {album_group_key}",
            }
        )
    elif fetch_album_art and spotify_url:
        high_confidence = bool(previews.get("spotify_high_confidence"))
        result.update(
            {
                "album_art_url": spotify_url,
                "album_art_source": "spotify",
                "album_art_confidence": spotify_score,
                "album_art_review_status": "approved" if high_confidence else "needs_review",
                "album_art_review_notes": "spotify album match accepted" if high_confidence else "spotify match below auto-approve threshold",
            }
        )
    elif fetch_album_art and artist_image_url:
        result.update(
            {
                "album_art_url": artist_image_url,
                "album_art_source": "artist",
                "album_art_confidence": max(10.0, min(spotify_score, 17.9)),
                "album_art_review_status": "needs_review",
                "album_art_review_notes": "spotify artist image used as fallback because no album cover was available",
            }
        )
    elif fetch_album_art and previews.get("spotify_id"):
        result.update(
            {
                "album_art_review_status": "needs_review",
                "album_art_review_notes": _art_debug_reason(previews, fetch_album_art),
            }
        )

    if album_group_key and result["album_art_url"]:
        existing = album_art_cache.get(album_group_key)
        if not existing or float(result["album_art_confidence"]) >= float(existing.get("album_art_confidence") or 0.0):
            album_art_cache[album_group_key] = {
                "album_art_url": result["album_art_url"],
                "album_art_source": result["album_art_source"],
                "album_art_confidence": result["album_art_confidence"],
            }

    return result


def scan_directory(
    directory: str,
    db: Database,
    skip_existing: bool = True,
    rescan_mode: str = "smart",
    bpm_lookup: str = "auto",
    fetch_album_art: bool = False,
    verbose: bool = False,
    spotify_enabled: bool = True,
    fast_scan: bool = False,
    auto_double_bpm: bool = False,
    progress_callback: Optional[Callable[[dict], None]] = None,
) -> dict:
    results = {"scanned": 0, "analyzed": 0, "skipped": 0, "errors": 0}
    audio_files = []

    for root, _dirs, files in os.walk(directory):
        for filename in files:
            if Path(filename).suffix.lower() in SUPPORTED_EXTENSIONS:
                audio_files.append(os.path.join(root, filename))

    total_files = len(audio_files)
    processed = 0

    def _emit(event: dict) -> None:
        if not progress_callback:
            return
        payload = {
            "current": processed,
            "total": total_files,
            **event,
        }
        progress_callback(payload)

    if progress_callback:
        _emit({"event": "scan_start", "directory": directory})
    else:
        print(f"\nFound {total_files} audio files")

    def _step(label: str, filepath: str) -> None:
        if verbose:
            _emit({"event": "track_step", "path": filepath, "file": Path(filepath).name, "step": label})
        if verbose:
            tqdm.write(f"  [{label}] {Path(filepath).name}")

    album_art_cache: dict[str, dict] = {}
    folder_bpm_context: dict[str, list[float]] = {}

    spotify_scan_enabled = spotify_enabled
    enrichment_enabled = not fast_scan
    spotify_timeout_streak = 0

    with ThreadPoolExecutor(max_workers=1) as spotify_pool:
        iterator = audio_files if progress_callback else tqdm(audio_files, desc="Scanning")
        for filepath in iterator:
            try:
                _emit({"event": "track_start", "path": filepath, "file": Path(filepath).name})
                _step("db-lookup", filepath)
                existing = db.get_track_by_path(filepath)
                file_size, file_mtime = _file_signature(filepath)
                unchanged = bool(existing and _same_file_signature(existing, file_size, file_mtime))
                skip_reason = None
                if existing and skip_existing and unchanged:
                    has_metadata = bool((existing.artist and existing.artist.strip()) or (existing.title and existing.title.strip()))
                    has_analysis = bool(existing.bpm and existing.key)
                    has_art = bool(existing.album_art_url)
                    if rescan_mode == "smart":
                        if has_analysis and (not fetch_album_art or has_art):
                            skip_reason = "already_analyzed"
                    elif rescan_mode == "missing-metadata":
                        if has_metadata:
                            skip_reason = "metadata_present"
                    elif rescan_mode == "missing-analysis":
                        if has_analysis:
                            skip_reason = "analysis_present"
                    elif rescan_mode == "missing-art":
                        if not fetch_album_art or has_art:
                            skip_reason = "album_art_present"

                if skip_reason:
                    results["skipped"] += 1
                    processed += 1
                    _emit(
                        {
                            "event": "track_complete",
                            "path": filepath,
                            "file": Path(filepath).name,
                            "status": "skipped",
                            "reason": skip_reason,
                        }
                    )
                    _emit({"event": "log", "level": "info", "message": f"{Path(filepath).name}: skipped ({skip_reason})"})
                    continue

                should_compute_hash = existing is None or not unchanged or not getattr(existing, "file_hash", None)
                file_hash = get_file_hash(filepath) if should_compute_hash else str(getattr(existing, "file_hash", "") or "")

                results["scanned"] += 1
                _step("metadata", filepath)
                metadata = extract_metadata(filepath)
                if verbose:
                    _emit(
                        {
                            "event": "track_metadata",
                            "path": filepath,
                            "file": Path(filepath).name,
                            "artist": metadata["artist"],
                            "title": metadata["title"],
                            "album": metadata["album"],
                            "duration": metadata["duration"],
                            "bitrate": metadata["bitrate"],
                            "track_number": metadata["track_number"],
                            "release_year": metadata["release_year"],
                            "embedded_album_art": bool(metadata["embedded_album_art_url"]),
                        }
                    )

                bpm = 0.0
                bpm_source = ""
                bpm_error = ""
                decode_failed = False
                bpm_confidence = 0.0
                analysis_stage = "start"
                debug_parts = [f"file={filepath}"]
                can_local = bpm_lookup in {"auto", "local", "both"}
                can_tag = bpm_lookup in {"auto", "local", "tag", "both"}
                can_spotify = bpm_lookup in {"auto", "spotify", "both"}

                if metadata["artist"] or metadata["title"]:
                    debug_parts.append(f"metadata=artist:{metadata['artist'] or 'none'} title:{metadata['title'] or 'none'}")
                debug_parts.append(f"spotify_lookup=artist:{metadata['artist'] or 'none'} title:{metadata['title'] or 'none'}")
                debug_parts.append("album_art=enabled" if fetch_album_art else "album_art=disabled")
                debug_parts.append(f"title_cleaned={metadata['title'] or 'none'}")

                # Submit remote metadata lookup immediately so it runs
                # concurrently with BPM/key detection in the main thread.
                spotify_future: Future | None = None
                if enrichment_enabled:
                    needs_acoustid = not bool(metadata["artist"] and metadata["title"])
                    _step("metadata lookup (async)", filepath)
                    spotify_future = spotify_pool.submit(
                        build_media_links,
                        metadata["artist"],
                        metadata["title"],
                        metadata["album"],
                        metadata["duration"],
                        metadata["track_number"],
                        metadata["release_year"],
                        fetch_album_art,
                        filepath,
                        spotify_scan_enabled,
                        needs_acoustid,
                    )
                    debug_parts.append("acoustid=enabled_missing_metadata" if needs_acoustid else "acoustid=skipped_metadata_present")

                if can_local or can_tag:
                    _step("isolated-analysis", filepath)
                    analysis_stage = "isolated_analysis"
                    analysis = _run_isolated_analysis(filepath, bpm_lookup, auto_double_bpm)
                    bpm = float(analysis.get("bpm") or 0.0)
                    bpm_source = str(analysis.get("bpm_source") or "")
                    bpm_error = str(analysis.get("bpm_error") or "")
                    bpm_confidence = float(analysis.get("bpm_confidence") or 0.0)
                    decode_failed = bool(analysis.get("decode_failed"))
                    key = str(analysis.get("key") or "")
                    key_numeric = str(analysis.get("key_numeric") or "")
                    debug_parts.append(f"isolated_bpm={bpm or 0.0}")
                    debug_parts.append(f"isolated_bpm_confidence={bpm_confidence:.3f}")
                    if bpm_source:
                        debug_parts.append(f"isolated_bpm_source={bpm_source}")
                    if key:
                        debug_parts.append(f"isolated_key={key}")
                    if bpm_error:
                        debug_parts.append(f"isolated_error={bpm_error}")
                    if analysis.get("debug"):
                        debug_parts.append(str(analysis.get("debug")))
                    if decode_failed:
                        debug_parts.append("decode_test=failed")
                else:
                    key = ""
                    key_numeric = ""

                # Collect Spotify result — if it's still running, wait up to
                # _SPOTIFY_TIMEOUT seconds then give up and continue without it.
                if enrichment_enabled and spotify_future is not None:
                    _step("await-spotify", filepath)
                    try:
                        previews = spotify_future.result(timeout=_SPOTIFY_TIMEOUT)
                        spotify_timeout_streak = 0
                    except FutureTimeoutError:
                        previews = dict(_EMPTY_PREVIEWS)
                        spotify_future.cancel()
                        spotify_timeout_streak += 1
                        _emit({"event": "log", "level": "warning", "message": f"Spotify timeout for {Path(filepath).name}"})
                        if spotify_scan_enabled and spotify_timeout_streak >= max(1, _SPOTIFY_TIMEOUT_STREAK_LIMIT):
                            spotify_scan_enabled = False
                            _emit(
                                {
                                    "event": "log",
                                    "level": "warning",
                                    "message": (
                                        f"Spotify disabled for the rest of this scan after "
                                        f"{spotify_timeout_streak} consecutive timeouts."
                                    ),
                                }
                            )
                        if verbose:
                            tqdm.write(f"  [spotify timeout] {Path(filepath).name}")
                else:
                    previews = dict(_EMPTY_PREVIEWS)

                if not metadata["artist"] and previews.get("acoustid_artist"):
                    metadata["artist"] = _normalize_artist(str(previews.get("acoustid_artist") or ""))
                    metadata["artist"] = _smart_capitalize(metadata["artist"])
                    if metadata["artist"]:
                        debug_parts.append(f"acoustid_artist={metadata['artist']}")
                if (not metadata["title"] or not str(metadata["title"]).strip()) and previews.get("acoustid_title"):
                    metadata["title"] = str(previews.get("acoustid_title") or "").strip() or metadata["title"]
                    metadata["title"] = _smart_capitalize(metadata["title"])
                    if metadata["title"]:
                        debug_parts.append(f"acoustid_title={metadata['title']}")
                if (not metadata["album"] or not str(metadata["album"]).strip()) and previews.get("acoustid_album"):
                    metadata["album"] = str(previews.get("acoustid_album") or "").strip() or metadata["album"]
                    metadata["album"] = _smart_capitalize(metadata["album"])
                    if metadata["album"]:
                        debug_parts.append(f"acoustid_album={metadata['album']}")

                if not bpm and can_spotify:
                    analysis_stage = "spotify_bpm"
                    spotify_bpm = float(previews.get("spotify_tempo") or 0.0)
                    if spotify_bpm:
                        bpm = spotify_bpm
                        bpm_source = "spotify"
                        bpm_error = ""
                        bpm_confidence = max(bpm_confidence, 0.55)
                        debug_parts.append(f"spotify_bpm={spotify_bpm}")
                    else:
                        debug_parts.append("spotify_bpm=none")

                if not key and previews.get("spotify_key"):
                    key = str(previews.get("spotify_key") or "")
                    key_numeric = key
                    debug_parts.append(f"spotify_key={key}")

                folder_context_key = _folder_context_key(filepath, metadata)
                folder_tempos = folder_bpm_context.setdefault(folder_context_key, [])
                bpm, bpm_confidence, bpm_source, normalization_reason = _normalize_bpm_with_context(
                    filepath,
                    metadata,
                    bpm,
                    bpm_confidence,
                    bpm_source,
                    folder_tempos,
                )
                if normalization_reason:
                    debug_parts.append(f"bpm_normalized={normalization_reason}")
                    debug_parts.append(f"folder_context_median={_context_median(folder_tempos):.1f}")

                debug_parts.append(f"spotify_id={previews.get('spotify_id') or 'none'}")
                debug_parts.append(f"acoustid_id={previews.get('acoustid_id') or 'none'}")
                debug_parts.append(f"album_art_url={previews.get('album_art_url') or 'none'}")
                if fast_scan:
                    debug_parts.append("enrichment=disabled_fast_scan")
                if not spotify_scan_enabled:
                    debug_parts.append("spotify_scan=disabled_after_timeouts")
                if previews.get("spotify_debug"):
                    debug_parts.append(f"spotify_debug={previews.get('spotify_debug')}")
                if previews.get("acoustid_debug"):
                    debug_parts.append(f"acoustid_debug={previews.get('acoustid_debug')}")

                if not bpm:
                    debug_parts.append("bpm=missing")
                if not key:
                    debug_parts.append("key=missing")

                album_art = _resolve_album_art(metadata, previews, fetch_album_art, album_art_cache)
                album_art_url = str(album_art["album_art_url"] or "")
                debug_parts.append(f"album_art_source={album_art['album_art_source'] or 'none'}")
                debug_parts.append(f"album_art_confidence={float(album_art['album_art_confidence'] or 0.0):.1f}")
                debug_parts.append(f"album_art_review={album_art['album_art_review_status']}")
                if album_art.get("album_group_key"):
                    debug_parts.append(f"album_group={album_art['album_group_key']}")

                db.add_track(
                    {
                        "path": filepath,
                        "title": metadata["title"],
                        "artist": metadata["artist"],
                        "album": metadata["album"],
                        "duration": metadata["duration"],
                        "bitrate": metadata["bitrate"],
                        "bpm": bpm,
                        "key": key,
                        "key_numeric": key_numeric,
                        "spotify_id": previews["spotify_id"],
                        "spotify_uri": previews["spotify_uri"],
                        "spotify_url": previews["spotify_url"],
                        "spotify_preview_url": previews["spotify_preview_url"],
                        "spotify_tempo": previews["spotify_tempo"],
                        "spotify_key": previews["spotify_key"],
                        "spotify_mode": previews["spotify_mode"],
                        "album_art_url": album_art_url,
                        "spotify_album_name": previews["spotify_album_name"],
                        "spotify_match_score": float(previews.get("spotify_match_score") or 0.0),
                        "spotify_high_confidence": str(previews.get("spotify_high_confidence") or False).lower(),
                        "album_art_source": album_art["album_art_source"],
                        "album_art_confidence": float(album_art.get("album_art_confidence") or 0.0),
                        "album_art_review_status": album_art["album_art_review_status"],
                        "album_art_review_notes": album_art["album_art_review_notes"],
                        "album_group_key": album_art["album_group_key"],
                        "embedded_album_art": bool(album_art.get("embedded_album_art")),
                        "album_art_match_debug": json.dumps(
                            {
                                "source": album_art["album_art_source"],
                                "confidence": float(album_art.get("album_art_confidence") or 0.0),
                                "review_status": album_art["album_art_review_status"],
                                "review_notes": album_art["album_art_review_notes"],
                                "group_key": album_art["album_group_key"],
                                "spotify_debug": previews.get("spotify_debug") or "",
                                "spotify_album_name": previews.get("spotify_album_name") or "",
                                "spotify_track_number": previews.get("spotify_track_number") or 0,
                                "spotify_release_year": previews.get("spotify_release_year") or 0,
                            }
                        ),
                        "youtube_url": previews["youtube_url"],
                        "analysis_status": "ok" if bpm else "needs_review",
                        "analysis_error": bpm_error,
                        "decode_failed": decode_failed,
                        "analysis_stage": analysis_stage,
                        "analysis_debug": " | ".join(debug_parts),
                        "bpm_source": bpm_source,
                        "bpm_confidence": bpm_confidence,
                        "file_hash": file_hash,
                        "file_size": file_size,
                        "file_mtime": file_mtime,
                    }
                )
                if bpm > 0 and (bpm_confidence >= 0.45 or "sanity" in bpm_source or bpm_source == "spotify"):
                    folder_tempos.append(float(bpm))
                    if len(folder_tempos) > 24:
                        del folder_tempos[:-24]
                results["analyzed"] += 1
                processed += 1
                _emit(
                    {
                        "event": "track_complete",
                        "path": filepath,
                        "file": Path(filepath).name,
                        "status": "analyzed",
                        "artist": metadata["artist"],
                        "title": metadata["title"],
                        "bpm": bpm,
                        "bpm_source": bpm_source,
                        "key": key,
                        "spotify_id": previews["spotify_id"],
                        "album_art_url": album_art_url,
                        "album_art_source": album_art["album_art_source"],
                        "album_art_confidence": float(album_art.get("album_art_confidence") or 0.0),
                        "album_art_review_status": album_art["album_art_review_status"],
                        "decode_failed": decode_failed,
                    }
                )
                _emit(
                    {
                        "event": "log",
                        "level": "success" if bpm else "warning",
                        "message": (
                            f"{Path(filepath).name}: bpm={bpm or 0:.1f} src={bpm_source or 'none'} "
                            f"key={key or 'none'} spotify={'yes' if previews['spotify_id'] else 'no'} "
                            f"art={'yes' if album_art_url else 'no'} source={album_art['album_art_source'] or 'none'} "
                            f"review={album_art['album_art_review_status']}"
                        ),
                    }
                )

                if verbose:
                    label = f"{metadata['artist'] or '?'} - {metadata['title'] or Path(filepath).stem}"
                    bpm_str = f"{bpm:.1f} ({bpm_source})" if bpm else "no BPM"
                    key_str = key or "no key"
                    art_reason = _art_debug_reason(previews, fetch_album_art)
                    art_icon = "🎨" if album_art_url else "✗"
                    tqdm.write(f"  {art_icon} {label}  |  {bpm_str}  |  {key_str}  |  art: {art_reason}")

            except Exception as exc:
                results["errors"] += 1
                processed += 1
                _emit(
                    {
                        "event": "track_complete",
                        "path": filepath,
                        "file": Path(filepath).name,
                        "status": "error",
                        "error": str(exc),
                    }
                )
                if progress_callback:
                    progress_callback({"event": "log", "level": "error", "message": f"Error processing {filepath}: {exc}"})
                else:
                    tqdm.write(f"\nError processing {filepath}: {exc}")

    _emit({"event": "scan_complete", "results": results})
    return results
