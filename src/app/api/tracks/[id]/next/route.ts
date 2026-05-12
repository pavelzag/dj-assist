import { NextRequest, NextResponse } from 'next/server';
import { getAllTracks, getTrackById, serializeTrack } from '@/lib/db';
import { getRecommendedNextTracks, type RecommendationIntent } from '@/lib/analyzer';
import { googleFeaturesEnabled } from '@/lib/app-flavor';
import { isCloudTrackPath } from '@/lib/cloud-source';

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
  const googleEnabled = googleFeaturesEnabled();
  if (!googleEnabled && isCloudTrackPath(track.path)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const allTracks = (await getAllTracks()).filter((candidate) => googleEnabled || !isCloudTrackPath(candidate.path));
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
