import { promises as fs } from 'node:fs';
import path from 'node:path';
import { cloudCacheDirectory, extensionFromMimeType, normalizeCloudAudioFile, safeBasename, temporaryCloudDownloadPath, writeTempFileAndPromote } from '@/lib/cloud-cache';
import { getOneDriveAccessToken } from '@/lib/runtime-settings';

async function fetchOneDriveFileMetadata(fileId: string, accessToken: string) {
  const url = new URL(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}`);
  url.searchParams.set('$select', 'id,name,file,size,lastModifiedDateTime');
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
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
    const error = payload.error as Record<string, unknown> | undefined;
    throw new Error(String(error?.message ?? payload.error ?? raw ?? 'Could not load OneDrive file metadata.'));
  }
  return {
    id: String(payload.id ?? fileId).trim(),
    name: String(payload.name ?? '').trim() || fileId,
    mimeType: String((payload.file as Record<string, unknown> | undefined)?.mimeType ?? '').trim() || 'application/octet-stream',
    modifiedTime: String(payload.lastModifiedDateTime ?? '').trim() || null,
    size: Number(payload.size ?? 0) || null,
  };
}

async function prepareOneDriveAudioFile(input: {
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

export async function ensureLocalOneDriveTrackFile(
  fileId: string,
  knownMetadata?: { name?: string; mimeType?: string; size?: string | number | null },
): Promise<{
  localPath: string;
  cached: boolean;
  name: string;
  mimeType: string;
}> {
  const { accessToken } = await getOneDriveAccessToken();
  const metadata = (knownMetadata?.name && knownMetadata?.mimeType)
    ? {
      id: fileId,
      name: knownMetadata.name,
      mimeType: knownMetadata.mimeType,
      modifiedTime: null,
      size: Number(knownMetadata.size ?? 0) || null,
    }
    : await fetchOneDriveFileMetadata(fileId, accessToken);
  const ext = path.extname(metadata.name) || extensionFromMimeType(metadata.mimeType);
  const baseName = path.basename(metadata.name, path.extname(metadata.name) || ext);
  const finalPath = path.join(cloudCacheDirectory('onedrive'), `${fileId}-${safeBasename(baseName)}${ext}`);
  const expectedSize = Number.isFinite(metadata.size) && metadata.size && metadata.size > 0 ? metadata.size : null;

  const preparedCachedFile = await prepareOneDriveAudioFile({
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

  await fs.mkdir(cloudCacheDirectory('onedrive'), { recursive: true });
  const tempPath = temporaryCloudDownloadPath('onedrive', fileId, ext);
  const url = new URL(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(5 * 60_000),
  });
  if (!response.ok || !response.body) {
    const detail = (await response.text()).slice(0, 300).trim();
    throw new Error(`OneDrive file download failed status=${response.status}${detail ? ` detail=${detail}` : ''}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeTempFileAndPromote(tempPath, finalPath, buffer);
  const preparedDownloadedFile = await prepareOneDriveAudioFile({
    filePath: finalPath,
    mimeType: metadata.mimeType,
    expectedSize,
  });
  if (!preparedDownloadedFile) {
    await fs.unlink(finalPath).catch(() => {});
    throw new Error('OneDrive file download produced an invalid or incomplete cached file.');
  }

  return {
    localPath: finalPath,
    cached: false,
    name: metadata.name,
    mimeType: preparedDownloadedFile.mimeType,
  };
}
