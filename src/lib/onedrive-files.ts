import { logServerEvent } from '@/lib/app-log';
import { isLikelyAudioFile } from '@/lib/cloud-audio';

export type OneDriveAudioFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  size: string | null;
  parents: string[];
};

export type OneDriveFolderEntry = {
  id: string;
  name: string;
  parents: string[];
};

const ONEDRIVE_SCAN_CONCURRENCY = 8;

function summarizeOneDriveEntry(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(item.id ?? '').trim() || null,
    name: String(item.name ?? '').trim() || null,
    hasFolder: Boolean(item.folder && typeof item.folder === 'object'),
    hasFile: Boolean(item.file && typeof item.file === 'object'),
    mimeType: String((item.file as Record<string, unknown> | undefined)?.mimeType ?? '').trim() || null,
    size: item.size == null ? null : String(item.size),
    parents: normalizeParents(item),
  };
}

function logOneDriveFilesEvent(event: string, context: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info') {
  void logServerEvent({
    level: level === 'warn' ? 'warning' : level,
    message: `[onedrive-files] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...context,
    })}`,
    category: 'onedrive-files',
    context: {
      event,
      ...context,
    },
    alsoConsole: level !== 'info',
  }).catch(() => {});
}

async function fetchOneDriveChildrenPage(input: {
  accessToken: string;
  parentId?: string;
  nextLink?: string | null;
}): Promise<{
  items: Array<Record<string, unknown>>;
  nextLink: string | null;
}> {
  const url = input.nextLink
    ? new URL(input.nextLink)
    : new URL(
      input.parentId
        ? `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(input.parentId)}/children`
        : 'https://graph.microsoft.com/v1.0/me/drive/root/children',
    );
  url.searchParams.set('$select', 'id,name,folder,file,size,lastModifiedDateTime,parentReference');
  url.searchParams.set('$top', '200');

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    payload = raw ? { error: raw } : {};
  }
  if (!response.ok) {
    logOneDriveFilesEvent('api_error', {
      url: url.toString(),
      status: response.status,
      error: String((payload.error ?? raw) || 'Could not list OneDrive files.'),
    }, 'error');
    throw new Error(String((payload.error ?? raw) || 'Could not list OneDrive files.'));
  }
  const items = Array.isArray(payload.value) ? payload.value as Array<Record<string, unknown>> : [];
  return {
    items,
    nextLink: String(payload['@odata.nextLink'] ?? '').trim() || null,
  };
}

function normalizeParents(item: Record<string, unknown>): string[] {
  const parentReference = item.parentReference && typeof item.parentReference === 'object'
    ? item.parentReference as Record<string, unknown>
    : null;
  const parentId = String(parentReference?.id ?? '').trim();
  return parentId ? [parentId] : [];
}

function isFolderItem(item: Record<string, unknown>): boolean {
  return Boolean(item.folder && typeof item.folder === 'object');
}

function isFileItem(item: Record<string, unknown>): boolean {
  return Boolean(item.file && typeof item.file === 'object');
}

function toAudioFile(item: Record<string, unknown>): OneDriveAudioFile | null {
  const name = String(item.name ?? '').trim();
  const mimeType = String((item.file as Record<string, unknown> | undefined)?.mimeType ?? '').trim() || 'application/octet-stream';
  if (!name || !isLikelyAudioFile({ name, mimeType })) return null;
  return {
    id: String(item.id ?? '').trim(),
    name,
    mimeType,
    modifiedTime: String(item.lastModifiedDateTime ?? '').trim() || null,
    size: item.size == null ? null : String(item.size),
    parents: normalizeParents(item),
  };
}

function toFolderEntry(item: Record<string, unknown>): OneDriveFolderEntry | null {
  if (!isFolderItem(item)) return null;
  const name = String(item.name ?? '').trim();
  const id = String(item.id ?? '').trim();
  if (!name || !id) return null;
  return {
    id,
    name,
    parents: normalizeParents(item),
  };
}

async function collectDescendants(input: {
  accessToken: string;
  rootFolderId?: string;
  limitFolders?: number;
}): Promise<{
  folders: OneDriveFolderEntry[];
  files: OneDriveAudioFile[];
}> {
  const rootFolderId = String(input.rootFolderId ?? '').trim() || undefined;
  const folders = new Map<string, OneDriveFolderEntry>();
  const files: OneDriveAudioFile[] = [];
  const frontier = [rootFolderId ?? 'root'];
  const visited = new Set<string>(frontier);

  while (frontier.length) {
    const batch = frontier.splice(0, ONEDRIVE_SCAN_CONCURRENCY);
    const results = await Promise.all(batch.map(async (folderId) => {
      const allItems: Array<Record<string, unknown>> = [];
      let nextLink: string | null = null;
      let safety = 0;
      do {
        const page = await fetchOneDriveChildrenPage({
          accessToken: input.accessToken,
          parentId: folderId === 'root' ? undefined : folderId,
          nextLink,
        });
        allItems.push(...page.items);
        nextLink = page.nextLink;
        safety += 1;
      } while (nextLink && safety < 32);
      return { folderId, items: allItems };
    }));

    for (const result of results) {
      for (const item of result.items) {
        const folder = toFolderEntry(item);
        if (folder) {
          folders.set(folder.id, folder);
          if (!visited.has(folder.id)) {
            visited.add(folder.id);
            frontier.push(folder.id);
          }
          continue;
        }
        const file = toAudioFile(item);
        if (file) files.push(file);
      }
    }

    if (input.limitFolders && folders.size >= input.limitFolders) break;
  }

  return {
    folders: [...folders.values()],
    files,
  };
}

export async function listOneDriveFolderChildren(input: {
  accessToken: string;
  parentId?: string;
  search?: string;
  limit?: number;
}): Promise<{
  folders: OneDriveFolderEntry[];
  files: OneDriveAudioFile[];
  truncated: boolean;
}> {
  const search = String(input.search ?? '').trim().toLowerCase();
  logOneDriveFilesEvent('list_children_start', {
    parentId: String(input.parentId ?? '').trim() || null,
    search: search || null,
    limit: Number.isFinite(Number(input.limit)) ? Math.trunc(Number(input.limit)) : null,
  });
  if (search) {
    const { folders, files } = await collectDescendants({
      accessToken: input.accessToken,
      rootFolderId: input.parentId || undefined,
    });
    const filteredFolders = folders.filter((folder) => folder.name.toLowerCase().includes(search));
    const filteredFiles = files.filter((file) => file.name.toLowerCase().includes(search));
    logOneDriveFilesEvent('list_children_search_summary', {
      parentId: String(input.parentId ?? '').trim() || null,
      search,
      folderCount: filteredFolders.length,
      audioFileCount: filteredFiles.length,
    });
    return { folders: filteredFolders, files: filteredFiles, truncated: false };
  }

  const page = await fetchOneDriveChildrenPage({
    accessToken: input.accessToken,
    parentId: String(input.parentId ?? '').trim() || undefined,
  });
  const folders = page.items.map(toFolderEntry).filter((item): item is OneDriveFolderEntry => Boolean(item));
  const files = page.items.map(toAudioFile).filter((item): item is OneDriveAudioFile => Boolean(item));
  logOneDriveFilesEvent('list_children_page_summary', {
    parentId: String(input.parentId ?? '').trim() || null,
    entryCount: page.items.length,
    folderCount: folders.length,
    audioFileCount: files.length,
    sampleEntries: page.items.slice(0, 5).map(summarizeOneDriveEntry),
    truncated: Boolean(page.nextLink),
  });
  return {
    folders: folders.slice(0, input.limit ?? folders.length),
    files: files.slice(0, input.limit ?? files.length),
    truncated: Boolean(page.nextLink),
  };
}

export async function listOneDriveAudioFiles(input: {
  accessToken: string;
  folderId?: string;
  allFolderIds?: string[];
  search?: string;
  limit: number;
  pageToken?: string;
}): Promise<{
  files: OneDriveAudioFile[];
  nextPageToken: string | null;
}> {
  const search = String(input.search ?? '').trim().toLowerCase();
  const rootIds = (input.allFolderIds?.length ? input.allFolderIds : (input.folderId ? [input.folderId] : []))
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);
  const foldersToScan = rootIds.length ? rootIds : ['root'];
  const files: OneDriveAudioFile[] = [];
  const visited = new Set<string>();
  const frontier = [...foldersToScan];

  logOneDriveFilesEvent('list_audio_root_resolution', {
    folderId: String(input.folderId ?? '').trim() || null,
    allFolderIds: rootIds.length ? rootIds : null,
    rootCount: rootIds.length,
    rootMode: rootIds.length ? 'selected-folder' : 'root',
    search: search || null,
    limit: input.limit,
    pageToken: input.pageToken || null,
  });
  logOneDriveFilesEvent('list_audio_start', {
    folderId: String(input.folderId ?? '').trim() || null,
    allFolderIds: rootIds.length ? rootIds : null,
    search: search || null,
    limit: input.limit,
    pageToken: input.pageToken || null,
  });

  while (frontier.length && files.length < input.limit) {
    const current = frontier.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const page = await fetchOneDriveChildrenPage({
      accessToken: input.accessToken,
      parentId: current === 'root' ? undefined : current,
    });
    for (const item of page.items) {
      if (isFolderItem(item)) {
        const folderId = String(item.id ?? '').trim();
        if (folderId && !visited.has(folderId)) frontier.push(folderId);
        continue;
      }
      const audio = toAudioFile(item);
      if (!audio) continue;
      if (search && !audio.name.toLowerCase().includes(search)) continue;
      files.push(audio);
      if (files.length >= input.limit) break;
    }
    logOneDriveFilesEvent('list_audio_batch_summary', {
      folderId: String(input.folderId ?? '').trim() || null,
      currentFolder: current,
      visitedFolderCount: visited.size,
      frontierCount: frontier.length,
      returnedFileCount: files.length,
      search: search || null,
    });
  }

  logOneDriveFilesEvent('list_audio_completed', {
    folderId: String(input.folderId ?? '').trim() || null,
    allFolderIds: rootIds.length ? rootIds : null,
    search: search || null,
    limit: input.limit,
    returnedFileCount: files.length,
    visitedFolderCount: visited.size,
    samples: files.slice(0, 10).map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      size: file.size,
      parents: file.parents,
    })),
  });

  return {
    files,
    nextPageToken: null,
  };
}

export async function collectOneDriveFolderTree(input: {
  accessToken: string;
  rootFolderId: string;
  maxFolders?: number;
}): Promise<string[]> {
  const { folders } = await collectDescendants({
    accessToken: input.accessToken,
    rootFolderId: input.rootFolderId,
    limitFolders: input.maxFolders,
  });
  return [input.rootFolderId, ...folders.map((folder) => folder.id)].filter(Boolean);
}
