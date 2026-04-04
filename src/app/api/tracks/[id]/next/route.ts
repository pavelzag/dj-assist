import { NextRequest, NextResponse } from 'next/server';
import { getAllTracks, getTrackById, serializeTrack } from '@/lib/db';
import { getRecommendedNextTracks } from '@/lib/analyzer';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const trackId = parseInt(id, 10);
  if (isNaN(trackId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const track = await getTrackById(trackId);
  if (!track) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const allTracks = await getAllTracks();
  const recommendations = getRecommendedNextTracks(
    track.key ?? '',
    track.bpm ?? 0,
    allTracks,
    [track.id],
  );

  return NextResponse.json(
    recommendations.map(({ track: t, reason, score }) => ({
      ...serializeTrack(t as Parameters<typeof serializeTrack>[0]),
      reason,
      score,
    })),
  );
}
