import { NextRequest, NextResponse } from 'next/server';
import { getAllTracks, getTrackById, serializeTrack } from '@/lib/db';
import { getRecommendedNextTracks, type RecommendationIntent } from '@/lib/analyzer';

export const runtime = 'nodejs';

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
  if (!track) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const allTracks = await getAllTracks();
  const rawIntent = request.nextUrl.searchParams.get('intent');
  const intent: RecommendationIntent = rawIntent === 'up' || rawIntent === 'down' || rawIntent === 'same' ? rawIntent : 'safe';
  const recommendations = getRecommendedNextTracks(
    track,
    allTracks,
    [track.id],
    intent,
  );

  return NextResponse.json(
    recommendations.map(({ track: t, reason, score }) => ({
      ...serializeTrack(t as Parameters<typeof serializeTrack>[0], { includeEmbeddedArtwork: false }),
      reason,
      score,
    })),
  );
}
