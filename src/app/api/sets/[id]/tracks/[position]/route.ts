import { NextRequest, NextResponse } from 'next/server';
import { removeTrackFromSet } from '@/lib/db';

export const runtime = 'nodejs';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; position: string }> },
) {
  const { id, position: entryId } = await params;
  try {
    await removeTrackFromSet(parseInt(id, 10), entryId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not remove track from playlist.';
    const status = message.includes('not found') ? 404 : message.includes('conflict') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
