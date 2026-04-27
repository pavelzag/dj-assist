// NOTE: This route reads from the local filesystem and only works in Node.js environments
// (local dev, self-hosted). It will not function on Vercel's serverless runtime.

import { NextRequest } from 'next/server';
import { createReadStream, existsSync, statSync } from 'fs';
import path from 'path';
import { getTrackById } from '@/lib/db';

export const runtime = 'nodejs';

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.aiff': 'audio/x-aiff',
    '.aif': 'audio/x-aiff',
  };
  return map[ext] ?? 'application/octet-stream';
}

function resolveTrackPath(trackPath: string): string {
  const expanded = trackPath.startsWith('~')
    ? path.join(process.env.HOME ?? '', trackPath.slice(1))
    : trackPath;
  return path.resolve(expanded);
}

function nodeStreamToWeb(
  nodeStream: ReturnType<typeof createReadStream>,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk) =>
        controller.enqueue(chunk instanceof Buffer ? chunk : Buffer.from(chunk)),
      );
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const trackId = parseInt(id, 10);
  if (isNaN(trackId)) {
    return Response.json({ error: 'invalid id' }, { status: 400 });
  }

  const track = await getTrackById(trackId);
  if (!track?.path) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  const filePath = resolveTrackPath(track.path);
  if (!existsSync(filePath)) {
    return Response.json({ error: 'file missing' }, { status: 404 });
  }

  const { size } = statSync(filePath);
  const mimeType = getMimeType(filePath);
  const rangeHeader = request.headers.get('range');

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : size - 1;
      const chunkSize = end - start + 1;
      return new Response(nodeStreamToWeb(createReadStream(filePath, { start, end })), {
        status: 206,
        headers: {
          'Content-Type': mimeType,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
        },
      });
    }
  }

  return new Response(nodeStreamToWeb(createReadStream(filePath)), {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(size),
    },
  });
}
