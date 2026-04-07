import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { NextRequest, NextResponse } from 'next/server';
import { getTrackById, serializeTrack } from '@/lib/db';
import { resolveWorkingPython } from '@/lib/scan';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

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
    const python = await resolveWorkingPython();
    await execFileAsync(
      python,
      ['-m', 'dj_assist.cli', 'reanalyze-bpm', String(trackId), '--json-output'],
      {
        cwd: process.cwd(),
        env: process.env,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reanalyze BPM.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const refreshed = await getTrackById(trackId);
  if (!refreshed) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ track: serializeTrack(refreshed) });
}
