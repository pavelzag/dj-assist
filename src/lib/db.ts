import postgres from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var _pgConn: postgres.Sql | undefined;
}

function getDb(): postgres.Sql {
  if (!global._pgConn) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is not set');
    global._pgConn = postgres(url, { max: 10 });
  }
  return global._pgConn;
}

let scanSchemaEnsured = false;

export async function ensureScanSchema(): Promise<void> {
  if (scanSchemaEnsured) return;
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS scan_runs (
      id TEXT PRIMARY KEY,
      directory TEXT NOT NULL,
      status TEXT NOT NULL,
      rescan_mode TEXT NOT NULL,
      fetch_album_art BOOLEAN NOT NULL DEFAULT TRUE,
      verbose_enabled BOOLEAN NOT NULL DEFAULT FALSE,
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
      validation JSONB NOT NULL DEFAULT '{}'::jsonb,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS scan_logs (
      id BIGSERIAL PRIMARY KEY,
      scan_run_id TEXT NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'log',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  scanSchemaEnsured = true;
}

export interface Track {
  id: number;
  path: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  duration: number | null;
  bpm: number | null;
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

export async function createScanRun(input: {
  id: string;
  directory: string;
  rescanMode: string;
  fetchAlbumArt: boolean;
  verbose: boolean;
  validation: Record<string, unknown>;
}): Promise<void> {
  await ensureScanSchema();
  const sql = getDb();
  await sql`
    INSERT INTO scan_runs (
      id, directory, status, rescan_mode, fetch_album_art, verbose_enabled, validation
    ) VALUES (
      ${input.id},
      ${input.directory},
      'queued',
      ${input.rescanMode},
      ${input.fetchAlbumArt},
      ${input.verbose},
      ${sql.json(input.validation as never)}
    )
  `;
}

export async function updateScanRun(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await ensureScanSchema();
  const sql = getDb();
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  const values: unknown[] = [];
  const assignments = entries.map(([key, value], index) => {
    const escapedKey = key.replace(/[^a-z0-9_]/gi, '');
    values.push(key === 'validation' || key === 'summary' ? JSON.stringify(value) : value);
    return `${escapedKey} = $${index + 1}${key === 'validation' || key === 'summary' ? '::jsonb' : ''}`;
  });
  values.push(id);
  await sql.unsafe(
    `UPDATE scan_runs SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`,
    values as never[],
  );
}

export async function finalizeScanRun(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await updateScanRun(id, patch);
  const sql = getDb();
  await sql`
    UPDATE scan_runs
    SET finished_at = COALESCE(finished_at, NOW()), updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function addScanLog(input: {
  scanRunId: string;
  level: string;
  message: string;
  eventType?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await ensureScanSchema();
  const sql = getDb();
  await sql`
    INSERT INTO scan_logs (scan_run_id, level, message, event_type, payload)
    VALUES (
      ${input.scanRunId},
      ${input.level},
      ${input.message},
      ${input.eventType ?? 'log'},
      ${sql.json((input.payload ?? {}) as never)}
    )
  `;
}

export async function listScanRuns(limit = 20): Promise<ScanRun[]> {
  await ensureScanSchema();
  const sql = getDb();
  return sql<ScanRun[]>`
    SELECT * FROM scan_runs
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function getScanRunById(id: string): Promise<ScanRun | null> {
  await ensureScanSchema();
  const sql = getDb();
  const rows = await sql<ScanRun[]>`SELECT * FROM scan_runs WHERE id = ${id}`;
  return rows[0] ?? null;
}

export async function getScanLogs(scanRunId: string, limit = 200): Promise<ScanLog[]> {
  await ensureScanSchema();
  const sql = getDb();
  return sql<ScanLog[]>`
    SELECT * FROM scan_logs
    WHERE scan_run_id = ${scanRunId}
    ORDER BY id DESC
    LIMIT ${limit}
  `;
}

export function serializeTrack(track: Track) {
  const effectiveBpm = track.bpm ?? track.spotify_tempo ?? null;
  const effectiveKey = track.key || track.spotify_key || track.key_numeric || '';
  return {
    id: track.id,
    path: track.path,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    bpm: track.bpm,
    key: track.key,
    key_numeric: track.key_numeric,
    spotify_id: track.spotify_id,
    spotify_uri: track.spotify_uri,
    spotify_url: track.spotify_url,
    spotify_preview_url: track.spotify_preview_url,
    spotify_tempo: track.spotify_tempo,
    spotify_key: track.spotify_key,
    spotify_mode: track.spotify_mode,
    album_art_url: track.album_art_url,
    spotify_album_name: track.spotify_album_name,
    spotify_match_score: track.spotify_match_score,
    spotify_high_confidence: (track.spotify_high_confidence ?? '').toLowerCase() === 'true',
    album_art_debug: {
      album_art_url: track.album_art_url ?? '',
      spotify_id: track.spotify_id ?? '',
      spotify_album_name: track.spotify_album_name ?? '',
      spotify_match_score: track.spotify_match_score ?? 0,
      spotify_high_confidence: (track.spotify_high_confidence ?? '').toLowerCase() === 'true',
      has_album_art: Boolean(track.album_art_url),
    },
    youtube_url: track.youtube_url,
    bpm_source: track.bpm_source,
    analysis_status: track.analysis_status,
    analysis_error: track.analysis_error,
    decode_failed: track.decode_failed,
    analysis_stage: track.analysis_stage,
    analysis_debug: track.analysis_debug,
    effective_bpm: effectiveBpm,
    effective_key: effectiveKey,
  };
}

function trackIdentity(track: Track): string {
  return (
    track.spotify_id ||
    track.file_hash ||
    `${track.artist ?? ''}|${track.title ?? ''}|${Math.round(track.duration ?? 0)}`
  );
}

function uniqueTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((t) => {
    const key = trackIdentity(t);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function getAllTracks(): Promise<Track[]> {
  const sql = getDb();
  const rows = await sql<Track[]>`SELECT * FROM tracks ORDER BY artist, title, id`;
  return uniqueTracks(rows);
}

export async function getTrackById(id: number): Promise<Track | null> {
  const sql = getDb();
  const rows = await sql<Track[]>`SELECT * FROM tracks WHERE id = ${id}`;
  return rows[0] ?? null;
}

export interface SearchParams {
  query?: string | null;
  bpmMin?: number | null;
  bpmMax?: number | null;
  key?: string | null;
}

export async function searchTracks(params: SearchParams): Promise<Track[]> {
  const sql = getDb();
  const { query, bpmMin, bpmMax, key } = params;
  const likeQuery = query ? `%${query}%` : null;
  const normKey = key ? key.trim().toUpperCase() : null;

  const rows = await sql<Track[]>`
    SELECT * FROM tracks
    WHERE 1=1
    ${likeQuery != null ? sql`AND (title ILIKE ${likeQuery} OR artist ILIKE ${likeQuery})` : sql``}
    ${bpmMin != null ? sql`AND COALESCE(bpm, spotify_tempo) >= ${bpmMin}` : sql``}
    ${bpmMax != null ? sql`AND COALESCE(bpm, spotify_tempo) <= ${bpmMax}` : sql``}
    ${normKey != null ? sql`AND (UPPER(key) = ${normKey} OR UPPER(spotify_key) = ${normKey} OR UPPER(key_numeric) = ${normKey})` : sql``}
    ORDER BY artist, title, id
  `;
  return uniqueTracks(rows);
}

export async function updateTrackBpm(id: number, bpm: number): Promise<void> {
  const sql = getDb();
  await sql`UPDATE tracks SET bpm = ${bpm}, bpm_source = 'manual' WHERE id = ${id}`;
}

// ── Sets ─────────────────────────────────────────────────────────────────────

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

export async function getAllSets(): Promise<SetSummary[]> {
  const sql = getDb();
  return sql<SetSummary[]>`
    SELECT s.id, s.name, s.created_at,
      COUNT(st.id)::int AS track_count,
      COALESCE(SUM(t.duration), 0)::float AS total_duration
    FROM sets s
    LEFT JOIN set_tracks st ON st.set_id = s.id
    LEFT JOIN tracks t ON t.id = st.track_id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `;
}

export async function createSet(name: string): Promise<TrackSet> {
  const sql = getDb();
  const rows = await sql<TrackSet[]>`INSERT INTO sets (name) VALUES (${name}) RETURNING *`;
  return rows[0];
}

export async function deleteSet(id: number): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM set_tracks WHERE set_id = ${id}`;
  await sql`DELETE FROM sets WHERE id = ${id}`;
}

export async function getSetById(id: number): Promise<SetDetail | null> {
  const sql = getDb();
  const sets = await sql<TrackSet[]>`SELECT * FROM sets WHERE id = ${id}`;
  if (!sets[0]) return null;
  const tracks = await sql<(Track & { position: number })[]>`
    SELECT t.*, st.position
    FROM tracks t
    JOIN set_tracks st ON st.track_id = t.id
    WHERE st.set_id = ${id}
    ORDER BY st.position
  `;
  return { ...sets[0], tracks };
}

export async function addTrackToSet(setId: number, trackId: number): Promise<void> {
  const sql = getDb();
  const [row] = await sql<[{ count: string }]>`
    SELECT COUNT(*)::text AS count FROM set_tracks WHERE set_id = ${setId}
  `;
  const position = parseInt(row.count, 10) + 1;
  await sql`INSERT INTO set_tracks (set_id, track_id, position) VALUES (${setId}, ${trackId}, ${position})`;
}

export async function removeTrackFromSet(setId: number, position: number): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM set_tracks WHERE set_id = ${setId} AND position = ${position}`;
  await sql`UPDATE set_tracks SET position = position - 1 WHERE set_id = ${setId} AND position > ${position}`;
}
