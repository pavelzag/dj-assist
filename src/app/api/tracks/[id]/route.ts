import { NextRequest, NextResponse } from 'next/server';
import { getAllTracks, getTrackById, serializeTrack, updateTrackBpm, updateTrackMetadata } from '@/lib/db';
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
  if (body.bpm !== undefined) {
    const bpm = parseFloat(body.bpm);
    if (isNaN(bpm) || bpm <= 0) return NextResponse.json({ error: 'invalid bpm' }, { status: 400 });
    await updateTrackBpm(trackId, bpm);
  }

  if (body.artist !== undefined || body.title !== undefined || body.album !== undefined || body.key !== undefined || body.ignored !== undefined || body.custom_tags !== undefined || body.manual_cues !== undefined || body.album_art_review_status !== undefined || body.album_art_review_notes !== undefined) {
    await updateTrackMetadata(trackId, {
      artist: body.artist,
      title: body.title,
      album: body.album,
      key: body.key,
      ignored: body.ignored,
      custom_tags: Array.isArray(body.custom_tags) ? body.custom_tags.map((item: unknown) => String(item)) : undefined,
      manual_cues: Array.isArray(body.manual_cues) ? body.manual_cues.map((cue: Record<string, unknown>) => ({
        time: Number(cue.time ?? 0),
        label: cue.label ? String(cue.label) : undefined,
      })) : undefined,
      album_art_review_status: body.album_art_review_status !== undefined ? String(body.album_art_review_status ?? '') : undefined,
      album_art_review_notes: body.album_art_review_notes !== undefined ? String(body.album_art_review_notes ?? '') : undefined,
    });
  }

  const track = await getTrackById(trackId);
  return NextResponse.json({ track: serializeTrack(track!) });
}
