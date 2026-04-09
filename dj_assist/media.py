from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher
from functools import lru_cache
import json
import os
import re
import shutil
import subprocess
import time
from urllib.parse import quote_plus

import requests

# Minimum seconds to wait between Spotify API calls.
_SPOTIFY_REQUEST_DELAY = float(os.getenv("SPOTIFY_REQUEST_DELAY", "0.15"))
_SPOTIFY_HTTP_TIMEOUT = float(os.getenv("SPOTIFY_HTTP_TIMEOUT", "3"))
_ACOUSTID_REQUEST_DELAY = float(os.getenv("ACOUSTID_REQUEST_DELAY", "0.05"))
_ACOUSTID_API_URL = "https://api.acoustid.org/v2/lookup"
_DEFAULT_ACOUSTID_API_KEY = "UNhsnYL0za"

# Module-level token cache so all SpotifyClient instances within a process
# share one token instead of fetching a new one per track.
_spotify_token_cache: dict[str, str] = {"token": "", "type": "Bearer"}


def youtube_search_url(query: str) -> str:
    return f"https://www.youtube.com/results?search_query={quote_plus(query)}"


def spotify_search_url(query: str) -> str:
    return f"https://open.spotify.com/search/{quote_plus(query)}"


def youtube_preview_url(query: str) -> str:
    return youtube_search_url(query)


@dataclass
class SpotifyMatch:
    spotify_id: str = ""
    spotify_uri: str = ""
    spotify_url: str = ""
    spotify_preview_url: str = ""
    tempo: float = 0.0
    key: str = ""
    mode: str = ""
    album_art_url: str = ""
    artist_image_url: str = ""
    album_name: str = ""
    match_score: float = 0.0
    high_confidence: bool = False
    debug: str = ""
    track_number: int = 0
    release_year: int = 0


@dataclass
class AcoustIdMatch:
    artist: str = ""
    title: str = ""
    album: str = ""
    score: float = 0.0
    acoustid_id: str = ""
    recording_id: str = ""
    fingerprint_duration: int = 0
    debug: str = ""


class SpotifyClient:
    def __init__(self) -> None:
        import os

        self.client_id = os.getenv("SPOTIFY_CLIENT_ID", "").strip()
        self.client_secret = os.getenv("SPOTIFY_CLIENT_SECRET", "").strip()
        self._token = ""
        self._token_type = "Bearer"

    def missing_credentials(self) -> list[str]:
        missing = []
        if not self.client_id:
            missing.append("SPOTIFY_CLIENT_ID")
        if not self.client_secret:
            missing.append("SPOTIFY_CLIENT_SECRET")
        return missing

    def enabled(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def connection_status(self) -> dict[str, str | bool]:
        status = {
            "enabled": self.enabled(),
            "token_ok": False,
            "error": "",
        }
        if not self.enabled():
            status["error"] = "missing_credentials"
            return status

        try:
            token = self._get_token()
            status["token_ok"] = bool(token)
            if not token:
                status["error"] = "empty_token"
        except Exception as exc:
            status["error"] = str(exc)
        return status

    def _get_token(self) -> str:
        if not self.enabled():
            return ""
        if _spotify_token_cache["token"]:
            return _spotify_token_cache["token"]

        response = requests.post(
            "https://accounts.spotify.com/api/token",
            data={"grant_type": "client_credentials"},
            auth=(self.client_id, self.client_secret),
            timeout=_SPOTIFY_HTTP_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
        _spotify_token_cache["token"] = payload.get("access_token", "")
        _spotify_token_cache["type"] = payload.get("token_type", "Bearer")
        return _spotify_token_cache["token"]

    def _get_with_retry(self, url: str, max_retries: int = 2, **kwargs) -> requests.Response:
        """GET with automatic retry on 429, honouring Retry-After and adding a
        small inter-request delay to stay within Spotify's rate limits."""
        for attempt in range(max_retries + 1):
            if _SPOTIFY_REQUEST_DELAY > 0:
                time.sleep(_SPOTIFY_REQUEST_DELAY)
            response = requests.get(url, **kwargs)
            if response.status_code != 429:
                return response
            retry_after = float(response.headers.get("Retry-After", 2 ** attempt))
            retry_after = min(retry_after, 10.0)  # never block more than 10s per attempt
            time.sleep(retry_after)
        return response  # return last response even if still 429

    def _headers(self) -> dict[str, str]:
        token = self._get_token()
        if not token:
            return {}
        return {"Authorization": f"{_spotify_token_cache['type']} {token}"}

    @staticmethod
    def _duration_tolerance_seconds() -> float:
        import os

        try:
            return float(os.getenv("SPOTIFY_MATCH_DURATION_TOLERANCE", "6"))
        except ValueError:
            return 6.0

    @staticmethod
    def _art_confidence_threshold() -> float:
        import os

        try:
            return float(os.getenv("SPOTIFY_ART_CONFIDENCE_THRESHOLD", "18"))
        except ValueError:
            return 18.0

    @staticmethod
    def _normalize_text(value: str | None) -> str:
        if not value:
            return ""
        value = value.lower()
        value = re.sub(r"\([^)]*\)", " ", value)
        value = re.sub(r"\[[^\]]*\]", " ", value)
        value = re.sub(r"\b(feat|ft|featuring|with|vs|remix|mix|edit|version|extended|radio)\b", " ", value)
        value = re.sub(r"[^a-z0-9]+", " ", value)
        return re.sub(r"\s+", " ", value).strip()

    @staticmethod
    def _text_similarity(left: str | None, right: str | None) -> float:
        a = SpotifyClient._normalize_text(left)
        b = SpotifyClient._normalize_text(right)
        if not a or not b:
            return 0.0
        if a == b:
            return 1.0
        return SequenceMatcher(None, a, b).ratio()

    @staticmethod
    def _parse_release_year(value: str | None) -> int:
        if not value:
            return 0
        match = re.search(r"(\d{4})", value)
        return int(match.group(1)) if match else 0

    def search_track(
        self,
        artist: str | None,
        title: str | None,
        album: str | None = None,
        duration: float | None = None,
        track_number: int | None = None,
        release_year: int | None = None,
        include_album_art: bool = False,
    ) -> SpotifyMatch:
        if not self.enabled() or not title:
            return SpotifyMatch(debug=json.dumps({"enabled": self.enabled(), "has_title": bool(title)}))

        queries = []
        if artist:
            queries.append(f'artist:"{artist}" track:"{title}"')
            queries.append(f"{artist} {title}")
        queries.append(title)

        debug = {"queries": []}

        for query in queries:
            try:
                response = self._get_with_retry(
                    "https://api.spotify.com/v1/search",
                    headers=self._headers(),
                    params={"q": query, "type": "track", "limit": 10},
                    timeout=_SPOTIFY_HTTP_TIMEOUT,
                )
                response.raise_for_status()
                items = response.json().get("tracks", {}).get("items", [])
                debug["queries"].append({"query": query, "items": len(items)})
                if not items:
                    continue

                best = self._pick_best_match(
                    items,
                    artist=artist,
                    title=title,
                    album=album,
                    duration=duration,
                    track_number=track_number,
                    release_year=release_year,
                    duration_tolerance=self._duration_tolerance_seconds(),
                )
                if best:
                    best_item, best_score = best
                    tempo, key, mode = self._fetch_audio_features(best_item.get("id", ""))
                    album = best_item.get("album") or {}
                    images = album.get("images") or []
                    album_art_url = ""
                    artist_image_url = ""
                    if include_album_art and images and best_score >= self._art_confidence_threshold():
                        album_art_url = images[0].get("url", "")
                    if include_album_art and not album_art_url:
                        artist_ids = [str(artist.get("id") or "").strip() for artist in best_item.get("artists", [])]
                        artist_image_url = self._fetch_artist_image(next((artist_id for artist_id in artist_ids if artist_id), ""))
                    album_track_number = int(best_item.get("track_number") or 0)
                    album_release_year = self._parse_release_year(album.get("release_date"))
                    return SpotifyMatch(
                        spotify_id=best_item.get("id", ""),
                        spotify_uri=best_item.get("uri", ""),
                        spotify_url=best_item.get("external_urls", {}).get("spotify", ""),
                        spotify_preview_url=best_item.get("preview_url", "") or "",
                        tempo=tempo,
                        key=key,
                        mode=mode,
                        album_art_url=album_art_url,
                        artist_image_url=artist_image_url,
                        album_name=album.get("name", "") or "",
                        match_score=best_score,
                        high_confidence=best_score >= self._art_confidence_threshold(),
                        debug=json.dumps({**debug, "matched": best_item.get("id", ""), "score": best_score}),
                        track_number=album_track_number,
                        release_year=album_release_year,
                    )
            except Exception as exc:
                debug.setdefault("errors", []).append({"query": query, "error": str(exc)})
                continue

        return SpotifyMatch(debug=json.dumps(debug))

    @staticmethod
    def _pick_best_match(
        items: list[dict],
        artist: str | None,
        title: str | None,
        album: str | None,
        duration: float | None,
        track_number: int | None,
        release_year: int | None,
        duration_tolerance: float = 6.0,
    ) -> tuple[dict, float] | None:
        if not items:
            return None

        candidates: list[tuple[float, dict]] = []

        def score(item: dict) -> float:
            value = 0.0
            item_name = (item.get("name") or "")
            artists = [a.get("name", "") for a in item.get("artists", [])]
            album_name = (item.get("album") or {}).get("name", "")
            artist_similarity = max([SpotifyClient._text_similarity(artist, candidate) for candidate in artists] + [0.0])
            title_similarity = SpotifyClient._text_similarity(title, item_name)
            album_similarity = SpotifyClient._text_similarity(album, album_name)

            value += title_similarity * 14.0
            value += artist_similarity * 12.0
            value += album_similarity * 7.0

            if title_similarity >= 0.98:
                value += 4.0
            if artist_similarity >= 0.98:
                value += 4.0
            if album and album_similarity >= 0.98:
                value += 2.0

            if duration:
                item_ms = item.get("duration_ms") or 0
                diff = abs((item_ms / 1000.0) - duration)
                if diff > duration_tolerance:
                    return float("-inf")
                value += max(0.0, duration_tolerance - diff) * 1.8
                value += 10.0 - min(diff, 10.0)
            if track_number:
                item_track_number = int(item.get("track_number") or 0)
                if item_track_number and item_track_number == track_number:
                    value += 3.0
            if release_year:
                item_release_year = SpotifyClient._parse_release_year((item.get("album") or {}).get("release_date"))
                if item_release_year:
                    value += max(0.0, 3.0 - min(abs(item_release_year - release_year), 3))
            if title_similarity >= 0.92 and artist_similarity >= 0.92:
                value += 4.0
            return value

        for item in items:
            item_score = score(item)
            if item_score != float("-inf"):
                candidates.append((item_score, item))

        if not candidates:
            return None

        candidates.sort(key=lambda pair: pair[0], reverse=True)
        best_score, best_item = candidates[0]
        if best_score < 12.0:
            return None
        return best_item, best_score

    def _fetch_audio_features(self, spotify_id: str) -> tuple[float, str, str]:
        if not spotify_id or not self.enabled():
            return 0.0, "", ""

        try:
            response = self._get_with_retry(
                f"https://api.spotify.com/v1/audio-features/{spotify_id}",
                headers=self._headers(),
                timeout=_SPOTIFY_HTTP_TIMEOUT,
            )
            response.raise_for_status()
            payload = response.json()
            tempo = float(payload.get("tempo") or 0.0)
            key_index = int(payload.get("key") or -1)
            mode = "major" if int(payload.get("mode") or 1) == 1 else "minor"
            camelot = self._key_to_camelot(key_index, mode)
            return tempo, camelot, mode
        except Exception:
            return 0.0, "", ""

    def _fetch_artist_image(self, artist_id: str) -> str:
        if not artist_id or not self.enabled():
            return ""

        try:
            response = self._get_with_retry(
                f"https://api.spotify.com/v1/artists/{artist_id}",
                headers=self._headers(),
                timeout=_SPOTIFY_HTTP_TIMEOUT,
            )
            response.raise_for_status()
            payload = response.json()
            images = payload.get("images") or []
            if not images:
                return ""
            return str(images[0].get("url") or "")
        except Exception:
            return ""

    @staticmethod
    def _key_to_camelot(key_index: int, mode: str) -> str:
        major = {0: "8B", 1: "3B", 2: "10B", 3: "5B", 4: "12B", 5: "7B", 6: "2B", 7: "9B", 8: "4B", 9: "11B", 10: "6B", 11: "1B"}
        minor = {0: "5A", 1: "12A", 2: "7A", 3: "2A", 4: "9A", 5: "4A", 6: "11A", 7: "6A", 8: "1A", 9: "8A", 10: "3A", 11: "10A"}
        if key_index < 0:
            return ""
        return major.get(key_index, "") if mode == "major" else minor.get(key_index, "")


class AcoustIdClient:
    def __init__(self) -> None:
        configured_key = os.getenv("ACOUSTID_API_KEY", "").strip()
        self.api_key = configured_key or _DEFAULT_ACOUSTID_API_KEY
        configured_fpcalc = os.getenv("FPCALC_PATH", "").strip()
        self.fpcalc_path = configured_fpcalc or shutil.which("fpcalc") or ""

    def enabled(self) -> bool:
        return bool(self.api_key)

    def available(self) -> bool:
        return self.enabled() and bool(self.fpcalc_path)

    def identify_track(
        self,
        file_path: str | None,
        *,
        artist: str | None = None,
        title: str | None = None,
        album: str | None = None,
        duration: float | None = None,
    ) -> AcoustIdMatch:
        debug: dict[str, object] = {
            "enabled": self.enabled(),
            "has_file": bool(file_path),
            "fpcalc_path": self.fpcalc_path or "",
        }
        if not self.enabled():
            debug["error"] = "missing_api_key"
            return AcoustIdMatch(debug=json.dumps(debug))
        if not file_path:
            debug["error"] = "missing_file_path"
            return AcoustIdMatch(debug=json.dumps(debug))
        if not self.fpcalc_path:
            debug["error"] = "fpcalc_missing"
            return AcoustIdMatch(debug=json.dumps(debug))

        try:
            fingerprint_duration, fingerprint = self._fingerprint_file(file_path)
            debug["fingerprint_duration"] = fingerprint_duration
            time.sleep(_ACOUSTID_REQUEST_DELAY)
            response = requests.get(
                _ACOUSTID_API_URL,
                params={
                    "client": self.api_key,
                    "duration": fingerprint_duration,
                    "fingerprint": fingerprint,
                    "meta": "recordings releasegroups compress",
                    "format": "json",
                },
                timeout=20,
            )
            response.raise_for_status()
            payload = response.json()
            results = payload.get("results") or []
            debug["result_count"] = len(results)
            if not results:
                debug["error"] = "no_results"
                return AcoustIdMatch(fingerprint_duration=fingerprint_duration, debug=json.dumps(debug))

            best = self._pick_best_result(
                results,
                artist=artist,
                title=title,
                album=album,
                duration=duration or fingerprint_duration,
            )
            if not best:
                debug["error"] = "no_recording_match"
                return AcoustIdMatch(fingerprint_duration=fingerprint_duration, debug=json.dumps(debug))

            match, debug_extra = best
            debug.update(debug_extra)
            match.fingerprint_duration = fingerprint_duration
            match.debug = json.dumps(debug)
            return match
        except Exception as exc:
            debug["error"] = str(exc)
            return AcoustIdMatch(debug=json.dumps(debug))

    def _fingerprint_file(self, file_path: str) -> tuple[int, str]:
        result = subprocess.run(
            [self.fpcalc_path, file_path],
            check=True,
            capture_output=True,
            text=True,
            timeout=45,
        )
        duration = 0
        fingerprint = ""
        for line in result.stdout.splitlines():
            if line.startswith("DURATION="):
                try:
                    duration = int(float(line.split("=", 1)[1].strip()))
                except ValueError:
                    duration = 0
            elif line.startswith("FINGERPRINT="):
                fingerprint = line.split("=", 1)[1].strip()
        if not duration or not fingerprint:
            raise RuntimeError("fpcalc did not return a usable fingerprint")
        return duration, fingerprint

    @staticmethod
    def _pick_best_result(
        results: list[dict],
        *,
        artist: str | None,
        title: str | None,
        album: str | None,
        duration: float | None,
    ) -> tuple[AcoustIdMatch, dict[str, object]] | None:
        candidates: list[tuple[float, AcoustIdMatch, dict[str, object]]] = []

        for result in results:
            result_score = float(result.get("score") or 0.0)
            acoustid_id = str(result.get("id") or "")
            recordings = result.get("recordings") or []
            if not recordings:
                continue
            for recording in recordings:
                recording_title = str(recording.get("title") or "").strip()
                artist_names = [
                    str(item.get("name") or "").strip()
                    for item in (recording.get("artists") or [])
                    if str(item.get("name") or "").strip()
                ]
                recording_artist = ", ".join(artist_names)
                releasegroups = recording.get("releasegroups") or []
                recording_album = ""
                if releasegroups:
                    recording_album = str(releasegroups[0].get("title") or "").strip()
                recording_duration = float(recording.get("duration") or 0.0)
                recording_id = str(recording.get("id") or "")

                score = result_score * 100.0
                title_similarity = SpotifyClient._text_similarity(title, recording_title)
                artist_similarity = SpotifyClient._text_similarity(artist, recording_artist)
                album_similarity = SpotifyClient._text_similarity(album, recording_album)
                score += title_similarity * 18.0
                score += artist_similarity * 14.0
                score += album_similarity * 8.0

                if title and title_similarity < 0.55:
                    score -= 10.0
                if artist and artist_similarity < 0.4:
                    score -= 8.0
                if duration and recording_duration:
                    diff = abs(recording_duration - duration)
                    score += max(0.0, 8.0 - min(diff, 8.0))

                candidates.append(
                    (
                        score,
                        AcoustIdMatch(
                            artist=recording_artist,
                            title=recording_title,
                            album=recording_album,
                            score=result_score,
                            acoustid_id=acoustid_id,
                            recording_id=recording_id,
                        ),
                        {
                            "selected_acoustid_id": acoustid_id,
                            "selected_recording_id": recording_id,
                            "selected_artist": recording_artist,
                            "selected_title": recording_title,
                            "selected_album": recording_album,
                            "selected_score": result_score,
                        },
                    )
                )

        if not candidates:
            return None

        candidates.sort(key=lambda item: item[0], reverse=True)
        best_score, best_match, best_debug = candidates[0]
        if best_score < 35.0:
            return None
        best_debug["selection_strength"] = best_score
        return best_match, best_debug


def _empty_media_links() -> dict[str, str | float | bool | int]:
    return {
        "youtube_url": "",
        "spotify_url": "",
        "spotify_preview_url": "",
        "spotify_uri": "",
        "spotify_id": "",
        "spotify_tempo": 0.0,
        "spotify_key": "",
        "spotify_mode": "",
        "album_art_url": "",
        "artist_image_url": "",
        "spotify_album_name": "",
        "spotify_match_score": 0.0,
        "spotify_high_confidence": False,
        "spotify_debug": "",
        "spotify_track_number": 0,
        "spotify_release_year": 0,
        "acoustid_artist": "",
        "acoustid_title": "",
        "acoustid_album": "",
        "acoustid_match_score": 0.0,
        "acoustid_id": "",
        "acoustid_recording_id": "",
        "acoustid_debug": "",
    }


@lru_cache(maxsize=256)
def build_media_links(
    artist: str | None,
    title: str | None,
    album: str | None = None,
    duration: float | None = None,
    track_number: int | None = None,
    release_year: int | None = None,
    fetch_album_art: bool = False,
    file_path: str | None = None,
    enable_spotify: bool = True,
    enable_acoustid: bool = True,
) -> dict[str, str | float | bool | int]:
    resolved_artist = artist
    resolved_title = title
    resolved_album = album
    if enable_acoustid:
        acoustid = AcoustIdClient().identify_track(
            file_path,
            artist=artist,
            title=title,
            album=album,
            duration=duration,
        )
    else:
        acoustid = AcoustIdMatch(debug=json.dumps({"enabled": False, "reason": "not_needed_for_scan"}))
    if not resolved_artist and acoustid.artist:
        resolved_artist = acoustid.artist
    if (not resolved_title or not resolved_title.strip()) and acoustid.title:
        resolved_title = acoustid.title
    if not resolved_album and acoustid.album:
        resolved_album = acoustid.album

    query = " ".join(part for part in [resolved_artist, resolved_title] if part)
    if not query:
        empty = _empty_media_links()
        empty.update(
            {
                "acoustid_artist": acoustid.artist,
                "acoustid_title": acoustid.title,
                "acoustid_album": acoustid.album,
                "acoustid_match_score": acoustid.score,
                "acoustid_id": acoustid.acoustid_id,
                "acoustid_recording_id": acoustid.recording_id,
                "acoustid_debug": acoustid.debug,
            }
        )
        return empty

    if not enable_spotify:
        empty = _empty_media_links()
        empty.update(
            {
                "youtube_url": youtube_preview_url(query),
                "acoustid_artist": acoustid.artist,
                "acoustid_title": acoustid.title,
                "acoustid_album": acoustid.album,
                "acoustid_match_score": acoustid.score,
                "acoustid_id": acoustid.acoustid_id,
                "acoustid_recording_id": acoustid.recording_id,
                "acoustid_debug": acoustid.debug,
            }
        )
        return empty

    spotify = SpotifyClient().search_track(
        resolved_artist,
        resolved_title,
        album=resolved_album,
        duration=duration,
        track_number=track_number,
        release_year=release_year,
        include_album_art=fetch_album_art,
    )
    return {
        "youtube_url": youtube_preview_url(query),
        "spotify_url": spotify.spotify_url or spotify_search_url(query),
        "spotify_preview_url": spotify.spotify_preview_url,
        "spotify_uri": spotify.spotify_uri,
        "spotify_id": spotify.spotify_id,
        "spotify_tempo": spotify.tempo,
        "spotify_key": spotify.key,
        "spotify_mode": spotify.mode,
        "album_art_url": spotify.album_art_url,
        "artist_image_url": spotify.artist_image_url,
        "spotify_album_name": spotify.album_name,
        "spotify_match_score": spotify.match_score,
        "spotify_high_confidence": spotify.high_confidence,
        "spotify_debug": spotify.debug,
        "spotify_track_number": spotify.track_number,
        "spotify_release_year": spotify.release_year,
        "acoustid_artist": acoustid.artist,
        "acoustid_title": acoustid.title,
        "acoustid_album": acoustid.album,
        "acoustid_match_score": acoustid.score,
        "acoustid_id": acoustid.acoustid_id,
        "acoustid_recording_id": acoustid.recording_id,
        "acoustid_debug": acoustid.debug,
    }
