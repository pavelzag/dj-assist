import { NextRequest, NextResponse } from 'next/server';
import { getAllSets, createSet } from '@/lib/db';

export async function GET() {
  const sets = await getAllSets();
  return NextResponse.json({ sets });
}

export async function POST(request: NextRequest) {
  const { name } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const set = await createSet(name.trim());
  return NextResponse.json({ set }, { status: 201 });
}
