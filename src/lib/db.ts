import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import {
  CollectionSyncConflictError,
  getCollectionTracksFromServer,
  listCollectionsFromServer,
  syncCollectionDeletion,
  syncCollectionSnapshot,
} from '@/lib/server-collections';

declare global {
  // eslint-disable-next-line no-var
  var _sqliteConn: DatabaseSync | undefined;
}

function defaultDatabasePath(): string {
  return join(homedir(), '.dj_assist', 'dj_assist.db');
}

function resolveSqlitePath(): string {
  const explicitPath = process.env.DJ_ASSIST_DB_PATH?.trim();
  if (explicitPath) return explicitPath;

  const url = process.env.DJ_ASSIST_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || '';
  if (url.startsWith('sqlite:///')) return url.slice('sqlite:///'.length);
  if (url.startsWith('sqlite://')) return url.slice('sqlite://'.length);

  return defaultDatabasePath();
}

export function getDatabasePath(): string {
  return resolveSqlitePath();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function boolInt(value: boolean | null | undefined): number | null {
  if (value == null) return null;
  return value ? 1 : 0;
}

function toBoolean(value: unknown): boolean | null {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return null;
}

type SqlitePrimitive = string | number | bigint | null | Uint8Array;

function isSqliteBusyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; errcode?: unknown; errstr?: unknown; message?: unknown };
  return (
    candidate.code === 'ERR_SQLITE_ERROR'
    && (
      candidate.errcode === 5
      || String(candidate.errstr ?? '').toLowerCase().includes('database is locked')
      || String(candidate.message ?? '').toLowerCase().includes('database is locked')
    )
  );
}

function sleepSync(milliseconds: number): void {
  const duration = Math.max(0, Math.trunc(milliseconds));
  if (!duration) return;
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, duration);
}

function getDb(): DatabaseSync {
  if (!global._sqliteConn) {
    const dbPath = resolveSqlitePath();
    mkdirSync(dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    global._sqliteConn = db;
  }
  return global._sqliteConn;
}

let schemaEnsured = false;

function ensureSchema(): void {
  if (schemaEnsured) return;
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      title TEXT,
      artist TEXT,
      album TEXT,
      duration REAL,
      bitrate REAL,
      bpm REAL,
      bpm_override REAL,
      bpm_confidence REAL,
      key TEXT,
      key_numeric TEXT,
      spotify_id TEXT,
      spotify_uri TEXT,
      spotify_url TEXT,
      spotify_preview_url TEXT,
      spotify_tempo REAL,
      spotify_key TEXT,
      spotify_mode TEXT,
      album_art_url TEXT,
      album_art_source TEXT,
      album_art_confidence REAL,
      album_art_review_status TEXT,
      album_art_review_notes TEXT,
      album_group_key TEXT,
      embedded_album_art INTEGER NOT NULL DEFAULT 0,
      album_art_match_debug TEXT,
      spotify_album_name TEXT,
      spotify_match_score REAL,
      spotify_high_confidence TEXT,
      youtube_url TEXT,
      bpm_source TEXT,
      analysis_status TEXT,
      analysis_error TEXT,
      decode_failed TEXT,
      analysis_stage TEXT,
      analysis_debug TEXT,
      file_hash TEXT,
      file_size INTEGER,
      file_mtime REAL,
      ignored INTEGER NOT NULL DEFAULT 0,
      custom_tags TEXT,
      artist_canonical TEXT,
      album_canonical TEXT,
      manual_cues TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      server_collection_id TEXT,
      server_client_id TEXT,
      server_client_collection_id TEXT,
      server_revision INTEGER,
      server_updated_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS set_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
      track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      client_entry_id TEXT,
      position INTEGER NOT NULL,
      UNIQUE(set_id, position)
    );

    CREATE TABLE IF NOT EXISTS scan_runs (
      id TEXT PRIMARY KEY,
      directory TEXT NOT NULL,
      status TEXT NOT NULL,
      rescan_mode TEXT NOT NULL,
      fetch_album_art INTEGER NOT NULL DEFAULT 1,
      verbose_enabled INTEGER NOT NULL DEFAULT 0,
      total_files INTEGER NOT NULL DEFAULT 0,
      processed_files INTEGER NOT NULL DEFAULT 0,
      scanned INTEGER NOT NULL DEFAULT 0,
      analyzed INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      errors INTEGER NOT NULL DEFAULT 0,
      with_bpm INTEGER NOT NULL DEFAULT 0,
      with_key INTEGER NOT NULL DEFAULT 0,
      with_spotify INTEGER NOT NULL DEFAULT 0,
      with_album_art INTEGER NOT NULL DEFAULT 0,
      decode_failures INTEGER NOT NULL DEFAULT 0,
      fatal_error TEXT,
      current_file TEXT,
      validation TEXT NOT NULL DEFAULT '{}',
      summary TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS scan_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_run_id TEXT NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'log',
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const trackColumns = [
    ['bitrate', 'REAL'],
    ['bpm_override', 'REAL'],
    ['bpm_confidence', 'REAL'],
    ['ignored', 'INTEGER NOT NULL DEFAULT 0'],
    ['custom_tags', 'TEXT'],
    ['artist_canonical', 'TEXT'],
    ['album_canonical', 'TEXT'],
    ['manual_cues', "TEXT NOT NULL DEFAULT '[]'"],
    ['album_art_source', 'TEXT'],
    ['album_art_confidence', 'REAL'],
    ['album_art_review_status', 'TEXT'],
    ['album_art_review_notes', 'TEXT'],
    ['album_group_key', 'TEXT'],
    ['embedded_album_art', 'INTEGER NOT NULL DEFAULT 0'],
    ['album_art_match_debug', 'TEXT'],
    ['spotify_url', 'TEXT'],
    ['file_size', 'INTEGER'],
    ['file_mtime', 'REAL'],
  ] as const;
  const trackExisting = new Set(
    db.prepare("SELECT name FROM pragma_table_info('tracks')").all().map((row) => String((row as Record<string, unknown>).name)),
  );
  for (const [name, definition] of trackColumns) {
    if (!trackExisting.has(name)) db.exec(`ALTER TABLE tracks ADD COLUMN ${name} ${definition}`);
  }

  const setColumns = [
    ['server_collection_id', 'TEXT'],
    ['server_client_id', 'TEXT'],
    ['server_client_collection_id', 'TEXT'],
    ['server_revision', 'INTEGER'],
    ['server_updated_at', 'TEXT'],
  ] as const;
  const setExisting = new Set(
    db.prepare("SELECT name FROM pragma_table_info('sets')").all().map((row) => String((row as Record<string, unknown>).name)),
  );
  for (const [name, definition] of setColumns) {
    if (!setExisting.has(name)) db.exec(`ALTER TABLE sets ADD COLUMN ${name} ${definition}`);
  }
  const setTrackExisting = new Set(
    db.prepare("SELECT name FROM pragma_table_info('set_tracks')").all().map((row) => String((row as Record<string, unknown>).name)),
  );
  if (!setTrackExisting.has('client_entry_id')) db.exec('ALTER TABLE set_tracks ADD COLUMN client_entry_id TEXT');
  db.exec("UPDATE set_tracks SET client_entry_id = lower(hex(randomblob(16))) WHERE client_entry_id IS NULL OR trim(client_entry_id) = ''");
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS sets_server_collection_idx ON sets(server_collection_id) WHERE server_collection_id IS NOT NULL');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS set_tracks_client_entry_idx ON set_tracks(client_entry_id) WHERE client_entry_id IS NOT NULL');

  schemaEnsured = true;
}

function queryAll<T extends Record<string, unknown>>(sql: string, ...params: SqlitePrimitive[]): T[] {
  ensureSchema();
  return getDb().prepare(sql).all(...params) as T[];
}

function queryOne<T extends Record<string, unknown>>(sql: string, ...params: SqlitePrimitive[]): T | null {
  ensureSchema();
  return (getDb().prepare(sql).get(...params) as T | undefined) ?? null;
}

function execute(sql: string, ...params: SqlitePrimitive[]): void {
  ensureSchema();
  getDb().prepare(sql).run(...params);
}

function transaction<T>(fn: () => T): T {
  ensureSchema();
  const db = getDb();
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // Ignore rollback errors after a failed write.
        }
        throw error;
      }
    } catch (error) {
      if (!isSqliteBusyError(error) || attempt === maxAttempts) throw error;
      sleepSync(attempt * 150);
    }
  }
  throw new Error('Unreachable transaction retry state.');
}

function canonicalizeText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/\b(feat|ft|featuring|with|vs|x)\b.*$/i, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim();
}

const DISPLAY_UPPERCASE_TOKENS = new Set(['DJ', 'MC', 'UK', 'USA', 'EDM', 'RNB', 'EP', 'LP', 'VIP', 'ID']);

function smartCapitalize(value: string | null): string | null {
  const cleaned = String(value ?? '').trim();
  if (!cleaned) return value == null ? null : '';

  const letters = [...cleaned].filter((char) => /[A-Za-z]/.test(char));
  if (letters.length) {
    const hasLower = letters.some((char) => char === char.toLowerCase());
    const hasUpper = letters.some((char) => char === char.toUpperCase());
    if (hasLower && hasUpper) return cleaned;
  }

  const convertToken = (token: string) => {
    if (!token) return token;
    const upper = token.toUpperCase();
    if (DISPLAY_UPPERCASE_TOKENS.has(upper)) return upper;
    if (token.includes("'")) {
      return token
        .split("'")
        .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : part))
        .join("'");
    }
    return `${token[0].toUpperCase()}${token.slice(1).toLowerCase()}`;
  };

  return cleaned
    .split(/(\s+|[-/&()+[\]{}])/)
    .map((part) => (/^(\s+|[-/&()+[\]{}])$/.test(part) ? part : convertToken(part)))
    .join('');
}

export function canonicalizeArtistName(value: string | null): string {
  return canonicalizeText(String(value ?? ''));
}

export function canonicalizeAlbumName(value: string | null): string {
  return canonicalizeText(String(value ?? ''));
}

function parseTags(value: string | null): string[] {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeTags(tags: string[]): string {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].join(', ');
}

type PreferredSourceKind = 'local' | 'google_drive' | null;

function preferredSourceTagValue(track: Pick<Track, 'custom_tags'>): PreferredSourceKind {
  const tags = parseTags(track.custom_tags);
  if (tags.includes('preferred_source:local')) return 'local';
  if (tags.includes('preferred_source:google_drive')) return 'google_drive';
  return null;
}

function withPreferredSourceTag(existingTags: string | null, preferredSource: PreferredSourceKind): string {
  const nextTags = parseTags(existingTags).filter((tag) => tag !== 'preferred_source:local' && tag !== 'preferred_source:google_drive');
  if (preferredSource) nextTags.push(`preferred_source:${preferredSource}`);
  return serializeTags(nextTags);
}

export interface Track {
  id: number;
  path: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  duration: number | null;
  bitrate: number | null;
  bpm: number | null;
  bpm_override: number | null;
  bpm_confidence: number | null;
  key: string | null;
  key_numeric: string | null;
  spotify_id: string | null;
  spotify_uri: string | null;
  spotify_url: string | null;
  spotify_preview_url: string | null;
  spotify_tempo: number | null;
  spotify_key: string | null;
  spotify_mode: string | null;
  album_art_url: string | null;
  album_art_source: string | null;
  album_art_confidence: number | null;
  album_art_review_status: string | null;
  album_art_review_notes: string | null;
  album_group_key: string | null;
  embedded_album_art: boolean | null;
  album_art_match_debug: string | null;
  spotify_album_name: string | null;
  spotify_match_score: number | null;
  spotify_high_confidence: string | null;
  youtube_url: string | null;
  bpm_source: string | null;
  analysis_status: string | null;
  analysis_error: string | null;
  decode_failed: string | null;
  analysis_stage: string | null;
  analysis_debug: string | null;
  file_hash: string | null;
  file_size: number | null;
  file_mtime: number | null;
  ignored: boolean | null;
  custom_tags: string | null;
  artist_canonical: string | null;
  album_canonical: string | null;
  manual_cues: Array<{ time: number; label?: string }> | null;
  created_at: Date | null;
}

export type SerializedTrackSource = {
  kind: 'local' | 'google_drive';
  label: string;
  path: string | null;
  track_id: number;
  file_hash: string | null;
};

export interface ScanRun {
  id: string;
  directory: string;
  status: string;
  rescan_mode: string;
  fetch_album_art: boolean;
  verbose_enabled: boolean;
  total_files: number;
  processed_files: number;
  scanned: number;
  analyzed: number;
  skipped: number;
  errors: number;
  with_bpm: number;
  with_key: number;
  with_spotify: number;
  with_album_art: number;
  decode_failures: number;
  fatal_error: string | null;
  current_file: string | null;
  validation: Record<string, unknown>;
  summary: Record<string, unknown>;
  created_at: Date | null;
  updated_at: Date | null;
  finished_at: Date | null;
}

export interface ScanLog {
  id: number;
  scan_run_id: string;
  level: string;
  message: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date | null;
}

function mapTrack(row: Record<string, unknown>): Track {
  return {
    ...(row as unknown as Omit<Track, 'embedded_album_art' | 'ignored' | 'manual_cues' | 'created_at'>),
    id: Number(row.id),
    duration: row.duration == null ? null : Number(row.duration),
    bitrate: row.bitrate == null ? null : Number(row.bitrate),
    bpm: row.bpm == null ? null : Number(row.bpm),
    bpm_override: row.bpm_override == null ? null : Number(row.bpm_override),
    bpm_confidence: row.bpm_confidence == null ? null : Number(row.bpm_confidence),
    spotify_tempo: row.spotify_tempo == null ? null : Number(row.spotify_tempo),
    album_art_confidence: row.album_art_confidence == null ? null : Number(row.album_art_confidence),
    spotify_match_score: row.spotify_match_score == null ? null : Number(row.spotify_match_score),
    file_size: row.file_size == null ? null : Number(row.file_size),
    file_mtime: row.file_mtime == null ? null : Number(row.file_mtime),
    embedded_album_art: toBoolean(row.embedded_album_art),
    ignored: toBoolean(row.ignored),
    manual_cues: parseJson<Array<{ time: number; label?: string }>>(row.manual_cues, []),
    created_at: parseDate(row.created_at),
  };
}

function mapScanRun(row: Record<string, unknown>): ScanRun {
  return {
    ...(row as unknown as Omit<ScanRun, 'fetch_album_art' | 'verbose_enabled' | 'validation' | 'summary' | 'created_at' | 'updated_at' | 'finished_at'>),
    fetch_album_art: Boolean(row.fetch_album_art),
    verbose_enabled: Boolean(row.verbose_enabled),
    total_files: Number(row.total_files ?? 0),
    processed_files: Number(row.processed_files ?? 0),
    scanned: Number(row.scanned ?? 0),
    analyzed: Number(row.analyzed ?? 0),
    skipped: Number(row.skipped ?? 0),
    errors: Number(row.errors ?? 0),
    with_bpm: Number(row.with_bpm ?? 0),
    with_key: Number(row.with_key ?? 0),
    with_spotify: Number(row.with_spotify ?? 0),
    with_album_art: Number(row.with_album_art ?? 0),
    decode_failures: Number(row.decode_failures ?? 0),
    validation: parseJson<Record<string, unknown>>(row.validation, {}),
    summary: parseJson<Record<string, unknown>>(row.summary, {}),
    created_at: parseDate(row.created_at),
    updated_at: parseDate(row.updated_at),
    finished_at: parseDate(row.finished_at),
  };
}

function mapScanLog(row: Record<string, unknown>): ScanLog {
  return {
    ...(row as unknown as Omit<ScanLog, 'payload' | 'created_at'>),
    id: Number(row.id),
    payload: parseJson<Record<string, unknown>>(row.payload, {}),
    created_at: parseDate(row.created_at),
  };
}

export async function createScanRun(input: {
  id: string;
  directory: string;
  rescanMode: string;
  fetchAlbumArt: boolean;
  verbose: boolean;
  validation: Record<string, unknown>;
}): Promise<void> {
  execute(
    `INSERT INTO scan_runs (
      id, directory, status, rescan_mode, fetch_album_art, verbose_enabled, validation
    ) VALUES (?, ?, 'queued', ?, ?, ?, ?)`,
    input.id,
    input.directory,
    input.rescanMode,
    input.fetchAlbumArt ? 1 : 0,
    input.verbose ? 1 : 0,
    JSON.stringify(input.validation ?? {}),
  );
}

export async function updateScanRun(id: string, patch: Record<string, unknown>): Promise<void> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  const assignments: string[] = [];
  const values: SqlitePrimitive[] = [];
  for (const [key, value] of entries) {
    const escapedKey = key.replace(/[^a-z0-9_]/gi, '');
    assignments.push(`${escapedKey} = ?`);
    if (key === 'validation' || key === 'summary') values.push(JSON.stringify(value ?? {}));
    else if (typeof value === 'boolean') values.push(value ? 1 : 0);
    else values.push((value as SqlitePrimitive) ?? null);
  }
  values.push(id);
  execute(`UPDATE scan_runs SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...values);
}

export async function finalizeScanRun(id: string, patch: Record<string, unknown>): Promise<void> {
  await updateScanRun(id, patch);
  execute(
    'UPDATE scan_runs SET finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    id,
  );
}

export async function addScanLog(input: {
  scanRunId: string;
  level: string;
  message: string;
  eventType?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  execute(
    'INSERT INTO scan_logs (scan_run_id, level, message, event_type, payload) VALUES (?, ?, ?, ?, ?)',
    input.scanRunId,
    input.level,
    input.message,
    input.eventType ?? 'log',
    JSON.stringify(input.payload ?? {}),
  );
}

export async function listScanRuns(limit = 20): Promise<ScanRun[]> {
  return queryAll<Record<string, unknown>>(
    'SELECT * FROM scan_runs ORDER BY datetime(created_at) DESC LIMIT ?',
    limit,
  ).map(mapScanRun);
}

export async function getScanRunById(id: string): Promise<ScanRun | null> {
  const row = queryOne<Record<string, unknown>>('SELECT * FROM scan_runs WHERE id = ?', id);
  return row ? mapScanRun(row) : null;
}

export async function getScanLogs(scanRunId: string, limit = 200): Promise<ScanLog[]> {
  return queryAll<Record<string, unknown>>(
    'SELECT * FROM scan_logs WHERE scan_run_id = ? ORDER BY id DESC LIMIT ?',
    scanRunId,
    limit,
  ).map(mapScanLog);
}

function sanitizeAlbumArtUrl(
  trackId: number,
  value: string | null,
  options?: { includeEmbeddedArtwork?: boolean },
): string | null {
  if (!value) return value;
  if (options?.includeEmbeddedArtwork === false && value.startsWith('data:')) {
    return `/api/tracks/${trackId}/art`;
  }
  return value;
}

export function serializeTrack(
  track: Track,
  options?: { includeEmbeddedArtwork?: boolean },
) {
  const effectiveBpm = track.bpm_override ?? track.bpm ?? track.spotify_tempo ?? null;
  const effectiveBpmSource = track.bpm_override != null ? 'manual' : track.bpm_source;
  const effectiveKey = track.key || track.spotify_key || track.key_numeric || '';
  const albumArtUrl = sanitizeAlbumArtUrl(track.id, track.album_art_url, options);
  const displayArtist = smartCapitalize(track.artist);
  const displayTitle = smartCapitalize(track.title);
  const displayAlbum = smartCapitalize(track.album);
  const displaySpotifyAlbumName = smartCapitalize(track.spotify_album_name);
  return {
    id: track.id,
    path: track.path,
    title: displayTitle,
    artist: displayArtist,
    album: displayAlbum,
    duration: track.duration,
    bitrate: track.bitrate,
    bpm: track.bpm,
    bpm_override: track.bpm_override,
    bpm_confidence: track.bpm_confidence,
    key: track.key,
    key_numeric: track.key_numeric,
    spotify_id: track.spotify_id,
    spotify_uri: track.spotify_uri,
    spotify_url: track.spotify_url,
    spotify_preview_url: track.spotify_preview_url,
    spotify_tempo: track.spotify_tempo,
    spotify_key: track.spotify_key,
    spotify_mode: track.spotify_mode,
    album_art_url: albumArtUrl,
    album_art_source: track.album_art_source,
    album_art_confidence: track.album_art_confidence,
    album_art_review_status: track.album_art_review_status,
    album_art_review_notes: track.album_art_review_notes,
    album_group_key: track.album_group_key,
    embedded_album_art: Boolean(track.embedded_album_art),
    album_art_match_debug: track.album_art_match_debug,
    spotify_album_name: displaySpotifyAlbumName,
    spotify_match_score: track.spotify_match_score,
    spotify_high_confidence: (track.spotify_high_confidence ?? '').toLowerCase() === 'true',
    album_art_debug: {
      album_art_url: albumArtUrl ?? '',
      spotify_id: track.spotify_id ?? '',
      spotify_album_name: displaySpotifyAlbumName ?? '',
      spotify_match_score: track.spotify_match_score ?? 0,
      spotify_high_confidence: (track.spotify_high_confidence ?? '').toLowerCase() === 'true',
      album_art_source: track.album_art_source ?? '',
      album_art_confidence: track.album_art_confidence ?? 0,
      album_art_review_status: track.album_art_review_status ?? '',
      album_art_review_notes: track.album_art_review_notes ?? '',
      album_group_key: track.album_group_key ?? '',
      embedded_album_art: Boolean(track.embedded_album_art),
      album_art_match_debug: track.album_art_match_debug ?? '',
      has_album_art: Boolean(track.album_art_url),
    },
    youtube_url: track.youtube_url,
    bpm_source: effectiveBpmSource,
    analysis_status: track.analysis_status,
    analysis_error: track.analysis_error,
    decode_failed: track.decode_failed,
    analysis_stage: track.analysis_stage,
    analysis_debug: track.analysis_debug,
    file_hash: track.file_hash,
    ignored: Boolean(track.ignored),
    custom_tags: parseTags(track.custom_tags),
    artist_canonical: track.artist_canonical ?? canonicalizeArtistName(track.artist),
    album_canonical: track.album_canonical ?? canonicalizeAlbumName(track.album ?? track.spotify_album_name),
    manual_cues: Array.isArray(track.manual_cues) ? track.manual_cues : [],
    effective_bpm: effectiveBpm,
    effective_key: effectiveKey,
    sources: buildTrackSources([track]),
    source_kinds: [isGoogleDriveTrackPathValue(track.path) ? 'google_drive' : 'local'],
    has_local_source: !isGoogleDriveTrackPathValue(track.path),
    has_google_drive_source: isGoogleDriveTrackPathValue(track.path),
  };
}

function trackIdentity(track: Track): string {
  return track.spotify_id || track.file_hash || `${track.artist ?? ''}|${track.title ?? ''}|${Math.round(track.duration ?? 0)}`;
}

function isGoogleDriveTrackPathValue(pathValue: string | null): boolean {
  return String(pathValue ?? '').trim().startsWith('gdrive:');
}

function preferredTrackOrder(a: Track, b: Track): number {
  const preferredSource = preferredSourceTagValue(a) ?? preferredSourceTagValue(b);
  if (preferredSource) {
    const aMatchesPreference = preferredSource === 'google_drive' ? isGoogleDriveTrackPathValue(a.path) : !isGoogleDriveTrackPathValue(a.path);
    const bMatchesPreference = preferredSource === 'google_drive' ? isGoogleDriveTrackPathValue(b.path) : !isGoogleDriveTrackPathValue(b.path);
    if (aMatchesPreference !== bMatchesPreference) return aMatchesPreference ? -1 : 1;
  }
  const aLocal = !isGoogleDriveTrackPathValue(a.path);
  const bLocal = !isGoogleDriveTrackPathValue(b.path);
  if (aLocal !== bLocal) return aLocal ? -1 : 1;
  const aHasBpm = Number(a.bpm_override ?? a.bpm ?? a.spotify_tempo ?? 0) > 0;
  const bHasBpm = Number(b.bpm_override ?? b.bpm ?? b.spotify_tempo ?? 0) > 0;
  if (aHasBpm !== bHasBpm) return aHasBpm ? -1 : 1;
  return Number(a.id) - Number(b.id);
}

function preferValue<T>(tracks: Track[], pick: (track: Track) => T | null | undefined, fallback: T | null = null): T | null {
  for (const track of tracks) {
    const value = pick(track);
    if (value == null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }
  return fallback;
}

function buildTrackSources(tracks: Track[]): SerializedTrackSource[] {
  const seen = new Set<string>();
  return [...tracks]
    .sort(preferredTrackOrder)
    .flatMap((track) => {
      const kind: SerializedTrackSource['kind'] = isGoogleDriveTrackPathValue(track.path) ? 'google_drive' : 'local';
      const key = `${kind}:${track.path ?? ''}:${track.id}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        kind,
        label: kind === 'google_drive' ? 'Google Drive' : 'Local',
        path: track.path,
        track_id: track.id,
        file_hash: track.file_hash ?? null,
      }];
    });
}

export function aggregateTracks(tracks: Track[]): Track[][] {
  const groups = new Map<string, Track[]>();
  for (const track of tracks) {
    const key = trackIdentity(track);
    const bucket = groups.get(key) ?? [];
    bucket.push(track);
    groups.set(key, bucket);
  }
  return [...groups.values()]
    .map((group) => [...group].sort(preferredTrackOrder))
    .sort((a, b) => compareAggregateTrackOrder(a[0], b[0]));
}

function compareAggregateTrackOrder(a: Track, b: Track): number {
  return String(a.artist ?? '').localeCompare(String(b.artist ?? ''))
    || String(a.title ?? '').localeCompare(String(b.title ?? ''))
    || Number(a.id) - Number(b.id);
}

export function serializeTrackGroup(
  trackGroup: Track[],
  options?: { includeEmbeddedArtwork?: boolean },
) {
  const tracks = [...trackGroup].sort(preferredTrackOrder);
  const primary = tracks[0];
  const combinedTags = [...new Set(tracks.flatMap((track) => parseTags(track.custom_tags)))];
  const combinedSources = buildTrackSources(tracks);
  const base = serializeTrack(primary, options);
  return {
    ...base,
    path: preferValue(tracks, (track) => track.path, primary.path),
    title: preferValue(tracks, (track) => smartCapitalize(track.title), base.title),
    artist: preferValue(tracks, (track) => smartCapitalize(track.artist), base.artist),
    album: preferValue(tracks, (track) => smartCapitalize(track.album), base.album),
    duration: preferValue(tracks, (track) => track.duration, base.duration),
    bitrate: preferValue(tracks, (track) => track.bitrate, base.bitrate),
    bpm: preferValue(tracks, (track) => track.bpm, base.bpm),
    bpm_override: preferValue(tracks, (track) => track.bpm_override, base.bpm_override),
    bpm_confidence: preferValue(tracks, (track) => track.bpm_confidence, base.bpm_confidence),
    key: preferValue(tracks, (track) => track.key, base.key),
    key_numeric: preferValue(tracks, (track) => track.key_numeric, base.key_numeric),
    spotify_id: preferValue(tracks, (track) => track.spotify_id, base.spotify_id),
    spotify_uri: preferValue(tracks, (track) => track.spotify_uri, base.spotify_uri),
    spotify_url: preferValue(tracks, (track) => track.spotify_url, base.spotify_url),
    spotify_preview_url: preferValue(tracks, (track) => track.spotify_preview_url, base.spotify_preview_url),
    spotify_tempo: preferValue(tracks, (track) => track.spotify_tempo, base.spotify_tempo),
    spotify_key: preferValue(tracks, (track) => track.spotify_key, base.spotify_key),
    spotify_mode: preferValue(tracks, (track) => track.spotify_mode, base.spotify_mode),
    album_art_url: preferValue(tracks, (track) => sanitizeAlbumArtUrl(track.id, track.album_art_url, options), base.album_art_url),
    album_art_source: preferValue(tracks, (track) => track.album_art_source, base.album_art_source),
    album_art_confidence: preferValue(tracks, (track) => track.album_art_confidence, base.album_art_confidence),
    album_art_review_status: preferValue(tracks, (track) => track.album_art_review_status, base.album_art_review_status),
    album_art_review_notes: preferValue(tracks, (track) => track.album_art_review_notes, base.album_art_review_notes),
    album_group_key: preferValue(tracks, (track) => track.album_group_key, base.album_group_key),
    embedded_album_art: tracks.some((track) => Boolean(track.embedded_album_art)),
    album_art_match_debug: preferValue(tracks, (track) => track.album_art_match_debug, base.album_art_match_debug),
    spotify_album_name: preferValue(tracks, (track) => smartCapitalize(track.spotify_album_name), base.spotify_album_name),
    spotify_match_score: preferValue(tracks, (track) => track.spotify_match_score, base.spotify_match_score),
    spotify_high_confidence: tracks.some((track) => (track.spotify_high_confidence ?? '').toLowerCase() === 'true'),
    youtube_url: preferValue(tracks, (track) => track.youtube_url, base.youtube_url),
    bpm_source: preferValue(tracks, (track) => track.bpm_override != null ? 'manual' : track.bpm_source, base.bpm_source),
    analysis_status: preferValue(tracks, (track) => track.analysis_status, base.analysis_status),
    analysis_error: preferValue(tracks, (track) => track.analysis_error, base.analysis_error),
    decode_failed: preferValue(tracks, (track) => track.decode_failed, base.decode_failed),
    analysis_stage: preferValue(tracks, (track) => track.analysis_stage, base.analysis_stage),
    analysis_debug: preferValue(tracks, (track) => track.analysis_debug, base.analysis_debug),
    file_hash: preferValue(tracks, (track) => track.file_hash, base.file_hash),
    ignored: tracks.some((track) => Boolean(track.ignored)),
    custom_tags: combinedTags,
    artist_canonical: preferValue(tracks, (track) => track.artist_canonical, base.artist_canonical),
    album_canonical: preferValue(tracks, (track) => track.album_canonical, base.album_canonical),
    manual_cues: preferValue(tracks, (track) => Array.isArray(track.manual_cues) && track.manual_cues.length ? track.manual_cues : null, base.manual_cues),
    effective_bpm: preferValue(tracks, (track) => track.bpm_override ?? track.bpm ?? track.spotify_tempo, base.effective_bpm),
    effective_key: preferValue(tracks, (track) => track.key || track.spotify_key || track.key_numeric, base.effective_key),
    sources: combinedSources,
    source_kinds: [...new Set(combinedSources.map((source) => source.kind))],
    has_local_source: combinedSources.some((source) => source.kind === 'local'),
    has_google_drive_source: combinedSources.some((source) => source.kind === 'google_drive'),
    source_track_ids: tracks.map((track) => track.id),
    source_count: combinedSources.length,
    source_preference: preferredSourceTagValue(primary),
  };
}

function uniqueTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    const key = trackIdentity(track);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function getAllTracks(): Promise<Track[]> {
  return uniqueTracks(queryAll<Record<string, unknown>>('SELECT * FROM tracks ORDER BY artist, title, id').map(mapTrack));
}

export async function getAllTrackRows(): Promise<Track[]> {
  return queryAll<Record<string, unknown>>('SELECT * FROM tracks ORDER BY artist, title, id').map(mapTrack);
}

export async function getTrackById(id: number): Promise<Track | null> {
  const row = queryOne<Record<string, unknown>>('SELECT * FROM tracks WHERE id = ?', id);
  return row ? mapTrack(row) : null;
}

export async function getTrackGroupMembers(trackId: number): Promise<Track[]> {
  const current = await getTrackById(trackId);
  if (!current) return [];
  const identity = trackIdentity(current);
  return (await getAllTrackRows())
    .filter((track) => trackIdentity(track) === identity)
    .sort(preferredTrackOrder);
}

export interface SearchParams {
  query?: string | null;
  bpmMin?: number | null;
  bpmMax?: number | null;
  key?: string | null;
}

export async function searchTracks(params: SearchParams): Promise<Track[]> {
  return uniqueTracks(await searchTrackRows(params));
}

export async function searchTrackRows(params: SearchParams): Promise<Track[]> {
  const clauses = ['1=1'];
  const values: SqlitePrimitive[] = [];
  const query = params.query?.trim();
  if (query) {
    clauses.push("(LOWER(title) LIKE LOWER(?) OR LOWER(artist) LIKE LOWER(?) OR LOWER(album) LIKE LOWER(?) OR LOWER(spotify_album_name) LIKE LOWER(?) OR LOWER(COALESCE(custom_tags, '')) LIKE LOWER(?))");
    const like = `%${query}%`;
    values.push(like, like, like, like, like);
  }
  if (params.bpmMin != null) {
    clauses.push('COALESCE(bpm_override, bpm, spotify_tempo) >= ?');
    values.push(params.bpmMin);
  }
  if (params.bpmMax != null) {
    clauses.push('COALESCE(bpm_override, bpm, spotify_tempo) <= ?');
    values.push(params.bpmMax);
  }
  if (params.key?.trim()) {
    clauses.push('(UPPER(key) = ? OR UPPER(spotify_key) = ? OR UPPER(key_numeric) = ?)');
    const normKey = params.key.trim().toUpperCase();
    values.push(normKey, normKey, normKey);
  }
  const rows = queryAll<Record<string, unknown>>(
    `SELECT * FROM tracks WHERE ${clauses.join(' AND ')} ORDER BY artist, title, id`,
    ...values,
  ).map(mapTrack);
  return rows;
}

export async function updateTrackBpm(id: number, bpm: number): Promise<void> {
  execute('UPDATE tracks SET bpm_override = ? WHERE id = ?', bpm, id);
}

export async function updateTrackMetadata(
  id: number,
  patch: {
    title?: string | null;
    artist?: string | null;
    album?: string | null;
    key?: string | null;
    ignored?: boolean;
    custom_tags?: string[];
    manual_cues?: Array<{ time: number; label?: string }>;
    album_art_url?: string | null;
    album_art_source?: string | null;
    album_art_confidence?: number | null;
    album_art_review_status?: string | null;
    album_art_review_notes?: string | null;
    source_preference?: PreferredSourceKind;
  },
): Promise<void> {
  const current = await getTrackById(id);
  if (!current) return;

  const title = patch.title !== undefined ? patch.title : current.title;
  const artist = patch.artist !== undefined ? patch.artist : current.artist;
  const album = patch.album !== undefined ? patch.album : current.album;
  const values = {
    title,
    artist,
    album,
    key: patch.key !== undefined ? patch.key : current.key,
    ignored: patch.ignored !== undefined ? patch.ignored : current.ignored,
    custom_tags: patch.custom_tags !== undefined ? serializeTags(patch.custom_tags) : current.custom_tags,
    album_art_url: patch.album_art_url !== undefined ? patch.album_art_url : current.album_art_url,
    album_art_source: patch.album_art_source !== undefined ? patch.album_art_source : current.album_art_source,
    album_art_confidence: patch.album_art_confidence !== undefined ? patch.album_art_confidence : current.album_art_confidence,
    album_art_review_status: patch.album_art_review_status !== undefined ? patch.album_art_review_status : current.album_art_review_status,
    album_art_review_notes: patch.album_art_review_notes !== undefined ? patch.album_art_review_notes : current.album_art_review_notes,
    artist_canonical: canonicalizeArtistName(artist),
    album_canonical: canonicalizeAlbumName(album),
    manual_cues: patch.manual_cues !== undefined ? JSON.stringify(patch.manual_cues) : JSON.stringify(current.manual_cues ?? []),
    source_preference: patch.source_preference !== undefined ? patch.source_preference : preferredSourceTagValue(current),
  };

  const nextCustomTags = patch.custom_tags !== undefined
    ? withPreferredSourceTag(serializeTags(patch.custom_tags), values.source_preference)
    : withPreferredSourceTag(current.custom_tags, values.source_preference);

  execute(
    `UPDATE tracks
     SET title = ?, artist = ?, album = ?, key = ?, ignored = ?, custom_tags = ?,
         album_art_url = ?, album_art_source = ?, album_art_confidence = ?,
         album_art_review_status = ?, album_art_review_notes = ?, artist_canonical = ?,
         album_canonical = ?, manual_cues = ?
     WHERE id = ?`,
    values.title,
    values.artist,
    values.album,
    values.key,
    boolInt(Boolean(values.ignored)),
    nextCustomTags,
    values.album_art_url,
    values.album_art_source,
    values.album_art_confidence,
    values.album_art_review_status,
    values.album_art_review_notes,
    values.artist_canonical,
    values.album_canonical,
    values.manual_cues,
    id,
  );
}

export async function updateGoogleDriveTrackLocalMetadata(
  fileId: string,
  patch: {
    title?: string | null;
    artist?: string | null;
    album?: string | null;
    duration?: number | null;
    bitrate?: number | null;
    bpm?: number | null;
    key?: string | null;
    embedded_album_art_url?: string | null;
  },
): Promise<void> {
  const path = `gdrive:${String(fileId ?? '').trim()}`;
  const currentRow = queryOne<Record<string, unknown>>('SELECT * FROM tracks WHERE path = ? LIMIT 1', path);
  if (!currentRow) return;
  const current = mapTrack(currentRow);

  const title = patch.title !== undefined ? patch.title : current.title;
  const artist = patch.artist !== undefined ? patch.artist : current.artist;
  const album = patch.album !== undefined ? patch.album : current.album;
  const artistCanonical = canonicalizeArtistName(artist);
  const albumCanonical = canonicalizeAlbumName(album);
  const albumGroupKey = artistCanonical && albumCanonical ? `${artistCanonical}::${albumCanonical}` : current.album_group_key;
  const embeddedArtUrl = patch.embedded_album_art_url !== undefined ? patch.embedded_album_art_url : current.album_art_url;
  const hasEmbeddedArt = Boolean(String(embeddedArtUrl ?? '').trim());
  const nextBpm = patch.bpm != null && patch.bpm > 0 ? patch.bpm : current.bpm;
  const nextKey = patch.key !== undefined ? patch.key : current.key;

  execute(
    `UPDATE tracks
     SET title = ?, artist = ?, album = ?, duration = ?, bitrate = ?, bpm = ?, key = ?,
         bpm_source = ?, analysis_status = ?, analysis_error = ?, analysis_stage = ?, analysis_debug = ?,
         album_art_url = ?, album_art_source = ?, album_art_confidence = ?, album_art_review_status = ?,
         album_art_review_notes = ?, embedded_album_art = ?, album_group_key = ?, artist_canonical = ?, album_canonical = ?
     WHERE path = ?`,
    title,
    artist,
    album,
    patch.duration != null && patch.duration > 0 ? patch.duration : current.duration,
    patch.bitrate != null && patch.bitrate > 0 ? patch.bitrate : current.bitrate,
    nextBpm,
    nextKey,
    nextBpm ? 'tag' : current.bpm_source,
    'google_drive_local_metadata',
    null,
    'google_drive_local_metadata',
    `source=google_drive_local_metadata | embedded_tags=${hasEmbeddedArt ? 'yes' : 'no'} | bpm=${nextBpm ?? 0} | key=${nextKey ?? ''}`,
    hasEmbeddedArt ? embeddedArtUrl : current.album_art_url,
    hasEmbeddedArt ? 'embedded' : current.album_art_source,
    hasEmbeddedArt ? 100 : current.album_art_confidence,
    hasEmbeddedArt ? 'approved' : current.album_art_review_status,
    hasEmbeddedArt ? 'embedded artwork extracted from Google Drive file tags' : current.album_art_review_notes,
    boolInt(hasEmbeddedArt || Boolean(current.embedded_album_art)),
    albumGroupKey,
    artistCanonical || current.artist_canonical,
    albumCanonical || current.album_canonical,
    path,
  );
}

export async function purgeIgnoredGoogleDriveTracks(): Promise<number> {
  const before = Number(
    queryOne<Record<string, unknown>>(
      "SELECT COUNT(*) AS count FROM tracks WHERE path LIKE 'gdrive:%' AND title LIKE '._%'",
    )?.count ?? 0,
  );
  if (!before) return 0;
  execute("DELETE FROM tracks WHERE path LIKE 'gdrive:%' AND title LIKE '._%'");
  return before;
}

export async function getTracksByIds(ids: number[]): Promise<Track[]> {
  const uniqueIds = [...new Set(ids.filter((id) => Number.isFinite(id)))];
  if (!uniqueIds.length) return [];
  const placeholders = uniqueIds.map(() => '?').join(', ');
  return queryAll<Record<string, unknown>>(`SELECT * FROM tracks WHERE id IN (${placeholders})`, ...uniqueIds).map(mapTrack);
}

export async function importGoogleDriveTracks(input: {
  files: Array<{
    id: string;
    name: string;
    modifiedTime?: string | null;
    size?: string | null;
    md5Checksum?: string | null;
  }>;
  folderId?: string;
  folderName?: string;
}): Promise<{ imported: number; updated: number }> {
  const files = input.files.filter((file) => {
    const fileId = String(file.id ?? '').trim();
    const name = String(file.name ?? '').trim();
    return fileId && !name.startsWith('._');
  });
  if (!files.length) return { imported: 0, updated: 0 };
  let imported = 0;
  let updated = 0;
  const folderTag = String(input.folderId ?? '').trim();
  const folderName = String(input.folderName ?? '').trim();
  transaction(() => {
    for (const file of files) {
      const fileId = String(file.id ?? '').trim();
      const path = `gdrive:${fileId}`;
      const derivedTitle = String(file.name ?? '').replace(/\.[^.]+$/, '').trim() || String(file.name ?? '').trim() || fileId;
      const modifiedAt = String(file.modifiedTime ?? '').trim();
      const fileMtime = modifiedAt ? new Date(modifiedAt).getTime() / 1000 : null;
      const fileSize = Number(file.size ?? 0);
      const existing = queryOne<Record<string, unknown>>('SELECT id, title, custom_tags FROM tracks WHERE path = ? LIMIT 1', path);
      const tags = [
        ...parseTags(String(existing?.custom_tags ?? '')),
        'source:google_drive',
        ...(folderTag ? [`gdrive-folder:${folderTag}`] : []),
        ...(folderName ? [`gdrive-folder-name:${folderName}`] : []),
      ];
      const serializedTags = serializeTags(tags);
      if (existing) {
        execute(
          `UPDATE tracks
           SET title = ?,
               file_hash = ?,
               file_size = ?,
               file_mtime = ?,
               custom_tags = ?,
               analysis_status = COALESCE(analysis_status, ?)
           WHERE id = ?`,
          String(existing.title ?? '').trim() || derivedTitle,
          String(file.md5Checksum ?? '').trim() || null,
          Number.isFinite(fileSize) && fileSize > 0 ? fileSize : null,
          fileMtime,
          serializedTags,
          'google_drive_metadata',
          Number(existing.id),
        );
        updated += 1;
      } else {
        execute(
          `INSERT INTO tracks (
             path, title, artist, album, duration, bitrate, bpm, bpm_override, bpm_confidence,
             key, key_numeric, spotify_id, spotify_uri, spotify_url, spotify_preview_url,
             spotify_tempo, spotify_key, spotify_mode, album_art_url, album_art_source,
             album_art_confidence, album_art_review_status, album_art_review_notes, album_group_key,
             embedded_album_art, album_art_match_debug, spotify_album_name, spotify_match_score,
             spotify_high_confidence, youtube_url, bpm_source, analysis_status, analysis_error,
             decode_failed, analysis_stage, analysis_debug, file_hash, file_size, file_mtime,
             ignored, custom_tags, artist_canonical, album_canonical, manual_cues
           ) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL, NULL, NULL, ?, ?, ?, 0, ?, NULL, NULL, '[]')`,
          path,
          derivedTitle,
          'google_drive_metadata',
          String(file.md5Checksum ?? '').trim() || null,
          Number.isFinite(fileSize) && fileSize > 0 ? fileSize : null,
          fileMtime,
          serializedTags,
        );
        imported += 1;
      }
    }
  });
  return { imported, updated };
}

export async function bulkTrackAction(input: {
  ids: number[];
  action: 'ignore' | 'unignore' | 'add_tags' | 'remove_tags' | 'clear_tags' | 'add_to_set' | 'delete';
  tags?: string[];
  setId?: number;
}): Promise<{
  updated: number;
  skipped?: number;
  missingTrackIds?: number[];
  missingSet?: boolean;
}> {
  const ids = [...new Set(input.ids.filter((id) => Number.isFinite(id)))];
  if (!ids.length) return { updated: 0 };

  if (input.action === 'add_to_set') {
    if (!input.setId) return { updated: 0 };
    const setExists = queryOne<Record<string, unknown>>('SELECT id FROM sets WHERE id = ? LIMIT 1', input.setId);
    if (!setExists) {
      return { updated: 0, skipped: ids.length, missingTrackIds: ids, missingSet: true };
    }
    const tracks = await getTracksByIds(ids);
    const existingTrackIds = new Set(tracks.map((track) => Number(track.id)).filter((id) => Number.isFinite(id)));
    const missingTrackIds = ids.filter((id) => !existingTrackIds.has(id));
    if (tracks.length) {
      const setId = input.setId;
      await mutateSetWithRebase(setId, () => {
        let position = Number(queryOne<Record<string, unknown>>('SELECT COUNT(*) AS count FROM set_tracks WHERE set_id = ?', setId)?.count ?? 0);
        transaction(() => {
          for (const track of tracks) {
            position += 1;
            execute(
              'INSERT INTO set_tracks (set_id, track_id, client_entry_id, position) VALUES (?, ?, ?, ?)',
              setId,
              track.id,
              randomUUID(),
              position,
            );
          }
        });
      });
    }
    return {
      updated: tracks.length,
      skipped: missingTrackIds.length,
      missingTrackIds,
      missingSet: false,
    };
  }

  const placeholders = ids.map(() => '?').join(', ');
  if (input.action === 'delete') {
    execute(`DELETE FROM tracks WHERE id IN (${placeholders})`, ...ids);
    return { updated: ids.length };
  }

  const rows = queryAll<Record<string, unknown>>(`SELECT * FROM tracks WHERE id IN (${placeholders})`, ...ids).map(mapTrack);

  transaction(() => {
    for (const row of rows) {
      const currentTags = parseTags(row.custom_tags);
      let nextTags = currentTags;
      let nextIgnored = Boolean(row.ignored);
      if (input.action === 'ignore') nextIgnored = true;
      if (input.action === 'unignore') nextIgnored = false;
      if (input.action === 'add_tags') nextTags = [...new Set([...currentTags, ...(input.tags ?? [])])];
      if (input.action === 'remove_tags') nextTags = currentTags.filter((tag) => !(input.tags ?? []).includes(tag));
      if (input.action === 'clear_tags') nextTags = [];
      execute('UPDATE tracks SET ignored = ?, custom_tags = ? WHERE id = ?', nextIgnored ? 1 : 0, serializeTags(nextTags), row.id);
    }
  });

  return { updated: rows.length };
}

export async function resetLibraryData(): Promise<void> {
  transaction(() => {
    execute('DELETE FROM set_tracks');
    execute('DELETE FROM sets');
    execute('DELETE FROM scan_logs');
    execute('DELETE FROM scan_runs');
    execute('DELETE FROM tracks');
  });
}

export interface TrackSet {
  id: number;
  name: string;
  server_collection_id?: string | null;
  server_client_id?: string | null;
  server_client_collection_id?: string | null;
  server_revision?: number | null;
  server_updated_at?: Date | null;
  created_at: Date | null;
}

export interface SetSummary extends TrackSet {
  track_count: number;
  total_duration: number;
}

export interface SetDetail extends TrackSet {
  tracks: (Track & { position: number; client_entry_id: string | null })[];
}

function mapSet(row: Record<string, unknown>): TrackSet {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    server_collection_id: row.server_collection_id == null ? null : String(row.server_collection_id),
    server_client_id: row.server_client_id == null ? null : String(row.server_client_id),
    server_client_collection_id: row.server_client_collection_id == null ? null : String(row.server_client_collection_id),
    server_revision: row.server_revision == null ? null : Number(row.server_revision),
    server_updated_at: parseDate(row.server_updated_at),
    created_at: parseDate(row.created_at),
  };
}

function serializeSetForServer(set: SetDetail) {
  return {
    server_collection_id: set.server_collection_id ?? undefined,
    source_client_id: set.server_client_id ?? undefined,
    client_collection_id: set.server_client_collection_id ?? `set:${set.id}`,
    local_collection_id: set.id,
    name: set.name,
    created_at: set.created_at?.toISOString() ?? null,
    base_revision: set.server_revision ?? null,
    base_updated_at: set.server_updated_at?.toISOString() ?? null,
    tracks: set.tracks.map((track) => ({
      position: track.position,
      client_entry_id: track.client_entry_id ?? undefined,
      local_track_id: track.id,
      file_hash: track.file_hash ?? null,
      path: track.path ?? null,
      spotify_id: track.spotify_id ?? null,
    })),
  };
}

function updateLocalSetSyncMetadata(
  setId: number,
  patch: {
    server_collection_id?: string | null;
    server_client_id?: string | null;
    server_client_collection_id?: string | null;
    server_revision?: number | null;
    server_updated_at?: string | null;
  },
): void {
  execute(
    `UPDATE sets
     SET server_collection_id = COALESCE(?, server_collection_id),
         server_client_id = COALESCE(?, server_client_id),
         server_client_collection_id = COALESCE(?, server_client_collection_id),
         server_revision = COALESCE(?, server_revision),
         server_updated_at = COALESCE(?, server_updated_at)
     WHERE id = ?`,
    patch.server_collection_id ?? null,
    patch.server_client_id ?? null,
    patch.server_client_collection_id ?? null,
    patch.server_revision ?? null,
    patch.server_updated_at ?? null,
    setId,
  );
}

function applyRemoteCollectionToLocalSet(
  localSetId: number,
  summary: {
    id?: string | null;
    client_id?: string | null;
    client_collection_id?: string | null;
    name?: string | null;
    created_at?: string | null;
    revision?: number | null;
    updated_at?: string | null;
  },
  remoteTracks: Record<string, unknown>[],
  byFileHash: Map<string, number>,
  bySpotifyId: Map<string, number>,
  byPath: Map<string, number>,
): void {
  transaction(() => {
    execute(
      `UPDATE sets
       SET name = ?,
           server_collection_id = ?,
           server_client_id = ?,
           server_client_collection_id = ?,
           server_revision = ?,
           server_updated_at = ?,
           created_at = COALESCE(?, created_at)
       WHERE id = ?`,
      String(summary.name ?? ''),
      summary.id ?? null,
      summary.client_id ?? null,
      summary.client_collection_id ?? null,
      summary.revision ?? null,
      summary.updated_at ?? null,
      summary.created_at ?? null,
      localSetId,
    );
    execute('DELETE FROM set_tracks WHERE set_id = ?', localSetId);

    let position = 1;
    for (const track of remoteTracks) {
      const localTrackId = matchLocalTrackIdForServerTrack(track, byFileHash, bySpotifyId, byPath);
      if (!localTrackId) continue;
      execute(
        'INSERT INTO set_tracks (set_id, track_id, client_entry_id, position) VALUES (?, ?, ?, ?)',
        localSetId,
        localTrackId,
        String(track.client_entry_id ?? '').trim() || randomUUID(),
        position,
      );
      position += 1;
    }
  });
}

function buildLocalTrackIndexes() {
  const localTracks = queryAll<Record<string, unknown>>('SELECT id, file_hash, spotify_id, path FROM tracks');
  const byFileHash = new Map<string, number>();
  const bySpotifyId = new Map<string, number>();
  const byPath = new Map<string, number>();
  for (const row of localTracks) {
    const trackId = Number(row.id ?? 0);
    if (!trackId) continue;
    const fileHash = String(row.file_hash ?? '').trim();
    const spotifyId = String(row.spotify_id ?? '').trim();
    const pathKey = normalizePath(row.path);
    if (fileHash && !byFileHash.has(fileHash)) byFileHash.set(fileHash, trackId);
    if (spotifyId && !bySpotifyId.has(spotifyId)) bySpotifyId.set(spotifyId, trackId);
    if (pathKey && !byPath.has(pathKey)) byPath.set(pathKey, trackId);
  }
  return { byFileHash, bySpotifyId, byPath };
}

async function syncSingleSetFromServer(setId: number): Promise<SetDetail | null> {
  const set = await getSetById(setId);
  if (!set) return null;

  let collections: Awaited<ReturnType<typeof listCollectionsFromServer>>;
  try {
    collections = await listCollectionsFromServer();
  } catch {
    return set;
  }
  const remote = collections.find((collection) => (
    (set.server_collection_id && collection.id === set.server_collection_id)
    || (
      set.server_client_id
      && set.server_client_collection_id
      && collection.client_id === set.server_client_id
      && collection.client_collection_id === set.server_client_collection_id
    )
  ));
  if (!remote) return set;

  let remoteTracks: Awaited<ReturnType<typeof getCollectionTracksFromServer>>;
  try {
    remoteTracks = await getCollectionTracksFromServer(remote.id);
  } catch {
    return set;
  }
  const { byFileHash, bySpotifyId, byPath } = buildLocalTrackIndexes();
  applyRemoteCollectionToLocalSet(setId, remote, remoteTracks, byFileHash, bySpotifyId, byPath);
  return getSetById(setId);
}

async function syncSetToServer(setId: number): Promise<void> {
  const set = await getSetById(setId);
  if (!set) return;
  const result = await syncCollectionSnapshot(serializeSetForServer(set));
  if (!result.ok) return;
  const collection = result.collection;
  if (!collection) return;
  updateLocalSetSyncMetadata(setId, {
    server_collection_id: collection.id ?? null,
    server_client_id: collection.client_id ?? null,
    server_client_collection_id: collection.client_collection_id ?? null,
    server_revision: collection.revision ?? null,
    server_updated_at: collection.updated_at ?? null,
  });
}

async function mutateSetWithRebase(
  setId: number,
  applyMutation: () => void,
): Promise<void> {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await syncSingleSetFromServer(setId);
    applyMutation();
    try {
      await syncSetToServer(setId);
      return;
    } catch (error) {
      if (!(error instanceof CollectionSyncConflictError) || attempt === maxAttempts) throw error;
    }
  }
}

export async function getAllSets(): Promise<SetSummary[]> {
  return queryAll<Record<string, unknown>>(
    `SELECT s.id, s.name, s.server_collection_id, s.server_client_id, s.server_client_collection_id,
            s.server_revision, s.server_updated_at, s.created_at,
            COUNT(st.id) AS track_count,
            COALESCE(SUM(t.duration), 0) AS total_duration
     FROM sets s
     LEFT JOIN set_tracks st ON st.set_id = s.id
     LEFT JOIN tracks t ON t.id = st.track_id
     GROUP BY s.id
      ORDER BY datetime(s.created_at) DESC`,
  ).map((row) => ({
    ...mapSet(row),
    track_count: Number(row.track_count ?? 0),
    total_duration: Number(row.total_duration ?? 0),
  }));
}

export async function createSet(name: string): Promise<TrackSet> {
  await syncSetsFromServer().catch(() => ({ collections: 0, imported: 0, updated: 0, matched_tracks: 0 }));
  const normalizedName = name.trim();
  const existing = queryOne<Record<string, unknown>>(
    'SELECT * FROM sets WHERE lower(trim(name)) = lower(trim(?)) LIMIT 1',
    normalizedName,
  );
  if (existing) {
    throw new Error('A playlist with this name already exists.');
  }
  execute('INSERT INTO sets (name) VALUES (?)', normalizedName);
  const row = queryOne<Record<string, unknown>>('SELECT * FROM sets WHERE id = last_insert_rowid()');
  const set = mapSet(row ?? {});
  await syncSetToServer(set.id);
  return set;
}

export async function deleteSet(id: number): Promise<void> {
  let existing = await syncSingleSetFromServer(id);
  if (!existing) existing = await getSetById(id);
  if (!existing) return;
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await syncCollectionDeletion({
        localCollectionId: existing.id,
      name: existing.name,
      createdAt: existing.created_at?.toISOString() ?? null,
      serverCollectionId: existing.server_collection_id ?? null,
      sourceClientId: existing.server_client_id ?? null,
      sourceClientCollectionId: existing.server_client_collection_id ?? null,
      baseRevision: existing.server_revision ?? null,
      baseUpdatedAt: existing.server_updated_at?.toISOString() ?? null,
    });
      break;
    } catch (error) {
      if (!(error instanceof CollectionSyncConflictError) || attempt === maxAttempts) throw error;
      const refreshed = await syncSingleSetFromServer(id);
      if (!refreshed) break;
      existing = refreshed;
    }
  }
  transaction(() => {
    execute('DELETE FROM set_tracks WHERE set_id = ?', id);
    execute('DELETE FROM sets WHERE id = ?', id);
  });
}

export async function getSetById(id: number): Promise<SetDetail | null> {
  const set = queryOne<Record<string, unknown>>('SELECT * FROM sets WHERE id = ?', id);
  if (!set) return null;
  const tracks = queryAll<Record<string, unknown>>(
    `SELECT t.*, st.position, st.client_entry_id
     FROM tracks t
     JOIN set_tracks st ON st.track_id = t.id
     WHERE st.set_id = ?
     ORDER BY st.position`,
    id,
  ).map((row) => ({
    ...mapTrack(row),
    position: Number(row.position ?? 0),
    client_entry_id: row.client_entry_id == null ? null : String(row.client_entry_id),
  }));
  return { ...mapSet(set), tracks };
}

export async function addTrackToSet(setId: number, trackId: number): Promise<void> {
  const setExists = queryOne<Record<string, unknown>>('SELECT id FROM sets WHERE id = ? LIMIT 1', setId);
  if (!setExists) throw new Error('Playlist not found.');
  const trackExists = queryOne<Record<string, unknown>>('SELECT id FROM tracks WHERE id = ? LIMIT 1', trackId);
  if (!trackExists) throw new Error('Track not found.');
  await mutateSetWithRebase(setId, () => {
    const countRow = queryOne<Record<string, unknown>>('SELECT COUNT(*) AS count FROM set_tracks WHERE set_id = ?', setId);
    const position = Number(countRow?.count ?? 0) + 1;
    execute('INSERT INTO set_tracks (set_id, track_id, client_entry_id, position) VALUES (?, ?, ?, ?)', setId, trackId, randomUUID(), position);
  });
}

export async function removeTrackFromSet(setId: number, clientEntryId: string): Promise<void> {
  await mutateSetWithRebase(setId, () => {
    const row = queryOne<Record<string, unknown>>(
      'SELECT position FROM set_tracks WHERE set_id = ? AND client_entry_id = ? LIMIT 1',
      setId,
      clientEntryId,
    );
    if (!row) throw new Error('Playlist entry not found.');
    const position = Number(row.position ?? 0);
    transaction(() => {
      execute('DELETE FROM set_tracks WHERE set_id = ? AND client_entry_id = ?', setId, clientEntryId);
      execute('UPDATE set_tracks SET position = position - 1 WHERE set_id = ? AND position > ?', setId, position);
    });
  });
}

function normalizePath(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function matchLocalTrackIdForServerTrack(
  track: Record<string, unknown>,
  byFileHash: Map<string, number>,
  bySpotifyId: Map<string, number>,
  byPath: Map<string, number>,
): number | null {
  const fileHash = String(track.file_hash ?? '').trim();
  if (fileHash && byFileHash.has(fileHash)) return byFileHash.get(fileHash) ?? null;

  const spotifyId = String(track.spotify_id ?? '').trim();
  if (spotifyId && bySpotifyId.has(spotifyId)) return bySpotifyId.get(spotifyId) ?? null;

  const pathKey = normalizePath(track.path);
  if (pathKey && byPath.has(pathKey)) return byPath.get(pathKey) ?? null;

  return null;
}

export async function syncSetsFromServer(): Promise<{
  collections: number;
  imported: number;
  updated: number;
  matched_tracks: number;
}> {
  const collections = await listCollectionsFromServer();
  if (!collections.length) {
    return { collections: 0, imported: 0, updated: 0, matched_tracks: 0 };
  }

  const { byFileHash, bySpotifyId, byPath } = buildLocalTrackIndexes();

  let imported = 0;
  let updated = 0;
  let matchedTracks = 0;

  for (const collection of collections) {
    const remoteTracks = await getCollectionTracksFromServer(collection.id);
    let existed = false;
    transaction(() => {
      const existing = queryOne<Record<string, unknown>>(
        `SELECT *
         FROM sets
         WHERE server_collection_id = ?
            OR (
              server_client_id = ?
              AND server_client_collection_id = ?
            )
         LIMIT 1`,
        collection.id,
        collection.client_id,
        collection.client_collection_id,
      );

      let setId = Number(existing?.id ?? 0);
      existed = Boolean(setId);
      if (setId) {
        execute(
          `UPDATE sets
           SET name = ?,
               server_collection_id = ?,
               server_client_id = ?,
               server_client_collection_id = ?,
               server_revision = ?,
               server_updated_at = ?
           WHERE id = ?`,
          collection.name,
          collection.id,
          collection.client_id,
          collection.client_collection_id,
          collection.revision ?? null,
          collection.updated_at ?? collection.synced_at ?? null,
          setId,
        );
        execute('DELETE FROM set_tracks WHERE set_id = ?', setId);
      } else {
        execute(
          `INSERT INTO sets (name, server_collection_id, server_client_id, server_client_collection_id, server_revision, server_updated_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
          collection.name,
          collection.id,
          collection.client_id,
          collection.client_collection_id,
          collection.revision ?? null,
          collection.updated_at ?? collection.synced_at ?? null,
          collection.created_at ?? null,
        );
        const row = queryOne<Record<string, unknown>>('SELECT id FROM sets WHERE id = last_insert_rowid()');
        setId = Number(row?.id ?? 0);
      }

      let position = 1;
      for (const track of remoteTracks) {
        const localTrackId = matchLocalTrackIdForServerTrack(track, byFileHash, bySpotifyId, byPath);
        if (!localTrackId) continue;
        execute(
          'INSERT INTO set_tracks (set_id, track_id, client_entry_id, position) VALUES (?, ?, ?, ?)',
          setId,
          localTrackId,
          String(track.client_entry_id ?? '').trim() || randomUUID(),
          position,
        );
        position += 1;
        matchedTracks += 1;
      }
    });

    if (existed) updated += 1;
    else imported += 1;
  }

  return {
    collections: collections.length,
    imported,
    updated,
    matched_tracks: matchedTracks,
  };
}

export interface LibraryOverview {
  health: Record<string, number>;
  smart_crates: Array<{ id: string; label: string; count: number; query: string }>;
  duplicates: Array<{ type: string; key: string; tracks: ReturnType<typeof serializeTrack>[] }>;
  cover_review_queue: Array<{
    id: number;
    artist: string;
    title: string;
    album: string;
    album_art_review_status: string;
    album_art_review_notes: string;
    album_art_confidence: number;
    album_art_source: string;
    album_art_url: string;
  }>;
  artists: Array<{ name: string; canonical: string; track_count: number; album_count: number; albums: string[] }>;
  albums: Array<{ name: string; artist: string; canonical: string; track_count: number; with_art: number }>;
  tags: Array<{ tag: string; count: number }>;
}

export async function getLibraryOverview(): Promise<LibraryOverview> {
  const allTracks = (await getAllTracks()).map((track) => serializeTrack(track, { includeEmbeddedArtwork: false }));

  const health = {
    total: allTracks.length,
    ignored: allTracks.filter((track) => track.ignored).length,
    missing_bpm: allTracks.filter((track) => !track.effective_bpm).length,
    missing_key: allTracks.filter((track) => !track.effective_key).length,
    missing_album_art: allTracks.filter((track) => !track.album_art_url).length,
    embedded_album_art: allTracks.filter((track) => track.embedded_album_art).length,
    decode_failures: allTracks.filter((track) => String(track.decode_failed ?? '') === 'true').length,
    no_spotify_match: allTracks.filter((track) => !track.spotify_id).length,
    cover_review_queue: allTracks.filter((track) => ['needs_review', 'missing', 'conflict'].includes(String(track.album_art_review_status ?? ''))).length,
    tagged: allTracks.filter((track) => Array.isArray(track.custom_tags) && track.custom_tags.length > 0).length,
  };

  const smartCrates = [
    { id: 'missing-bpm', label: 'Missing BPM', count: health.missing_bpm, query: 'bpm:missing' },
    { id: 'missing-key', label: 'Missing Key', count: health.missing_key, query: 'key:missing' },
    { id: 'missing-art', label: 'Missing Album Art', count: health.missing_album_art, query: 'art:missing' },
    { id: 'cover-review', label: 'Cover Review Queue', count: health.cover_review_queue, query: 'art:review' },
    { id: 'decode-failures', label: 'Decode Failures', count: health.decode_failures, query: 'decode:failed' },
    { id: 'no-spotify', label: 'No Spotify Match', count: health.no_spotify_match, query: 'spotify:missing' },
    { id: 'ignored', label: 'Ignored', count: health.ignored, query: 'ignored:true' },
  ];

  const duplicateGroups = new Map<string, { type: string; key: string; tracks: typeof allTracks }>();
  const albumArtByGroup = new Map<string, Set<string>>();
  for (const track of allTracks) {
    const signature = `${track.artist_canonical}|${canonicalizeText(String(track.title ?? ''))}|${Math.round(Number(track.duration ?? 0))}`;
    const keys = [
      track.file_hash ? ['file_hash', String(track.file_hash)] : null,
      track.spotify_id ? ['spotify_id', String(track.spotify_id)] : null,
      signature.includes('||0') ? null : ['signature', signature],
    ].filter(Boolean) as Array<[string, string]>;
    for (const [type, key] of keys) {
      const groupKey = `${type}:${key}`;
      const group = duplicateGroups.get(groupKey) ?? { type, key, tracks: [] };
      group.tracks.push(track);
      duplicateGroups.set(groupKey, group);
    }
    if (track.album_group_key) {
      const artUrls = albumArtByGroup.get(String(track.album_group_key)) ?? new Set<string>();
      if (track.album_art_url) artUrls.add(String(track.album_art_url));
      albumArtByGroup.set(String(track.album_group_key), artUrls);
    }
  }

  const duplicates = [...duplicateGroups.values()]
    .filter((group) => group.tracks.length > 1)
    .sort((a, b) => b.tracks.length - a.tracks.length)
    .slice(0, 20);

  const coverReviewQueue = allTracks
    .map((track) => {
      const conflict = track.album_group_key ? (albumArtByGroup.get(String(track.album_group_key))?.size ?? 0) > 1 : false;
      const status = conflict ? 'conflict' : String(track.album_art_review_status ?? (track.album_art_url ? 'approved' : 'missing'));
      const notes = conflict
        ? 'album cluster has conflicting cover artwork'
        : String(track.album_art_review_notes ?? (track.album_art_url ? '' : 'no cover artwork attached'));
      return {
        id: Number(track.id),
        artist: String(track.artist ?? 'Unknown Artist'),
        title: String(track.title ?? 'Untitled'),
        album: String(track.album ?? track.spotify_album_name ?? ''),
        album_art_review_status: status,
        album_art_review_notes: notes,
        album_art_confidence: Number(track.album_art_confidence ?? 0),
        album_art_source: String(track.album_art_source ?? ''),
        album_art_url: String(track.album_art_url ?? ''),
      };
    })
    .filter((track) => ['needs_review', 'missing', 'conflict'].includes(track.album_art_review_status))
    .sort((a, b) => a.album_art_confidence - b.album_art_confidence || a.artist.localeCompare(b.artist))
    .slice(0, 50);

  const artistMap = new Map<string, { name: string; canonical: string; track_count: number; albums: Set<string> }>();
  const albumMap = new Map<string, { name: string; artist: string; canonical: string; track_count: number; with_art: number }>();
  const tagMap = new Map<string, number>();

  for (const track of allTracks) {
    const artistName = String(track.artist ?? 'Unknown Artist');
    const artistCanonical = String(track.artist_canonical ?? canonicalizeArtistName(track.artist));
    const artistEntry = artistMap.get(artistCanonical) ?? { name: artistName, canonical: artistCanonical, track_count: 0, albums: new Set<string>() };
    artistEntry.track_count += 1;
    const albumName = String(track.album ?? track.spotify_album_name ?? '').trim();
    if (albumName) artistEntry.albums.add(albumName);
    artistMap.set(artistCanonical, artistEntry);

    if (albumName) {
      const albumKey = `${artistCanonical}:${canonicalizeAlbumName(albumName)}`;
      const albumEntry = albumMap.get(albumKey) ?? {
        name: albumName,
        artist: artistName,
        canonical: canonicalizeAlbumName(albumName),
        track_count: 0,
        with_art: 0,
      };
      albumEntry.track_count += 1;
      if (track.album_art_url) albumEntry.with_art += 1;
      albumMap.set(albumKey, albumEntry);
    }

    for (const tag of (track.custom_tags as string[]) ?? []) {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    }
  }

  return {
    health,
    smart_crates: smartCrates,
    duplicates,
    cover_review_queue: coverReviewQueue,
    artists: [...artistMap.values()]
      .map((artist) => ({
        name: artist.name,
        canonical: artist.canonical,
        track_count: artist.track_count,
        album_count: artist.albums.size,
        albums: [...artist.albums].sort((a, b) => a.localeCompare(b)).slice(0, 6),
      }))
      .sort((a, b) => b.track_count - a.track_count)
      .slice(0, 50),
    albums: [...albumMap.values()]
      .sort((a, b) => b.track_count - a.track_count)
      .slice(0, 50),
    tags: [...tagMap.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count),
  };
}
