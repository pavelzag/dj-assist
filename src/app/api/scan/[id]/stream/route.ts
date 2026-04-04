import { NextRequest, NextResponse } from 'next/server';
import { getScanJobSnapshot, subscribeToScanJob } from '@/lib/scan-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function encodeEvent(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const existing = await getScanJobSnapshot(id);
  if (!existing) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};

      const closeStream = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Ignore duplicate close attempts after the client disconnects.
        }
      };

      const pushEvent = (event: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encodeEvent(event));
        } catch {
          closeStream();
          return;
        }
        if (event.event === 'job_state' && String(event.status ?? '') === 'missing') {
          closeStream();
          return;
        }
        if (event.event === 'scan_failed' || event.event === 'scan_cancelled') {
          closeStream();
          return;
        }
        if (event.event === 'job_state' && ['completed', 'failed', 'cancelled'].includes(String(event.status ?? ''))) {
          closeStream();
        }
      };

      unsubscribe = subscribeToScanJob(id, (event) => {
        pushEvent(event);
      });

      if (['completed', 'failed', 'cancelled'].includes(existing.status)) {
        pushEvent({ event: 'job_state', status: existing.status, summary: existing.summary, job_id: existing.id });
        return;
      }

      cleanup = closeStream;
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
