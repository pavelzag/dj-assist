from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from pathlib import Path
from typing import Callable, Optional

from tqdm import tqdm

from .analyzer import analyze_track, detect_key, read_tag_bpm
from .db import Database
from .media import build_media_links

SUPPORTED_EXTENSIONS = {".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aiff", ".aif"}
IGNORED_FILENAMES = {".ds_store"}

_EMPTY_PREVIEWS: dict = {
    "youtube_url": "", "spotify_url": "", "spotify_preview_url": "",
    "spotify_uri": "", "spotify_id": "", "spotify_tempo": 0.0,
    "spotify_key": "", "spotify_mode": "", "album_art_url": "", "artist_image_url": "",
    "album_art_provider": "", "artist_image_provider": "",
    "spotify_album_name": "", "spotify_match_score": 0.0,
    "spotify_high_confidence": False, "spotify_debug": "", "theaudiodb_debug": "", "musicbrainz_debug": "", "discogs_debug": "",
    "spotify_track_number": 0, "spotify_release_year": 0,
    "acoustid_artist": "", "acoustid_title": "", "acoustid_album": "",
    "acoustid_match_score": 0.0, "acoustid_id": "", "acoustid_recording_id": "",
    "acoustid_debug": "",
}

# Max seconds to wait for Spotify before skipping it for a given track.
_SPOTIFY_TIMEOUT = float(os.getenv("SPOTIFY_TIMEOUT", "3"))
_SPOTIFY_TIMEOUT_STREAK_LIMIT = int(os.getenv("SPOTIFY_TIMEOUT_STREAK_LIMIT", "3"))
_SERVER_LOOKUP_TIMEOUT = float(os.getenv("DJ_ASSIST_SERVER_LOOKUP_TIMEOUT", os.getenv("DJ_ASSIST_SERVER_TIMEOUT", "4")))
_SERVER_UPLOAD_TIMEOUT = float(os.getenv("DJ_ASSIST_SERVER_UPLOAD_TIMEOUT", os.getenv("DJ_ASSIST_SERVER_TIMEOUT", "12")))
_SERVER_ART_UPLOAD_CACHE: dict[str, str] = {}
_SERVER_ART_UPLOAD_WARNING: str | None = None

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


def _server_enabled() -> bool:
    return os.getenv("DJ_ASSIST_SERVER_ENABLED", "false").lower() == "true" and bool(os.getenv("DJ_ASSIST_SERVER_URL", "").strip())


def _client_id() -> str:
    return os.getenv("DJ_ASSIST_CLIENT_ID", "anonymous-client").strip() or "anonymous-client"


def _user_data() -> dict:
    raw = os.getenv("DJ_ASSIST_USER_DATA", "").strip()
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and parsed.get("type") and parsed.get("id"):
                return parsed
        except Exception:
            pass
    return {"type": "anonymous", "id": _client_id()}


def _server_url(path: str) -> str:
    base = os.getenv("DJ_ASSIST_SERVER_URL", "").strip().rstrip("/")
    return f"{base}{path}"


def _server_base_url() -> str:
    return os.getenv("DJ_ASSIST_SERVER_URL", "").strip().rstrip("/")


def _server_is_local_debug() -> bool:
    base = _server_base_url().lower()
    return "localhost" in base or "127.0.0.1" in base


def _server_post(path: str, payload: dict, timeout: float) -> tuple[int, dict]:
    data = json.dumps(payload).encode("utf-8")
    user = payload.get("user_data") if isinstance(payload, dict) else None
    google_id_token = ""
    google_access_token = ""
    if isinstance(user, dict):
        google_id_token = str(user.get("google_id_token") or "").strip()
        google_access_token = str(user.get("google_access_token") or "").strip()
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "dj-assist-client",
    }
    if google_id_token:
        headers["Authorization"] = f"Bearer {google_id_token}"
        headers["X-Google-Id-Token"] = google_id_token
    if google_access_token:
        headers["X-Google-Access-Token"] = google_access_token
    request = urllib.request.Request(
        _server_url(path),
        data=data,
        method="POST",
        headers=headers,
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
        return int(response.status), json.loads(raw or "{}")


def _lookup_server_allowed() -> tuple[bool, str]:
    user = _user_data()
    google_id_token = str(user.get("google_id_token") or "").strip()
    if not _server_enabled() or user.get("type") != "google" or not google_id_token:
        reason = "server disabled" if not _server_enabled() else f"user_type={user.get('type')}"
        if _server_enabled() and user.get("type") == "google" and not google_id_token:
            reason = "google_token_missing"
        return False, reason
    return True, ""


def _lookup_server_track(file_hash: str) -> tuple[dict | None, str]:
    allowed, reason = _lookup_server_allowed()
    if not allowed:
        return None, f"lookup skipped ({reason})"
    user = _user_data()
    try:
        status, payload = _server_post(
            "/api/v1/tracks/lookup",
            {
                "client_id": _client_id(),
                "user_data": user,
                "file_hash": file_hash,
            },
            timeout=_SERVER_LOOKUP_TIMEOUT,
        )
        if payload.get("matched") and isinstance(payload.get("track"), dict):
            bpm = float(payload["track"].get("bpm") or payload["track"].get("spotify_tempo") or 0.0)
            key = str(payload["track"].get("musical_key") or payload["track"].get("key") or payload["track"].get("key_numeric") or "")
            return payload["track"], f"lookup hit status={status} bpm={bpm or 0:.1f} key={key or 'none'}"
        return None, f"lookup miss status={status}"
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace").strip()
        return None, f"lookup error status={exc.code} {detail[:200]}".strip()
    except TimeoutError:
        return None, f"lookup timeout after {_SERVER_LOOKUP_TIMEOUT:.1f}s"
    except Exception as exc:
        return None, f"lookup error {exc}"


def _server_track_to_local(server_track: dict, filepath: str, file_hash: str, file_size: int, file_mtime: float) -> dict:
    return {
        "path": filepath,
        "title": server_track.get("title"),
        "artist": server_track.get("artist"),
        "album": server_track.get("album"),
        "duration": server_track.get("duration"),
        "bitrate": server_track.get("bitrate"),
        "bpm": server_track.get("bpm"),
        "key": server_track.get("musical_key") or server_track.get("key"),
        "key_numeric": server_track.get("key_numeric"),
        "spotify_id": server_track.get("spotify_id"),
        "spotify_uri": server_track.get("spotify_uri"),
        "spotify_url": server_track.get("spotify_url"),
        "spotify_preview_url": server_track.get("spotify_preview_url"),
        "spotify_tempo": server_track.get("spotify_tempo"),
        "spotify_key": server_track.get("spotify_key"),
        "spotify_mode": server_track.get("spotify_mode"),
        "album_art_url": server_track.get("album_art_url"),
        "spotify_album_name": server_track.get("spotify_album_name"),
        "spotify_match_score": server_track.get("spotify_match_score"),
        "spotify_high_confidence": str(server_track.get("spotify_high_confidence") or False).lower(),
        "album_art_source": server_track.get("album_art_source"),
        "album_art_confidence": server_track.get("album_art_confidence"),
        "album_art_review_status": server_track.get("album_art_review_status"),
        "album_art_review_notes": server_track.get("album_art_review_notes"),
        "album_group_key": server_track.get("album_group_key"),
        "embedded_album_art": bool(server_track.get("embedded_album_art")),
        "album_art_match_debug": server_track.get("album_art_match_debug"),
        "youtube_url": server_track.get("youtube_url"),
        "analysis_status": "server_match",
        "analysis_error": "",
        "decode_failed": server_track.get("decode_failed"),
        "analysis_stage": "server_match",
        "analysis_debug": "source=dj-assist-server",
        "bpm_source": server_track.get("bpm_source") or "server",
        "bpm_confidence": server_track.get("bpm_confidence"),
        "file_hash": file_hash,
        "file_size": file_size,
        "file_mtime": file_mtime,
    }


def _lookup_preferred_album_art(
    db: Database,
    artist: Optional[str],
    album: Optional[str],
    spotify_album_name: Optional[str] = None,
) -> tuple[str, str]:
    for album_value, source in (
        (album, "album_cache"),
        (spotify_album_name, "server_lookup"),
    ):
        group_key = _album_group_key(artist, album_value)
        if not group_key:
            continue
        cached = db.get_album_art_by_group_key(group_key)
        if cached and cached.album_art_url:
            return str(cached.album_art_url), source
    return "", ""


def _server_track_needs_local_analysis(server_track: dict) -> bool:
    bpm = float(server_track.get("bpm") or server_track.get("spotify_tempo") or 0.0)
    if bpm > 0:
        return False
    return True


def _seed_metadata_from_server(metadata: dict, server_track: dict) -> dict:
    seeded = dict(metadata)
    if not seeded.get("artist") and server_track.get("artist"):
        seeded["artist"] = server_track.get("artist")
    if not seeded.get("title") and server_track.get("title"):
        seeded["title"] = server_track.get("title")
    if not seeded.get("album") and server_track.get("album"):
        seeded["album"] = server_track.get("album")
    if not seeded.get("duration") and server_track.get("duration") is not None:
        seeded["duration"] = server_track.get("duration")
    if not seeded.get("bitrate") and server_track.get("bitrate") is not None:
        seeded["bitrate"] = server_track.get("bitrate")
    return seeded


def _local_app_url(path: str) -> str:
    base = os.getenv("DJ_ASSIST_LOCAL_APP_URL", "").strip().rstrip("/")
    return f"{base}{path}" if base else ""


def _server_album_art_url(track_data: dict) -> str:
    """Return a GCS-backed URL for the track's album art.

    Delegates the actual upload to the local Next.js server via
    POST /api/art/store-gcs.  This means:
    - No google-cloud-storage Python dependency needed on the user's machine.
    - GCS credentials are configured once on the Next.js server (via
      DJ_ASSIST_GCS_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS),
      not per user.
    - The same in-process cache avoids redundant uploads within a scan run.
    - Graceful fallback: if the local server is unavailable or GCS is not
      configured, external URLs are passed through unchanged and data: URIs
      (which can't be served as a URL) are dropped.
    """
    global _SERVER_ART_UPLOAD_WARNING

    album_art_url = str(track_data.get("album_art_url") or "").strip()
    if not album_art_url:
        return ""

    # Fast path: already resolved during this scan run.
    cached = _SERVER_ART_UPLOAD_CACHE.get(album_art_url)
    if cached:
        return cached

    endpoint = _local_app_url("/api/art/store-gcs")
    if not endpoint:
        # Local server URL not configured — fall back gracefully.
        return "" if album_art_url.startswith("data:") else album_art_url

    try:
        data = json.dumps({"url": album_art_url}).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))

        gcs_url = str(payload.get("gcs_url") or "").strip()
        if gcs_url:
            _SERVER_ART_UPLOAD_CACHE[album_art_url] = gcs_url
            return gcs_url

        # GCS not configured on the server side — fall back.
        reason = str(payload.get("reason") or "")
        if reason and reason != "gcs_not_configured":
            warning = f"server album art upload skipped: {reason}"
            if _SERVER_ART_UPLOAD_WARNING != warning:
                _SERVER_ART_UPLOAD_WARNING = warning
                print(f"[dj-assist] {warning}", file=sys.stderr)
        return "" if album_art_url.startswith("data:") else album_art_url

    except Exception as exc:
        warning = f"server album art upload skipped: {exc}"
        if _SERVER_ART_UPLOAD_WARNING != warning:
            _SERVER_ART_UPLOAD_WARNING = warning
            print(f"[dj-assist] {warning}", file=sys.stderr)
        return "" if album_art_url.startswith("data:") else album_art_url


def _serialize_track_for_server(track_data: dict, client_track_id: str) -> dict:
    album_art_url = _server_album_art_url(track_data)
    has_album_art = bool(album_art_url)
    return {
        "client_track_id": client_track_id,
        "title": track_data.get("title"),
        "artist": track_data.get("artist"),
        "album": track_data.get("album"),
        "duration": track_data.get("duration"),
        "bitrate": track_data.get("bitrate"),
        "bpm": track_data.get("bpm"),
        "bpm_confidence": track_data.get("bpm_confidence"),
        "key": track_data.get("key"),
        "key_numeric": track_data.get("key_numeric"),
        "spotify_id": track_data.get("spotify_id"),
        "spotify_uri": track_data.get("spotify_uri"),
        "spotify_url": track_data.get("spotify_url"),
        "spotify_tempo": track_data.get("spotify_tempo"),
        "spotify_key": track_data.get("spotify_key"),
        "spotify_mode": track_data.get("spotify_mode"),
        "bpm_source": track_data.get("bpm_source"),
        "analysis_status": track_data.get("analysis_status"),
        "analysis_error": track_data.get("analysis_error"),
        "decode_failed": track_data.get("decode_failed"),
        "file_hash": track_data.get("file_hash"),
        "file_size": track_data.get("file_size"),
        "file_mtime": track_data.get("file_mtime"),
        "effective_bpm": track_data.get("bpm") or track_data.get("spotify_tempo"),
        "effective_key": track_data.get("key") or track_data.get("spotify_key") or track_data.get("key_numeric"),
        # Server-side ingestion expects artwork_* fields (with album_art_* aliases).
        # Embedded data URIs must be externalized before sync; otherwise Postgres stores the blob itself.
        "artwork_url": album_art_url,
        "artwork_source": track_data.get("album_art_source"),
        "artwork_status": (
            "present"
            if has_album_art
            else "missing"
        ),
        "album_art_url": album_art_url,
        "album_art_source": track_data.get("album_art_source"),
        "album_art_status": (
            "present"
            if has_album_art
            else "missing"
        ),
    }


def _upload_track_to_server(track_data: dict, client_track_id: str) -> tuple[bool, str]:
    if not _server_enabled():
        return False, "upload skipped (server disabled)"
    try:
        status, payload = _server_post(
            "/api/v1/ingest",
            {
                "client_id": _client_id(),
                "user_data": _user_data(),
                "sent_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "tracks": [_serialize_track_for_server(track_data, client_track_id)],
                "usage_events": [],
            },
            timeout=_SERVER_UPLOAD_TIMEOUT,
        )
        received_tracks = int(payload.get("tracks_received") or 0)
        return True, f"upload ok status={status} tracks_received={received_tracks}"
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace").strip()
        return False, f"upload error status={exc.code} {detail[:200]}".strip()
    except TimeoutError:
        return False, f"upload timeout after {_SERVER_UPLOAD_TIMEOUT:.1f}s"
    except Exception as exc:
        return False, f"upload error {exc}"


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


def _analysis_workers() -> int:
    raw = os.getenv("DJ_ASSIST_ANALYSIS_WORKERS", "").strip()
    if raw:
        try:
            return max(1, int(raw))
        except ValueError:
            pass
    cpu_count = os.cpu_count() or 4
    return max(1, min(4, cpu_count))


def _scan_concurrency() -> int:
    raw = os.getenv("DJ_ASSIST_SCAN_CONCURRENCY", "").strip()
    if raw:
        try:
            return max(1, int(raw))
        except ValueError:
            pass
    return _analysis_workers()


def _artwork_workers() -> int:
    raw = os.getenv("DJ_ASSIST_ARTWORK_WORKERS", "").strip()
    if raw:
        try:
            return max(1, int(raw))
        except ValueError:
            pass
    return 2


def _db_commit_batch_size() -> int:
    raw = os.getenv("DJ_ASSIST_DB_COMMIT_BATCH_SIZE", "").strip()
    if raw:
        try:
            return max(1, int(raw))
        except ValueError:
            pass
    return 25


def _artwork_defer_threshold() -> int:
    raw = os.getenv("DJ_ASSIST_DEFER_ARTWORK_THRESHOLD", "").strip()
    if raw:
        try:
            return max(1, int(raw))
        except ValueError:
            pass
    return 100


def _defer_artwork_enrichment(total_files: int, fetch_album_art: bool) -> bool:
    if not fetch_album_art:
        return False
    raw = os.getenv("DJ_ASSIST_DEFER_ARTWORK_ENRICHMENT", "").strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return total_files >= _artwork_defer_threshold()


def _run_local_analysis(filepath: str, bpm_lookup: str, auto_double_bpm: bool) -> dict:
    bpm = 0.0
    bpm_source = ""
    bpm_error = ""
    bpm_confidence = 0.0
    decode_failed = False
    key = ""
    key_numeric = ""
    key_confidence = 0.0

    can_local = bpm_lookup in {"auto", "local", "both"}
    can_tag = bpm_lookup in {"auto", "local", "tag", "both"}

    try:
        if can_local:
            analysis = analyze_track(filepath)
            bpm = analysis.bpm
            bpm_source = analysis.bpm_source
            bpm_error = analysis.bpm_error
            bpm_confidence = analysis.bpm_confidence
            decode_failed = analysis.decode_failed
            key = analysis.key
            key_numeric = analysis.key_numeric
            key_confidence = analysis.key_confidence

        if not bpm and can_tag:
            tag_bpm = read_tag_bpm(filepath)
            if tag_bpm:
                bpm = tag_bpm
                bpm_source = "tag"
                bpm_error = ""

        if not can_local:
            key, key_numeric, key_confidence = detect_key(filepath)

        if auto_double_bpm and bpm and 60.0 <= bpm <= 80.0:
            bpm = float(round(bpm * 2))
            bpm_source = (bpm_source + "+doubled") if bpm_source else "doubled"
    except Exception as exc:
        return {
            "bpm": 0.0,
            "bpm_source": "",
            "bpm_error": "analysis_in_process_error",
            "bpm_confidence": 0.0,
            "decode_failed": True,
            "key": "",
            "key_numeric": "",
            "confidence": 0.0,
            "debug": f"analysis_in_process_error={exc}",
        }

    return {
        "bpm": bpm,
        "bpm_source": bpm_source,
        "bpm_error": bpm_error,
        "bpm_confidence": bpm_confidence,
        "decode_failed": decode_failed,
        "key": key,
        "key_numeric": key_numeric,
        "confidence": key_confidence,
        "debug": "analysis_in_process",
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


def _artist_cache_key(artist: Optional[str]) -> str:
    return _normalize_text(artist)


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


def _should_ignore_scan_file(filename: str) -> bool:
    lowered = filename.strip().lower()
    if not lowered:
        return True
    if lowered in IGNORED_FILENAMES:
        return True
    # Ignore AppleDouble sidecar files and other hidden dotfiles that should never be scanned as audio.
    if lowered.startswith("._") or (lowered.startswith(".") and Path(lowered).suffix.lower() in SUPPORTED_EXTENSIONS):
        return True
    return False


def _describe_missing_bpm(
    *,
    bpm_error: str,
    decode_failed: bool,
    can_spotify: bool,
    enrichment_enabled: bool,
    spotify_scan_enabled: bool,
    previews: dict,
    metadata: dict,
) -> tuple[str, str]:
    spotify_id = str(previews.get("spotify_id") or "").strip()
    spotify_tempo = float(previews.get("spotify_tempo") or 0.0)
    acoustid_id = str(previews.get("acoustid_id") or "").strip()
    has_metadata = bool(str(metadata.get("artist") or "").strip() or str(metadata.get("title") or "").strip())

    if decode_failed or bpm_error in {"decode_failed", "analysis_subprocess_failed", "analysis_subprocess_error"}:
        return "decode_failed", "audio decode/analysis failed before a tempo could be extracted"
    if bpm_error == "analysis_timeout":
        return "analysis_timeout", "tempo analysis timed out"
    if bpm_error == "analysis_subprocess_invalid_json":
        return "analysis_subprocess_invalid_json", "analysis subprocess returned invalid data"
    if bpm_error == "no tempo candidates":
        return "no_tempo_candidates", "audio was decoded but no stable tempo candidates were found"
    if bpm_error == "unstable tempo":
        return "unstable_tempo", "tempo candidates were found but too inconsistent to trust"
    if not can_spotify:
        return "spotify_disabled_by_mode", "local analysis found no BPM and Spotify fallback was disabled by scan mode"
    if not enrichment_enabled:
        return "enrichment_disabled", "local analysis found no BPM and metadata enrichment was disabled"
    if not spotify_scan_enabled:
        return "spotify_disabled_after_timeouts", "local analysis found no BPM and Spotify lookup was disabled after repeated timeouts"
    if spotify_tempo > 0:
        return "spotify_tempo_not_applied", "Spotify returned a tempo but it was not applied"
    if spotify_id:
        return "spotify_match_without_tempo", "Spotify matched the track but did not provide a tempo"
    if acoustid_id and not has_metadata:
        return "acoustid_match_without_tempo", "AcoustID helped identify the track but no BPM source returned a tempo"
    if not has_metadata:
        return "missing_metadata_and_no_match", "file metadata was too sparse and no external match supplied a tempo"
    return "no_bpm_source", "no local or external BPM source produced a usable tempo"


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


def extract_metadata(filepath: str, original_name: Optional[str] = None) -> dict:
    metadata = {
        "title": None,
        "artist": None,
        "album": None,
        "duration": 0.0,
        "bitrate": 0.0,
        "bpm": 0.0,
        "key": None,
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
        metadata["key"] = _tag_value(audio.tags, "TKEY", "initialkey", "key")
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

    # Use original_name (e.g. the Google Drive filename) for filename fallback so that
    # cache-path prefixes like fileId don't pollute artist/title.
    fallback_path = original_name if original_name else filepath
    filename_metadata = _parse_filename_metadata(fallback_path)
    if not metadata["artist"]:
        metadata["artist"] = _normalize_artist(filename_metadata["artist"])
    if not metadata["title"]:
        metadata["title"] = filename_metadata["title"] or Path(fallback_path).stem

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
    if previews.get("album_art_provider") == "theaudiodb_album":
        return "TheAudioDB album artwork matched"
    if previews.get("album_art_provider") == "theaudiodb_track":
        return "TheAudioDB track artwork matched"
    if previews.get("album_art_provider") in {"musicbrainz_release_group", "musicbrainz_release"}:
        return "MusicBrainz/Cover Art Archive artwork matched"
    if previews.get("album_art_provider") == "discogs_release":
        return "Discogs artwork matched"
    if previews.get("artist_image_provider") == "theaudiodb_artist":
        return "TheAudioDB artist image fallback matched"
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
    artist_art_cache: dict[str, dict],
    preferred_album_art_url: str = "",
    preferred_album_art_source: str = "",
) -> dict:
    spotify_album_name = str(previews.get("spotify_album_name") or "")
    album_group_key = _album_group_key(metadata.get("artist"), metadata.get("album") or spotify_album_name)
    artist_cache_key = _artist_cache_key(metadata.get("artist"))
    embedded_url = str(metadata.get("embedded_album_art_url") or "")
    spotify_url = str(previews.get("album_art_url") or "")
    artist_image_url = str(previews.get("artist_image_url") or "")
    album_art_provider = str(previews.get("album_art_provider") or "")
    artist_image_provider = str(previews.get("artist_image_provider") or "")
    spotify_score = float(previews.get("spotify_match_score") or 0.0)
    cached = album_art_cache.get(album_group_key, {}) if album_group_key else {}
    cached_artist = artist_art_cache.get(artist_cache_key, {}) if artist_cache_key else {}

    result = {
        "album_art_url": "",
        "album_art_source": "",
        "album_art_confidence": 0.0,
        "album_art_review_status": "missing" if fetch_album_art else "disabled",
        "album_art_review_notes": "album art lookup disabled" if not fetch_album_art else "no artwork matched",
        "album_group_key": album_group_key,
        "embedded_album_art": False,
        "album_art_candidates": [],
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
        if previews.get("album_art_candidates"):
            result["album_art_candidates"] = previews.get("album_art_candidates")
    elif fetch_album_art and preferred_album_art_url:
        source = (preferred_album_art_source or "server_lookup").strip() or "server_lookup"
        review_notes = "artwork reused from dj-assist server album cache"
        if source == "album_cache":
            review_notes = "artwork reused from existing album cache"
        result.update(
            {
                "album_art_url": preferred_album_art_url,
                "album_art_source": source,
                "album_art_confidence": 96.0 if source.startswith("server") else 90.0,
                "album_art_review_status": "approved",
                "album_art_review_notes": review_notes,
            }
        )
        if previews.get("album_art_candidates"):
            result["album_art_candidates"] = previews.get("album_art_candidates")
    elif fetch_album_art and spotify_url:
        high_confidence = bool(previews.get("spotify_high_confidence"))
        provider = album_art_provider or "spotify"
        review_notes = "spotify album match accepted" if high_confidence else "spotify match below auto-approve threshold"
        confidence = spotify_score if provider == "spotify" else max(16.0, spotify_score)
        review_status = "approved" if high_confidence and provider == "spotify" else "needs_review"
        if provider == "theaudiodb_album":
            review_notes = "TheAudioDB album artwork used as fallback"
        elif provider == "theaudiodb_track":
            review_notes = "TheAudioDB track artwork used as fallback"
        elif provider in {"musicbrainz_release_group", "musicbrainz_release"}:
            review_notes = "MusicBrainz/Cover Art Archive artwork used as fallback"
            confidence = max(24.0, spotify_score)
            review_status = "approved"
        elif provider == "discogs_release":
            review_notes = "Discogs artwork used as fallback"
            confidence = max(18.0, spotify_score)
            review_status = "needs_review"
        result.update(
            {
                "album_art_url": spotify_url,
                "album_art_source": provider,
                "album_art_confidence": confidence,
                "album_art_review_status": review_status,
                "album_art_review_notes": review_notes,
            }
        )
        if previews.get("album_art_candidates"):
            result["album_art_candidates"] = previews.get("album_art_candidates")
    elif fetch_album_art and artist_image_url:
        provider = artist_image_provider or "artist"
        review_notes = "spotify artist image used as fallback because no album cover was available"
        if provider == "theaudiodb_artist":
            review_notes = "TheAudioDB artist image used as fallback because no album cover was available"
        result.update(
            {
                "album_art_url": artist_image_url,
                "album_art_source": provider,
                "album_art_confidence": max(10.0, min(spotify_score, 17.9)),
                "album_art_review_status": "needs_review",
                "album_art_review_notes": review_notes,
            }
        )
    elif fetch_album_art and cached_artist.get("album_art_url"):
        cached_confidence = float(cached_artist.get("album_art_confidence") or 0.0)
        result.update(
            {
                "album_art_url": str(cached_artist.get("album_art_url") or ""),
                "album_art_source": "artist_cache",
                "album_art_confidence": cached_confidence,
                "album_art_review_status": "needs_review",
                "album_art_review_notes": f"reused fallback artist image for {metadata.get('artist') or 'artist'}",
            }
        )
        if previews.get("album_art_candidates"):
            result["album_art_candidates"] = previews.get("album_art_candidates")
    elif fetch_album_art and artist_image_url:
        provider = artist_image_provider or "artist"
        review_notes = "artist image used as final fallback because no album cover was available"
        if provider == "theaudiodb_artist":
            review_notes = "TheAudioDB artist image used as final fallback because no album cover was available"
        result.update(
            {
                "album_art_url": artist_image_url,
                "album_art_source": provider,
                "album_art_confidence": 12.0,
                "album_art_review_status": "needs_review",
                "album_art_review_notes": review_notes,
            }
        )
        if previews.get("album_art_candidates"):
            result["album_art_candidates"] = previews.get("album_art_candidates")
    elif fetch_album_art and previews.get("spotify_id"):
        result.update(
            {
                "album_art_review_status": "needs_review",
                "album_art_review_notes": _art_debug_reason(previews, fetch_album_art),
            }
        )
        if previews.get("album_art_candidates"):
            result["album_art_candidates"] = previews.get("album_art_candidates")

    if album_group_key and result["album_art_url"]:
        existing = album_art_cache.get(album_group_key)
        if not existing or float(result["album_art_confidence"]) >= float(existing.get("album_art_confidence") or 0.0):
            album_art_cache[album_group_key] = {
                "album_art_url": result["album_art_url"],
                "album_art_source": result["album_art_source"],
                "album_art_confidence": result["album_art_confidence"],
            }

    if artist_cache_key and result["album_art_url"] and result["album_art_source"] in {"artist", "artist_cache"}:
        existing_artist = artist_art_cache.get(artist_cache_key)
        if not existing_artist or float(result["album_art_confidence"]) >= float(existing_artist.get("album_art_confidence") or 0.0):
            artist_art_cache[artist_cache_key] = {
                "album_art_url": result["album_art_url"],
                "album_art_source": "artist",
                "album_art_confidence": result["album_art_confidence"],
            }

    return result


def _should_compute_hash(existing, unchanged: bool, lookup_allowed: bool) -> bool:
    if existing is None or not unchanged:
        return True
    if lookup_allowed and not getattr(existing, "file_hash", None):
        return True
    return False


def _process_scan_candidate(
    filepath: str,
    metadata: dict,
    *,
    file_hash: str,
    file_size: int,
    file_mtime: float,
    bpm_lookup: str,
    fetch_album_art: bool,
    spotify_enabled: bool,
    fast_scan: bool,
    auto_double_bpm: bool,
    server_lookup_enabled: bool,
    defer_artwork: bool,
) -> dict:
    previews = dict(_EMPTY_PREVIEWS)
    preferred_album_art_url = ""
    preferred_album_art_source = ""
    user = _user_data()
    lookup_log = ""
    server_track = None

    if server_lookup_enabled:
        server_track, lookup_log = _lookup_server_track(file_hash)

    if server_track:
        track_data = _server_track_to_local(server_track, filepath, file_hash, file_size, file_mtime)
        if track_data.get("album_art_url"):
            preferred_album_art_url = str(track_data.get("album_art_url") or "")
            preferred_album_art_source = str(track_data.get("album_art_source") or "server_lookup")
        if not _server_track_needs_local_analysis(server_track):
            return {
                "status": "server_match",
                "filepath": filepath,
                "metadata": metadata,
                "track_data": track_data,
                "lookup_log": lookup_log,
                "user": user,
            }
        metadata = _seed_metadata_from_server(metadata, track_data)

    can_spotify = bpm_lookup in {"auto", "spotify", "both"}
    needs_acoustid = (not fast_scan) and (not bool(metadata["artist"] and metadata["title"]))
    analysis = _run_local_analysis(filepath, bpm_lookup, auto_double_bpm)

    previews = build_media_links(
        metadata["artist"],
        metadata["title"],
        metadata["album"],
        metadata["duration"],
        metadata["track_number"],
        metadata["release_year"],
        fetch_album_art and not defer_artwork,
        filepath,
        spotify_enabled if not fast_scan else False,
        needs_acoustid,
    )

    return {
        "status": "analyzed",
        "filepath": filepath,
        "metadata": metadata,
        "analysis": analysis,
        "previews": previews,
        "lookup_log": lookup_log,
        "preferred_album_art_url": preferred_album_art_url,
        "preferred_album_art_source": preferred_album_art_source,
        "server_track": server_track,
        "file_hash": file_hash,
        "file_size": file_size,
        "file_mtime": file_mtime,
        "can_spotify": can_spotify,
        "needs_acoustid": needs_acoustid,
        "defer_artwork": defer_artwork,
        "user": user,
    }


def _process_deferred_artwork_candidate(
    filepath: str,
    metadata: dict,
    *,
    spotify_enabled: bool,
    fast_scan: bool,
    needs_acoustid: bool,
) -> dict:
    previews = build_media_links(
        metadata.get("artist"),
        metadata.get("title"),
        metadata.get("album"),
        metadata.get("duration"),
        metadata.get("track_number"),
        metadata.get("release_year"),
        True,
        filepath,
        spotify_enabled if not fast_scan else False,
        needs_acoustid,
    )
    return {
        "filepath": filepath,
        "metadata": metadata,
        "previews": previews,
    }


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
            if _should_ignore_scan_file(filename):
                continue
            if Path(filename).suffix.lower() in SUPPORTED_EXTENSIONS:
                audio_files.append(os.path.join(root, filename))

    total_files = len(audio_files)
    processed = 0
    scan_started_at = time.perf_counter()

    def _emit(event: dict) -> None:
        if not progress_callback:
            return
        progress_callback({"current": processed, "total": total_files, **event})

    if progress_callback:
        _emit({"event": "scan_start", "directory": directory})
    else:
        print(f"\nFound {total_files} audio files")

    def _step(label: str, filepath: str) -> None:
        if verbose:
            _emit({"event": "track_step", "path": filepath, "file": Path(filepath).name, "step": label})
            tqdm.write(f"  [{label}] {Path(filepath).name}")

    album_art_cache: dict[str, dict] = {}
    artist_art_cache: dict[str, dict] = {}
    folder_bpm_context: dict[str, list[float]] = {}
    defer_artwork = _defer_artwork_enrichment(total_files, fetch_album_art)
    scan_workers = _scan_concurrency()
    analysis_workers = _analysis_workers()
    artwork_workers = _artwork_workers() if defer_artwork else 1
    commit_batch_size = 1 if getattr(db, "is_sqlite", False) else _db_commit_batch_size()
    lookup_allowed, _ = _lookup_server_allowed()
    server_sync_enabled = _server_enabled()
    server_failure_streak = 0
    server_failure_limit = 2 if _server_is_local_debug() else 4
    pending_writes = 0
    last_visible_commit_at = time.perf_counter()
    visible_commit_batch_size = max(3, min(5, commit_batch_size))
    visible_commit_interval_s = 0.75
    scan_session = db.get_session()
    metrics = {
        "hashed_files": 0,
        "server_matches": 0,
        "deferred_artwork_jobs": 0,
        "completed_artwork_jobs": 0,
        "db_commits": 0,
    }

    def _record_server_result(log: str) -> None:
        nonlocal server_sync_enabled, server_failure_streak
        if not server_sync_enabled:
            return
        normalized = (log or "").lower()
        failed = any(token in normalized for token in [" timeout ", "timed out", "connection refused", "lookup error", "upload error"])
        if not failed:
            server_failure_streak = 0
            return
        server_failure_streak += 1
        if server_failure_streak < server_failure_limit:
            return
        server_sync_enabled = False
        _emit(
            {
                "event": "log",
                "level": "warning",
                "message": (
                    "dj-assist-server disabled for the rest of this scan after "
                    f"{server_failure_streak} consecutive failures."
                ),
            }
        )

    def _commit_pending(*, force: bool = False) -> None:
        nonlocal pending_writes, last_visible_commit_at
        if pending_writes <= 0:
            return
        if not force and pending_writes < commit_batch_size:
            return
        scan_session.commit()
        pending_writes = 0
        last_visible_commit_at = time.perf_counter()
        metrics["db_commits"] += 1

    def _commit_pending_for_visibility() -> None:
        if pending_writes <= 0:
            return
        if pending_writes >= visible_commit_batch_size:
            _commit_pending(force=True)
            return
        if time.perf_counter() - last_visible_commit_at >= visible_commit_interval_s:
            _commit_pending(force=True)
            return
        _commit_pending()

    def _enqueue_artwork_enrichment(track_id: int, filepath: str, metadata: dict, needs_acoustid: bool, art_pool, pending_art: dict) -> None:
        if not defer_artwork:
            return
        if not metadata.get("artist") and not metadata.get("title"):
            return
        future = art_pool.submit(
            _process_deferred_artwork_candidate,
            filepath,
            dict(metadata),
            spotify_enabled=spotify_enabled,
            fast_scan=fast_scan,
            needs_acoustid=needs_acoustid,
        )
        pending_art[future] = {"track_id": track_id}
        metrics["deferred_artwork_jobs"] += 1

    def _drain_artwork_futures(pending_art: dict, *, block: bool = False) -> None:
        nonlocal pending_writes
        if not pending_art:
            return
        done = set()
        if block:
            done, _ = wait(set(pending_art.keys()), return_when=FIRST_COMPLETED)
        else:
            done = {future for future in pending_art if future.done()}
        for future in done:
            context = pending_art.pop(future)
            try:
                payload = future.result()
                metadata = payload["metadata"]
                previews = payload["previews"]
                preferred_album_art_url, preferred_album_art_source = _lookup_preferred_album_art(
                    db,
                    metadata.get("artist"),
                    metadata.get("album") or previews.get("spotify_album_name"),
                    previews.get("spotify_album_name"),
                )
                album_art = _resolve_album_art(
                    metadata,
                    previews,
                    True,
                    album_art_cache,
                    artist_art_cache,
                    preferred_album_art_url=preferred_album_art_url,
                    preferred_album_art_source=preferred_album_art_source,
                )
                album_art_url = str(album_art.get("album_art_url") or "")
                if not album_art_url:
                    continue
                db.update_track_fields(
                    context["track_id"],
                    {
                        "spotify_id": previews.get("spotify_id"),
                        "spotify_uri": previews.get("spotify_uri"),
                        "spotify_url": previews.get("spotify_url"),
                        "spotify_preview_url": previews.get("spotify_preview_url"),
                        "spotify_tempo": previews.get("spotify_tempo"),
                        "spotify_key": previews.get("spotify_key"),
                        "spotify_mode": previews.get("spotify_mode"),
                        "spotify_album_name": previews.get("spotify_album_name"),
                        "spotify_match_score": float(previews.get("spotify_match_score") or 0.0),
                        "spotify_high_confidence": str(previews.get("spotify_high_confidence") or False).lower(),
                        "album_art_url": album_art_url,
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
                                "candidates": album_art.get("album_art_candidates") or [],
                                "spotify_debug": previews.get("spotify_debug") or "",
                            }
                        ),
                    },
                    session=scan_session,
                    commit=False,
                    skip_empty=True,
                )
                pending_writes += 1
                metrics["completed_artwork_jobs"] += 1
                _emit(
                    {
                        "event": "log",
                        "level": "success",
                        "message": (
                            f"{Path(payload['filepath']).name}: background artwork enrichment "
                            f"stored source={album_art['album_art_source'] or 'none'}"
                        ),
                    }
                )
                _commit_pending_for_visibility()
            except Exception as exc:
                _emit(
                    {
                        "event": "log",
                        "level": "warning",
                        "message": f"{Path(str(context.get('track_id'))).name}: artwork enrichment failed: {exc}",
                    }
                )

    def _finalize_candidate(candidate: dict, pending_art: dict, art_pool) -> None:
        nonlocal processed, pending_writes
        filepath = candidate["filepath"]
        file_label = Path(filepath).name
        lookup_log = str(candidate.get("lookup_log") or "").strip()
        if lookup_log:
            _record_server_result(lookup_log)
            _emit(
                {
                    "event": "log",
                    "level": "success" if candidate.get("server_track") or candidate["status"] == "server_match" else ("warning" if "error" in lookup_log else "info"),
                    "message": f"{file_label}: dj-assist-server {lookup_log}",
                }
            )

        if candidate["status"] == "server_match":
            metrics["server_matches"] += 1
            track_data = candidate["track_data"]
            track = db.add_track(track_data, session=scan_session, commit=False)
            pending_writes += 1
            _commit_pending()
            bpm = float(track_data.get("bpm") or track_data.get("spotify_tempo") or 0.0)
            key = str(track_data.get("key") or track_data.get("spotify_key") or track_data.get("key_numeric") or "")
            results["analyzed"] += 1
            processed += 1
            _emit(
                {
                    "event": "track_complete",
                    "path": filepath,
                    "file": file_label,
                    "status": "server_match",
                    "artist": track_data.get("artist"),
                    "title": track_data.get("title"),
                    "bpm": bpm,
                    "bpm_source": track_data.get("bpm_source") or "server",
                    "key": key,
                    "spotify_id": track_data.get("spotify_id"),
                    "album_art_url": track_data.get("album_art_url"),
                    "album_art_source": track_data.get("album_art_source"),
                    "album_art_confidence": float(track_data.get("album_art_confidence") or 0.0),
                    "album_art_review_status": track_data.get("album_art_review_status"),
                    "decode_failed": track_data.get("decode_failed"),
                }
            )
            _emit(
                {
                    "event": "log",
                    "level": "success",
                    "message": f"{file_label}: server match bpm={bpm or 0:.1f} key={key or 'none'}",
                }
            )
            return

        metadata = candidate["metadata"]
        analysis = candidate["analysis"]
        previews = candidate["previews"]
        if not metadata["artist"] and previews.get("acoustid_artist"):
            metadata["artist"] = _smart_capitalize(_normalize_artist(str(previews.get("acoustid_artist") or "")))
        if (not metadata["title"] or not str(metadata["title"]).strip()) and previews.get("acoustid_title"):
            metadata["title"] = _smart_capitalize(str(previews.get("acoustid_title") or "").strip() or metadata["title"])
        if (not metadata["album"] or not str(metadata["album"]).strip()) and previews.get("acoustid_album"):
            metadata["album"] = _smart_capitalize(str(previews.get("acoustid_album") or "").strip() or metadata["album"])

        bpm = float(analysis.get("bpm") or 0.0)
        bpm_source = str(analysis.get("bpm_source") or "")
        bpm_error = str(analysis.get("bpm_error") or "")
        bpm_confidence = float(analysis.get("bpm_confidence") or 0.0)
        decode_failed = bool(analysis.get("decode_failed"))
        key = str(analysis.get("key") or "")
        key_numeric = str(analysis.get("key_numeric") or "")

        if not bpm and candidate.get("can_spotify"):
            spotify_bpm = float(previews.get("spotify_tempo") or 0.0)
            if spotify_bpm:
                bpm = spotify_bpm
                bpm_source = "spotify"
                bpm_error = ""
                bpm_confidence = max(bpm_confidence, 0.55)
        if not key and previews.get("spotify_key"):
            key = str(previews.get("spotify_key") or "")
            key_numeric = key

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

        preferred_album_art_url = str(candidate.get("preferred_album_art_url") or "")
        preferred_album_art_source = str(candidate.get("preferred_album_art_source") or "")
        if fetch_album_art and not preferred_album_art_url and previews.get("spotify_album_name"):
            preferred_album_art_url, preferred_album_art_source = _lookup_preferred_album_art(
                db,
                metadata.get("artist"),
                previews.get("spotify_album_name"),
                previews.get("spotify_album_name"),
            )

        album_art = _resolve_album_art(
            metadata,
            previews,
            fetch_album_art,
            album_art_cache,
            artist_art_cache,
            preferred_album_art_url=preferred_album_art_url,
            preferred_album_art_source=preferred_album_art_source,
        )
        album_art_url = str(album_art.get("album_art_url") or "")

        debug_parts = [
            f"file={filepath}",
            f"analysis_mode=in_process_pool",
            f"bpm={bpm or 0.0}",
            f"bpm_source={bpm_source or 'none'}",
            f"key={key or 'none'}",
            f"spotify_id={previews.get('spotify_id') or 'none'}",
            f"acoustid_id={previews.get('acoustid_id') or 'none'}",
            f"album_art_source={album_art.get('album_art_source') or 'none'}",
        ]
        if normalization_reason:
            debug_parts.append(f"bpm_normalized={normalization_reason}")

        bpm_missing_reason = ""
        bpm_missing_detail = ""
        if not bpm:
            bpm_missing_reason, bpm_missing_detail = _describe_missing_bpm(
                bpm_error=bpm_error,
                decode_failed=decode_failed,
                can_spotify=bool(candidate.get("can_spotify")),
                enrichment_enabled=True,
                spotify_scan_enabled=spotify_enabled,
                previews=previews,
                metadata=metadata,
            )
            debug_parts.append(f"bpm_missing_reason={bpm_missing_reason}")

        track_data = {
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
                    "candidates": album_art.get("album_art_candidates") or [],
                    "spotify_debug": previews.get("spotify_debug") or "",
                }
            ),
            "youtube_url": previews["youtube_url"],
            "analysis_status": "ok" if bpm else "needs_review",
            "analysis_error": bpm_error,
            "decode_failed": decode_failed,
            "analysis_stage": "analysis_pool",
            "analysis_debug": " | ".join(debug_parts),
            "bpm_source": bpm_source,
            "bpm_confidence": bpm_confidence,
            "file_hash": candidate["file_hash"],
            "file_size": candidate["file_size"],
            "file_mtime": candidate["file_mtime"],
        }
        track = db.add_track(track_data, session=scan_session, commit=False)
        pending_writes += 1
        _commit_pending_for_visibility()

        if defer_artwork and fetch_album_art and not album_art_url:
            _enqueue_artwork_enrichment(track.id, filepath, metadata, bool(candidate.get("needs_acoustid")), art_pool, pending_art)

        uploaded = False
        upload_log = ""
        if server_sync_enabled:
            uploaded, upload_log = _upload_track_to_server(track_data, candidate["file_hash"] or filepath)
        elif _server_enabled():
            upload_log = "upload skipped (server temporarily disabled)"
        if upload_log:
            _record_server_result(upload_log)
            _emit(
                {
                    "event": "log",
                    "level": "success" if uploaded else ("warning" if "skipped" in upload_log else "error"),
                    "message": f"{file_label}: dj-assist-server {upload_log}",
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
                "file": file_label,
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
                "server_uploaded": uploaded,
                "server_upload_log": upload_log,
                "bpm_missing_reason": bpm_missing_reason,
                "bpm_missing_detail": bpm_missing_detail,
            }
        )
        _emit(
            {
                "event": "log",
                "level": "success" if bpm else "warning",
                "message": (
                    f"{file_label}: bpm={bpm or 0:.1f} src={bpm_source or 'none'} "
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

    pending_scan: dict[Future, str] = {}
    pending_art: dict[Future, dict] = {}

    _emit(
        {
            "event": "log",
            "level": "info",
            "message": (
                f"Scan pipeline ready: files={total_files} scan_workers={scan_workers} "
                f"analysis_workers={analysis_workers} artwork_workers={artwork_workers} "
                f"batch_commit={commit_batch_size} defer_artwork={'yes' if defer_artwork else 'no'}"
            ),
        }
    )

    iterator = audio_files if progress_callback else tqdm(audio_files, desc="Scanning")
    try:
        with ThreadPoolExecutor(max_workers=max(scan_workers, analysis_workers)) as scan_pool, ThreadPoolExecutor(max_workers=artwork_workers) as art_pool:
            for filepath in iterator:
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
                    _emit({"event": "track_complete", "path": filepath, "file": Path(filepath).name, "status": "skipped", "reason": skip_reason})
                    _emit({"event": "log", "level": "info", "message": f"{Path(filepath).name}: skipped ({skip_reason})"})
                    _drain_artwork_futures(pending_art)
                    continue

                should_hash = _should_compute_hash(existing, unchanged, lookup_allowed and server_sync_enabled)
                file_hash = get_file_hash(filepath) if should_hash else str(getattr(existing, "file_hash", "") or "")
                if should_hash:
                    metrics["hashed_files"] += 1
                results["scanned"] += 1
                _step("metadata", filepath)
                metadata = extract_metadata(filepath)
                future = scan_pool.submit(
                    _process_scan_candidate,
                    filepath,
                    dict(metadata),
                    file_hash=file_hash,
                    file_size=file_size,
                    file_mtime=file_mtime,
                    bpm_lookup=bpm_lookup,
                    fetch_album_art=fetch_album_art,
                    spotify_enabled=spotify_enabled,
                    fast_scan=fast_scan,
                    auto_double_bpm=auto_double_bpm,
                    server_lookup_enabled=bool(lookup_allowed and server_sync_enabled),
                    defer_artwork=defer_artwork,
                )
                pending_scan[future] = filepath
                if len(pending_scan) >= scan_workers:
                    done, _ = wait(set(pending_scan.keys()), return_when=FIRST_COMPLETED)
                    for done_future in done:
                        pending_scan.pop(done_future, None)
                        _finalize_candidate(done_future.result(), pending_art, art_pool)
                    _drain_artwork_futures(pending_art)

            while pending_scan:
                done, _ = wait(set(pending_scan.keys()), return_when=FIRST_COMPLETED)
                for done_future in done:
                    pending_scan.pop(done_future, None)
                    _finalize_candidate(done_future.result(), pending_art, art_pool)
                _drain_artwork_futures(pending_art)

            while pending_art:
                _drain_artwork_futures(pending_art, block=True)

        _commit_pending(force=True)
    except Exception:
        scan_session.rollback()
        raise
    finally:
        scan_session.close()

    elapsed_s = max(0.001, time.perf_counter() - scan_started_at)
    _emit(
        {
            "event": "log",
            "level": "info",
            "message": (
                f"Scan metrics: elapsed={elapsed_s:.2f}s processed={processed}/{total_files} "
                f"hashed={metrics['hashed_files']} server_matches={metrics['server_matches']} "
                f"deferred_art={metrics['deferred_artwork_jobs']} completed_art={metrics['completed_artwork_jobs']} "
                f"db_commits={metrics['db_commits']} throughput={processed / elapsed_s:.2f} files/s"
            ),
            "metrics": {
                **metrics,
                "elapsed_seconds": round(elapsed_s, 3),
                "throughput_files_per_second": round(processed / elapsed_s, 3),
                "processed_files": processed,
                "total_files": total_files,
                "defer_artwork": defer_artwork,
                "scan_workers": scan_workers,
                "analysis_workers": analysis_workers,
                "artwork_workers": artwork_workers,
                "db_commit_batch_size": commit_batch_size,
            },
        }
    )
    _emit({"event": "scan_complete", "results": results})
    return results
