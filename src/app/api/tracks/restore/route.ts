import { NextRequest, NextResponse } from 'next/server';
import { restoreTrackSnapshots } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const tracks = Array.isArray(body.tracks) ? body.tracks as Record<string, unknown>[] : [];
  if (!tracks.length) {
    return NextResponse.json({ error: 'tracks required' }, { status: 400 });
  }
  try {
    const restored = await restoreTrackSnapshots(tracks);
    return NextResponse.json({ ok: true, restored });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unexpected error' },
      { status: 500 },
    );
  }
}
