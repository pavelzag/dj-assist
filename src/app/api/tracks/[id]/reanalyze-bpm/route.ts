import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { NextRequest, NextResponse } from 'next/server';
import { getTrackById, serializeTrack } from '@/lib/db';
import { ensureLocalGoogleDriveTrackFile } from '@/lib/google-drive-cache';
import { resolveWorkingPython } from '@/lib/scan';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);
const REANALYZE_TIMEOUT_MS = 45000;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const trackId = parseInt(id, 10);
  if (isNaN(trackId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const currentTrack = await getTrackById(trackId);
  if (!currentTrack) return NextResponse.json({ error: 'not found' }, { status: 404 });

  try {
    let pathOverride = '';
    let googleDriveDownload: Record<string, unknown> | null = null;
    if (String(currentTrack.path ?? '').startsWith('gdrive:')) {
      const fileId = String(currentTrack.path ?? '').slice('gdrive:'.length).trim();
      if (!fileId) {
        return NextResponse.json({ error: 'Google Drive track is missing its file ID.' }, { status: 400 });
      }
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

    const python = await resolveWorkingPython();
    const startedAt = Date.now();
    const args = ['-m', 'dj_assist.cli', 'reanalyze-bpm', String(trackId), '--json-output'];
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
        timeout: REANALYZE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
    );
    const durationMs = Date.now() - startedAt;
    try {
      const parsed = JSON.parse(stdout || '{}') as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        return NextResponse.json({
          track: serializeTrack((await getTrackById(trackId)) ?? currentTrack),
          debug: {
            durationMs,
            googleDriveDownload,
            stdout: parsed,
            stderr: String(stderr || '').trim(),
          },
        });
      }
    } catch {
      return NextResponse.json({
        track: serializeTrack((await getTrackById(trackId)) ?? currentTrack),
        debug: {
          durationMs,
          googleDriveDownload,
          stdout: String(stdout || '').trim(),
          stderr: String(stderr || '').trim(),
        },
      });
    }
  } catch (error) {
    const execError = error as Error & { stdout?: string; stderr?: string; signal?: string; code?: number };
    const timedOut = execError?.signal === 'SIGTERM' && !execError?.code;
    const message = timedOut
      ? `BPM reanalysis timed out after ${Math.round(REANALYZE_TIMEOUT_MS / 1000)}s.`
      : (error instanceof Error ? error.message : 'Unable to reanalyze BPM.');
    return NextResponse.json(
      {
        error: message,
        debug: {
          timeoutMs: REANALYZE_TIMEOUT_MS,
          timedOut,
          code: execError?.code ?? null,
          signal: execError?.signal ?? null,
          trackId,
          stdout: String(execError?.stdout ?? '').trim(),
          stderr: String(execError?.stderr ?? '').trim(),
        },
      },
      { status: 500 },
    );
  }
}
