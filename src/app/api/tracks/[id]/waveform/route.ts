import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { NextRequest, NextResponse } from 'next/server';
import { getTrackById } from '@/lib/db';
import { resolveWorkingPython } from '@/lib/scan';
import { readCachedWaveform, writeCachedWaveform, type WaveformPeaksPayload } from '@/lib/waveforms';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const trackId = parseInt(id, 10);
  if (isNaN(trackId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const track = await getTrackById(trackId);
  if (!track?.path) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (String(track.path).startsWith('gdrive:')) {
    return NextResponse.json(
      { error: 'Google Drive tracks do not have a local file path for waveform extraction yet.' },
      { status: 400 },
    );
  }

  const requestedWidth = Number(request.nextUrl.searchParams.get('width') ?? '640');
  const width = Number.isFinite(requestedWidth) ? Math.max(64, Math.min(4096, Math.round(requestedWidth))) : 640;

  const cached = await readCachedWaveform(track.path, width);
  if (cached) {
    return NextResponse.json({ ok: true, cached: true, waveform: cached });
  }

  try {
    const python = await resolveWorkingPython();
    const { stdout } = await execFileAsync(
      python,
      ['-m', 'dj_assist.cli', 'waveform-peaks', track.path, '--width', String(width)],
      {
        cwd: process.cwd(),
        env: process.env,
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    const waveform = JSON.parse(stdout) as WaveformPeaksPayload;
    await writeCachedWaveform(track.path, width, waveform);
    return NextResponse.json({ ok: true, cached: false, waveform });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
