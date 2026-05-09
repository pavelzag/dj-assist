import { logServerEvent } from '@/lib/app-log';

export type GoogleDriveAudioFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  size: string | null;
  parents: string[];
  md5Checksum: string | null;
};

const GOOGLE_DRIVE_AUDIO_EXTENSIONS = [
  '.mp3',
  '.flac',
  '.wav',
  '.ogg',
  '.m4a',
  '.aac',
  '.aiff',
  '.aif',
  '.opus',
  '.wma',
  '.alac',
  '.mp4',
  '.m4b',
  '.ape',
  '.mpga',
];
const GOOGLE_DRIVE_PLAYLIST_EXTENSIONS = [
  '.m3u',
  '.m3u8',
  '.pls',
  '.cue',
];
const GOOGLE_DRIVE_PLAYLIST_MIME_FRAGMENTS = [
  'audio/x-mpegurl',
  'audio/mpegurl',
  'application/x-mpegurl',
  'application/vnd.apple.mpegurl',
  'application/mpegurl',
  'audio/x-scpls',
  'application/pls+xml',
];
const GOOGLE_DRIVE_FOLDER_SCAN_CONCURRENCY = 8;

function escapeDriveQueryValue(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

export function isIgnoredGoogleDriveAudioFileName(name: string): boolean {
  const normalized = String(name ?? '').trim();
  const lower = normalized.toLowerCase();
  return (
    normalized.startsWith('._')
    || lower === '.ds_store'
    || lower === 'thumbs.db'
    || lower === 'desktop.ini'
    || (normalized.startsWith('.') && !hasKnownAudioExtension(normalized))
  );
}

function hasKnownAudioExtension(name: string): boolean {
  const normalized = String(name ?? '').trim().toLowerCase();
  return GOOGLE_DRIVE_AUDIO_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

function hasKnownPlaylistExtension(name: string): boolean {
  const normalized = String(name ?? '').trim().toLowerCase();
  return GOOGLE_DRIVE_PLAYLIST_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

function isLikelyGoogleDriveAudioFile(file: Pick<GoogleDriveAudioFile, 'name' | 'mimeType'>): boolean {
  if (hasKnownPlaylistExtension(file.name)) {
    return false;
  }
  const mimeType = String(file.mimeType ?? '').trim().toLowerCase();
  if (GOOGLE_DRIVE_PLAYLIST_MIME_FRAGMENTS.some((fragment) => mimeType.includes(fragment))) {
    return false;
  }
  if (!mimeType || mimeType === 'application/octet-stream' || mimeType === 'binary/octet-stream') {
    return hasKnownAudioExtension(file.name);
  }
  if (mimeType === 'video/mp4' || mimeType === 'application/mp4') {
    return hasKnownAudioExtension(file.name);
  }
  return mimeType.includes('audio/') || hasKnownAudioExtension(file.name);
}

// Collect all descendant folder IDs for a given root folder (BFS). When a cap
// is provided, stop adding new folders once it is reached.
export async function collectFolderTree(input: {
  accessToken: string;
  rootFolderId: string;
  maxFolders?: number;
}): Promise<string[]> {
  const maxFolders = Number.isFinite(input.maxFolders) && Number(input.maxFolders) > 0
    ? Math.trunc(Number(input.maxFolders))
    : null;
  const all = new Set<string>([input.rootFolderId]);
  let frontier = [input.rootFolderId];
  let depth = 0;

  await logServerEvent({
    category: 'google-drive-files',
    level: 'info',
    message: `[google-drive-files] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'folder_tree_started',
      rootFolderId: input.rootFolderId,
      maxFolders,
      initialFrontier: frontier.length,
      totalFolders: all.size,
    })}`,
  });

  while (frontier.length > 0 && (maxFolders == null || all.size < maxFolders)) {
    const nextFrontier: string[] = [];
    const frontierSize = frontier.length;
    const foldersBeforeDepth = all.size;
    const depthStartedAt = Date.now();

    await logServerEvent({
      category: 'google-drive-files',
      level: 'info',
      message: `[google-drive-files] ${JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'folder_tree_depth_started',
        rootFolderId: input.rootFolderId,
        depth,
        frontierSize,
        totalFoldersBeforeDepth: foldersBeforeDepth,
        maxFolders,
      })}`,
    });

    for (let i = 0; i < frontier.length; i += GOOGLE_DRIVE_FOLDER_SCAN_CONCURRENCY) {
      if (maxFolders != null && all.size >= maxFolders) break;
      const batch = frontier.slice(i, i + GOOGLE_DRIVE_FOLDER_SCAN_CONCURRENCY);
      const batchChildren = await Promise.all(
        batch.map((parentId) => fetchDirectSubfolderIds(parentId, input.accessToken)),
      );

      for (const children of batchChildren) {
        if (maxFolders != null && all.size >= maxFolders) break;
        for (const childId of children) {
          if (maxFolders != null && all.size >= maxFolders) break;
          if (!all.has(childId)) {
            all.add(childId);
            nextFrontier.push(childId);
          }
        }
      }
    }

    await logServerEvent({
      category: 'google-drive-files',
      level: 'info',
      message: `[google-drive-files] ${JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'folder_tree_depth_completed',
        rootFolderId: input.rootFolderId,
        depth,
        frontierSize,
        discoveredThisDepth: nextFrontier.length,
        totalFoldersAfterDepth: all.size,
        elapsedMs: Date.now() - depthStartedAt,
        hitCap: maxFolders != null && all.size >= maxFolders,
      })}`,
    });

    frontier = nextFrontier;
    depth += 1;
  }

  await logServerEvent({
    category: 'google-drive-files',
    level: 'info',
    message: `[google-drive-files] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'folder_tree_completed',
      rootFolderId: input.rootFolderId,
      depthReached: depth,
      totalFolders: all.size,
      remainingFrontier: frontier.length,
      stoppedBecause: frontier.length === 0
        ? 'frontier_exhausted'
        : (maxFolders != null && all.size >= maxFolders ? 'max_folders_reached' : 'loop_exit'),
      maxFolders,
    })}`,
  });

  return [...all];
}

async function fetchDirectSubfolderIds(parentId: string, accessToken: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set(
      'q',
      `trashed = false and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents`,
    );
    url.searchParams.set('fields', 'nextPageToken, files(id)');
    url.searchParams.set('pageSize', '200');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) break;
    const payload = await response.json() as Record<string, unknown>;
    if (Array.isArray(payload.files)) {
      for (const f of payload.files) {
        const id = String((f as Record<string, unknown>).id ?? '').trim();
        if (id) ids.push(id);
      }
    }
    pageToken = String(payload.nextPageToken ?? '').trim() || undefined;
  } while (pageToken);

  return ids;
}

// Build Drive API query clauses for a set of folder IDs.  If no IDs are given,
// falls back to searching all files across the entire Drive, with audio
// detection handled locally. Drive metadata is too inconsistent to rely on
// MIME type / filename filtering in the remote query.
function buildFolderQuery(folderIds: string[], search?: string): string {
  const clauses: string[] = ['trashed = false'];
  const searchTerm = String(search ?? '').trim();
  if (searchTerm) {
    clauses.push(`name contains '${escapeDriveQueryValue(searchTerm)}'`);
  }
  if (folderIds.length > 0) {
    const conditions = folderIds.map((id) => `'${escapeDriveQueryValue(id)}' in parents`).join(' or ');
    clauses.push(`(${conditions})`);
  }
  return clauses.join(' and ');
}

async function fetchAudioFilePage(input: {
  accessToken: string;
  query: string;
  pageSize: number;
  pageToken?: string;
}): Promise<{
  files: GoogleDriveAudioFile[];
  nextPageToken: string | null;
  rawCount: number;
  acceptedCount: number;
  sampleFiles: Array<{ name: string; mimeType: string }>;
}> {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', input.query);
  url.searchParams.set('fields', 'nextPageToken, files(id,name,mimeType,modifiedTime,size,parents,md5Checksum)');
  url.searchParams.set('orderBy', 'modifiedTime desc,name');
  url.searchParams.set('pageSize', String(input.pageSize));
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');
  if (input.pageToken) url.searchParams.set('pageToken', input.pageToken);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  if (!response.ok) {
    throw new Error(String((payload.error ?? raw) || 'Could not list Google Drive audio files.'));
  }

  const rawFiles = Array.isArray(payload.files)
    ? payload.files
        .filter((file): file is Record<string, unknown> => Boolean(file && typeof file === 'object'))
        .map((file): GoogleDriveAudioFile => ({
          id: String(file.id ?? '').trim(),
          name: String(file.name ?? '').trim() || 'Untitled',
          mimeType: String(file.mimeType ?? '').trim(),
          modifiedTime: String(file.modifiedTime ?? '').trim() || null,
          size: String(file.size ?? '').trim() || null,
          parents: Array.isArray(file.parents)
            ? file.parents.map((value) => String(value)).filter(Boolean)
            : [],
          md5Checksum: String(file.md5Checksum ?? '').trim() || null,
        }))
    : [];
  const files = rawFiles.filter((file) => file.id && !isIgnoredGoogleDriveAudioFileName(file.name) && isLikelyGoogleDriveAudioFile(file));

  return {
    files,
    nextPageToken: String(payload.nextPageToken ?? '').trim() || null,
    rawCount: rawFiles.length,
    acceptedCount: files.length,
    sampleFiles: rawFiles.slice(0, 5).map((file) => ({
      name: file.name,
      mimeType: file.mimeType,
    })),
  };
}

export async function listGoogleDriveAudioFiles(input: {
  accessToken: string;
  folderId?: string;
  // When provided, searches all listed folder IDs (supports recursive imports).
  allFolderIds?: string[];
  search?: string;
  limit: number;
  pageToken?: string;
}) {
  const limit = Math.min(Math.max(Math.trunc(input.limit || 100), 1), 5000);
  const pageSize = Math.min(limit, 200);
  const folderId = String(input.folderId ?? '').trim();
  const search = String(input.search ?? '').trim();

  // Determine which folder IDs to query across.
  const folderIds = input.allFolderIds ?? (folderId ? [folderId] : []);

  if (folderIds.length <= 1) {
    // Single query covering all folders (or the whole Drive).
    const query = buildFolderQuery(folderIds, search);
    return fetchAudioFilePage({
      accessToken: input.accessToken,
      query,
      pageSize,
      pageToken: input.pageToken,
    });
  }

  // For large recursive imports, query a small number of folders in parallel.
  // This stays much more reliable than one giant OR-query while avoiding the
  // extreme latency of a purely sequential walk.
  const collected: GoogleDriveAudioFile[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < folderIds.length && collected.length < limit; i += GOOGLE_DRIVE_FOLDER_SCAN_CONCURRENCY) {
    const batch = folderIds.slice(i, i + GOOGLE_DRIVE_FOLDER_SCAN_CONCURRENCY);
    const startedAt = Date.now();
    await logServerEvent({
      level: 'info',
      message: `[google-drive-files] ${JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'recursive_batch_started',
        batchIndex: Math.floor(i / GOOGLE_DRIVE_FOLDER_SCAN_CONCURRENCY) + 1,
        batchCount: Math.ceil(folderIds.length / GOOGLE_DRIVE_FOLDER_SCAN_CONCURRENCY),
        foldersInBatch: batch.length,
        foldersProcessed: i,
        foldersTotal: folderIds.length,
        filesCollected: collected.length,
        limit,
      })}`,
      category: 'google-drive-files',
      context: {
        event: 'recursive_batch_started',
        batchIndex: Math.floor(i / GOOGLE_DRIVE_FOLDER_SCAN_CONCURRENCY) + 1,
        batchCount: Math.ceil(folderIds.length / GOOGLE_DRIVE_FOLDER_SCAN_CONCURRENCY),
        foldersInBatch: batch.length,
        foldersProcessed: i,
        foldersTotal: folderIds.length,
        filesCollected: collected.length,
        limit,
      },
      alsoConsole: true,
    }).catch(() => {});
    const batchResults = await Promise.all(batch.map(async (singleFolderId) => {
      const files: GoogleDriveAudioFile[] = [];
      let rawCount = 0;
      let acceptedCount = 0;
      const sampleFiles: Array<{ name: string; mimeType: string }> = [];
      const query = buildFolderQuery([singleFolderId], search);
      let batchToken: string | undefined;
      do {
        const page = await fetchAudioFilePage({
          accessToken: input.accessToken,
          query,
          pageSize,
          pageToken: batchToken,
        });
        files.push(...page.files);
        rawCount += page.rawCount;
        acceptedCount += page.acceptedCount;
        if (sampleFiles.length < 5) {
          sampleFiles.push(...page.sampleFiles.slice(0, 5 - sampleFiles.length));
        }
        batchToken = page.nextPageToken ?? undefined;
      } while (batchToken);
      return { folderId: singleFolderId, files, rawCount, acceptedCount, sampleFiles };
    }));

    for (const result of batchResults) {
      if (result.rawCount > 0 || result.acceptedCount > 0) {
        await logServerEvent({
          level: 'info',
          message: `[google-drive-files] ${JSON.stringify({
            timestamp: new Date().toISOString(),
            event: 'recursive_folder_scanned',
            folderId: result.folderId,
            rawCount: result.rawCount,
            acceptedCount: result.acceptedCount,
            sampleFiles: result.sampleFiles,
          })}`,
          category: 'google-drive-files',
          context: {
            event: 'recursive_folder_scanned',
            folderId: result.folderId,
            rawCount: result.rawCount,
            acceptedCount: result.acceptedCount,
            sampleFiles: result.sampleFiles,
          },
          alsoConsole: true,
        }).catch(() => {});
      }
      for (const file of result.files) {
        if (seen.has(file.id)) continue;
        seen.add(file.id);
        collected.push(file);
        if (collected.length >= limit) break;
      }
      if (collected.length >= limit) break;
    }
    await logServerEvent({
      level: 'info',
      message: `[google-drive-files] ${JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'recursive_batch_completed',
        batchIndex: Math.floor(i / GOOGLE_DRIVE_FOLDER_SCAN_CONCURRENCY) + 1,
        batchCount: Math.ceil(folderIds.length / GOOGLE_DRIVE_FOLDER_SCAN_CONCURRENCY),
        foldersInBatch: batch.length,
        foldersProcessed: Math.min(i + batch.length, folderIds.length),
        foldersTotal: folderIds.length,
        filesCollected: collected.length,
        elapsedMs: Date.now() - startedAt,
        hitLimit: collected.length >= limit,
      })}`,
      category: 'google-drive-files',
      context: {
        event: 'recursive_batch_completed',
        batchIndex: Math.floor(i / GOOGLE_DRIVE_FOLDER_SCAN_CONCURRENCY) + 1,
        batchCount: Math.ceil(folderIds.length / GOOGLE_DRIVE_FOLDER_SCAN_CONCURRENCY),
        foldersInBatch: batch.length,
        foldersProcessed: Math.min(i + batch.length, folderIds.length),
        foldersTotal: folderIds.length,
        filesCollected: collected.length,
        elapsedMs: Date.now() - startedAt,
        hitLimit: collected.length >= limit,
      },
      alsoConsole: true,
    }).catch(() => {});
  }

  return { files: collected, nextPageToken: null };
}
