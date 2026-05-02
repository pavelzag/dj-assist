from __future__ import annotations

from collections.abc import Mapping, Sequence
import json
import time
from pathlib import Path
from typing import Any

import click
from rich.console import Console
from rich.table import Table

from .analyzer import get_recommended_next_tracks
from .analyzer import analyze_track
from .analyzer import detect_bpm
from .analyzer import detect_key
from .analyzer import extract_waveform_peaks
from .analyzer import read_tag_bpm
from .db import Database
from .scanner import scan_directory
from .web import run_app
from .media import AcoustIdClient, SpotifyClient
from .tag_writer import write_mp3_metadata

console = Console()


def _db() -> Database:
    return Database()


def _track_label(track) -> str:
    artist = track.artist or "Unknown Artist"
    title = track.title or Path(track.path).stem
    return f"{artist} - {title}"


def _format_duration(seconds: float | None) -> str:
    if not seconds:
        return "--:--"
    minutes = int(seconds // 60)
    remainder = int(seconds % 60)
    return f"{minutes}:{remainder:02d}"


def _print_tracks(tracks) -> None:
    table = Table(show_header=True, header_style="bold cyan")
    table.add_column("ID", justify="right")
    table.add_column("Track")
    table.add_column("BPM", justify="right")
    table.add_column("Src", justify="center")
    table.add_column("Key", justify="center")
    table.add_column("Dur", justify="right")
    table.add_column("Path")

    for track in tracks:
        table.add_row(
            str(track.id),
            _track_label(track),
            f"{(track.bpm or track.spotify_tempo or 0.0):.1f}" if (track.bpm or track.spotify_tempo) else "--",
            track.bpm_source or "--",
            track.key or track.spotify_key or track.key_numeric or "--",
            _format_duration(track.duration),
            track.path,
        )

    console.print(table)


def _print_sets(sets) -> None:
    table = Table(show_header=True, header_style="bold cyan")
    table.add_column("ID", justify="right")
    table.add_column("Name")
    table.add_column("Tracks", justify="right")
    table.add_column("Duration", justify="right")
    for set_obj in sets:
        table.add_row(
            str(set_obj.id),
            set_obj.name,
            str(len(set_obj.set_tracks)),
            _format_duration(set_obj.total_duration),
        )
    console.print(table)


def _print_recommendations(reference, tracks, exclude_ids=None, limit: int | None = None) -> list:
    recommendations = get_recommended_next_tracks(
        reference.key or "",
        reference.bpm or 0.0,
        tracks,
        exclude_ids=exclude_ids or [],
    )

    table = Table(show_header=True, header_style="bold cyan")
    table.add_column("ID", justify="right")
    table.add_column("Track")
    table.add_column("BPM", justify="right")
    table.add_column("Src", justify="center")
    table.add_column("Key", justify="center")
    table.add_column("Reason")
    table.add_column("Score", justify="right")

    if limit is not None:
        recommendations = recommendations[:limit]

    for track, reason, score in recommendations:
        table.add_row(
            str(track.id),
            _track_label(track),
            f"{(track.bpm or track.spotify_tempo or 0.0):.1f}" if (track.bpm or track.spotify_tempo) else "--",
            track.bpm_source or "--",
            track.key or track.spotify_key or track.key_numeric or "--",
            reason,
            f"{score:.1f}",
        )

    console.print(
        f"\n[bold]Next after:[/bold] {_track_label(reference)}  "
        f"([cyan]{(reference.bpm or 0.0):.1f}[/cyan] BPM, [magenta]{reference.key or '--'}[/magenta])"
    )
    console.print(table)
    return recommendations


@click.group()
def main() -> None:
    """DJ track analysis and set builder."""


@main.command()
@click.argument("directory", type=click.Path(exists=True, file_okay=False, path_type=Path))
@click.option("--no-skip-existing", is_flag=True, help="Re-analyze every file.")
@click.option(
    "--rescan-mode",
    type=click.Choice(["smart", "missing-metadata", "missing-analysis", "missing-art", "full"], case_sensitive=False),
    default="smart",
    show_default=True,
    help="Choose when existing tracks should be rescanned.",
)
@click.option(
    "--bpm-lookup",
    type=click.Choice(["auto", "local", "tag", "spotify", "both", "off"], case_sensitive=False),
    default="auto",
    show_default=True,
    help="Choose how BPM is resolved.",
)
@click.option(
    "--fetch-album-art/--no-fetch-album-art",
    default=True,
    show_default=True,
    help="Fetch and store album art when Spotify metadata is available.",
)
@click.option("--verbose", "-v", is_flag=True, help="Print per-track debug output.")
@click.option("--no-spotify", is_flag=True, help="Skip all Spotify/album-art lookups.")
@click.option("--fast-scan", is_flag=True, help="Skip AcoustID and Spotify enrichment for the fastest local scan.")
@click.option("--auto-double", is_flag=True, help="Double and round BPM for tracks detected in the 60–80 BPM range.")
@click.option("--json-progress", is_flag=True, help="Emit newline-delimited JSON progress events.")
def scan(directory: Path, no_skip_existing: bool, rescan_mode: str, bpm_lookup: str, fetch_album_art: bool, verbose: bool, no_spotify: bool, fast_scan: bool, auto_double: bool, json_progress: bool) -> None:
    db = _db()
    spotify_enabled = not no_spotify and not fast_scan

    def emit(event: dict) -> None:
        click.echo(json.dumps(event), err=False)

    if spotify_enabled:
        missing = SpotifyClient().missing_credentials()
        if missing:
            if json_progress:
                emit({"event": "log", "level": "warning", "message": f"Spotify env missing: {', '.join(missing)}"})
                emit({"event": "log", "level": "info", "message": "Spotify disabled, but fallback artwork providers remain available."})
            else:
                console.print(f"[yellow]Spotify env missing:[/yellow] {', '.join(missing)}")
                console.print("[dim]Spotify disabled, but fallback artwork providers remain available.[/dim]")
            spotify_enabled = False
    if not spotify_enabled:
        if json_progress:
            emit({"event": "log", "level": "info", "message": "Spotify disabled — skipping Spotify metadata lookups." if not fast_scan else "Fast scan enabled — skipping Spotify and AcoustID, but artwork fallbacks remain enabled."})
        else:
            console.print("[dim]Spotify disabled — skipping Spotify metadata lookups.[/dim]" if not fast_scan else "[dim]Fast scan enabled — skipping Spotify and AcoustID, but artwork fallbacks remain enabled.[/dim]")
    if not fast_scan:
        acoustid = AcoustIdClient()
        if acoustid.enabled():
            if acoustid.available():
                message = "AcoustID enabled — fingerprint metadata recovery is available."
                level = "info"
            else:
                message = "AcoustID key present, but fpcalc was not found — fingerprint lookup is unavailable."
                level = "warning"
            if json_progress:
                emit({"event": "log", "level": level, "message": message})
            else:
                style = "yellow" if level == "warning" else "dim"
                console.print(f"[{style}]{message}[/{style}]")
    results = scan_directory(
        str(directory),
        db,
        skip_existing=not no_skip_existing,
        rescan_mode="full" if no_skip_existing else rescan_mode.lower(),
        bpm_lookup=bpm_lookup.lower(),
        fetch_album_art=fetch_album_art,
        verbose=verbose,
        spotify_enabled=spotify_enabled,
        fast_scan=fast_scan,
        auto_double_bpm=auto_double,
        progress_callback=emit if json_progress else None,
    )
    if json_progress:
        emit({"event": "summary", "results": results})
    else:
        console.print(
            f"Scanned: {results['scanned']}  Analyzed: {results['analyzed']}  Skipped: {results['skipped']}  Errors: {results['errors']}"
        )


@main.command()
def list() -> None:
    _print_tracks(_db().get_all_tracks())


@main.command(name="write-tags")
@click.argument("file_path", type=click.Path(dir_okay=False, path_type=Path))
@click.option("--artist", default=None)
@click.option("--title", default=None)
@click.option("--album", default=None)
@click.option("--key", "musical_key", default=None)
@click.option("--tags", default=None, help="Comma-separated DJ Assist tags.")
def write_tags(file_path: Path, artist: str | None, title: str | None, album: str | None, musical_key: str | None, tags: str | None) -> None:
    tag_list = [item.strip() for item in (tags or "").split(",") if item.strip()]
    try:
        write_mp3_metadata(
            str(file_path),
            artist=artist,
            title=title,
            album=album,
            key=musical_key,
            custom_tags=tag_list,
        )
    except Exception as error:
        raise click.ClickException(str(error)) from error


@main.command(name="waveform-peaks")
@click.argument("file_path", type=click.Path(dir_okay=False, path_type=Path))
@click.option("--width", type=int, default=640, show_default=True)
def waveform_peaks(file_path: Path, width: int) -> None:
    try:
        payload = extract_waveform_peaks(str(file_path), width=width)
    except Exception as error:
        raise click.ClickException(str(error)) from error
    click.echo(json.dumps(payload))


@main.command(name="analyze-file")
@click.argument("file_path", type=click.Path(dir_okay=False, path_type=Path))
@click.option(
    "--bpm-lookup",
    type=click.Choice(["auto", "local", "tag", "spotify", "both", "off"], case_sensitive=False),
    default="auto",
    show_default=True,
)
@click.option("--auto-double", is_flag=True, help="Double and round BPM for tracks detected in the 60–80 BPM range.")
def analyze_file(file_path: Path, bpm_lookup: str, auto_double: bool) -> None:
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

    if can_local:
        analysis = analyze_track(str(file_path))
        bpm = analysis.bpm
        bpm_source = analysis.bpm_source
        bpm_error = analysis.bpm_error
        bpm_confidence = analysis.bpm_confidence
        decode_failed = analysis.decode_failed
        key = analysis.key
        key_numeric = analysis.key_numeric
        key_confidence = analysis.key_confidence

    if not bpm and can_tag:
        tag_bpm = read_tag_bpm(str(file_path))
        if tag_bpm:
            bpm = tag_bpm
            bpm_source = "tag"
            bpm_error = ""

    if not can_local:
        key, key_numeric, key_confidence = detect_key(str(file_path))

    if auto_double and bpm and 60.0 <= bpm <= 80.0:
        bpm = float(round(bpm * 2))
        bpm_source = (bpm_source + "+doubled") if bpm_source else "doubled"

    click.echo(
        json.dumps(
            {
                "bpm": bpm,
                "bpm_source": bpm_source,
                "bpm_error": bpm_error,
                "bpm_confidence": bpm_confidence,
                "decode_failed": decode_failed,
                "key": key,
                "key_numeric": key_numeric,
                "confidence": key_confidence,
            }
        )
    )


@main.command()
@click.option("--query", default=None)
@click.option("--artist", default=None)
@click.option("--key", default=None)
@click.option("--bpm-min", type=float, default=None)
@click.option("--bpm-max", type=float, default=None)
def search(query, artist, key, bpm_min, bpm_max) -> None:
    tracks = _db().search_tracks(query=query, artist=artist, key=key, bpm_min=bpm_min, bpm_max=bpm_max)
    _print_tracks(tracks)


@main.command()
@click.argument("track_id", type=int)
def debug(track_id: int) -> None:
    db = _db()
    track = db.get_track_by_id(track_id)
    if not track:
        raise click.ClickException(f"Track {track_id} not found")
    console.print(f"[bold]{_track_label(track)}[/bold]")
    console.print(f"Path: {track.path}")
    console.print(f"BPM: {track.bpm or track.spotify_tempo or '--'}")
    console.print(f"Key: {track.key or track.spotify_key or track.key_numeric or '--'}")
    console.print(f"Stage: {track.analysis_stage or '--'}")
    console.print(f"Status: {track.analysis_status or '--'}")
    console.print(f"Decode failed: {track.decode_failed or '--'}")
    if track.analysis_error:
        console.print(f"Error: {track.analysis_error}")
    if track.analysis_debug:
        console.print(track.analysis_debug)


@main.command(name="reanalyze-bpm")
@click.argument("track_id", type=int)
@click.option("--json-output", is_flag=True, help="Emit JSON with the updated BPM analysis.")
@click.option("--path-override", type=str, default="", help="Optional local file path to analyze instead of the stored track path.")
def reanalyze_bpm(track_id: int, json_output: bool, path_override: str) -> None:
    started_at = time.perf_counter()
    timeline: list[dict[str, object]] = []

    def mark(stage: str, **extra: object) -> None:
        elapsed_ms = round((time.perf_counter() - started_at) * 1000, 1)
        entry = {"stage": stage, "elapsed_ms": elapsed_ms, **extra}
        timeline.append(entry)
        click.echo(f"[reanalyze-bpm] {json.dumps(entry, ensure_ascii=True)}", err=True)

    db = _db()
    mark("db_lookup_start", track_id=track_id)
    track = db.get_track_by_id(track_id)
    if not track:
        raise click.ClickException(f"Track {track_id} not found")
    if not track.path:
        raise click.ClickException(f"Track {track_id} has no file path")
    analysis_path = path_override.strip() or track.path

    mark("detect_bpm_start", path=analysis_path, stored_path=track.path)
    bpm, bpm_source, analysis_error, bpm_confidence = detect_bpm(analysis_path)
    mark(
        "detect_bpm_done",
        bpm=bpm or 0.0,
        bpm_source=bpm_source or "",
        analysis_error=analysis_error or "",
        bpm_confidence=float(bpm_confidence or 0.0),
    )
    analysis_status = "ok" if bpm else "needs_review"
    decode_failed = "true" if analysis_error == "decode_failed" else "false"
    reanalyze_debug: dict[str, object] = {
        "track_id": track_id,
        "path": track.path,
        "analysis_path": analysis_path,
        "artist": track.artist or "",
        "title": track.title or "",
        "album": track.album or "",
        "local_bpm": bpm or 0.0,
        "local_bpm_source": bpm_source or "",
        "local_bpm_error": analysis_error or "",
        "bpm_confidence": float(bpm_confidence or 0.0),
        "album_art_present_before": bool(track.album_art_url),
        "album_art_source_before": track.album_art_source or "",
        "art_recheck_attempted": False,
        "art_saved": False,
        "timeline": timeline,
    }
    analysis_debug = (
        f"manual_reanalyze_bpm={bpm or 0.0} | "
        f"local_bpm_error={analysis_error or 'none'} | "
        f"bpm_confidence={bpm_confidence:.3f}"
    )
    mark("db_update_analysis_start")
    updated = db.update_track_analysis(
      track_id,
      bpm=bpm,
      bpm_source=bpm_source,
      bpm_confidence=bpm_confidence,
      analysis_status=analysis_status,
      analysis_error=analysis_error,
      analysis_stage="local_bpm",
      analysis_debug=analysis_debug,
      decode_failed=decode_failed,
    )
    mark("db_update_analysis_done", updated=bool(updated))
    if not updated:
        raise click.ClickException(f"Track {track_id} not found after update")

    mark("art_refresh_start", has_album_art=bool(updated.album_art_url))
    art_result = _refresh_track_art(track_id, force=False)
    reanalyze_debug["art_refresh"] = art_result
    mark(
        "art_refresh_done",
        ok=bool(art_result.get("ok", False)),
        art_saved=bool(art_result.get("art_saved", False)),
        message=str(art_result.get("message") or ""),
    )
    mark("db_reload_track_start")
    refreshed_after_art = db.get_track_by_id(track_id)
    if refreshed_after_art:
        updated = refreshed_after_art
    mark("db_reload_track_done", found=bool(refreshed_after_art))

    payload = {
        "id": updated.id,
        "bpm": updated.bpm or 0.0,
        "bpm_source": updated.bpm_source or "",
        "bpm_confidence": float(updated.bpm_confidence or 0.0),
        "analysis_status": updated.analysis_status or "",
        "analysis_error": updated.analysis_error or "",
        "analysis_stage": updated.analysis_stage or "",
        "analysis_debug": updated.analysis_debug or "",
        "decode_failed": updated.decode_failed or "",
        "album_art_url": updated.album_art_url or "",
        "album_art_source": updated.album_art_source or "",
        "debug": reanalyze_debug,
    }
    mark("complete", final_bpm=payload["bpm"], final_album_art_source=payload["album_art_source"])
    if json_output:
        click.echo(json.dumps(payload))
        return

    console.print(
        f"{_track_label(updated)} -> BPM {payload['bpm'] or '--'} ({payload['bpm_source'] or 'none'})"
    )


def _refresh_track_art(track_id: int, force: bool = False) -> dict:
    from .media import build_media_links, SpotifyClient
    from .scanner import _resolve_album_art

    started_at = time.perf_counter()
    timeline: list[dict[str, object]] = []

    def mark(stage: str, **extra: object) -> None:
        elapsed_ms = round((time.perf_counter() - started_at) * 1000, 1)
        entry = {"stage": stage, "elapsed_ms": elapsed_ms, **extra}
        timeline.append(entry)
        click.echo(f"[reanalyze-art] {json.dumps(entry, ensure_ascii=True)}", err=True)

    db = _db()
    mark("db_lookup_start", track_id=track_id, force=force)
    track = db.get_track_by_id(track_id)
    if not track:
        mark("db_lookup_missing")
        return {"ok": False, "track_id": track_id, "message": "track not found", "timeline": timeline}
    if not track.path:
        mark("db_lookup_missing_path")
        return {"ok": False, "track_id": track_id, "message": "track has no file path", "timeline": timeline}
    if track.album_art_url and not force:
        mark("skip_existing_art", album_art_source=track.album_art_source or "")
        return {
            "ok": True,
            "track_id": track_id,
            "message": "track already has album art",
            "art_saved": False,
            "art_skip_reason": "already_has_album_art",
            "album_art_url": track.album_art_url or "",
            "album_art_source": track.album_art_source or "",
            "timeline": timeline,
        }

    missing = SpotifyClient().missing_credentials()
    spotify_enabled = not bool(missing)
    if missing:
        mark("spotify_credentials_missing", missing=",".join(missing))

    result: dict[str, object] = {
        "ok": True,
        "track_id": track_id,
        "path": track.path,
        "artist": track.artist or "",
        "title": track.title or "",
        "album": track.album or "",
        "album_art_present_before": bool(track.album_art_url),
        "album_art_source_before": track.album_art_source or "",
        "art_saved": False,
        "timeline": timeline,
    }

    mark(
        "build_media_links_start",
        artist=track.artist or "",
        title=track.title or "",
        album=track.album or "",
        duration=float(track.duration or 0.0),
    )
    needs_acoustid = not bool((track.artist and str(track.artist).strip()) and (track.title and str(track.title).strip()))
    mark("build_media_links_mode", needs_acoustid=needs_acoustid)
    previews = build_media_links(
        track.artist,
        track.title,
        track.album,
        track.duration,
        fetch_album_art=True,
        file_path=track.path,
        enable_spotify=spotify_enabled,
        enable_acoustid=needs_acoustid,
    )
    mark(
        "build_media_links_done",
        spotify_id=previews.get("spotify_id") or "",
        spotify_match_score=float(previews.get("spotify_match_score") or 0.0),
        has_album_art=bool(previews.get("album_art_url")),
        has_artist_image=bool(previews.get("artist_image_url")),
    )
    result["spotify_id"] = previews.get("spotify_id") or ""
    result["spotify_match_score"] = float(previews.get("spotify_match_score") or 0.0)
    result["spotify_album_art_url"] = previews.get("album_art_url") or ""
    result["spotify_artist_image_url"] = previews.get("artist_image_url") or ""
    result["spotify_debug"] = previews.get("spotify_debug") or ""
    result["theaudiodb_debug"] = previews.get("theaudiodb_debug") or ""
    result["musicbrainz_debug"] = previews.get("musicbrainz_debug") or ""
    result["discogs_debug"] = previews.get("discogs_debug") or ""
    result["album_art_provider"] = previews.get("album_art_provider") or ""
    result["artist_image_provider"] = previews.get("artist_image_provider") or ""

    album_art = _resolve_album_art(
        {
            "artist": track.artist,
            "title": track.title,
            "album": track.album,
            "embedded_album_art_url": "",
        },
        previews,
        True,
        {},
        {},
    )
    mark(
        "resolve_album_art_done",
        resolved_source=album_art.get("album_art_source") or "",
        resolved_status=album_art.get("album_art_review_status") or "",
        has_resolved_art=bool(album_art.get("album_art_url")),
    )
    album_art_url = str(album_art.get("album_art_url") or "")
    result["resolved_album_art_url"] = album_art_url
    result["resolved_album_art_source"] = album_art.get("album_art_source") or ""
    result["resolved_album_art_review_status"] = album_art.get("album_art_review_status") or ""
    result["resolved_album_art_review_notes"] = album_art.get("album_art_review_notes") or ""

    if not album_art_url:
        mark("resolve_album_art_empty")
        result["message"] = "no album art or artist image could be resolved"
        return result

    mark("db_save_art_start", album_art_source=album_art.get("album_art_source") or "")
    db.add_track(
        {
            "path": track.path,
            "album_art_url": album_art_url,
            "album_art_source": album_art.get("album_art_source") or "",
            "album_art_confidence": float(album_art.get("album_art_confidence") or 0.0),
            "album_art_review_status": album_art.get("album_art_review_status") or "missing",
            "album_art_review_notes": album_art.get("album_art_review_notes") or "",
            "album_group_key": album_art.get("album_group_key") or "",
            "embedded_album_art": bool(album_art.get("embedded_album_art")),
            "spotify_id": previews.get("spotify_id") or track.spotify_id,
            "spotify_uri": previews.get("spotify_uri") or track.spotify_uri,
            "spotify_url": previews.get("spotify_url") or track.spotify_url,
            "spotify_preview_url": previews.get("spotify_preview_url") or track.spotify_preview_url,
            "spotify_album_name": previews.get("spotify_album_name") or track.spotify_album_name,
            "spotify_match_score": float(previews.get("spotify_match_score") or 0.0),
            "spotify_high_confidence": str(previews.get("spotify_high_confidence") or False).lower(),
        }
    )
    mark("db_save_art_done")
    refreshed = db.get_track_by_id(track_id)
    result["art_saved"] = True
    result["message"] = f"saved {album_art.get('album_art_source') or 'art'} image"
    result["album_art_url"] = refreshed.album_art_url if refreshed else album_art_url
    result["album_art_source"] = refreshed.album_art_source if refreshed else album_art.get("album_art_source") or ""
    mark("complete", final_album_art_source=result["album_art_source"])
    return result


def _merge_art_storage_debug(
    existing_debug: object,
    *,
    origin_url: str,
    public_url: str,
    bucket: str,
    object_name: str,
    sha256_hex: str,
    content_type: str,
) -> str:
    payload: dict[str, Any]
    if isinstance(existing_debug, str) and existing_debug.strip():
        try:
            parsed = json.loads(existing_debug)
            payload = dict(parsed) if isinstance(parsed, Mapping) else {"raw": existing_debug}
        except json.JSONDecodeError:
            payload = {"raw": existing_debug}
    else:
        payload = {}
    payload["storage"] = {
        "provider": "gcs",
        "origin_url": origin_url,
        "public_url": public_url,
        "bucket": bucket,
        "object_name": object_name,
        "sha256": sha256_hex,
        "content_type": content_type,
    }
    return json.dumps(payload)


def _compact_debug_payload(raw: object) -> str:
    if not raw:
        return ""
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return ""
        try:
            raw = json.loads(text)
        except json.JSONDecodeError:
            return text[:220]
    if not isinstance(raw, Mapping):
        return str(raw)[:220]

    preferred_keys = [
        "error",
        "timed_out",
        "enabled",
        "result_count",
        "selected_artist",
        "selected_title",
        "selected_album",
        "selected_score",
        "selection_strength",
        "album_art_url",
        "artist_image_url",
    ]
    parts: list[str] = []
    for key in preferred_keys:
        if key not in raw:
            continue
        value = raw.get(key)
        if value in ("", None, [], {}):
            continue
        parts.append(f"{key}={value}")
    if not parts and raw.get("events"):
        events = raw.get("events")
        if isinstance(events, Sequence) and not isinstance(events, (str, bytes)) and events:
            last_event = events[-1]
            if isinstance(last_event, Mapping):
                stage = last_event.get("stage")
                error = last_event.get("error")
                if stage:
                    parts.append(f"last_stage={stage}")
                if error:
                    parts.append(f"last_error={error}")
    if not parts:
        return json.dumps(raw, ensure_ascii=True)[:220]
    return " ".join(parts)[:220]


def _provider_attempt_summary(previews: dict[str, object], resolution_meta: dict[str, object]) -> str:
    spotify_state = "on" if resolution_meta.get("spotify_enabled") else "off"
    spotify_missing = ",".join(resolution_meta.get("spotify_missing_credentials") or [])
    acoustid_state = "on" if resolution_meta.get("needs_acoustid") else "off"
    provider = str(previews.get("album_art_provider") or "none")
    artist_provider = str(previews.get("artist_image_provider") or "none")
    bits = [
        f"spotify={spotify_state}",
        f"acoustid={acoustid_state}",
        f"album_provider={provider}",
        f"artist_provider={artist_provider}",
    ]
    if spotify_missing:
        bits.append(f"spotify_missing={spotify_missing}")
    return " ".join(bits)


def _provider_debug_summary(previews: dict[str, object]) -> str:
    labels = [
        ("spotify", previews.get("spotify_debug")),
        ("acoustid", previews.get("acoustid_debug")),
        ("theaudiodb", previews.get("theaudiodb_debug")),
        ("musicbrainz", previews.get("musicbrainz_debug")),
        ("discogs", previews.get("discogs_debug")),
    ]
    parts = []
    for label, raw in labels:
        compact = _compact_debug_payload(raw)
        if compact:
            parts.append(f"{label}[{compact}]")
    return " | ".join(parts)


def _resolve_track_art_for_storage(
    track,
    *,
    force_resolve: bool,
    album_art_cache: dict[str, dict],
    artist_art_cache: dict[str, dict],
) -> tuple[dict[str, object], dict[str, object], dict[str, object]]:
    from .media import build_media_links
    from .scanner import _resolve_album_art

    current_url = str(track.album_art_url or "").strip()
    if current_url and not force_resolve:
        return (
            {
                "album_art_url": current_url,
                "album_art_source": track.album_art_source or "existing",
                "album_art_confidence": float(track.album_art_confidence or 0.0),
                "album_art_review_status": track.album_art_review_status or ("approved" if current_url else "missing"),
                "album_art_review_notes": track.album_art_review_notes or "",
                "album_group_key": track.album_group_key or "",
                "embedded_album_art": bool(track.embedded_album_art),
            },
            {
                "spotify_id": track.spotify_id or "",
                "spotify_uri": track.spotify_uri or "",
                "spotify_url": track.spotify_url or "",
                "spotify_preview_url": track.spotify_preview_url or "",
                "spotify_album_name": track.spotify_album_name or "",
                "spotify_match_score": float(track.spotify_match_score or 0.0),
                "spotify_high_confidence": str(track.spotify_high_confidence or False).lower(),
            },
            {
                "used_existing_url": True,
                "spotify_enabled": bool(track.spotify_id),
                "spotify_missing_credentials": [],
                "needs_acoustid": False,
            },
        )

    missing = SpotifyClient().missing_credentials()
    spotify_enabled = not bool(missing)
    needs_acoustid = not bool((track.artist and str(track.artist).strip()) and (track.title and str(track.title).strip()))
    previews = build_media_links(
        track.artist,
        track.title,
        track.album,
        track.duration,
        fetch_album_art=True,
        file_path=track.path,
        enable_spotify=spotify_enabled,
        enable_acoustid=needs_acoustid,
    )
    album_art = _resolve_album_art(
        {
            "artist": track.artist,
            "title": track.title,
            "album": track.album,
            "embedded_album_art_url": "",
        },
        previews,
        True,
        album_art_cache,
        artist_art_cache,
    )
    return (
        album_art,
        previews,
        {
            "used_existing_url": False,
            "spotify_enabled": spotify_enabled,
            "spotify_missing_credentials": missing,
            "needs_acoustid": needs_acoustid,
        },
    )


@main.command(name="reanalyze-art")
@click.argument("track_id", type=int)
@click.option("--force", is_flag=True, help="Refresh art even if the track already has an image.")
@click.option("--json-output", is_flag=True, help="Emit JSON with the updated art analysis.")
def reanalyze_art(track_id: int, force: bool, json_output: bool) -> None:
    payload = _refresh_track_art(track_id, force=force)
    if json_output:
        click.echo(json.dumps(payload))
        return
    if not payload.get("ok", False):
        raise click.ClickException(str(payload.get("message") or "Unable to refresh artwork"))
    console.print(str(payload.get("message") or "Artwork refresh complete."))


@main.command()
@click.option("--dry-run", is_flag=True, help="Show what would be removed without changing the database.")
def dedupe(dry_run: bool) -> None:
    result = _db().dedupe_tracks(dry_run=dry_run)
    mode = "Would remove" if dry_run else "Removed"
    console.print(
        f"{mode} {result['removed']} duplicate track rows across {result['groups']} groups."
    )


@main.command(name="reset-db")
@click.option("--yes", is_flag=True, help="Confirm destructive database reset.")
def reset_db(yes: bool) -> None:
    if not yes:
        raise click.ClickException("Refusing to reset without --yes")
    _db().reset_database()
    console.print("Database reset complete.")


@main.command(name="fetch-art")
@click.option("--force", is_flag=True, help="Re-fetch art even for tracks that already have it.")
@click.option("--limit", type=int, default=None, help="Maximum number of tracks to process.")
@click.option("--verbose", "-v", is_flag=True, help="Print per-track debug output.")
def fetch_art(force: bool, limit: int | None, verbose: bool) -> None:
    """Fetch missing album art from Spotify for already-scanned tracks."""
    from tqdm import tqdm
    from .media import SpotifyClient, build_media_links
    from .scanner import _resolve_album_art

    missing = SpotifyClient().missing_credentials()
    if missing:
        raise click.ClickException(f"Spotify credentials missing: {', '.join(missing)}")

    db = _db()
    tracks = db.get_all_tracks()
    targets = [t for t in tracks if force or not t.album_art_url]
    if limit is not None:
        targets = targets[:limit]

    if not tracks:
        console.print("No tracks in database. Run [bold]dj-assist scan[/bold] first.")
        return
    if not targets:
        console.print("All tracks already have album art.")
        return

    console.print(f"Fetching album art for {len(targets)} tracks...")
    updated = 0
    skipped = 0
    errors = 0

    from .scanner import _art_debug_reason
    album_art_cache: dict[str, dict] = {}
    artist_art_cache: dict[str, dict] = {}

    for track in tqdm(targets, desc="Fetching art"):
        try:
            previews = build_media_links(
                track.artist,
                track.title,
                track.album,
                track.duration,
                fetch_album_art=True,
                file_path=track.path,
            )
            album_art = _resolve_album_art(
                {
                    "artist": track.artist,
                    "title": track.title,
                    "album": track.album,
                    "embedded_album_art_url": "",
                },
                previews,
                True,
                album_art_cache,
                artist_art_cache,
            )
            art_url = str(album_art.get("album_art_url") or "")
            if verbose:
                label = _track_label(track)
                reason = _art_debug_reason(previews, fetch_album_art=True)
                icon = "🎨" if art_url else "✗"
                source = str(album_art.get("album_art_source") or "none")
                tqdm.write(f"  {icon} {label}  |  art: {reason}  |  source: {source}")
            if not art_url:
                skipped += 1
                continue
            db.add_track({
                "path": track.path,
                "album_art_url": art_url,
                "album_art_source": album_art.get("album_art_source") or "",
                "album_art_confidence": float(album_art.get("album_art_confidence") or 0.0),
                "album_art_review_status": album_art.get("album_art_review_status") or "missing",
                "album_art_review_notes": album_art.get("album_art_review_notes") or "",
                "album_group_key": album_art.get("album_group_key") or "",
                "embedded_album_art": bool(album_art.get("embedded_album_art")),
                "spotify_id": previews.get("spotify_id") or track.spotify_id,
                "spotify_uri": previews.get("spotify_uri") or track.spotify_uri,
                "spotify_url": previews.get("spotify_url") or track.spotify_url,
                "spotify_album_name": previews.get("spotify_album_name") or track.spotify_album_name,
                "spotify_match_score": float(previews.get("spotify_match_score") or 0.0),
                "spotify_high_confidence": str(previews.get("spotify_high_confidence") or False).lower(),
            })
            updated += 1
        except Exception as exc:
            errors += 1
            tqdm.write(f"Error for {_track_label(track)}: {exc}")

    console.print(
        f"Updated: {updated}  No match: {skipped}  Errors: {errors}"
    )


@main.command(name="store-art-gcs")
@click.option("--force", is_flag=True, help="Reprocess tracks even if their art already points at the configured GCS URL base.")
@click.option("--force-resolve", is_flag=True, help="Ignore the current album_art_url and resolve artwork again from providers.")
@click.option("--limit", type=int, default=None, help="Maximum number of tracks to process.")
@click.option("--bucket", type=str, default=None, help="GCS bucket name. Falls back to DJ_ASSIST_GCS_BUCKET.")
@click.option("--prefix", type=str, default=None, help="Object prefix inside the bucket. Falls back to DJ_ASSIST_GCS_PREFIX.")
@click.option("--public-base-url", type=str, default=None, help="Public URL base for stored art. Defaults to https://storage.googleapis.com/<bucket>.")
@click.option("--verbose", "-v", is_flag=True, help="Print per-track debug output.")
def store_art_gcs(
    force: bool,
    force_resolve: bool,
    limit: int | None,
    bucket: str | None,
    prefix: str | None,
    public_base_url: str | None,
    verbose: bool,
) -> None:
    """Backfill album art into GCS and rewrite DB URLs to the stored objects."""
    from tqdm import tqdm

    from .art_store import (
        download_art,
        gcs_bucket_from_env,
        gcs_prefix_from_env,
        gcs_public_base_url,
        is_managed_art_url,
        upload_art_to_gcs,
    )

    resolved_bucket = (bucket or gcs_bucket_from_env()).strip()
    if not resolved_bucket:
        raise click.ClickException("GCS bucket is required. Pass --bucket or set DJ_ASSIST_GCS_BUCKET.")
    resolved_prefix = (prefix or gcs_prefix_from_env()).strip()
    resolved_public_base_url = gcs_public_base_url(resolved_bucket, explicit=public_base_url)

    db = _db()
    tracks = db.get_all_tracks()
    if not tracks:
        console.print("No tracks in database. Run [bold]dj-assist scan[/bold] first.")
        return

    targets = [
        track for track in tracks
        if force or not is_managed_art_url(track.album_art_url or "", resolved_bucket, resolved_public_base_url)
    ]
    if limit is not None:
        targets = targets[:limit]
    if not targets:
        console.print("All tracks already point at the configured GCS bucket.")
        return

    console.print(f"Storing album art to GCS for {len(targets)} tracks...")
    updated = 0
    skipped = 0
    errors = 0
    reused = 0
    album_art_cache: dict[str, dict] = {}
    artist_art_cache: dict[str, dict] = {}
    source_cache: dict[str, dict[str, str]] = {}

    for track in tqdm(targets, desc="Uploading art"):
        try:
            album_art, preview_payload, resolution_meta = _resolve_track_art_for_storage(
                track,
                force_resolve=force_resolve,
                album_art_cache=album_art_cache,
                artist_art_cache=artist_art_cache,
            )
            source_url = str(album_art.get("album_art_url") or "").strip()
            if not source_url:
                skipped += 1
                if verbose:
                    reason = str(album_art.get("album_art_review_notes") or "no album art resolved")
                    tqdm.write(f"  ✗ {_track_label(track)}  |  {reason}")
                    tqdm.write(f"    {_provider_attempt_summary(preview_payload, resolution_meta)}")
                    debug_summary = _provider_debug_summary(preview_payload)
                    if debug_summary:
                        tqdm.write(f"    {debug_summary}")
                continue

            cached_storage = source_cache.get(source_url)
            if cached_storage:
                stored_public_url = cached_storage["public_url"]
                object_name = cached_storage["object_name"]
                sha256_hex = cached_storage["sha256"]
                content_type = cached_storage["content_type"]
                reused += 1
            else:
                downloaded = download_art(source_url)
                stored = upload_art_to_gcs(
                    downloaded,
                    bucket_name=resolved_bucket,
                    prefix=resolved_prefix,
                    public_base_url=resolved_public_base_url,
                )
                stored_public_url = stored.public_url
                object_name = stored.object_name
                sha256_hex = stored.sha256_hex
                content_type = stored.content_type
                source_cache[source_url] = {
                    "public_url": stored_public_url,
                    "object_name": object_name,
                    "sha256": sha256_hex,
                    "content_type": content_type,
                }

            db.add_track({
                "path": track.path,
                "album_art_url": stored_public_url,
                "album_art_source": album_art.get("album_art_source") or track.album_art_source or "",
                "album_art_confidence": float(album_art.get("album_art_confidence") or track.album_art_confidence or 0.0),
                "album_art_review_status": album_art.get("album_art_review_status") or track.album_art_review_status or "missing",
                "album_art_review_notes": album_art.get("album_art_review_notes") or track.album_art_review_notes or "",
                "album_group_key": album_art.get("album_group_key") or track.album_group_key or "",
                "embedded_album_art": bool(album_art.get("embedded_album_art") if "embedded_album_art" in album_art else track.embedded_album_art),
                "album_art_match_debug": _merge_art_storage_debug(
                    track.album_art_match_debug,
                    origin_url=source_url,
                    public_url=stored_public_url,
                    bucket=resolved_bucket,
                    object_name=object_name,
                    sha256_hex=sha256_hex,
                    content_type=content_type,
                ),
                "spotify_id": str(preview_payload.get("spotify_id") or track.spotify_id or ""),
                "spotify_uri": str(preview_payload.get("spotify_uri") or track.spotify_uri or ""),
                "spotify_url": str(preview_payload.get("spotify_url") or track.spotify_url or ""),
                "spotify_preview_url": str(preview_payload.get("spotify_preview_url") or track.spotify_preview_url or ""),
                "spotify_album_name": str(preview_payload.get("spotify_album_name") or track.spotify_album_name or ""),
                "spotify_match_score": float(preview_payload.get("spotify_match_score") or track.spotify_match_score or 0.0),
                "spotify_high_confidence": str(preview_payload.get("spotify_high_confidence") or track.spotify_high_confidence or False).lower(),
            })
            updated += 1
            if verbose:
                source_label = str(album_art.get("album_art_source") or track.album_art_source or "unknown")
                action = "reused_existing" if resolution_meta.get("used_existing_url") else "resolved_fresh"
                tqdm.write(f"  ✓ {_track_label(track)}  |  source: {source_label}  |  mode: {action}  |  stored: {stored_public_url}")
                tqdm.write(f"    {_provider_attempt_summary(preview_payload, resolution_meta)}")
        except Exception as exc:
            errors += 1
            tqdm.write(f"Error for {_track_label(track)}: {exc}")
            if verbose:
                debug_summary = ""
                try:
                    debug_summary = _provider_debug_summary(preview_payload)  # type: ignore[name-defined]
                except Exception:
                    debug_summary = ""
                if debug_summary:
                    tqdm.write(f"    {debug_summary}")

    console.print(
        f"Stored: {updated}  Reused uploads: {reused}  No match: {skipped}  Errors: {errors}"
    )


@main.command()
@click.option("--host", default="127.0.0.1", show_default=True)
@click.option("--port", default=8000, type=int, show_default=True)
@click.option("--debug", is_flag=True, help="Run the web app in debug mode.")
def web(host: str, port: int, debug: bool) -> None:
    missing = SpotifyClient().missing_credentials()
    if missing:
        console.print(f"[yellow]Spotify env missing:[/yellow] {', '.join(missing)}")
    run_app(host=host, port=port, debug=debug)


@main.command()
@click.option("--start-track-id", type=int, default=None, help="Start from a specific track ID.")
@click.option("--limit", type=int, default=5, show_default=True, help="How many recommendations to show each step.")
def flow(start_track_id: int | None, limit: int) -> None:
    db = _db()
    tracks = db.get_all_tracks()
    if not tracks:
        raise click.ClickException("No tracks found. Run scan first.")

    current = None
    if start_track_id is not None:
        current = db.get_track_by_id(start_track_id)
        if not current:
            raise click.ClickException(f"Track {start_track_id} not found")
    else:
        _print_tracks(tracks)
        selected = click.prompt("Pick a track ID to start", type=int)
        current = db.get_track_by_id(selected)
        if not current:
            raise click.ClickException(f"Track {selected} not found")

    used_ids = {current.id}
    while True:
        recommendations = _print_recommendations(current, tracks, exclude_ids=list(used_ids), limit=limit)
        if not recommendations:
            console.print("No compatible next tracks found.")
            return

        choice = click.prompt(
            "Next track ID to continue, or 0 to stop",
            type=int,
            default=0,
            show_default=True,
        )
        if choice == 0:
            return

        next_track = next((track for track, _reason, _score in recommendations if track.id == choice), None)
        if not next_track:
            console.print("Choose one of the suggested track IDs from the table.")
            continue

        used_ids.add(next_track.id)
        current = next_track


@main.group()
def set() -> None:
    """Manage DJ sets."""


@set.command(name="new")
@click.argument("name")
def set_new(name: str) -> None:
    set_obj = _db().create_set(name)
    console.print(f"Created set {set_obj.id}: {set_obj.name}")


@set.command(name="list")
def set_list() -> None:
    _print_sets(_db().get_all_sets())


@set.command(name="show")
@click.argument("set_id", type=int)
def set_show(set_id: int) -> None:
    set_obj = _db().get_set_by_id(set_id)
    if not set_obj:
        raise click.ClickException(f"Set {set_id} not found")

    table = Table(show_header=True, header_style="bold cyan")
    table.add_column("Pos", justify="right")
    table.add_column("Track")
    table.add_column("BPM", justify="right")
    table.add_column("Key", justify="center")

    for st in set_obj.set_tracks:
        table.add_row(
            str(st.position),
            _track_label(st.track),
            f"{(st.track.bpm or st.track.spotify_tempo or 0.0):.1f}" if (st.track.bpm or st.track.spotify_tempo) else "--",
            st.track.bpm_source or "--",
            st.track.key or st.track.spotify_key or st.track.key_numeric or "--",
        )

    console.print(f"[bold]{set_obj.name}[/bold]  Total: {_format_duration(set_obj.total_duration)}")
    console.print(table)


@set.command(name="add")
@click.argument("set_id", type=int)
@click.argument("track_id", type=int)
def set_add(set_id: int, track_id: int) -> None:
    db = _db()
    set_obj = db.get_set_by_id(set_id)
    track = db.get_track_by_id(track_id)
    if not set_obj:
        raise click.ClickException(f"Set {set_id} not found")
    if not track:
        raise click.ClickException(f"Track {track_id} not found")
    db.add_track_to_set(set_id, track_id)
    console.print(f"Added track {track_id} to set {set_id}")


@set.command(name="remove")
@click.argument("set_id", type=int)
@click.argument("position", type=int)
def set_remove(set_id: int, position: int) -> None:
    _db().remove_track_from_set(set_id, position)
    console.print(f"Removed position {position} from set {set_id}")


@set.command(name="recommend")
@click.argument("set_id", type=int)
@click.option("--track-id", type=int, default=None, help="Use a specific reference track.")
def set_recommend(set_id: int, track_id: int | None) -> None:
    db = _db()
    set_obj = db.get_set_by_id(set_id)
    if not set_obj:
        raise click.ClickException(f"Set {set_id} not found")

    if track_id is None:
        if not set_obj.set_tracks:
            raise click.ClickException("Set is empty; provide --track-id")
        reference = set_obj.set_tracks[-1].track
    else:
        reference = next((t for t in db.get_all_tracks() if t.id == track_id), None)
        if not reference:
            raise click.ClickException(f"Track {track_id} not found")

    _print_recommendations(reference, db.get_all_tracks(), exclude_ids=[t.track_id for t in set_obj.set_tracks])


@set.command(name="export")
@click.argument("set_id", type=int)
@click.option("--output", type=click.Path(dir_okay=False, path_type=Path), default=None)
def set_export(set_id: int, output: Path | None) -> None:
    db = _db()
    set_obj = db.get_set_by_id(set_id)
    if not set_obj:
        raise click.ClickException(f"Set {set_id} not found")

    output = output or Path(f"set_{set_id}.txt")
    lines = [f"{set_obj.name}", ""]
    for st in set_obj.set_tracks:
        lines.append(f"{st.position}. {_track_label(st.track)} [{st.track.bpm or '--'} BPM, {st.track.key or '--'}]")
    output.write_text("\n".join(lines), encoding="utf-8")
    console.print(f"Exported to {output}")


if __name__ == "__main__":
    main()
