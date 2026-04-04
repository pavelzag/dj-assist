from __future__ import annotations

import hashlib
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, Future, TimeoutError as FutureTimeoutError
from pathlib import Path
from typing import Callable, Optional

from tqdm import tqdm

from .analyzer import detect_bpm, detect_key, has_decoding_error, read_tag_bpm
from .db import Database
from .media import build_media_links

SUPPORTED_EXTENSIONS = {".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aiff", ".aif"}

_EMPTY_PREVIEWS: dict = {
    "youtube_url": "", "spotify_url": "", "spotify_preview_url": "",
    "spotify_uri": "", "spotify_id": "", "spotify_tempo": 0.0,
    "spotify_key": "", "spotify_mode": "", "album_art_url": "",
    "spotify_album_name": "", "spotify_match_score": 0.0,
    "spotify_high_confidence": False, "spotify_debug": "",
}

# Max seconds to wait for Spotify before skipping it for a given track.
_SPOTIFY_TIMEOUT = float(os.getenv("SPOTIFY_TIMEOUT", "20"))

_UNKNOWN_ARTIST_VALUES = {"unknown", "unknown artist", "various artists"}


def get_file_hash(filepath: str) -> str:
    hash_md5 = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()


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


def extract_metadata(filepath: str) -> dict:
    metadata = {"title": None, "artist": None, "album": None, "duration": 0.0, "bpm": 0.0}

    try:
        from mutagen import File as MutagenFile

        audio = MutagenFile(filepath)
        if audio is None:
            return metadata

        metadata["title"] = _tag_value(audio.tags, "TIT2", "title")
        metadata["artist"] = _normalize_artist(_tag_value(audio.tags, "TPE1", "artist"))
        metadata["album"] = _tag_value(audio.tags, "TALB", "album")
        bpm_text = _tag_value(audio.tags, "TBPM", "bpm")
        if bpm_text:
            try:
                metadata["bpm"] = float(bpm_text)
            except ValueError:
                metadata["bpm"] = 0.0

        info = getattr(audio, "info", None)
        if info and hasattr(info, "length"):
            metadata["duration"] = float(info.length)
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


def scan_directory(
    directory: str,
    db: Database,
    skip_existing: bool = True,
    rescan_mode: str = "smart",
    bpm_lookup: str = "auto",
    fetch_album_art: bool = False,
    verbose: bool = False,
    spotify_enabled: bool = True,
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

    with ThreadPoolExecutor(max_workers=1) as spotify_pool:
        iterator = audio_files if progress_callback else tqdm(audio_files, desc="Scanning")
        for filepath in iterator:
            try:
                _emit({"event": "track_start", "path": filepath, "file": Path(filepath).name})
                _step("db-lookup", filepath)
                existing = db.get_track_by_path(filepath)
                skip_reason = None
                if existing and skip_existing:
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
                        }
                    )

                # Submit Spotify lookup to background thread immediately so it
                # runs concurrently with BPM/key detection in the main thread.
                # When spotify_enabled=False, resolve immediately with empty data.
                _step("spotify (async)", filepath)
                if spotify_enabled:
                    spotify_future: Future = spotify_pool.submit(
                        build_media_links,
                        metadata["artist"],
                        metadata["title"],
                        metadata["duration"],
                        fetch_album_art,
                    )
                else:
                    from concurrent.futures import Future as _Future
                    _f: Future = spotify_pool.submit(lambda: dict(_EMPTY_PREVIEWS))
                    spotify_future = _f

                bpm = 0.0
                bpm_source = ""
                bpm_error = ""
                decode_failed = False
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

                if can_local:
                    _step("local-bpm", filepath)
                    analysis_stage = "local_bpm"
                    bpm, bpm_source, bpm_error = detect_bpm(filepath)
                    decode_failed = bpm_error == "decode_failed"
                    debug_parts.append(f"local_bpm={bpm or 0.0}")
                    if bpm_error:
                        debug_parts.append(f"local_bpm_error={bpm_error}")

                if not bpm and can_tag:
                    analysis_stage = "tag_bpm"
                    tag_bpm = metadata.get("bpm") or read_tag_bpm(filepath)
                    if tag_bpm:
                        bpm = tag_bpm
                        bpm_source = "tag"
                        bpm_error = ""
                        debug_parts.append(f"tag_bpm={tag_bpm}")
                    else:
                        debug_parts.append("tag_bpm=none")

                _step("key-detect", filepath)
                key, key_numeric, _confidence = detect_key(filepath)

                _step("decode-check", filepath)
                if not decode_failed:
                    decode_failed = has_decoding_error(filepath)
                    if decode_failed:
                        debug_parts.append("decode_test=failed")
                else:
                    debug_parts.append("decode_test=failed")

                # Collect Spotify result — if it's still running, wait up to
                # _SPOTIFY_TIMEOUT seconds then give up and continue without it.
                _step("await-spotify", filepath)
                try:
                    previews = spotify_future.result(timeout=_SPOTIFY_TIMEOUT)
                except FutureTimeoutError:
                    previews = dict(_EMPTY_PREVIEWS)
                    spotify_future.cancel()
                    _emit({"event": "log", "level": "warning", "message": f"Spotify timeout for {Path(filepath).name}"})
                    if verbose:
                        tqdm.write(f"  [spotify timeout] {Path(filepath).name}")

                if not bpm and can_spotify:
                    analysis_stage = "spotify_bpm"
                    spotify_bpm = float(previews.get("spotify_tempo") or 0.0)
                    if spotify_bpm:
                        bpm = spotify_bpm
                        bpm_source = "spotify"
                        bpm_error = ""
                        debug_parts.append(f"spotify_bpm={spotify_bpm}")
                    else:
                        debug_parts.append("spotify_bpm=none")

                if not key and previews.get("spotify_key"):
                    key = str(previews.get("spotify_key") or "")
                    key_numeric = key
                    debug_parts.append(f"spotify_key={key}")

                debug_parts.append(f"spotify_id={previews.get('spotify_id') or 'none'}")
                debug_parts.append(f"album_art_url={previews.get('album_art_url') or 'none'}")
                if previews.get("spotify_debug"):
                    debug_parts.append(f"spotify_debug={previews.get('spotify_debug')}")

                if auto_double_bpm and bpm and 60.0 <= bpm <= 80.0:
                    original_bpm = bpm
                    bpm = float(round(bpm * 2))
                    bpm_source = (bpm_source + "+doubled") if bpm_source else "doubled"
                    debug_parts.append(f"auto_doubled={original_bpm:.1f}→{bpm:.0f}")

                if not bpm:
                    debug_parts.append("bpm=missing")
                if not key:
                    debug_parts.append("key=missing")

                album_art_url = previews["album_art_url"] if previews.get("spotify_id") and previews.get("album_art_url") else ""

                db.add_track(
                    {
                        "path": filepath,
                        "title": metadata["title"],
                        "artist": metadata["artist"],
                        "album": metadata["album"],
                        "duration": metadata["duration"],
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
                        "youtube_url": previews["youtube_url"],
                        "analysis_status": "ok" if bpm else "needs_review",
                        "analysis_error": bpm_error,
                        "decode_failed": decode_failed,
                        "analysis_stage": analysis_stage,
                        "analysis_debug": " | ".join(debug_parts),
                        "bpm_source": bpm_source,
                        "file_hash": get_file_hash(filepath),
                    }
                )
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
                            f"art={'yes' if album_art_url else 'no'}"
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
