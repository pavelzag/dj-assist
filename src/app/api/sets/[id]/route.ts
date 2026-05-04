import { NextRequest, NextResponse } from 'next/server';
import { getSetById, deleteSet, syncSetsFromServer } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const setId = parseInt(id, 10);
  // Return local data immediately — background sync keeps it fresh without blocking.
  const set = await getSetById(setId);
  if (!set) return NextResponse.json({ error: 'not found' }, { status: 404 });
  syncSetsFromServer().catch(() => {});
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
