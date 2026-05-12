import { promises as fs } from 'node:fs';
import path from 'node:path';
import { cloudCacheDirectory, extensionFromMimeType, normalizeCloudAudioFile, safeBasename, temporaryCloudDownloadPath, writeTempFileAndPromote } from '@/lib/cloud-cache';
import { getDropboxAccessToken } from '@/lib/runtime-settings';

async function fetchDropboxFileMetadata(fileId: string, accessToken: string) {
  const response = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path: fileId.startsWith('id:') ? fileId : `id:${fileId}`,
      include_deleted: false,
      include_has_explicit_shared_members: false,
    }),
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
    throw new Error(String((payload.error_summary ?? payload.error ?? raw) || 'Could not load Dropbox file metadata.'));
  }
  return {
    id: String(payload.id ?? fileId).trim(),
    name: String(payload.name ?? '').trim() || fileId,
    mimeType: String(payload.mime_type ?? '').trim() || 'application/octet-stream',
    modifiedTime: String(payload.server_modified ?? payload.client_modified ?? '').trim() || null,
    size: Number(payload.size ?? 0) || null,
    pathDisplay: String(payload.path_display ?? '').trim() || null,
  };
}

async function prepareDropboxAudioFile(input: {
  filePath: string;
  mimeType: string;
  expectedSize: number | null;
}): Promise<{ cached: boolean; mimeType: string } | null> {
  try {
    const stats = await fs.stat(input.filePath);
    if (!stats.isFile() || stats.size <= 0) return null;
    if (input.expectedSize && stats.size !== input.expectedSize) {
      await fs.unlink(input.filePath).catch(() => {});
      return null;
    }
    const normalized = await normalizeCloudAudioFile(input.filePath, input.mimeType);
    return {
      cached: true,
      mimeType: normalized.mimeType,
    };
  } catch {
    return null;
  }
}

export async function ensureLocalDropboxTrackFile(
  fileId: string,
  knownMetadata?: { name?: string; mimeType?: string; size?: string | number | null },
): Promise<{
  localPath: string;
  cached: boolean;
  name: string;
  mimeType: string;
}> {
  const { accessToken } = await getDropboxAccessToken();
  const metadata = (knownMetadata?.name && knownMetadata?.mimeType)
    ? {
      id: fileId,
      name: knownMetadata.name,
      mimeType: knownMetadata.mimeType,
      modifiedTime: null,
      size: Number(knownMetadata.size ?? 0) || null,
      pathDisplay: null,
    }
    : await fetchDropboxFileMetadata(fileId, accessToken);
  const ext = path.extname(metadata.name) || extensionFromMimeType(metadata.mimeType);
  const baseName = path.basename(metadata.name, path.extname(metadata.name) || ext);
  const finalPath = path.join(cloudCacheDirectory('dropbox'), `${fileId}-${safeBasename(baseName)}${ext}`);
  const expectedSize = Number.isFinite(metadata.size) && metadata.size && metadata.size > 0 ? metadata.size : null;

  const preparedCachedFile = await prepareDropboxAudioFile({
    filePath: finalPath,
    mimeType: metadata.mimeType,
    expectedSize: null,
  });
  if (preparedCachedFile) {
    return {
      localPath: finalPath,
      cached: true,
      name: metadata.name,
      mimeType: preparedCachedFile.mimeType,
    };
  }

  await fs.mkdir(cloudCacheDirectory('dropbox'), { recursive: true });
  const tempPath = temporaryCloudDownloadPath('dropbox', fileId, ext);
  const response = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path: fileId.startsWith('id:') ? fileId : `id:${fileId}` }),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(5 * 60_000),
  });
  if (!response.ok || !response.body) {
    const detail = (await response.text()).slice(0, 300).trim();
    throw new Error(`Dropbox file download failed status=${response.status}${detail ? ` detail=${detail}` : ''}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeTempFileAndPromote(tempPath, finalPath, buffer);
  const preparedDownloadedFile = await prepareDropboxAudioFile({
    filePath: finalPath,
    mimeType: metadata.mimeType,
    expectedSize,
  });
  if (!preparedDownloadedFile) {
    await fs.unlink(finalPath).catch(() => {});
    throw new Error('Dropbox file download produced an invalid or incomplete cached file.');
  }

  return {
    localPath: finalPath,
    cached: false,
    name: metadata.name,
    mimeType: preparedDownloadedFile.mimeType,
  };
}

