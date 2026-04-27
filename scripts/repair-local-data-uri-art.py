#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path

from dj_assist.art_store import (
    download_art,
    gcs_bucket_from_env,
    gcs_prefix_from_env,
    gcs_public_base_url,
    upload_art_to_gcs,
)


DEFAULT_SQLITE_PATHS = [
    Path.home() / "Library/Application Support/dj-assist/dj-assist.db",
    Path.home() / ".dj_assist/dj_assist.db",
]


@dataclass
class Row:
    id: int
    album_art_url: str


def detect_sqlite_path(explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit).expanduser()
        if not path.exists():
            raise FileNotFoundError(f"SQLite DB not found: {path}")
        return path
    for candidate in DEFAULT_SQLITE_PATHS:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("Could not find local SQLite DB. Pass --sqlite-path.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload embedded data: album art from local SQLite to GCS and rewrite album_art_url.",
    )
    parser.add_argument("--sqlite-path", default=None, help="Path to local DJ Assist SQLite DB.")
    parser.add_argument("--limit", type=int, default=None, help="Maximum number of rows to process.")
    parser.add_argument("--dry-run", action="store_true", help="Count candidate rows without updating anything.")
    return parser.parse_args()


def load_rows(conn: sqlite3.Connection, limit: int | None) -> list[Row]:
    sql = """
        SELECT id, album_art_url
        FROM tracks
        WHERE COALESCE(TRIM(album_art_url), '') LIKE 'data:%'
        ORDER BY id
    """
    params: tuple[object, ...] = ()
    if limit is not None:
        sql += " LIMIT ?"
        params = (limit,)
    return [Row(id=int(row[0]), album_art_url=str(row[1])) for row in conn.execute(sql, params).fetchall()]


def main() -> int:
    args = parse_args()
    sqlite_path = detect_sqlite_path(args.sqlite_path)

    bucket_name = gcs_bucket_from_env().strip()
    if not bucket_name:
        print("ERROR: DJ_ASSIST_GCS_BUCKET is not configured.", file=sys.stderr)
        return 2
    prefix = gcs_prefix_from_env()
    public_base_url = gcs_public_base_url(bucket_name)

    with sqlite3.connect(str(sqlite_path)) as conn:
        rows = load_rows(conn, args.limit)
        print(f"Found {len(rows)} local data URI rows in {sqlite_path}")
        if args.dry_run or not rows:
            return 0

        cache: dict[str, str] = {}
        updated = 0
        for row in rows:
            public_url = cache.get(row.album_art_url)
            if not public_url:
                stored = upload_art_to_gcs(
                    download_art(row.album_art_url),
                    bucket_name=bucket_name,
                    prefix=prefix,
                    public_base_url=public_base_url,
                )
                public_url = stored.public_url
                cache[row.album_art_url] = public_url
            conn.execute(
                "UPDATE tracks SET album_art_url = ? WHERE id = ?",
                (public_url, row.id),
            )
            updated += 1
        conn.commit()
        print(f"Updated {updated} local rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
