import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

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

function getDb(): DatabaseSync {
  if (!global._sqliteConn) {
    const dbPath = resolveSqlitePath();
    mkdirSync(dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON');
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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS set_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
      track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
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
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
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
  };
}

function trackIdentity(track: Track): string {
  return track.spotify_id || track.file_hash || `${track.artist ?? ''}|${track.title ?? ''}|${Math.round(track.duration ?? 0)}`;
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

export async function getTrackById(id: number): Promise<Track | null> {
  const row = queryOne<Record<string, unknown>>('SELECT * FROM tracks WHERE id = ?', id);
  return row ? mapTrack(row) : null;
}

export interface SearchParams {
  query?: string | null;
  bpmMin?: number | null;
  bpmMax?: number | null;
  key?: string | null;
}

export async function searchTracks(params: SearchParams): Promise<Track[]> {
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
  return uniqueTracks(rows);
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
    album_art_review_status?: string | null;
    album_art_review_notes?: string | null;
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
    album_art_review_status: patch.album_art_review_status !== undefined ? patch.album_art_review_status : current.album_art_review_status,
    album_art_review_notes: patch.album_art_review_notes !== undefined ? patch.album_art_review_notes : current.album_art_review_notes,
    artist_canonical: canonicalizeArtistName(artist),
    album_canonical: canonicalizeAlbumName(album),
    manual_cues: patch.manual_cues !== undefined ? JSON.stringify(patch.manual_cues) : JSON.stringify(current.manual_cues ?? []),
  };

  execute(
    `UPDATE tracks
     SET title = ?, artist = ?, album = ?, key = ?, ignored = ?, custom_tags = ?,
         album_art_review_status = ?, album_art_review_notes = ?, artist_canonical = ?,
         album_canonical = ?, manual_cues = ?
     WHERE id = ?`,
    values.title,
    values.artist,
    values.album,
    values.key,
    boolInt(Boolean(values.ignored)),
    values.custom_tags,
    values.album_art_review_status,
    values.album_art_review_notes,
    values.artist_canonical,
    values.album_canonical,
    values.manual_cues,
    id,
  );
}

export async function getTracksByIds(ids: number[]): Promise<Track[]> {
  const uniqueIds = [...new Set(ids.filter((id) => Number.isFinite(id)))];
  if (!uniqueIds.length) return [];
  const placeholders = uniqueIds.map(() => '?').join(', ');
  return queryAll<Record<string, unknown>>(`SELECT * FROM tracks WHERE id IN (${placeholders})`, ...uniqueIds).map(mapTrack);
}

export async function bulkTrackAction(input: {
  ids: number[];
  action: 'ignore' | 'unignore' | 'add_tags' | 'remove_tags' | 'clear_tags' | 'add_to_set' | 'delete';
  tags?: string[];
  setId?: number;
}): Promise<{ updated: number }> {
  const ids = [...new Set(input.ids.filter((id) => Number.isFinite(id)))];
  if (!ids.length) return { updated: 0 };

  if (input.action === 'add_to_set') {
    if (!input.setId) return { updated: 0 };
    for (const id of ids) await addTrackToSet(input.setId, id);
    return { updated: ids.length };
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
  created_at: Date | null;
}

export interface SetSummary extends TrackSet {
  track_count: number;
  total_duration: number;
}

export interface SetDetail extends TrackSet {
  tracks: (Track & { position: number })[];
}

function mapSet(row: Record<string, unknown>): TrackSet {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    created_at: parseDate(row.created_at),
  };
}

export async function getAllSets(): Promise<SetSummary[]> {
  return queryAll<Record<string, unknown>>(
    `SELECT s.id, s.name, s.created_at,
            COUNT(st.id) AS track_count,
            COALESCE(SUM(t.duration), 0) AS total_duration
     FROM sets s
     LEFT JOIN set_tracks st ON st.set_id = s.id
     LEFT JOIN tracks t ON t.id = st.track_id
     GROUP BY s.id
     ORDER BY datetime(s.created_at) DESC`,
  ).map((row) => ({
    id: Number(row.id),
    name: String(row.name ?? ''),
    created_at: parseDate(row.created_at),
    track_count: Number(row.track_count ?? 0),
    total_duration: Number(row.total_duration ?? 0),
  }));
}

export async function createSet(name: string): Promise<TrackSet> {
  execute('INSERT INTO sets (name) VALUES (?)', name);
  const row = queryOne<Record<string, unknown>>('SELECT * FROM sets WHERE id = last_insert_rowid()');
  return mapSet(row ?? {});
}

export async function deleteSet(id: number): Promise<void> {
  transaction(() => {
    execute('DELETE FROM set_tracks WHERE set_id = ?', id);
    execute('DELETE FROM sets WHERE id = ?', id);
  });
}

export async function getSetById(id: number): Promise<SetDetail | null> {
  const set = queryOne<Record<string, unknown>>('SELECT * FROM sets WHERE id = ?', id);
  if (!set) return null;
  const tracks = queryAll<Record<string, unknown>>(
    `SELECT t.*, st.position
     FROM tracks t
     JOIN set_tracks st ON st.track_id = t.id
     WHERE st.set_id = ?
     ORDER BY st.position`,
    id,
  ).map((row) => ({ ...mapTrack(row), position: Number(row.position ?? 0) }));
  return { ...mapSet(set), tracks };
}

export async function addTrackToSet(setId: number, trackId: number): Promise<void> {
  const countRow = queryOne<Record<string, unknown>>('SELECT COUNT(*) AS count FROM set_tracks WHERE set_id = ?', setId);
  const position = Number(countRow?.count ?? 0) + 1;
  execute('INSERT INTO set_tracks (set_id, track_id, position) VALUES (?, ?, ?)', setId, trackId, position);
}

export async function removeTrackFromSet(setId: number, position: number): Promise<void> {
  transaction(() => {
    execute('DELETE FROM set_tracks WHERE set_id = ? AND position = ?', setId, position);
    execute('UPDATE set_tracks SET position = position - 1 WHERE set_id = ? AND position > ?', setId, position);
  });
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
