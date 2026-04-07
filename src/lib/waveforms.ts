import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type WaveformPeaksPayload = {
  duration: number;
  sample_rate: number;
  samples: number;
  width: number;
  peaks: Array<{ min: number; max: number }>;
};

function waveformCacheDir() {
  const baseDir = process.env.DJ_ASSIST_CONFIG_DIR?.trim() || process.cwd();
  return path.join(baseDir, 'waveforms');
}

export async function computeWaveformCachePath(audioPath: string, width: number) {
  const fileStat = await stat(audioPath);
  const fingerprint = createHash('sha1')
    .update(audioPath)
    .update('|')
    .update(String(fileStat.size))
    .update('|')
    .update(String(fileStat.mtimeMs))
    .update('|')
    .update(String(width))
    .digest('hex');
  return path.join(waveformCacheDir(), `${fingerprint}.json`);
}

export async function readCachedWaveform(audioPath: string, width: number): Promise<WaveformPeaksPayload | null> {
  try {
    const cachePath = await computeWaveformCachePath(audioPath, width);
    const raw = await readFile(cachePath, 'utf8');
    return JSON.parse(raw) as WaveformPeaksPayload;
  } catch {
    return null;
  }
}

export async function writeCachedWaveform(audioPath: string, width: number, payload: WaveformPeaksPayload) {
  const cachePath = await computeWaveformCachePath(audioPath, width);
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(payload), 'utf8');
  return cachePath;
}
