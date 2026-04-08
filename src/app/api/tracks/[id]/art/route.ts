import { NextResponse } from 'next/server';
import { getTrackById } from '@/lib/db';

export const runtime = 'nodejs';

function parseDataUri(dataUri: string): { mimeType: string; data: Uint8Array } | null {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUri);
  if (!match) return null;
  const mimeType = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const raw = match[3] ?? '';
  try {
    const buffer = isBase64
      ? Buffer.from(raw, 'base64')
      : Buffer.from(decodeURIComponent(raw), 'utf8');
    return { mimeType, data: new Uint8Array(buffer) };
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const trackId = Number.parseInt(id, 10);
  if (Number.isNaN(trackId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const track = await getTrackById(trackId);
  if (!track?.album_art_url) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (!track.album_art_url.startsWith('data:')) {
    return NextResponse.redirect(track.album_art_url, { status: 307 });
  }

  const parsed = parseDataUri(track.album_art_url);
  if (!parsed) {
    return NextResponse.json({ error: 'invalid embedded artwork' }, { status: 400 });
  }

  return new NextResponse(Buffer.from(parsed.data), {
    status: 200,
    headers: {
      'Content-Type': parsed.mimeType,
      'Cache-Control': 'public, max-age=86400, immutable',
      'Content-Length': String(parsed.data.byteLength),
    },
  });
}
