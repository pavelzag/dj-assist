import { NextRequest, NextResponse } from 'next/server';
import { addWatchFolder, listWatchFolders, removeWatchFolder } from '@/lib/watch-folders';

export async function GET() {
  return NextResponse.json({ watches: await listWatchFolders() });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const directory = String(body.directory ?? '').trim();
  if (!directory) {
    return NextResponse.json({ error: 'directory required' }, { status: 400 });
  }
  try {
    const watch = await addWatchFolder(directory);
    return NextResponse.json({ watch });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const directory = String(body.directory ?? '').trim();
  if (!directory) {
    return NextResponse.json({ error: 'directory required' }, { status: 400 });
  }
  await removeWatchFolder(directory);
  return NextResponse.json({ ok: true });
}
