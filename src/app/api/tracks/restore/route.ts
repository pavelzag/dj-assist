import { NextRequest, NextResponse } from 'next/server';
import { restoreTrackSnapshots } from '@/lib/db';
import { googleFeaturesEnabled } from '@/lib/app-flavor';
import { isCloudTrackPath } from '@/lib/cloud-source';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const incomingTracks = Array.isArray(body.tracks) ? body.tracks as Record<string, unknown>[] : [];
  const tracks = googleFeaturesEnabled()
    ? incomingTracks
    : incomingTracks.filter((track) => !isCloudTrackPath(String(track.path ?? '')));
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
