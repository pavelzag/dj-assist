from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher
from functools import lru_cache
import json
import os
import re
import shutil
import subprocess
import sys
import time
from urllib.parse import quote_plus

import requests

# Minimum seconds to wait between Spotify API calls.
_SPOTIFY_REQUEST_DELAY = float(os.getenv("SPOTIFY_REQUEST_DELAY", "0.15"))
_SPOTIFY_HTTP_TIMEOUT = float(os.getenv("SPOTIFY_HTTP_TIMEOUT", "3"))
_THEAUDIODB_REQUEST_DELAY = float(os.getenv("THEAUDIODB_REQUEST_DELAY", "0.55"))
_THEAUDIODB_HTTP_TIMEOUT = float(os.getenv("THEAUDIODB_HTTP_TIMEOUT", "5"))
_MUSICBRAINZ_REQUEST_DELAY = float(os.getenv("MUSICBRAINZ_REQUEST_DELAY", "1.1"))
_MUSICBRAINZ_HTTP_TIMEOUT = float(os.getenv("MUSICBRAINZ_HTTP_TIMEOUT", "6"))
_DISCOGS_REQUEST_DELAY = float(os.getenv("DISCOGS_REQUEST_DELAY", "0.8"))
_DISCOGS_HTTP_TIMEOUT = float(os.getenv("DISCOGS_HTTP_TIMEOUT", "5"))
_ACOUSTID_REQUEST_DELAY = float(os.getenv("ACOUSTID_REQUEST_DELAY", "0.05"))
_ACOUSTID_API_URL = "https://api.acoustid.org/v2/lookup"

# Module-level token cache so all SpotifyClient instances within a process
# share one token instead of fetching a new one per track.
_spotify_token_cache: dict[str, str] = {"token": "", "type": "Bearer"}


def _collapse_query_whitespace(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _normalize_query_tokens(value: str | None) -> str:
    collapsed = _collapse_query_whitespace(value)
    if not collapsed:
        return ""
    collapsed = re.sub(r"\s*[-_/]+\s*", " ", collapsed)
    collapsed = re.sub(r"\s+", " ", collapsed)
    return collapsed.strip()


def _dedupe_variants(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = _collapse_query_whitespace(value)
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


def _case_variants(value: str | None) -> list[str]:
    normalized = _normalize_query_tokens(value)
    if not normalized:
        return []
    variants = [normalized]
    title_variant = normalized.title()
    upper_variant = normalized.upper()
    lower_variant = normalized.lower()
    if title_variant not in variants:
        variants.append(title_variant)
    if upper_variant not in variants:
        variants.append(upper_variant)
    if lower_variant not in variants:
        variants.append(lower_variant)
    return _dedupe_variants(variants)


def _query_variants(artist: str | None, album: str | None = None, title: str | None = None) -> list[dict[str, str]]:
    artist_variants = _case_variants(artist) or [""]
    album_variants = _case_variants(album) if album else [""]
    title_variants = _case_variants(title) if title else [""]
    variants: list[dict[str, str]] = []
    for artist_value in artist_variants:
        if album:
            for album_value in album_variants:
                variants.append({"artist": artist_value, "album": album_value, "title": ""})
        if title:
            for title_value in title_variants:
                variants.append({"artist": artist_value, "album": "", "title": title_value})
        if not album and not title:
            variants.append({"artist": artist_value, "album": "", "title": ""})
    deduped: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for variant in variants:
        key = (
            variant["artist"].casefold(),
            variant["album"].casefold(),
            variant["title"].casefold(),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(variant)
    return deduped


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


@dataclass
class TheAudioDbMatch:
    album_art_url: str = ""
    artist_image_url: str = ""
    album_name: str = ""
    album_art_provider: str = ""
    artist_image_provider: str = ""
    debug: str = ""


@dataclass
class MusicBrainzArtMatch:
    album_art_url: str = ""
    album_art_provider: str = ""
    debug: str = ""


@dataclass
class DiscogsArtMatch:
    album_art_url: str = ""
    album_art_provider: str = ""
    debug: str = ""


class SpotifyClient:
    def __init__(self) -> None:
        import os

        self.client_id = os.getenv("SPOTIFY_CLIENT_ID", "").strip()
        self.client_secret = os.getenv("SPOTIFY_CLIENT_SECRET", "").strip()
        self._token = ""
        self._token_type = "Bearer"
        self.debug_events: list[dict[str, object]] = []

    def _debug(self, stage: str, **fields: object) -> None:
        entry = {"stage": stage, **fields}
        self.debug_events.append(entry)
        if os.getenv("DJ_ASSIST_LIVE_SPOTIFY_DEBUG", "").strip() == "1":
            print(f"[spotify-debug] {json.dumps(entry, ensure_ascii=True)}", file=sys.stderr, flush=True)

    @staticmethod
    def _response_excerpt(response: requests.Response) -> str:
        try:
            payload = response.json()
            text = json.dumps(payload, ensure_ascii=True)
        except Exception:
            text = response.text or ""
        return text[:8000]

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
            self._debug("token_cache_hit", token_type=_spotify_token_cache.get("type", "Bearer"))
            return _spotify_token_cache["token"]

        started_at = time.perf_counter()
        response = requests.post(
            "https://accounts.spotify.com/api/token",
            data={"grant_type": "client_credentials"},
            auth=(self.client_id, self.client_secret),
            timeout=_SPOTIFY_HTTP_TIMEOUT,
        )
        self._debug(
            "token_response",
            url="https://accounts.spotify.com/api/token",
            status=response.status_code,
            elapsed_ms=round((time.perf_counter() - started_at) * 1000, 1),
        )
        response.raise_for_status()
        payload = response.json()
        _spotify_token_cache["token"] = payload.get("access_token", "")
        _spotify_token_cache["type"] = payload.get("token_type", "Bearer")
        self._debug(
            "token_parsed",
            token_type=_spotify_token_cache["type"],
            has_token=bool(_spotify_token_cache["token"]),
        )
        return _spotify_token_cache["token"]

    def _get_with_retry(self, url: str, max_retries: int = 2, **kwargs) -> requests.Response:
        """GET with automatic retry on 429, honouring Retry-After and adding a
        small inter-request delay to stay within Spotify's rate limits."""
        debug_meta = kwargs.pop("_debug_meta", {}) or {}
        fail_fast_on_429 = os.getenv("DJ_ASSIST_FAIL_FAST_ON_SPOTIFY_429", "").strip() == "1"
        for attempt in range(max_retries + 1):
            if _SPOTIFY_REQUEST_DELAY > 0:
                time.sleep(_SPOTIFY_REQUEST_DELAY)
            started_at = time.perf_counter()
            response = requests.get(url, **kwargs)
            self._debug(
                "http_get",
                url=url,
                attempt=attempt + 1,
                max_retries=max_retries,
                status=response.status_code,
                elapsed_ms=round((time.perf_counter() - started_at) * 1000, 1),
                meta=debug_meta,
                response_excerpt=self._response_excerpt(response),
            )
            if response.status_code != 429:
                return response
            if fail_fast_on_429:
                self._debug(
                    "http_rate_limited_fail_fast",
                    url=url,
                    attempt=attempt + 1,
                    meta=debug_meta,
                )
                return response
            retry_after = float(response.headers.get("Retry-After", 2 ** attempt))
            retry_after = min(retry_after, 10.0)  # never block more than 10s per attempt
            self._debug(
                "http_retry_after",
                url=url,
                attempt=attempt + 1,
                retry_after_s=retry_after,
                meta=debug_meta,
            )
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
        self.debug_events = []
        if not self.enabled() or not title:
            return SpotifyMatch(debug=json.dumps({"enabled": self.enabled(), "has_title": bool(title)}))

        artist = _collapse_query_whitespace(artist) or None
        title = _collapse_query_whitespace(title) or None
        album = _collapse_query_whitespace(album) or None
        fail_fast_on_429 = os.getenv("DJ_ASSIST_FAIL_FAST_ON_SPOTIFY_429", "").strip() == "1"

        queries = []
        if artist:
            queries.append(f'artist:"{artist}" track:"{title}"')
            queries.append(f"{artist} {title}")
        queries.append(title)

        debug: dict[str, object] = {"queries": []}
        self._debug(
            "search_track_start",
            artist=artist or "",
            title=title or "",
            album=album or "",
            duration=duration or 0.0,
            track_number=track_number or 0,
            release_year=release_year or 0,
            include_album_art=include_album_art,
        )

        for query in queries:
            try:
                response = self._get_with_retry(
                    "https://api.spotify.com/v1/search",
                    headers=self._headers(),
                    params={"q": query, "type": "track", "limit": 10},
                    timeout=_SPOTIFY_HTTP_TIMEOUT,
                    _debug_meta={"kind": "search", "query": query, "type": "track", "limit": 10},
                )
                if response.status_code == 429 and fail_fast_on_429:
                    self._debug("search_rate_limited_fail_fast", query=query)
                    debug.setdefault("errors", []).append({"query": query, "error": "429 rate limited"})
                    break
                response.raise_for_status()
                items = response.json().get("tracks", {}).get("items", [])
                query_debug = {
                    "query": query,
                    "items": len(items),
                    "candidate_ids": [str(item.get("id") or "") for item in items[:3]],
                    "candidate_names": [str(item.get("name") or "") for item in items[:3]],
                }
                cast_queries = debug.get("queries")
                if isinstance(cast_queries, list):
                    cast_queries.append(query_debug)
                self._debug("search_results", **query_debug)
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
                    self._debug(
                        "search_match_selected",
                        query=query,
                        spotify_id=best_item.get("id", ""),
                        score=round(best_score, 2),
                        album_art_found=bool(album_art_url),
                        artist_image_found=bool(artist_image_url),
                    )
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
                        debug=json.dumps({**debug, "matched": best_item.get("id", ""), "score": best_score, "events": self.debug_events}),
                        track_number=album_track_number,
                        release_year=album_release_year,
                    )
            except Exception as exc:
                debug.setdefault("errors", []).append({"query": query, "error": str(exc)})
                self._debug("search_query_error", query=query, error=str(exc))
                continue

        return SpotifyMatch(debug=json.dumps({**debug, "events": self.debug_events}))

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
                _debug_meta={"kind": "audio_features", "spotify_id": spotify_id},
            )
            response.raise_for_status()
            payload = response.json()
            tempo = float(payload.get("tempo") or 0.0)
            key_index = int(payload.get("key") or -1)
            mode = "major" if int(payload.get("mode") or 1) == 1 else "minor"
            camelot = self._key_to_camelot(key_index, mode)
            self._debug(
                "audio_features_parsed",
                spotify_id=spotify_id,
                tempo=tempo,
                camelot=camelot,
                mode=mode,
            )
            return tempo, camelot, mode
        except Exception as exc:
            self._debug("audio_features_error", spotify_id=spotify_id, error=str(exc))
            return 0.0, "", ""

    def _fetch_artist_image(self, artist_id: str) -> str:
        if not artist_id or not self.enabled():
            self._debug("artist_image_skip", artist_id=artist_id, enabled=self.enabled())
            return ""

        try:
            self._debug("artist_image_try", provider="spotify_artist", artist_id=artist_id)
            response = self._get_with_retry(
                f"https://api.spotify.com/v1/artists/{artist_id}",
                headers=self._headers(),
                timeout=_SPOTIFY_HTTP_TIMEOUT,
                _debug_meta={"kind": "artist", "artist_id": artist_id},
            )
            response.raise_for_status()
            payload = response.json()
            images = payload.get("images") or []
            if not images:
                self._debug("artist_image_missing", provider="spotify_artist", artist_id=artist_id, image_count=0)
                return ""
            image_url = str(images[0].get("url") or "")
            self._debug("artist_image_parsed", provider="spotify_artist", artist_id=artist_id, image_count=len(images), image_url=image_url)
            return image_url
        except Exception as exc:
            self._debug("artist_image_error", provider="spotify_artist", artist_id=artist_id, error=str(exc))
            return ""

    @staticmethod
    def _key_to_camelot(key_index: int, mode: str) -> str:
        major = {0: "8B", 1: "3B", 2: "10B", 3: "5B", 4: "12B", 5: "7B", 6: "2B", 7: "9B", 8: "4B", 9: "11B", 10: "6B", 11: "1B"}
        minor = {0: "5A", 1: "12A", 2: "7A", 3: "2A", 4: "9A", 5: "4A", 6: "11A", 7: "6A", 8: "1A", 9: "8A", 10: "3A", 11: "10A"}
        if key_index < 0:
            return ""
        return major.get(key_index, "") if mode == "major" else minor.get(key_index, "")


class TheAudioDbClient:
    def __init__(self) -> None:
        configured_key = os.getenv("THEAUDIODB_API_KEY", "").strip()
        self.api_key = configured_key or "123"
        self.base_url = os.getenv("THEAUDIODB_BASE_URL", "https://www.theaudiodb.com/api/v1/json").rstrip("/")
        self.debug_events: list[dict[str, object]] = []

    def _debug(self, stage: str, **fields: object) -> None:
        entry = {"stage": stage, **fields}
        self.debug_events.append(entry)
        if os.getenv("DJ_ASSIST_LIVE_SPOTIFY_DEBUG", "").strip() == "1":
            print(f"[spotify-debug] {json.dumps(entry, ensure_ascii=True)}", file=sys.stderr, flush=True)

    def enabled(self) -> bool:
        return os.getenv("THEAUDIODB_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}

    def _get(self, endpoint: str, params: dict[str, str]) -> dict[str, object]:
        if _THEAUDIODB_REQUEST_DELAY > 0:
            time.sleep(_THEAUDIODB_REQUEST_DELAY)
        url = f"{self.base_url}/{self.api_key}/{endpoint}"
        started_at = time.perf_counter()
        response = requests.get(url, params=params, timeout=_THEAUDIODB_HTTP_TIMEOUT)
        self._debug(
            "theaudiodb_http_get",
            url=url,
            status=response.status_code,
            elapsed_ms=round((time.perf_counter() - started_at) * 1000, 1),
            params=params,
            response_excerpt=SpotifyClient._response_excerpt(response),
        )
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, dict) else {}

    def search_art(self, artist: str | None, album: str | None = None, title: str | None = None) -> TheAudioDbMatch:
        self.debug_events = []
        artist = _normalize_query_tokens(artist)
        album = _normalize_query_tokens(album)
        title = _normalize_query_tokens(title)
        if not self.enabled() or not artist:
            return TheAudioDbMatch(debug=json.dumps({"enabled": self.enabled(), "has_artist": bool(artist)}))
        try:
            self._debug(
                "theaudiodb_search_start",
                artist=artist,
                album=album or "",
                title=title or "",
                public_test_key=self.api_key in {"2", "123"},
            )
            album_payload: dict[str, object] = {}
            if album:
                for variant in _query_variants(artist, album=album):
                    variant_artist = variant["artist"]
                    variant_album = variant["album"]
                    self._debug("theaudiodb_variant_try", kind="album", artist=variant_artist, album=variant_album)
                    album_payload = self._get("searchalbum.php", {"s": variant_artist, "a": variant_album})
                    albums = album_payload.get("album") if isinstance(album_payload, dict) else None
                    if isinstance(albums, list) and albums:
                        selected = next((item for item in albums if isinstance(item, dict) and str(item.get("strAlbumThumb") or "").strip()), None)
                        if selected and isinstance(selected, dict):
                            album_art_url = str(selected.get("strAlbumThumb") or "").strip()
                            if album_art_url:
                                self._debug(
                                    "theaudiodb_variant_match",
                                    kind="album",
                                    artist=variant_artist,
                                    album=variant_album,
                                )
                                self._debug("theaudiodb_album_match", artist=variant_artist, album=variant_album, album_art_url=album_art_url)
                                return TheAudioDbMatch(
                                    album_art_url=album_art_url,
                                    album_name=str(selected.get("strAlbum") or variant_album or album or "").strip(),
                                    album_art_provider="theaudiodb_album",
                                    debug=json.dumps({"album_payload": album_payload, "events": self.debug_events}),
                                )

            track_payload: dict[str, object] = {}
            if title:
                for variant in _query_variants(artist, title=title):
                    variant_artist = variant["artist"]
                    variant_title = variant["title"]
                    self._debug("theaudiodb_variant_try", kind="track", artist=variant_artist, title=variant_title)
                    self._debug("artist_image_try", provider="theaudiodb_track", artist=variant_artist, title=variant_title)
                    track_payload = self._get("searchtrack.php", {"s": variant_artist, "t": variant_title})
                    tracks = track_payload.get("track") if isinstance(track_payload, dict) else None
                    if isinstance(tracks, list) and tracks:
                        selected_track = next((item for item in tracks if isinstance(item, dict)), None)
                        if selected_track and isinstance(selected_track, dict):
                            album_art_url = str(
                                selected_track.get("strTrackThumb")
                                or selected_track.get("strAlbumThumb")
                                or ""
                            ).strip()
                            artist_image_url = str(selected_track.get("strArtistThumb") or "").strip()
                            self._debug("theaudiodb_variant_match", kind="track", artist=variant_artist, title=variant_title)
                            self._debug(
                                "theaudiodb_track_match",
                                artist=variant_artist,
                                title=variant_title,
                                album_art_url=album_art_url,
                                artist_image_url=artist_image_url,
                            )
                            if album_art_url or artist_image_url:
                                return TheAudioDbMatch(
                                    album_art_url=album_art_url,
                                    artist_image_url=artist_image_url,
                                    album_name=str(selected_track.get("strAlbum") or album or "").strip(),
                                    album_art_provider="theaudiodb_track" if album_art_url else "",
                                    artist_image_provider="theaudiodb_artist" if artist_image_url else "",
                                    debug=json.dumps(
                                        {
                                            "album_payload": album_payload,
                                            "track_payload": track_payload,
                                            "events": self.debug_events,
                                        }
                                    ),
                                )
                    self._debug("artist_image_missing", provider="theaudiodb_track", artist=variant_artist, title=variant_title, matched=False)

            artist_payload: dict[str, object] = {}
            for variant in _case_variants(artist):
                self._debug("theaudiodb_variant_try", kind="artist", artist=variant)
                self._debug("artist_image_try", provider="theaudiodb_artist", artist=variant)
                artist_payload = self._get("search.php", {"s": variant})
                artists = artist_payload.get("artists") if isinstance(artist_payload, dict) else None
                if isinstance(artists, list) and artists:
                    selected_artist = next((item for item in artists if isinstance(item, dict)), None)
                    if selected_artist and isinstance(selected_artist, dict):
                        artist_image_url = str(
                            selected_artist.get("strArtistThumb")
                            or selected_artist.get("strArtistWideThumb")
                            or selected_artist.get("strArtistFanart")
                            or ""
                        ).strip()
                        self._debug("theaudiodb_variant_match", kind="artist", artist=variant)
                        self._debug("theaudiodb_artist_match", artist=variant, artist_image_url=artist_image_url)
                        return TheAudioDbMatch(
                            artist_image_url=artist_image_url,
                            artist_image_provider="theaudiodb_artist" if artist_image_url else "",
                            debug=json.dumps(
                                {
                                    "album_payload": album_payload,
                                    "track_payload": track_payload,
                                    "artist_payload": artist_payload,
                                    "events": self.debug_events,
                                }
                            ),
                        )
                self._debug("artist_image_missing", provider="theaudiodb_artist", artist=variant, matched=False)
            return TheAudioDbMatch(debug=json.dumps({"album_payload": album_payload, "track_payload": track_payload, "events": self.debug_events}))
        except Exception as exc:
            self._debug("theaudiodb_error", artist=artist or "", album=album or "", error=str(exc))
            return TheAudioDbMatch(debug=json.dumps({"error": str(exc), "events": self.debug_events}))


class MusicBrainzClient:
    def __init__(self) -> None:
        self.base_url = os.getenv("MUSICBRAINZ_BASE_URL", "https://musicbrainz.org/ws/2").rstrip("/")
        self.cover_art_url = os.getenv("COVER_ART_ARCHIVE_BASE_URL", "https://coverartarchive.org").rstrip("/")
        self.user_agent = os.getenv("MUSICBRAINZ_USER_AGENT", "DJ-Assist/0.1 (https://github.com/openai)")
        self.debug_events: list[dict[str, object]] = []

    def _debug(self, stage: str, **fields: object) -> None:
        entry = {"stage": stage, **fields}
        self.debug_events.append(entry)
        if os.getenv("DJ_ASSIST_LIVE_SPOTIFY_DEBUG", "").strip() == "1":
            print(f"[spotify-debug] {json.dumps(entry, ensure_ascii=True)}", file=sys.stderr, flush=True)

    def enabled(self) -> bool:
        return os.getenv("MUSICBRAINZ_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}

    def _headers(self) -> dict[str, str]:
        return {"User-Agent": self.user_agent}

    def _get_json(self, url: str, params: dict[str, str] | None = None) -> dict[str, object]:
        if _MUSICBRAINZ_REQUEST_DELAY > 0:
            time.sleep(_MUSICBRAINZ_REQUEST_DELAY)
        started_at = time.perf_counter()
        response = requests.get(url, params=params, headers=self._headers(), timeout=_MUSICBRAINZ_HTTP_TIMEOUT)
        self._debug(
            "musicbrainz_http_get",
            url=url,
            status=response.status_code,
            elapsed_ms=round((time.perf_counter() - started_at) * 1000, 1),
            params=params or {},
            response_excerpt=SpotifyClient._response_excerpt(response),
        )
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, dict) else {}

    def _safe_get_json(self, url: str, params: dict[str, str] | None = None) -> tuple[dict[str, object] | None, bool]:
        try:
            return self._get_json(url, params), False
        except requests.ReadTimeout as exc:
            self._debug(
                "musicbrainz_query_error",
                url=url,
                params=params or {},
                timeout=True,
                error=str(exc),
            )
            return None, True
        except Exception as exc:
            self._debug(
                "musicbrainz_query_error",
                url=url,
                params=params or {},
                timeout=False,
                error=str(exc),
            )
            return None, False

    def _cover_art_for_release_group(self, release_group_id: str) -> str:
        if not release_group_id:
            return ""
        try:
            payload = self._get_json(f"{self.cover_art_url}/release-group/{release_group_id}")
            images = payload.get("images") if isinstance(payload, dict) else None
            if isinstance(images, list):
                for image in images:
                    if not isinstance(image, dict):
                        continue
                    if bool(image.get("front")):
                        thumbs = image.get("thumbnails") if isinstance(image.get("thumbnails"), dict) else {}
                        return str(thumbs.get("500") or thumbs.get("250") or image.get("image") or "").strip()
                first = next((img for img in images if isinstance(img, dict)), None)
                if isinstance(first, dict):
                    thumbs = first.get("thumbnails") if isinstance(first.get("thumbnails"), dict) else {}
                    return str(thumbs.get("500") or thumbs.get("250") or first.get("image") or "").strip()
        except Exception as exc:
            self._debug("cover_art_release_group_error", release_group_id=release_group_id, error=str(exc))
        return ""

    def _cover_art_for_release(self, release_id: str) -> str:
        if not release_id:
            return ""
        try:
            payload = self._get_json(f"{self.cover_art_url}/release/{release_id}")
            images = payload.get("images") if isinstance(payload, dict) else None
            if isinstance(images, list):
                for image in images:
                    if not isinstance(image, dict):
                        continue
                    if bool(image.get("front")):
                        thumbs = image.get("thumbnails") if isinstance(image.get("thumbnails"), dict) else {}
                        return str(thumbs.get("500") or thumbs.get("250") or image.get("image") or "").strip()
                first = next((img for img in images if isinstance(img, dict)), None)
                if isinstance(first, dict):
                    thumbs = first.get("thumbnails") if isinstance(first.get("thumbnails"), dict) else {}
                    return str(thumbs.get("500") or thumbs.get("250") or first.get("image") or "").strip()
        except Exception as exc:
            self._debug("cover_art_release_error", release_id=release_id, error=str(exc))
        return ""

    def search_art(self, artist: str | None, album: str | None = None, title: str | None = None) -> MusicBrainzArtMatch:
        self.debug_events = []
        artist = _normalize_query_tokens(artist)
        album = _normalize_query_tokens(album)
        title = _normalize_query_tokens(title)
        if not self.enabled():
            return MusicBrainzArtMatch(debug=json.dumps({"enabled": False}))
        timed_out = False
        if artist and album:
            queries = []
            for variant in _query_variants(artist, album=album):
                queries.append(
                    {
                        "kind": "release-group",
                        "artist": variant["artist"],
                        "album": variant["album"],
                        "query": f'artist:"{variant["artist"]}" AND releasegroup:"{variant["album"]}"',
                    }
                )
            for album_variant in _case_variants(album):
                queries.append(
                    {
                        "kind": "release-group-album-only",
                        "artist": "",
                        "album": album_variant,
                        "query": f'releasegroup:"{album_variant}"',
                    }
                )
            seen_queries: set[str] = set()
            for query_info in queries:
                if timed_out:
                    self._debug("musicbrainz_skip_after_timeout", kind=query_info["kind"], query=query_info["query"])
                    break
                query = query_info["query"]
                if query in seen_queries:
                    continue
                seen_queries.add(query)
                self._debug(
                    "musicbrainz_variant_try",
                    kind=query_info["kind"],
                    artist=query_info["artist"],
                    album=query_info["album"],
                    query=query,
                )
                payload, timed_out = self._safe_get_json(f"{self.base_url}/release-group", {"query": query, "fmt": "json", "limit": "5"})
                if payload is None:
                    continue
                groups = payload.get("release-groups") if isinstance(payload, dict) else None
                if isinstance(groups, list):
                    for group in groups:
                        if not isinstance(group, dict):
                            continue
                        group_id = str(group.get("id") or "").strip()
                        art_url = self._cover_art_for_release_group(group_id)
                        self._debug(
                            "musicbrainz_release_group_candidate",
                            artist=query_info["artist"],
                            album=query_info["album"],
                            release_group_id=group_id,
                            art_url=art_url,
                        )
                        if art_url:
                            self._debug(
                                "musicbrainz_variant_match",
                                kind=query_info["kind"],
                                artist=query_info["artist"],
                                album=query_info["album"],
                                query=query,
                            )
                            return MusicBrainzArtMatch(
                                album_art_url=art_url,
                                album_art_provider="musicbrainz_release_group",
                                debug=json.dumps({"payload": payload, "events": self.debug_events}),
                            )
        if artist and title and not timed_out:
            queries = []
            for variant in _query_variants(artist, title=title):
                queries.append(
                    {
                        "kind": "recording",
                        "artist": variant["artist"],
                        "title": variant["title"],
                        "query": f'artist:"{variant["artist"]}" AND recording:"{variant["title"]}"',
                    }
                )
            for title_variant in _case_variants(title):
                queries.append(
                    {
                        "kind": "recording-title-only",
                        "artist": "",
                        "title": title_variant,
                        "query": f'recording:"{title_variant}"',
                    }
                )
            seen_queries = set()
            for query_info in queries:
                if timed_out:
                    self._debug("musicbrainz_skip_after_timeout", kind=query_info["kind"], query=query_info["query"])
                    break
                query = query_info["query"]
                if query in seen_queries:
                    continue
                seen_queries.add(query)
                self._debug(
                    "musicbrainz_variant_try",
                    kind=query_info["kind"],
                    artist=query_info["artist"],
                    title=query_info["title"],
                    query=query,
                )
                payload, timed_out = self._safe_get_json(f"{self.base_url}/recording", {"query": query, "fmt": "json", "limit": "5"})
                if payload is None:
                    continue
                recordings = payload.get("recordings") if isinstance(payload, dict) else None
                if isinstance(recordings, list):
                    for recording in recordings:
                        if not isinstance(recording, dict):
                            continue
                        releases = recording.get("releases") if isinstance(recording.get("releases"), list) else []
                        for release in releases:
                            if not isinstance(release, dict):
                                continue
                            release_id = str(release.get("id") or "").strip()
                            art_url = self._cover_art_for_release(release_id)
                            self._debug(
                                "musicbrainz_recording_candidate",
                                artist=query_info["artist"],
                                title=query_info["title"],
                                release_id=release_id,
                                art_url=art_url,
                            )
                            if art_url:
                                self._debug(
                                    "musicbrainz_variant_match",
                                    kind=query_info["kind"],
                                    artist=query_info["artist"],
                                    title=query_info["title"],
                                    query=query,
                                )
                                return MusicBrainzArtMatch(
                                    album_art_url=art_url,
                                    album_art_provider="musicbrainz_release",
                                    debug=json.dumps({"payload": payload, "events": self.debug_events}),
                                )
        return MusicBrainzArtMatch(debug=json.dumps({"timed_out": timed_out, "events": self.debug_events}))


class DiscogsClient:
    def __init__(self) -> None:
        self.base_url = os.getenv("DISCOGS_BASE_URL", "https://api.discogs.com").rstrip("/")
        self.user_agent = os.getenv("DISCOGS_USER_AGENT", "DJ-Assist/0.1 (https://github.com/openai)")
        self.token = os.getenv("DISCOGS_TOKEN", "").strip()
        self.debug_events: list[dict[str, object]] = []

    def _debug(self, stage: str, **fields: object) -> None:
        entry = {"stage": stage, **fields}
        self.debug_events.append(entry)
        if os.getenv("DJ_ASSIST_LIVE_SPOTIFY_DEBUG", "").strip() == "1":
            print(f"[spotify-debug] {json.dumps(entry, ensure_ascii=True)}", file=sys.stderr, flush=True)

    def enabled(self) -> bool:
        return os.getenv("DISCOGS_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}

    def _headers(self) -> dict[str, str]:
        headers = {"User-Agent": self.user_agent}
        if self.token:
            headers["Authorization"] = f"Discogs token={self.token}"
        return headers

    def _get_json(self, url: str, params: dict[str, str]) -> dict[str, object]:
        if _DISCOGS_REQUEST_DELAY > 0:
            time.sleep(_DISCOGS_REQUEST_DELAY)
        started_at = time.perf_counter()
        response = requests.get(url, params=params, headers=self._headers(), timeout=_DISCOGS_HTTP_TIMEOUT)
        self._debug(
            "discogs_http_get",
            url=url,
            status=response.status_code,
            elapsed_ms=round((time.perf_counter() - started_at) * 1000, 1),
            params=params,
            response_excerpt=SpotifyClient._response_excerpt(response),
        )
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, dict) else {}

    def search_art(self, artist: str | None, album: str | None = None, title: str | None = None) -> DiscogsArtMatch:
        self.debug_events = []
        artist = _normalize_query_tokens(artist)
        album = _normalize_query_tokens(album)
        title = _normalize_query_tokens(title)
        if not self.enabled():
            return DiscogsArtMatch(debug=json.dumps({"enabled": False}))
        queries: list[dict[str, str]] = []
        if artist and album:
            for variant in _query_variants(artist, album=album):
                queries.append(
                    {
                        "kind": "release",
                        "artist": variant["artist"],
                        "album": variant["album"],
                        "q": f'{variant["artist"]} {variant["album"]}',
                    }
                )
        if artist and title:
            for variant in _query_variants(artist, title=title):
                queries.append(
                    {
                        "kind": "track",
                        "artist": variant["artist"],
                        "title": variant["title"],
                        "q": f'{variant["artist"]} {variant["title"]}',
                    }
                )
        if album:
            for album_variant in _case_variants(album):
                queries.append({"kind": "album-only", "artist": "", "album": album_variant, "q": album_variant})
        if title:
            for title_variant in _case_variants(title):
                queries.append({"kind": "title-only", "artist": "", "title": title_variant, "q": title_variant})
        seen_queries: set[str] = set()
        try:
            for query_info in queries:
                query = query_info["q"]
                if not query or query in seen_queries:
                    continue
                seen_queries.add(query)
                self._debug(
                    "discogs_variant_try",
                    kind=query_info["kind"],
                    artist=query_info.get("artist", ""),
                    album=query_info.get("album", ""),
                    title=query_info.get("title", ""),
                    query=query,
                )
                payload = self._get_json(
                    f"{self.base_url}/database/search",
                    {"q": query, "type": "release", "per_page": "5"},
                )
                results = payload.get("results") if isinstance(payload, dict) else None
                if not isinstance(results, list):
                    continue
                for result in results:
                    if not isinstance(result, dict):
                        continue
                    art_url = str(result.get("cover_image") or result.get("thumb") or "").strip()
                    self._debug(
                        "discogs_candidate",
                        kind=query_info["kind"],
                        title=str(result.get("title") or "").strip(),
                        type=str(result.get("type") or "").strip(),
                        art_url=art_url,
                    )
                    if art_url:
                        self._debug(
                            "discogs_variant_match",
                            kind=query_info["kind"],
                            query=query,
                            art_url=art_url,
                        )
                        return DiscogsArtMatch(
                            album_art_url=art_url,
                            album_art_provider="discogs_release",
                            debug=json.dumps({"payload": payload, "events": self.debug_events}),
                        )
            return DiscogsArtMatch(debug=json.dumps({"events": self.debug_events}))
        except Exception as exc:
            self._debug("discogs_error", artist=artist or "", album=album or "", title=title or "", error=str(exc))
            return DiscogsArtMatch(debug=json.dumps({"error": str(exc), "events": self.debug_events}))


class AcoustIdClient:
    def __init__(self) -> None:
        configured_key = os.getenv("ACOUSTID_API_KEY", "").strip()
        self.api_key = configured_key
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
        "album_art_provider": "",
        "artist_image_provider": "",
        "spotify_album_name": "",
        "spotify_match_score": 0.0,
        "spotify_high_confidence": False,
        "spotify_debug": "",
        "theaudiodb_debug": "",
        "musicbrainz_debug": "",
        "discogs_debug": "",
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
    enable_theaudiodb: bool = True,
) -> dict[str, str | float | bool | int]:
    resolved_artist = _collapse_query_whitespace(artist) or artist
    resolved_title = _collapse_query_whitespace(title) or title
    resolved_album = _collapse_query_whitespace(album) or album
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

    if enable_spotify:
        spotify = SpotifyClient().search_track(
            resolved_artist,
            resolved_title,
            album=resolved_album,
            duration=duration,
            track_number=track_number,
            release_year=release_year,
            include_album_art=fetch_album_art,
        )
    else:
        spotify = SpotifyMatch()

    if fetch_album_art and enable_theaudiodb:
        theaudiodb = TheAudioDbClient().search_art(resolved_artist, resolved_album, resolved_title)
    else:
        theaudiodb = TheAudioDbMatch(debug=json.dumps({"enabled": bool(fetch_album_art and enable_theaudiodb), "has_artist": bool(resolved_artist)}))
    if fetch_album_art:
        musicbrainz = MusicBrainzClient().search_art(resolved_artist, resolved_album, resolved_title)
        discogs = DiscogsClient().search_art(resolved_artist, resolved_album, resolved_title)
    else:
        musicbrainz = MusicBrainzArtMatch(debug=json.dumps({"enabled": False}))
        discogs = DiscogsArtMatch(debug=json.dumps({"enabled": False}))

    fallback_album_art_url = spotify.album_art_url or theaudiodb.album_art_url or musicbrainz.album_art_url or discogs.album_art_url
    fallback_album_art_provider = (
        "spotify"
        if spotify.album_art_url
        else theaudiodb.album_art_provider or musicbrainz.album_art_provider or discogs.album_art_provider
    )
    artist_image_url = spotify.artist_image_url or theaudiodb.artist_image_url
    artist_image_provider = "spotify_artist" if spotify.artist_image_url else theaudiodb.artist_image_provider
    if os.getenv("DJ_ASSIST_LIVE_SPOTIFY_DEBUG", "").strip() == "1":
        print(
            f"[spotify-debug] {json.dumps({'stage': 'artist_image_resolution', 'album_art_provider': fallback_album_art_provider or '', 'artist_image_provider': artist_image_provider or '', 'has_album_art': bool(fallback_album_art_url), 'has_artist_image': bool(artist_image_url)}, ensure_ascii=True)}",
            file=sys.stderr,
            flush=True,
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
        "album_art_url": fallback_album_art_url,
        "artist_image_url": artist_image_url,
        "album_art_provider": fallback_album_art_provider,
        "artist_image_provider": artist_image_provider,
        "spotify_album_name": spotify.album_name or theaudiodb.album_name,
        "spotify_match_score": spotify.match_score,
        "spotify_high_confidence": spotify.high_confidence,
        "spotify_debug": spotify.debug,
        "theaudiodb_debug": theaudiodb.debug,
        "musicbrainz_debug": musicbrainz.debug,
        "discogs_debug": discogs.debug,
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
