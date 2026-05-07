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
      console.warn('[art-store-gcs] missing url');
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }
    const sourceKind = sourceUrl.startsWith('data:') ? 'data' : 'remote';
    console.info(`[art-store-gcs] start kind=${sourceKind} bucket=${process.env.DJ_ASSIST_GCS_BUCKET ?? ''}`);
    if (!gcsEnabled()) {
      // GCS not configured — return the original URL unchanged so the
      // scanner can fall back gracefully.
      console.warn('[art-store-gcs] skipped reason=gcs_not_configured');
      return NextResponse.json({ ok: false, gcs_url: null, reason: 'gcs_not_configured' });
    }
    const gcsUrl = await uploadArtToGcs(sourceUrl);
    if (!gcsUrl) {
      console.warn('[art-store-gcs] failed reason=upload_failed');
      return NextResponse.json({ ok: false, gcs_url: null, reason: 'upload_failed' });
    }
    console.info(`[art-store-gcs] uploaded gcs_url=${gcsUrl}`);
    return NextResponse.json({ ok: true, gcs_url: gcsUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[art-store-gcs] error ${message}`);
    return NextResponse.json({ ok: false, gcs_url: null, reason: message }, { status: 500 });
  }
}
