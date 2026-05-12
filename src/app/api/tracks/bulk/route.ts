import { NextRequest, NextResponse } from 'next/server';
import { rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cpus } from 'node:os';
import { bulkTrackAction, getTracksByIds } from '@/lib/db';
import { ensureLocalGoogleDriveTrackFile } from '@/lib/google-drive-cache';
import { applySpotifyCredentialsToEnv, effectiveSpotifyCredentials } from '@/lib/runtime-settings';
import { resolveWorkingPython } from '@/lib/scan';
import { googleFeaturesEnabled } from '@/lib/app-flavor';

export const runtime = 'nodejs';
const execFileAsync = promisify(execFile);
const BULK_REANALYZE_ART_TIMEOUT_MS = 45000;
const BULK_REANALYZE_BPM_TIMEOUT_MS = 45000;
const BULK_REANALYZE_ART_CONCURRENCY = Math.max(1, Math.min(4, cpus().length || 1));

function parseStderrEvents(stderr: string | null | undefined): Array<Record<string, unknown>> | string {
  const text = String(stderr || '').trim();
  if (!text) return text;
  const lines = text.split('\n').filter(Boolean);
  const events = lines.map(line => {
    const match = line.match(/^\[([^\]]+)\]\s+(.*)$/);
    if (match) {
      const [, category, content] = match;
      try {
        return { category, ...JSON.parse(content) };
      } catch {
        return { category, raw: content };
      }
    }
    return { raw: line };
  });
  return events.length > 0 ? events : text;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map((value: unknown) => parseInt(String(value), 10)).filter((value: number) => Number.isFinite(value)) : [];
  const action = String(body.action ?? '');
  const deleteFiles = Boolean(body.deleteFiles);
  if (!ids.length) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 });
  }
  if (!['ignore', 'unignore', 'add_tags', 'remove_tags', 'clear_tags', 'add_to_set', 'delete', 'reanalyze_art', 'reanalyze_bpm'].includes(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  }

  if (action === 'reanalyze_art') {
    const force = Boolean(body.force);
    const spotify = await effectiveSpotifyCredentials();
    if (spotify.credentials) {
      applySpotifyCredentialsToEnv(spotify.credentials);
    }
    const python = await resolveWorkingPython();
    const results = await mapWithConcurrency<number, Record<string, unknown>>(ids as number[], BULK_REANALYZE_ART_CONCURRENCY, async (id) => {
      try {
        const { stdout, stderr } = await execFileAsync(
          python,
          ['-m', 'dj_assist.cli', 'reanalyze-art', String(id), ...(force ? ['--force'] : []), '--json-output'],
          {
            cwd: process.cwd(),
            env: process.env,
            timeout: BULK_REANALYZE_ART_TIMEOUT_MS,
            maxBuffer: 1024 * 1024,
          },
        );
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(stdout || '{}') as Record<string, unknown>;
        } catch {
          parsed = { ok: true, track_id: id, message: String(stdout || '').trim() };
        }
        return {
          id,
          ok: true,
          message: String(parsed.message ?? 'Artwork refresh complete.'),
          debug: {
            stdout: parsed,
            stderr: parseStderrEvents(stderr),
          },
        };
      } catch (error) {
        const execError = error as Error & { stdout?: string; stderr?: string; signal?: string; code?: number };
        return {
          id,
          ok: false,
          message: execError.message || 'Unable to refresh artwork.',
          debug: {
            code: execError?.code ?? null,
            signal: execError?.signal ?? null,
            stdout: String(execError?.stdout ?? '').trim(),
            stderr: parseStderrEvents(execError?.stderr),
          },
        };
      }
    });
    const successCount = results.filter((item) => item.ok).length;
    return NextResponse.json({
      ok: successCount > 0,
      results,
      processed: results.length,
      succeeded: successCount,
      failed: results.length - successCount,
    });
  }

  if (action === 'reanalyze_bpm') {
    const python = await resolveWorkingPython();
    const tracks = await getTracksByIds(ids);
    const trackById = new Map(tracks.map((track) => [Number(track.id), track]));
    const results = await mapWithConcurrency<number, Record<string, unknown>>(ids as number[], BULK_REANALYZE_ART_CONCURRENCY, async (id: number) => {
      const track = trackById.get(id);
      if (!track) {
        return { id, ok: false, message: 'Track not found.' };
      }
      try {
        let pathOverride = '';
        let googleDriveDownload: Record<string, unknown> | null = null;
        if (String(track.path ?? '').startsWith('gdrive:')) {
          if (!googleFeaturesEnabled()) {
            return { id, ok: false, message: 'Track not found.' };
          }
          const fileId = String(track.path ?? '').slice('gdrive:'.length).trim();
          if (!fileId) throw new Error('Google Drive track is missing its file ID.');
          const downloaded = await ensureLocalGoogleDriveTrackFile(fileId);
          pathOverride = downloaded.localPath;
          googleDriveDownload = {
            fileId,
            localPath: downloaded.localPath,
            cached: downloaded.cached,
            name: downloaded.name,
            mimeType: downloaded.mimeType,
          };
        }

        const args = ['-m', 'dj_assist.cli', 'reanalyze-bpm', String(id), '--json-output'];
        if (pathOverride) args.push('--path-override', pathOverride);
        const { stdout, stderr } = await execFileAsync(
          python,
          args,
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              DJ_ASSIST_LIVE_SPOTIFY_DEBUG: '1',
              DJ_ASSIST_FAIL_FAST_ON_SPOTIFY_429: '1',
            },
            timeout: BULK_REANALYZE_BPM_TIMEOUT_MS,
            maxBuffer: 1024 * 1024,
          },
        );
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(stdout || '{}') as Record<string, unknown>;
        } catch {
          parsed = { ok: true, track_id: id, message: String(stdout || '').trim() };
        }
        return {
          id,
          ok: true,
          message: `BPM ${String(parsed.bpm ?? parsed.effective_bpm ?? '') || 'updated'}`,
          debug: {
            stdout: parsed,
            stderr: parseStderrEvents(stderr),
            googleDriveDownload,
          },
        };
      } catch (error) {
        const execError = error as Error & { stdout?: string; stderr?: string; signal?: string; code?: number };
        return {
          id,
          ok: false,
          message: execError.message || 'Unable to reanalyze BPM.',
          debug: {
            code: execError?.code ?? null,
            signal: execError?.signal ?? null,
            stdout: String(execError?.stdout ?? '').trim(),
            stderr: parseStderrEvents(execError?.stderr),
          },
        };
      }
    });

    const successCount = results.filter((item) => item.ok).length;
    return NextResponse.json({
      ok: successCount > 0,
      results,
      processed: results.length,
      succeeded: successCount,
      failed: results.length - successCount,
    });
  }

  if (action === 'delete' && deleteFiles) {
    const tracks = await getTracksByIds(ids);
    const filePaths = [...new Set(tracks.map((track) => String(track.path ?? '').trim()).filter(Boolean))];
    try {
      await Promise.all(filePaths.map((filePath) => rm(filePath, { force: true })));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete one or more files from disk.';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  try {
    const result = await bulkTrackAction({
      ids,
      action: action as Parameters<typeof bulkTrackAction>[0]['action'],
      tags: Array.isArray(body.tags) ? body.tags.map((value: unknown) => String(value).trim()).filter(Boolean) : [],
      setId: body.setId ? parseInt(String(body.setId), 10) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bulk track action failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
