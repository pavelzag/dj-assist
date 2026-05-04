import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { NextRequest, NextResponse } from 'next/server';
import { getTrackById, propagateAlbumArt, serializeTrack } from '@/lib/db';
import { resolveWorkingPython } from '@/lib/scan';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);
const REANALYZE_ART_TIMEOUT_MS = 45000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const trackId = parseInt(id, 10);
  if (isNaN(trackId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const currentTrack = await getTrackById(trackId);
  if (!currentTrack) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const force = Boolean(body.force);

  try {
    const python = await resolveWorkingPython();
    const startedAt = Date.now();
    const { stdout, stderr } = await execFileAsync(
      python,
      ['-m', 'dj_assist.cli', 'reanalyze-art', String(trackId), ...(force ? ['--force'] : []), '--json-output'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DJ_ASSIST_LIVE_SPOTIFY_DEBUG: '1',
          DJ_ASSIST_FAIL_FAST_ON_SPOTIFY_429: '1',
        },
        timeout: REANALYZE_ART_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
    );
    const durationMs = Date.now() - startedAt;
    let debug: Record<string, unknown> | string = String(stdout || '').trim();
    try {
      debug = JSON.parse(stdout || '{}') as Record<string, unknown>;
    } catch {
      // keep stdout as string
    }
    const refreshed = await getTrackById(trackId);
    if (!refreshed) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const { propagated, updatedIds } = refreshed.album_art_url
      ? await propagateAlbumArt(trackId)
      : { propagated: 0, updatedIds: [] };
    return NextResponse.json({
      track: serializeTrack(refreshed),
      message: typeof debug === 'object' ? String(debug.message ?? 'Artwork refresh complete.') : 'Artwork refresh complete.',
      propagated,
      propagatedTrackIds: updatedIds,
      debug: {
        durationMs,
        stdout: debug,
        stderr: String(stderr || '').trim(),
      },
    });
  } catch (error) {
    const execError = error as Error & { stdout?: string; stderr?: string; signal?: string; code?: number };
    const timedOut = execError?.signal === 'SIGTERM' && !execError?.code;
    return NextResponse.json(
      {
        error: timedOut
          ? `Artwork reanalysis timed out after ${Math.round(REANALYZE_ART_TIMEOUT_MS / 1000)}s.`
          : (execError.message || 'Unable to reanalyze artwork.'),
        debug: {
          timeoutMs: REANALYZE_ART_TIMEOUT_MS,
          timedOut,
          code: execError?.code ?? null,
          signal: execError?.signal ?? null,
          trackId,
          force,
          stdout: String(execError?.stdout ?? '').trim(),
          stderr: String(execError?.stderr ?? '').trim(),
        },
      },
      { status: 500 },
    );
  }
}
