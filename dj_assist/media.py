from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import json
import os
import re
import time
from urllib.parse import quote_plus

import requests

# Minimum seconds to wait between Spotify API calls.
_SPOTIFY_REQUEST_DELAY = float(os.getenv("SPOTIFY_REQUEST_DELAY", "0.15"))

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
    album_name: str = ""
    match_score: float = 0.0
    high_confidence: bool = False
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
            timeout=10,
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
        value = re.sub(r"[^a-z0-9]+", " ", value)
        return re.sub(r"\s+", " ", value).strip()

    def search_track(
        self,
        artist: str | None,
        title: str | None,
        duration: float | None = None,
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
                    timeout=10,
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
                    duration=duration,
                    duration_tolerance=self._duration_tolerance_seconds(),
                )
                if best:
                    best_item, best_score = best
                    tempo, key, mode = self._fetch_audio_features(best_item.get("id", ""))
                    album = best_item.get("album") or {}
                    images = album.get("images") or []
                    album_art_url = ""
                    if include_album_art and images and best_score >= self._art_confidence_threshold():
                        album_art_url = images[0].get("url", "")
                    return SpotifyMatch(
                        spotify_id=best_item.get("id", ""),
                        spotify_uri=best_item.get("uri", ""),
                        spotify_url=best_item.get("external_urls", {}).get("spotify", ""),
                        spotify_preview_url=best_item.get("preview_url", "") or "",
                        tempo=tempo,
                        key=key,
                        mode=mode,
                        album_art_url=album_art_url,
                        album_name=album.get("name", "") or "",
                        match_score=best_score,
                        high_confidence=best_score >= self._art_confidence_threshold(),
                        debug=json.dumps({**debug, "matched": best_item.get("id", ""), "score": best_score}),
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
        duration: float | None,
        duration_tolerance: float = 6.0,
    ) -> tuple[dict, float] | None:
        if not items:
            return None

        candidates: list[tuple[float, dict]] = []

        def score(item: dict) -> float:
            value = 0.0
            item_name = (item.get("name") or "")
            artists = " ".join(a.get("name", "") for a in item.get("artists", []))
            norm_title = SpotifyClient._normalize_text(title)
            norm_artist = SpotifyClient._normalize_text(artist)
            norm_item_name = SpotifyClient._normalize_text(item_name)
            norm_artists = SpotifyClient._normalize_text(artists)

            if title:
                if norm_title and norm_title == norm_item_name:
                    value += 8.0
                elif norm_title and norm_title in norm_item_name:
                    value += 5.0
            if artist:
                if norm_artist and norm_artist == norm_artists:
                    value += 8.0
                elif norm_artist and norm_artist in norm_artists:
                    value += 5.0
            if duration:
                item_ms = item.get("duration_ms") or 0
                diff = abs((item_ms / 1000.0) - duration)
                if diff > duration_tolerance:
                    return float("-inf")
                value += max(0.0, duration_tolerance - diff) * 2.0
                value += 10.0 - min(diff, 10.0)
            if norm_title and norm_artist and norm_title in norm_item_name and norm_artist in norm_artists:
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
        if best_score < 8.0:
            return None
        return best_item, best_score

    def _fetch_audio_features(self, spotify_id: str) -> tuple[float, str, str]:
        if not spotify_id or not self.enabled():
            return 0.0, "", ""

        try:
            response = self._get_with_retry(
                f"https://api.spotify.com/v1/audio-features/{spotify_id}",
                headers=self._headers(),
                timeout=10,
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

    @staticmethod
    def _key_to_camelot(key_index: int, mode: str) -> str:
        major = {0: "8B", 1: "3B", 2: "10B", 3: "5B", 4: "12B", 5: "7B", 6: "2B", 7: "9B", 8: "4B", 9: "11B", 10: "6B", 11: "1B"}
        minor = {0: "5A", 1: "12A", 2: "7A", 3: "2A", 4: "9A", 5: "4A", 6: "11A", 7: "6A", 8: "1A", 9: "8A", 10: "3A", 11: "10A"}
        if key_index < 0:
            return ""
        return major.get(key_index, "") if mode == "major" else minor.get(key_index, "")


@lru_cache(maxsize=256)
def build_media_links(
    artist: str | None,
    title: str | None,
    duration: float | None = None,
    fetch_album_art: bool = False,
) -> dict[str, str | float]:
    query = " ".join(part for part in [artist, title] if part)
    if not query:
        return {
            "youtube_url": "",
            "spotify_url": "",
            "spotify_preview_url": "",
            "spotify_uri": "",
            "spotify_id": "",
            "spotify_tempo": 0.0,
            "album_art_url": "",
            "spotify_album_name": "",
    }

    spotify = SpotifyClient().search_track(artist, title, duration, include_album_art=fetch_album_art)
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
        "spotify_album_name": spotify.album_name,
        "spotify_match_score": spotify.match_score,
        "spotify_high_confidence": spotify.high_confidence,
        "spotify_debug": spotify.debug,
    }
