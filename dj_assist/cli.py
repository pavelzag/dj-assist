from __future__ import annotations

from pathlib import Path

import click
from rich.console import Console
from rich.table import Table

from .analyzer import get_recommended_next_tracks
from .db import Database
from .scanner import scan_directory
from .web import run_app
from .media import SpotifyClient

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
@click.option("--auto-double", is_flag=True, help="Double and round BPM for tracks detected in the 60–80 BPM range.")
def scan(directory: Path, no_skip_existing: bool, bpm_lookup: str, fetch_album_art: bool, verbose: bool, no_spotify: bool, auto_double: bool) -> None:
    db = _db()
    spotify_enabled = not no_spotify
    if spotify_enabled:
        missing = SpotifyClient().missing_credentials()
        if missing:
            console.print(f"[yellow]Spotify env missing:[/yellow] {', '.join(missing)}")
            spotify_enabled = False
    if not spotify_enabled:
        console.print("[dim]Spotify disabled — skipping metadata lookups.[/dim]")
    results = scan_directory(
        str(directory),
        db,
        skip_existing=not no_skip_existing,
        bpm_lookup=bpm_lookup.lower(),
        fetch_album_art=fetch_album_art and spotify_enabled,
        verbose=verbose,
        spotify_enabled=spotify_enabled,
        auto_double_bpm=auto_double,
    )
    console.print(
        f"Scanned: {results['scanned']}  Analyzed: {results['analyzed']}  Skipped: {results['skipped']}  Errors: {results['errors']}"
    )


@main.command()
def list() -> None:
    _print_tracks(_db().get_all_tracks())


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

    for track in tqdm(targets, desc="Fetching art"):
        try:
            previews = build_media_links(
                track.artist,
                track.title,
                track.duration,
                fetch_album_art=True,
            )
            art_url = previews.get("album_art_url") or ""
            if verbose:
                label = _track_label(track)
                reason = _art_debug_reason(previews, fetch_album_art=True)
                icon = "🎨" if art_url else "✗"
                tqdm.write(f"  {icon} {label}  |  art: {reason}")
            if not art_url:
                skipped += 1
                continue
            db.add_track({
                "path": track.path,
                "album_art_url": art_url,
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
