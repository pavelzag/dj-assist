import { NextRequest, NextResponse } from 'next/server';
import { getAllSets, createSet, syncSetsFromServer } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const shouldSync = request.nextUrl.searchParams.get('sync') === '1';
  let sync: Awaited<ReturnType<typeof syncSetsFromServer>> | null = null;
  if (shouldSync) {
    try {
      sync = await syncSetsFromServer();
    } catch (error) {
      return NextResponse.json({
        sets: await getAllSets(),
        sync: null,
        sync_error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const sets = await getAllSets();
  return NextResponse.json({ sets, sync });
}

export async function POST(request: NextRequest) {
  const { name } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const set = await createSet(name.trim());
  return NextResponse.json({ set }, { status: 201 });
}
