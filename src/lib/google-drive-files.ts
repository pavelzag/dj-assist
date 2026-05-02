export type GoogleDriveAudioFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  size: string | null;
  parents: string[];
  md5Checksum: string | null;
};

export function isIgnoredGoogleDriveAudioFileName(name: string): boolean {
  const normalized = String(name ?? '').trim();
  return normalized.startsWith('._');
}

export async function listGoogleDriveAudioFiles(input: {
  accessToken: string;
  folderId?: string;
  limit: number;
  pageToken?: string;
}) {
  const limit = Math.min(Math.max(Math.trunc(input.limit || 100), 1), 5000);
  const folderId = String(input.folderId ?? '').trim();
  const pageToken = String(input.pageToken ?? '').trim();
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set(
    'q',
    folderId
      ? `trashed = false and mimeType contains 'audio/' and '${folderId}' in parents`
      : "trashed = false and mimeType contains 'audio/'",
  );
  url.searchParams.set('fields', 'nextPageToken, files(id,name,mimeType,modifiedTime,size,parents,md5Checksum)');
  url.searchParams.set('orderBy', 'modifiedTime desc,name');
  url.searchParams.set('pageSize', String(Math.min(limit, 200)));
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');
  if (pageToken) url.searchParams.set('pageToken', pageToken);

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
        parents: Array.isArray(file.parents) ? file.parents.map((value) => String(value)).filter(Boolean) : [],
        md5Checksum: String(file.md5Checksum ?? '').trim() || null,
      }))
      .filter((file) => file.id && !isIgnoredGoogleDriveAudioFileName(file.name))
    : [];

  return {
    files,
    nextPageToken: String(payload.nextPageToken ?? '').trim() || null,
  };
}
