import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { getGoogleDriveAccessToken } from '@/lib/runtime-settings';
import { resolveWorkingPython } from '@/lib/scan';

const execFileAsync = promisify(execFile);

function configDirectory(): string {
  return process.env.DJ_ASSIST_CONFIG_DIR?.trim() || path.join(homedir(), '.dj_assist');
}

function cacheDirectory(): string {
  return path.join(configDirectory(), 'cache', 'google-drive');
}

function safeBasename(value: string): string {
  const cleaned = value.replace(/[^\w.\- ]+/g, '_').trim();
  return cleaned || 'google-drive-track';
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('mpeg')) return '.mp3';
  if (normalized.includes('wav')) return '.wav';
  if (normalized.includes('flac')) return '.flac';
  if (normalized.includes('aiff')) return '.aif';
  if (normalized.includes('ogg')) return '.ogg';
  if (normalized.includes('aac')) return '.aac';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return '.m4a';
  return '.bin';
}

function readSynchsafeInteger(buffer: Buffer, offset: number): number {
  return (
    ((buffer[offset] ?? 0) & 0x7f) << 21
    | ((buffer[offset + 1] ?? 0) & 0x7f) << 14
    | ((buffer[offset + 2] ?? 0) & 0x7f) << 7
    | ((buffer[offset + 3] ?? 0) & 0x7f)
  );
}

async function normalizeGoogleDriveAudioFile(
  filePath: string,
  mimeType: string,
): Promise<{ normalized: boolean; mimeType: string }> {
  // Peek at only the first 10 bytes to check for an ID3 header.  Most cached
  // files are already normalized and won't start with 'ID3', so this avoids
  // reading the full audio file (potentially 50–100 MB) on every cache check.
  const fd = await fs.open(filePath, 'r');
  let prefix: Buffer;
  try {
    const buf = Buffer.alloc(10);
    const { bytesRead } = await fd.read(buf, 0, 10, 0);
    prefix = buf.subarray(0, bytesRead);
  } finally {
    await fd.close();
  }

  if (prefix.length < 10 || prefix.subarray(0, 3).toString('ascii') !== 'ID3') {
    return { normalized: false, mimeType };
  }

  // File starts with ID3 — read the full content to check for and strip an M4A wrapper.
  const content = await fs.readFile(filePath, { encoding: null, flag: 'r' });
  const id3Size = readSynchsafeInteger(content, 6);
  const payloadOffset = 10 + id3Size;
  if (content.length < payloadOffset + 8 || content.subarray(payloadOffset + 4, payloadOffset + 8).toString('ascii') !== 'ftyp') {
    return { normalized: false, mimeType };
  }

  const stripped = content.subarray(payloadOffset);
  if (!stripped.length) {
    throw new Error('Google Drive cached file normalization produced an empty payload.');
  }

  const tempPath = `${filePath}.normalize-${Date.now()}.tmp`;
  await fs.writeFile(tempPath, stripped);
  await fs.rename(tempPath, filePath).catch(async () => {
    await fs.copyFile(tempPath, filePath);
    await fs.unlink(tempPath).catch(() => {});
  });

  return { normalized: true, mimeType: 'audio/mp4' };
}

async function prepareGoogleDriveAudioFile(input: {
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
    const normalized = await normalizeGoogleDriveAudioFile(input.filePath, input.mimeType);
    return {
      cached: true,
      mimeType: normalized.mimeType,
    };
  } catch {
    return null;
  }
}

async function fetchGoogleDriveFileMetadata(fileId: string, accessToken: string) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('fields', 'id,name,mimeType,modifiedTime,md5Checksum,size');
  url.searchParams.set('supportsAllDrives', 'true');

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  if (!response.ok) {
    throw new Error(String((payload.error ?? raw) || 'Could not load Google Drive file metadata.'));
  }

  return {
    id: String(payload.id ?? fileId).trim(),
    name: String(payload.name ?? '').trim() || fileId,
    mimeType: String(payload.mimeType ?? '').trim() || 'application/octet-stream',
    modifiedTime: String(payload.modifiedTime ?? '').trim() || null,
    md5Checksum: String(payload.md5Checksum ?? '').trim() || null,
    size: Number(payload.size ?? 0) || null,
  };
}

export async function ensureLocalGoogleDriveTrackFile(
  fileId: string,
  knownMetadata?: { name?: string; mimeType?: string; size?: string | number | null },
): Promise<{
  localPath: string;
  cached: boolean;
  name: string;
  mimeType: string;
}> {
  const { accessToken } = await getGoogleDriveAccessToken();
  // Use caller-supplied metadata when available to avoid a redundant Drive API
  // call — the import route already has name/mimeType/size from the listing step.
  const metadata = (knownMetadata?.name && knownMetadata?.mimeType)
    ? {
        id: fileId,
        name: knownMetadata.name,
        mimeType: knownMetadata.mimeType,
        modifiedTime: null,
        md5Checksum: null,
        size: Number(knownMetadata.size ?? 0) || null,
      }
    : await fetchGoogleDriveFileMetadata(fileId, accessToken);
  const ext = path.extname(metadata.name) || extensionFromMimeType(metadata.mimeType);
  const baseName = path.basename(metadata.name, path.extname(metadata.name) || ext);
  const fileName = `${fileId}-${safeBasename(baseName)}${ext}`;
  const finalPath = path.join(cacheDirectory(), fileName);
  const expectedSize = Number.isFinite(metadata.size) && metadata.size && metadata.size > 0 ? metadata.size : null;

  // Don't check size for cached files: normalization strips the ID3 wrapper from
  // some M4A files, making the local size permanently smaller than the Drive-reported
  // size.  Passing null here skips the size comparison so already-normalized cached
  // files are not deleted and re-downloaded on every subsequent import.
  const preparedCachedFile = await prepareGoogleDriveAudioFile({
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

  await fs.mkdir(cacheDirectory(), { recursive: true });
  const tempPath = path.join(tmpdir(), `dj-assist-gdrive-${fileId}-${Date.now()}${ext}`);

  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('alt', 'media');
  url.searchParams.set('supportsAllDrives', 'true');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(5 * 60_000),
  });
  if (!response.ok || !response.body) {
    const detail = (await response.text()).slice(0, 300).trim();
    throw new Error(`Google Drive file download failed status=${response.status}${detail ? ` detail=${detail}` : ''}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, finalPath).catch(async () => {
    await fs.copyFile(tempPath, finalPath);
    await fs.unlink(tempPath).catch(() => {});
  });
  const preparedDownloadedFile = await prepareGoogleDriveAudioFile({
    filePath: finalPath,
    mimeType: metadata.mimeType,
    expectedSize,
  });
  if (!preparedDownloadedFile) {
    await fs.unlink(finalPath).catch(() => {});
    throw new Error('Google Drive file download produced an invalid or incomplete cached file.');
  }

  return {
    localPath: finalPath,
    cached: false,
    name: metadata.name,
    mimeType: preparedDownloadedFile.mimeType,
  };
}

export type LocalAudioMetadata = {
  title: string | null;
  artist: string | null;
  album: string | null;
  duration: number;
  bitrate: number;
  bpm: number;
  key: string | null;
  track_number: number;
  release_year: number;
  embedded_album_art_url: string;
  embedded_album_art_mime: string;
};

export async function readLocalAudioMetadata(filePath: string, originalName?: string): Promise<LocalAudioMetadata> {
  const python = await resolveWorkingPython();
  const args = ['-m', 'dj_assist.cli', 'inspect-file', filePath];
  if (originalName) {
    args.push('--original-name', originalName);
  }
  const { stdout } = await execFileAsync(
    python,
    args,
    {
      cwd: process.cwd(),
      env: process.env,
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
    },
  );
  const parsed = JSON.parse(stdout || '{}') as Record<string, unknown>;
  return {
    title: String(parsed.title ?? '').trim() || null,
    artist: String(parsed.artist ?? '').trim() || null,
    album: String(parsed.album ?? '').trim() || null,
    duration: Number(parsed.duration ?? 0) || 0,
    bitrate: Number(parsed.bitrate ?? 0) || 0,
    bpm: Number(parsed.bpm ?? 0) || 0,
    key: String(parsed.key ?? '').trim() || null,
    track_number: Number(parsed.track_number ?? 0) || 0,
    release_year: Number(parsed.release_year ?? 0) || 0,
    embedded_album_art_url: String(parsed.embedded_album_art_url ?? '').trim(),
    embedded_album_art_mime: String(parsed.embedded_album_art_mime ?? '').trim(),
  };
}
