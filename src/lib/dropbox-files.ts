import { logServerEvent } from '@/lib/app-log';
import { isLikelyAudioFile } from '@/lib/cloud-audio';

export type DropboxAudioFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  size: string | null;
  pathLower: string | null;
  pathDisplay: string | null;
  cursor?: string | null;
};

export type DropboxFolderEntry = {
  id: string;
  name: string;
  pathLower: string | null;
  pathDisplay: string | null;
};

function isFolderEntry(entry: Record<string, unknown>): boolean {
  return String(entry['.tag'] ?? '').trim() === 'folder';
}

function isFileEntry(entry: Record<string, unknown>): boolean {
  return String(entry['.tag'] ?? '').trim() === 'file';
}

function summarizeDropboxEntry(entry: Record<string, unknown>): Record<string, unknown> {
  return {
    tag: String(entry['.tag'] ?? '').trim() || null,
    id: String(entry.id ?? '').trim() || null,
    name: String(entry.name ?? '').trim() || null,
    mimeType: String(entry.mime_type ?? '').trim() || null,
    pathLower: String(entry.path_lower ?? '').trim() || null,
    size: entry.size == null ? null : String(entry.size),
  };
}

function logDropboxFilesEvent(event: string, context: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info') {
  void logServerEvent({
    level: level === 'warn' ? 'warning' : level,
    message: `[dropbox-files] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...context,
    })}`,
    category: 'dropbox-files',
    context: {
      event,
      ...context,
    },
    alsoConsole: level !== 'info',
  }).catch(() => {});
}

function summarizeDropboxEntries(entries: Array<Record<string, unknown>>) {
  const folders = entries.filter(isFolderEntry);
  const files = entries.filter(isFileEntry);
  const audioFiles = files.map(toAudioFile).filter((item): item is DropboxAudioFile => Boolean(item));
  const skippedFiles = files.filter((entry) => !toAudioFile(entry));
  return {
    entryCount: entries.length,
    folderCount: folders.length,
    fileCount: files.length,
    audioFileCount: audioFiles.length,
    skippedFileCount: skippedFiles.length,
    sampleEntries: entries.slice(0, 5).map(summarizeDropboxEntry),
    sampleAudioFiles: audioFiles.slice(0, 5).map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      pathLower: file.pathLower,
      modifiedTime: file.modifiedTime,
    })),
  };
}

function toAudioFile(entry: Record<string, unknown>): DropboxAudioFile | null {
  if (!isFileEntry(entry)) return null;
  const name = String(entry.name ?? '').trim();
  const mimeType = String(entry.mime_type ?? '').trim() || 'application/octet-stream';
  if (!name || !isLikelyAudioFile({ name, mimeType })) return null;
  return {
    id: String(entry.id ?? '').trim(),
    name,
    mimeType,
    modifiedTime: String(entry.server_modified ?? entry.client_modified ?? '').trim() || null,
    size: entry.size == null ? null : String(entry.size),
    pathLower: String(entry.path_lower ?? '').trim() || null,
    pathDisplay: String(entry.path_display ?? '').trim() || null,
  };
}

function toFolderEntry(entry: Record<string, unknown>): DropboxFolderEntry | null {
  if (!isFolderEntry(entry)) return null;
  const name = String(entry.name ?? '').trim();
  const id = String(entry.id ?? '').trim();
  if (!name || !id) return null;
  return {
    id,
    name,
    pathLower: String(entry.path_lower ?? '').trim() || null,
    pathDisplay: String(entry.path_display ?? '').trim() || null,
  };
}

async function dropboxApiPost<T>(accessToken: string, path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.dropboxapi.com/2/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  if (!response.ok) {
    const payload = JSON.parse(raw || '{}') as Record<string, unknown>;
    logDropboxFilesEvent('api_error', {
      path,
      status: response.status,
      error_summary: String(payload.error_summary ?? payload.error ?? raw ?? `Dropbox API ${path} failed.`),
    }, 'error');
    throw new Error(String(payload.error_summary ?? payload.error ?? raw ?? `Dropbox API ${path} failed.`));
  }
  return raw ? JSON.parse(raw) as T : {} as T;
}

async function listFolderPage(input: {
  accessToken: string;
  path?: string;
  cursor?: string;
  recursive?: boolean;
}): Promise<{
  entries: Array<Record<string, unknown>>;
  cursor: string | null;
  hasMore: boolean;
}> {
  logDropboxFilesEvent('list_folder_request', {
    path: String(input.path ?? '').trim() || '',
    cursor: input.cursor ?? null,
    recursive: Boolean(input.recursive),
  });
  if (input.cursor) {
    const payload = await dropboxApiPost<{
      entries: Array<Record<string, unknown>>;
      cursor: string;
      has_more: boolean;
    }>(input.accessToken, 'files/list_folder/continue', { cursor: input.cursor })
      .then((payload) => ({
        entries: Array.isArray(payload.entries) ? payload.entries : [],
        cursor: String(payload.cursor ?? '').trim() || null,
        hasMore: Boolean(payload.has_more),
      }));
    logDropboxFilesEvent('list_folder_page', {
      path: String(input.path ?? '').trim() || '',
      cursor: input.cursor ?? null,
      hasMore: payload.hasMore,
      ...summarizeDropboxEntries(payload.entries),
    });
    return payload;
  }
  const payload = await dropboxApiPost<{
    entries: Array<Record<string, unknown>>;
    cursor: string;
    has_more: boolean;
  }>(input.accessToken, 'files/list_folder', {
    path: String(input.path ?? '').trim() || '',
    recursive: Boolean(input.recursive),
    include_deleted: false,
    include_media_info: true,
    include_non_downloadable_files: false,
    limit: 200,
  });
  return {
    entries: Array.isArray(payload.entries) ? payload.entries : [],
    cursor: String(payload.cursor ?? '').trim() || null,
    hasMore: Boolean(payload.has_more),
  };
}

function folderPathForId(folderId: string | undefined): string {
  const id = String(folderId ?? '').trim();
  return id ? `id:${id}` : '';
}

export async function listDropboxFolderChildren(input: {
  accessToken: string;
  parentId?: string;
  search?: string;
  limit?: number;
}): Promise<{
  folders: DropboxFolderEntry[];
  files: DropboxAudioFile[];
  truncated: boolean;
}> {
  const search = String(input.search ?? '').trim().toLowerCase();
  logDropboxFilesEvent('list_children_start', {
    parentId: String(input.parentId ?? '').trim() || null,
    search: search || null,
    limit: Number.isFinite(Number(input.limit)) ? Math.trunc(Number(input.limit)) : null,
  });
  if (search) {
    const all = await listDropboxAudioFiles({
      accessToken: input.accessToken,
      folderId: input.parentId,
      search,
      limit: input.limit ?? 1000,
    });
    return {
      folders: [],
      files: all.files,
      truncated: false,
    };
  }
  const page = await listFolderPage({
    accessToken: input.accessToken,
    path: folderPathForId(input.parentId),
    recursive: false,
  });
  const folders = page.entries.map(toFolderEntry).filter((item): item is DropboxFolderEntry => Boolean(item));
  const files = page.entries.map(toAudioFile).filter((item): item is DropboxAudioFile => Boolean(item));
  logDropboxFilesEvent('list_children_page_summary', {
    parentId: String(input.parentId ?? '').trim() || null,
    ...summarizeDropboxEntries(page.entries),
    parsedFolderCount: folders.length,
    parsedAudioFileCount: files.length,
    truncated: page.hasMore,
  });
  return {
    folders,
    files,
    truncated: page.hasMore,
  };
}

export async function listDropboxAudioFiles(input: {
  accessToken: string;
  folderId?: string;
  allFolderIds?: string[];
  search?: string;
  limit: number;
  pageToken?: string;
}): Promise<{
  files: DropboxAudioFile[];
  nextPageToken: string | null;
}> {
  const search = String(input.search ?? '').trim().toLowerCase();
  const roots = (input.allFolderIds?.length ? input.allFolderIds : (input.folderId ? [input.folderId] : []))
    .map((folderId) => folderPathForId(folderId))
    .filter(Boolean);
  const path = roots[0] ?? '';
  logDropboxFilesEvent('list_audio_start', {
    folderId: String(input.folderId ?? '').trim() || null,
    allFolderIds: roots.length ? roots : null,
    search: search || null,
    limit: input.limit,
    pageToken: input.pageToken || null,
    path,
  });
  const page = await listFolderPage({
    accessToken: input.accessToken,
    path,
    recursive: true,
    cursor: input.pageToken || undefined,
  });
  const parsedFiles = page.entries
    .map(toAudioFile)
    .filter((item): item is DropboxAudioFile => Boolean(item))
    .filter((item) => !search || item.name.toLowerCase().includes(search));
  const files = parsedFiles.slice(0, input.limit);
  logDropboxFilesEvent('list_audio_page_summary', {
    folderId: String(input.folderId ?? '').trim() || null,
    allFolderIds: roots.length ? roots : null,
    path,
    search: search || null,
    limit: input.limit,
    cursor: page.cursor,
    hasMore: page.hasMore,
    ...summarizeDropboxEntries(page.entries),
    parsedAudioFileCount: parsedFiles.length,
    returnedFileCount: files.length,
    filteredOutBySearch: search ? parsedFiles.length - files.length : 0,
  });
  return {
    files,
    nextPageToken: page.hasMore ? page.cursor : null,
  };
}

export async function collectDropboxFolderTree(input: {
  accessToken: string;
  rootFolderId: string;
  maxFolders?: number;
}): Promise<string[]> {
  const entries = await listDropboxAudioFiles({
    accessToken: input.accessToken,
    folderId: input.rootFolderId,
    limit: Number.POSITIVE_INFINITY,
  });
  const folders: string[] = [String(input.rootFolderId ?? '').trim()].filter(Boolean);
  logDropboxFilesEvent('folder_tree_collected', {
    rootFolderId: input.rootFolderId,
    fileCount: entries.files.length,
    collectedFolderCount: folders.length,
  });
  return folders;
}
