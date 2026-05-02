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

export async function ensureLocalGoogleDriveTrackFile(fileId: string): Promise<{
  localPath: string;
  cached: boolean;
  name: string;
  mimeType: string;
}> {
  const { accessToken } = await getGoogleDriveAccessToken();
  const metadata = await fetchGoogleDriveFileMetadata(fileId, accessToken);
  const ext = path.extname(metadata.name) || extensionFromMimeType(metadata.mimeType);
  const baseName = path.basename(metadata.name, path.extname(metadata.name) || ext);
  const fileName = `${fileId}-${safeBasename(baseName)}${ext}`;
  const finalPath = path.join(cacheDirectory(), fileName);

  try {
    const stats = await fs.stat(finalPath);
    if (stats.isFile() && stats.size > 0) {
      return {
        localPath: finalPath,
        cached: true,
        name: metadata.name,
        mimeType: metadata.mimeType,
      };
    }
  } catch {
    // Cache miss; continue to download.
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

  return {
    localPath: finalPath,
    cached: false,
    name: metadata.name,
    mimeType: metadata.mimeType,
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
