#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import os
import sqlite3
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path


DEFAULT_SQLITE_PATHS = [
    Path.home() / "Library/Application Support/dj-assist/dj-assist.db",
    Path.home() / ".dj_assist/dj_assist.db",
]


@dataclass
class ArtRow:
    file_hash: str
    album_art_url: str
    album_art_source: str
    album_art_status: str


def detect_sqlite_path(explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit).expanduser()
        if not path.exists():
            raise FileNotFoundError(f"SQLite DB not found: {path}")
        return path

    env_path = os.getenv("DJ_ASSIST_DB_PATH", "").strip()
    if env_path:
        path = Path(env_path).expanduser()
        if path.exists():
            return path
        raise FileNotFoundError(f"DJ_ASSIST_DB_PATH points to missing file: {path}")

    for candidate in DEFAULT_SQLITE_PATHS:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "Could not find local SQLite DB. Pass --sqlite-path or set DJ_ASSIST_DB_PATH."
    )


def read_rows(sqlite_path: Path) -> list[ArtRow]:
    query = """
        SELECT
          COALESCE(file_hash, ''),
          COALESCE(album_art_url, ''),
          COALESCE(album_art_source, '')
        FROM tracks
        WHERE COALESCE(file_hash, '') <> ''
          AND COALESCE(TRIM(album_art_url), '') <> ''
    """
    rows: list[ArtRow] = []
    with sqlite3.connect(str(sqlite_path)) as conn:
        cursor = conn.execute(query)
        for file_hash, album_art_url, album_art_source in cursor.fetchall():
            file_hash = str(file_hash or "").strip()
            album_art_url = str(album_art_url or "").strip()
            album_art_source = str(album_art_source or "").strip()
            if not file_hash or not album_art_url:
                continue
            rows.append(
                ArtRow(
                    file_hash=file_hash,
                    album_art_url=album_art_url,
                    album_art_source=album_art_source,
                    album_art_status="present",
                )
            )
    return rows


def write_csv(rows: list[ArtRow], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["file_hash", "album_art_url", "album_art_source", "album_art_status"])
        for row in rows:
            writer.writerow([row.file_hash, row.album_art_url, row.album_art_source, row.album_art_status])


def build_sql(
    csv_path: Path,
    overwrite: bool,
    client_id: str | None,
    dry_run: bool,
    target_data_uri_only: bool,
) -> str:
    csv_path_sql = str(csv_path).replace("'", "''")
    overwrite_sql = "TRUE" if overwrite else "FALSE"
    client_filter = ""
    if client_id:
        safe_client_id = client_id.replace("'", "''")
        client_filter = f" AND t.client_id = '{safe_client_id}'"
    target_filter = " AND COALESCE(BTRIM(t.album_art_url), '') LIKE 'data:%'" if target_data_uri_only else ""

    update_sql = f"""
WITH updated AS (
  UPDATE public.tracks AS t
  SET
    album_art_url = s.album_art_url,
    album_art_source = CASE
      WHEN BTRIM(COALESCE(s.album_art_source, '')) <> '' THEN s.album_art_source
      ELSE t.album_art_source
    END,
    album_art_status = COALESCE(NULLIF(s.album_art_status, ''), 'present'),
    album_art_checked_at = NOW(),
    updated_at = NOW()
  FROM tmp_album_art AS s
  WHERE t.file_hash = s.file_hash
    {client_filter}
    {target_filter}
    AND ({overwrite_sql} OR COALESCE(BTRIM(t.album_art_url), '') = '')
  RETURNING t.id
)
SELECT COUNT(*) AS updated_rows FROM updated;
"""

    commit_sql = "ROLLBACK;" if dry_run else "COMMIT;"
    return f"""
\\set ON_ERROR_STOP on
BEGIN;
DROP TABLE IF EXISTS tmp_album_art;
CREATE TEMP TABLE tmp_album_art (
  file_hash text NOT NULL,
  album_art_url text NOT NULL,
  album_art_source text,
  album_art_status text
);
\\copy tmp_album_art (file_hash, album_art_url, album_art_source, album_art_status) FROM '{csv_path_sql}' WITH (FORMAT csv, HEADER true)

SELECT COUNT(*) AS staged_rows FROM tmp_album_art;
SELECT COUNT(*) AS matched_rows
FROM public.tracks t
JOIN tmp_album_art s ON t.file_hash = s.file_hash
WHERE TRUE {client_filter}{target_filter};

{update_sql}
{commit_sql}
"""


def run_psql(database_url: str, sql_text: str) -> int:
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as sql_file:
        sql_file.write(sql_text)
        sql_path = Path(sql_file.name)

    try:
        completed = subprocess.run(
            ["psql", database_url, "-f", str(sql_path)],
            check=False,
            stdout=sys.stdout,
            stderr=sys.stderr,
            text=True,
        )
        return int(completed.returncode)
    finally:
        try:
            sql_path.unlink(missing_ok=True)
        except Exception:
            pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill Neon public.tracks album art from local SQLite tracks table."
    )
    parser.add_argument(
        "--sqlite-path",
        default=None,
        help="Path to local DJ Assist SQLite DB. Defaults to DJ_ASSIST_DB_PATH or known app locations.",
    )
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or "",
        help="Neon/Postgres URL (defaults to DATABASE_URL or POSTGRES_URL from env).",
    )
    parser.add_argument(
        "--client-id",
        default=None,
        help="Optional: only update tracks for this client_id in Neon.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing Neon album_art_url values (default only fills empty).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Stage and count matches, but rollback changes.",
    )
    parser.add_argument(
        "--target-data-uri-only",
        action="store_true",
        help="Only update Neon rows whose current album_art_url starts with data:.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.database_url:
        print("ERROR: DATABASE_URL/POSTGRES_URL is required (or pass --database-url).", file=sys.stderr)
        return 2

    try:
        sqlite_path = detect_sqlite_path(args.sqlite_path)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    rows = read_rows(sqlite_path)
    if not rows:
        print(f"No local rows with file_hash + album_art_url found in {sqlite_path}.")
        return 0

    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8") as csv_file:
        csv_path = Path(csv_file.name)
    try:
        write_csv(rows, csv_path)
        print(f"Prepared {len(rows)} local rows from {sqlite_path}")
        print(f"Mode: {'dry-run' if args.dry_run else 'apply'} | overwrite={'yes' if args.overwrite else 'no'}")
        if args.client_id:
            print(f"Client filter: {args.client_id}")
        sql_text = build_sql(
            csv_path=csv_path,
            overwrite=args.overwrite,
            client_id=args.client_id,
            dry_run=args.dry_run,
            target_data_uri_only=args.target_data_uri_only,
        )
        return run_psql(args.database_url, sql_text)
    finally:
        try:
            csv_path.unlink(missing_ok=True)
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
