import { promises as fs } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

export function configDirectory(): string {
  return process.env.DJ_ASSIST_CONFIG_DIR?.trim() || path.join(homedir(), '.dj_assist');
}

export function cloudCacheDirectory(kind: string): string {
  return path.join(configDirectory(), 'cache', kind);
}

export function safeBasename(value: string): string {
  const cleaned = String(value ?? '').replace(/[^\w.\- ]+/g, '_').trim();
  return cleaned || 'cloud-track';
}

export function extensionFromMimeType(mimeType: string): string {
  const normalized = String(mimeType ?? '').toLowerCase();
  if (normalized.includes('mpeg')) return '.mp3';
  if (normalized.includes('wav')) return '.wav';
  if (normalized.includes('flac')) return '.flac';
  if (normalized.includes('aiff')) return '.aif';
  if (normalized.includes('ogg')) return '.ogg';
  if (normalized.includes('aac')) return '.aac';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return '.m4a';
  if (normalized.includes('alac')) return '.m4a';
  return '.bin';
}

export function temporaryCloudDownloadPath(kind: string, id: string, ext: string): string {
  return path.join(tmpdir(), `dj-assist-${kind}-${String(id ?? '').trim()}-${Date.now()}${ext}`);
}

export async function writeTempFileAndPromote(tempPath: string, finalPath: string, buffer: Buffer): Promise<void> {
  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, finalPath).catch(async () => {
    await fs.copyFile(tempPath, finalPath);
    await fs.unlink(tempPath).catch(() => {});
  });
}

function readSynchsafeInteger(buffer: Buffer, offset: number): number {
  return (
    ((buffer[offset] ?? 0) & 0x7f) << 21
    | ((buffer[offset + 1] ?? 0) & 0x7f) << 14
    | ((buffer[offset + 2] ?? 0) & 0x7f) << 7
    | ((buffer[offset + 3] ?? 0) & 0x7f)
  );
}

export async function normalizeCloudAudioFile(filePath: string, mimeType: string): Promise<{ normalized: boolean; mimeType: string }> {
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

  const content = await fs.readFile(filePath, { encoding: null, flag: 'r' });
  const id3Size = readSynchsafeInteger(content, 6);
  const payloadOffset = 10 + id3Size;
  if (content.length < payloadOffset + 8 || content.subarray(payloadOffset + 4, payloadOffset + 8).toString('ascii') !== 'ftyp') {
    return { normalized: false, mimeType };
  }

  const stripped = content.subarray(payloadOffset);
  if (!stripped.length) {
    throw new Error('Cloud cached file normalization produced an empty payload.');
  }

  const tempPath = `${filePath}.normalize-${Date.now()}.tmp`;
  await fs.writeFile(tempPath, stripped);
  await fs.rename(tempPath, filePath).catch(async () => {
    await fs.copyFile(tempPath, filePath);
    await fs.unlink(tempPath).catch(() => {});
  });

  return { normalized: true, mimeType: 'audio/mp4' };
}
