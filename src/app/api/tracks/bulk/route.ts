import { NextRequest, NextResponse } from 'next/server';
import { rm } from 'node:fs/promises';
import { bulkTrackAction, getTracksByIds } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map((value: unknown) => parseInt(String(value), 10)).filter((value: number) => Number.isFinite(value)) : [];
  const action = String(body.action ?? '');
  const deleteFiles = Boolean(body.deleteFiles);
  if (!ids.length) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 });
  }
  if (!['ignore', 'unignore', 'add_tags', 'remove_tags', 'clear_tags', 'add_to_set', 'delete'].includes(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  }

  if (action === 'delete' && deleteFiles) {
    const tracks = await getTracksByIds(ids);
    const filePaths = [...new Set(tracks.map((track) => String(track.path ?? '').trim()).filter(Boolean))];
    try {
      await Promise.all(filePaths.map((filePath) => rm(filePath, { force: true })));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete one or more files from disk.';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const result = await bulkTrackAction({
    ids,
    action: action as Parameters<typeof bulkTrackAction>[0]['action'],
    tags: Array.isArray(body.tags) ? body.tags.map((value: unknown) => String(value).trim()).filter(Boolean) : [],
    setId: body.setId ? parseInt(String(body.setId), 10) : undefined,
  });

  return NextResponse.json(result);
}
