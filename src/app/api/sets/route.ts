import { NextRequest, NextResponse } from 'next/server';
import { getAllSets, createSet, syncSetsFromServer } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  await syncSetsFromServer().catch(() => ({ collections: 0, imported: 0, updated: 0, matched_tracks: 0 }));
  const sets = await getAllSets();
  return NextResponse.json({ sets });
}

export async function POST(request: NextRequest) {
  const { name } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  try {
    const set = await createSet(name.trim());
    return NextResponse.json({ set }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create playlist.';
    const status = message.includes('already exists') || message.includes('conflict') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
