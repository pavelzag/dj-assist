import { NextRequest, NextResponse } from 'next/server';
import { removeTrackFromSet } from '@/lib/db';

export const runtime = 'nodejs';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; position: string }> },
) {
  const { id, position } = await params;
  await removeTrackFromSet(parseInt(id, 10), parseInt(position, 10));
  return NextResponse.json({ ok: true });
}
