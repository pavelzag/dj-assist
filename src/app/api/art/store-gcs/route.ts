import { NextRequest, NextResponse } from 'next/server';
import { gcsEnabled, uploadArtToGcs } from '@/lib/gcs-art';

export const runtime = 'nodejs';

// Called by the local Python scanner to offload GCS uploads onto the
// Next.js server, which holds the service account credentials.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const sourceUrl = String(body.url ?? '').trim();
    if (!sourceUrl) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }
    if (!gcsEnabled()) {
      // GCS not configured — return the original URL unchanged so the
      // scanner can fall back gracefully.
      return NextResponse.json({ ok: false, gcs_url: null, reason: 'gcs_not_configured' });
    }
    const gcsUrl = await uploadArtToGcs(sourceUrl);
    if (!gcsUrl) {
      return NextResponse.json({ ok: false, gcs_url: null, reason: 'upload_failed' });
    }
    return NextResponse.json({ ok: true, gcs_url: gcsUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, gcs_url: null, reason: message }, { status: 500 });
  }
}
