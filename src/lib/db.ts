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
let trackManagementSchemaEnsured = false;

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

async function ensureTrackManagementSchema(): Promise<void> {
  if (trackManagementSchemaEnsured) return;
  const sql = getDb();
  await sql`
    ALTER TABLE tracks
    ADD COLUMN IF NOT EXISTS bitrate DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS ignored BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS custom_tags TEXT,
    ADD COLUMN IF NOT EXISTS artist_canonical TEXT,
    ADD COLUMN IF NOT EXISTS album_canonical TEXT,
    ADD COLUMN IF NOT EXISTS manual_cues JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS album_art_source TEXT,
    ADD COLUMN IF NOT EXISTS album_art_confidence DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS album_art_review_status TEXT,
    ADD COLUMN IF NOT EXISTS album_art_review_notes TEXT,
    ADD COLUMN IF NOT EXISTS album_group_key TEXT,
    ADD COLUMN IF NOT EXISTS embedded_album_art BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS album_art_match_debug TEXT
  `;
  trackManagementSchemaEnsured = true;
}

function canonicalizeText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/\b(feat|ft|featuring|with|vs|x)\b.*$/i, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim();
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
    bitrate: track.bitrate,
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
    album_art_source: track.album_art_source,
    album_art_confidence: track.album_art_confidence,
    album_art_review_status: track.album_art_review_status,
    album_art_review_notes: track.album_art_review_notes,
    album_group_key: track.album_group_key,
    embedded_album_art: Boolean(track.embedded_album_art),
    album_art_match_debug: track.album_art_match_debug,
    spotify_album_name: track.spotify_album_name,
    spotify_match_score: track.spotify_match_score,
    spotify_high_confidence: (track.spotify_high_confidence ?? '').toLowerCase() === 'true',
    album_art_debug: {
      album_art_url: track.album_art_url ?? '',
      spotify_id: track.spotify_id ?? '',
      spotify_album_name: track.spotify_album_name ?? '',
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
    bpm_source: track.bpm_source,
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
  await ensureTrackManagementSchema();
  const sql = getDb();
  const rows = await sql<Track[]>`SELECT * FROM tracks ORDER BY artist, title, id`;
  return uniqueTracks(rows);
}

export async function getTrackById(id: number): Promise<Track | null> {
  await ensureTrackManagementSchema();
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
  await ensureTrackManagementSchema();
  const sql = getDb();
  const { query, bpmMin, bpmMax, key } = params;
  const likeQuery = query ? `%${query}%` : null;
  const normKey = key ? key.trim().toUpperCase() : null;

  const rows = await sql<Track[]>`
    SELECT * FROM tracks
    WHERE 1=1
    ${likeQuery != null ? sql`AND (title ILIKE ${likeQuery} OR artist ILIKE ${likeQuery} OR album ILIKE ${likeQuery} OR spotify_album_name ILIKE ${likeQuery} OR COALESCE(custom_tags, '') ILIKE ${likeQuery})` : sql``}
    ${bpmMin != null ? sql`AND COALESCE(bpm, spotify_tempo) >= ${bpmMin}` : sql``}
    ${bpmMax != null ? sql`AND COALESCE(bpm, spotify_tempo) <= ${bpmMax}` : sql``}
    ${normKey != null ? sql`AND (UPPER(key) = ${normKey} OR UPPER(spotify_key) = ${normKey} OR UPPER(key_numeric) = ${normKey})` : sql``}
    ORDER BY artist, title, id
  `;
  return uniqueTracks(rows);
}

export async function updateTrackBpm(id: number, bpm: number): Promise<void> {
  await ensureTrackManagementSchema();
  const sql = getDb();
  await sql`UPDATE tracks SET bpm = ${bpm}, bpm_source = 'manual' WHERE id = ${id}`;
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
  await ensureTrackManagementSchema();
  const sql = getDb();
  const title = patch.title ?? null;
  const artist = patch.artist ?? null;
  const album = patch.album ?? null;
  const customTags = patch.custom_tags ? serializeTags(patch.custom_tags) : null;
  await sql`
    UPDATE tracks
    SET
      title = COALESCE(${title}, title),
      artist = COALESCE(${artist}, artist),
      album = COALESCE(${album}, album),
      key = COALESCE(${patch.key ?? null}, key),
      ignored = COALESCE(${patch.ignored ?? null}, ignored),
      custom_tags = COALESCE(${customTags}, custom_tags),
      album_art_review_status = COALESCE(${patch.album_art_review_status ?? null}, album_art_review_status),
      album_art_review_notes = COALESCE(${patch.album_art_review_notes ?? null}, album_art_review_notes),
      artist_canonical = COALESCE(${artist != null ? canonicalizeArtistName(artist) : null}, artist_canonical, ${canonicalizeArtistName(artist)}),
      album_canonical = COALESCE(${album != null ? canonicalizeAlbumName(album) : null}, album_canonical, ${canonicalizeAlbumName(album)}),
      manual_cues = COALESCE(${patch.manual_cues ? sql.json(patch.manual_cues as never) : null}, manual_cues)
    WHERE id = ${id}
  `;
}

export async function bulkTrackAction(input: {
  ids: number[];
  action: 'ignore' | 'unignore' | 'add_tags' | 'remove_tags' | 'clear_tags' | 'add_to_set';
  tags?: string[];
  setId?: number;
}): Promise<{ updated: number }> {
  await ensureTrackManagementSchema();
  const sql = getDb();
  const ids = [...new Set(input.ids.filter((id) => Number.isFinite(id)))];
  if (!ids.length) return { updated: 0 };

  if (input.action === 'add_to_set') {
    if (!input.setId) return { updated: 0 };
    for (const id of ids) {
      await addTrackToSet(input.setId, id);
    }
    return { updated: ids.length };
  }

  const rows = await sql<Track[]>`SELECT * FROM tracks WHERE id = ANY(${sql.array(ids)})`;
  for (const row of rows) {
    const currentTags = parseTags(row.custom_tags);
    let nextTags = currentTags;
    let nextIgnored = Boolean(row.ignored);
    if (input.action === 'ignore') nextIgnored = true;
    if (input.action === 'unignore') nextIgnored = false;
    if (input.action === 'add_tags') nextTags = [...new Set([...currentTags, ...(input.tags ?? [])])];
    if (input.action === 'remove_tags') nextTags = currentTags.filter((tag) => !(input.tags ?? []).includes(tag));
    if (input.action === 'clear_tags') nextTags = [];
    await sql`
      UPDATE tracks
      SET ignored = ${nextIgnored}, custom_tags = ${serializeTags(nextTags)}
      WHERE id = ${row.id}
    `;
  }

  return { updated: rows.length };
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
  const allTracks = (await getAllTracks()).map((track) => serializeTrack(track));

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
