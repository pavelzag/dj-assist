import { NextRequest, NextResponse } from 'next/server';
import { getAllTracks, getTrackById, serializeTrack, updateTrackBpm } from '@/lib/db';
import { getRecommendedNextTracks } from '@/lib/analyzer';

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
  ).slice(0, 50);

  return NextResponse.json({
    track: serializeTrack(track),
    next_tracks: recommendations.map(({ track: t, reason, score }) => ({
      ...serializeTrack(t as Parameters<typeof serializeTrack>[0]),
      reason,
      score,
    })),
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const trackId = parseInt(id, 10);
  if (isNaN(trackId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const body = await request.json();
  const bpm = parseFloat(body.bpm);
  if (isNaN(bpm) || bpm <= 0) return NextResponse.json({ error: 'invalid bpm' }, { status: 400 });

  await updateTrackBpm(trackId, bpm);
  const track = await getTrackById(trackId);
  return NextResponse.json({ track: serializeTrack(track!) });
}
