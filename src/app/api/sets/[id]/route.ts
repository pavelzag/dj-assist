import { NextRequest, NextResponse } from 'next/server';
import { getSetById, deleteSet, syncSetsFromServer } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await syncSetsFromServer().catch(() => ({ collections: 0, imported: 0, updated: 0, matched_tracks: 0 }));
  const set = await getSetById(parseInt(id, 10));
  if (!set) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ set });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteSet(parseInt(id, 10));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not delete playlist.';
    const status = message.includes('conflict') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
