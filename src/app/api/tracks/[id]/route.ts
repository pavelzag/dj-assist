import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { aggregateTracks, getAllTrackRows, getTrackById, getTrackGroupMembers, serializeTrack, serializeTrackGroup, updateTrackBpm, updateTrackMetadata } from '@/lib/db';
import { getRecommendedNextTracks, type RecommendationIntent } from '@/lib/analyzer';
import { resolveWorkingPython } from '@/lib/scan';

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
  if (!track) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const allTracks = await getAllTrackRows();
  const groupedTracks = aggregateTracks(allTracks);
  const trackGroup = await getTrackGroupMembers(track.id);
  const groupedTrack = trackGroup[0];
  const rawIntent = request.nextUrl.searchParams.get('intent');
  const intent: RecommendationIntent = rawIntent === 'up' || rawIntent === 'down' || rawIntent === 'same' ? rawIntent : 'safe';
  const recommendations = getRecommendedNextTracks(
    groupedTrack,
    groupedTracks.map((group) => group[0]),
    [groupedTrack.id],
    intent,
  ).slice(0, 50);

  return NextResponse.json({
    track: serializeTrackGroup(trackGroup),
    next_tracks: recommendations.map(({ track: t, reason, score }) => ({
      ...serializeTrack(t as Parameters<typeof serializeTrack>[0], { includeEmbeddedArtwork: false }),
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
  const currentTrack = await getTrackById(trackId);
  if (!currentTrack) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const trackGroup = await getTrackGroupMembers(trackId);
  const groupIds = trackGroup.map((track) => track.id);

  if (body.bpm !== undefined) {
    const bpm = parseFloat(body.bpm);
    if (isNaN(bpm) || bpm <= 0) return NextResponse.json({ error: 'invalid bpm' }, { status: 400 });
    await Promise.all(groupIds.map((id) => updateTrackBpm(id, bpm)));
  }

  const shouldWriteFileMetadata = Boolean(
    body.artist !== undefined ||
    body.title !== undefined ||
    body.album !== undefined ||
    body.key !== undefined ||
    body.custom_tags !== undefined,
  );

  if (shouldWriteFileMetadata) {
    try {
      const python = await resolveWorkingPython();
      const writablePaths = [...new Set(
        trackGroup
          .map((track) => String(track.path ?? '').trim())
          .filter((path) => path && !path.startsWith('gdrive:') && path.toLowerCase().endsWith('.mp3')),
      )];
      for (const writablePath of writablePaths) {
        const args = [
          '-m',
          'dj_assist.cli',
          'write-tags',
          writablePath,
        ];
        if (body.artist !== undefined) args.push('--artist', String(body.artist ?? ''));
        if (body.title !== undefined) args.push('--title', String(body.title ?? ''));
        if (body.album !== undefined) args.push('--album', String(body.album ?? ''));
        if (body.key !== undefined) args.push('--key', String(body.key ?? ''));
        if (body.custom_tags !== undefined) {
          const tags = Array.isArray(body.custom_tags) ? body.custom_tags.map((item: unknown) => String(item).trim()).filter(Boolean) : [];
          args.push('--tags', tags.join(', '));
        }
        await execFileAsync(python, args, {
          cwd: process.cwd(),
          env: process.env,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to write metadata into the audio file.';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (body.artist !== undefined || body.title !== undefined || body.album !== undefined || body.key !== undefined || body.ignored !== undefined || body.custom_tags !== undefined || body.manual_cues !== undefined || body.album_art_url !== undefined || body.album_art_source !== undefined || body.album_art_confidence !== undefined || body.album_art_review_status !== undefined || body.album_art_review_notes !== undefined || body.source_preference !== undefined) {
    const sourcePreference = body.source_preference === 'local' || body.source_preference === 'google_drive'
      ? body.source_preference
      : body.source_preference === null || body.source_preference === ''
        ? null
        : undefined;
    const patch = {
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
      album_art_url: body.album_art_url !== undefined ? String(body.album_art_url ?? '') : undefined,
      album_art_source: body.album_art_source !== undefined ? String(body.album_art_source ?? '') : undefined,
      album_art_confidence: body.album_art_confidence !== undefined ? Number(body.album_art_confidence ?? 0) : undefined,
      album_art_review_status: body.album_art_review_status !== undefined ? String(body.album_art_review_status ?? '') : undefined,
      album_art_review_notes: body.album_art_review_notes !== undefined ? String(body.album_art_review_notes ?? '') : undefined,
      source_preference: sourcePreference,
    };
    await Promise.all(groupIds.map((id) => updateTrackMetadata(id, patch)));
  }

  const refreshedGroup = await getTrackGroupMembers(trackId);
  return NextResponse.json({ track: serializeTrackGroup(refreshedGroup) });
}
