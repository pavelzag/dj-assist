export type GoogleDriveAudioFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  size: string | null;
  parents: string[];
  md5Checksum: string | null;
};

function escapeDriveQueryValue(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

export function isIgnoredGoogleDriveAudioFileName(name: string): boolean {
  const normalized = String(name ?? '').trim();
  return normalized.startsWith('._');
}

// Collect all descendant folder IDs for a given root folder (BFS, capped at
// maxFolders to avoid runaway API usage on very large trees).
export async function collectFolderTree(input: {
  accessToken: string;
  rootFolderId: string;
  maxFolders?: number;
}): Promise<string[]> {
  const maxFolders = input.maxFolders ?? 200;
  const all = new Set<string>([input.rootFolderId]);
  let frontier = [input.rootFolderId];

  while (frontier.length > 0 && all.size < maxFolders) {
    const nextFrontier: string[] = [];
    for (const parentId of frontier) {
      if (all.size >= maxFolders) break;
      const children = await fetchDirectSubfolderIds(parentId, input.accessToken);
      for (const childId of children) {
        if (!all.has(childId)) {
          all.add(childId);
          nextFrontier.push(childId);
        }
      }
    }
    frontier = nextFrontier;
  }

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
// falls back to searching all audio files across the entire Drive.
function buildFolderQuery(folderIds: string[], search?: string): string {
  const clauses: string[] = ["trashed = false", "mimeType contains 'audio/'"];
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
}): Promise<{ files: GoogleDriveAudioFile[]; nextPageToken: string | null }> {
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

  const files = Array.isArray(payload.files)
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
        .filter((file) => file.id && !isIgnoredGoogleDriveAudioFileName(file.name))
    : [];

  return {
    files,
    nextPageToken: String(payload.nextPageToken ?? '').trim() || null,
  };
}

// Batch size for folder-OR queries — keeps query strings well under URL limits.
const FOLDER_BATCH_SIZE = 50;

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

  if (folderIds.length <= FOLDER_BATCH_SIZE) {
    // Single query covering all folders (or the whole Drive).
    const query = buildFolderQuery(folderIds, search);
    return fetchAudioFilePage({
      accessToken: input.accessToken,
      query,
      pageSize,
      pageToken: input.pageToken,
    });
  }

  // More folders than fit in one query — batch them and merge results.
  // Pagination tokens are per-query so we can't resume mid-batch; collect
  // up to `limit` files across all batches instead.
  const collected: GoogleDriveAudioFile[] = [];
  for (let i = 0; i < folderIds.length && collected.length < limit; i += FOLDER_BATCH_SIZE) {
    const batch = folderIds.slice(i, i + FOLDER_BATCH_SIZE);
    const query = buildFolderQuery(batch, search);
    let batchToken: string | undefined;
    do {
      const page = await fetchAudioFilePage({
        accessToken: input.accessToken,
        query,
        pageSize: Math.min(pageSize, limit - collected.length),
        pageToken: batchToken,
      });
      collected.push(...page.files);
      batchToken = page.nextPageToken ?? undefined;
    } while (batchToken && collected.length < limit);
  }

  return { files: collected, nextPageToken: null };
}
