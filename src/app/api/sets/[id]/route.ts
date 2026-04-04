import { NextRequest, NextResponse } from 'next/server';
import { getSetById, deleteSet } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const set = await getSetById(parseInt(id, 10));
  if (!set) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ set });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deleteSet(parseInt(id, 10));
  return NextResponse.json({ ok: true });
}
