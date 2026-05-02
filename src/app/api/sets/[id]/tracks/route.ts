import { NextRequest, NextResponse } from 'next/server';
import { addTrackToSet } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { track_id } = await request.json();
  if (!track_id) return NextResponse.json({ error: 'track_id is required' }, { status: 400 });
  try {
    await addTrackToSet(parseInt(id, 10), parseInt(track_id, 10));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not add track to playlist.';
    const status = message.includes('conflict') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
