import { NextRequest, NextResponse } from 'next/server';
import { createScanJob, listScanJobHistory, startScanJob } from '@/lib/scan-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const jobs = await listScanJobHistory(30);
  return NextResponse.json({ jobs });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const directory = String(body?.directory ?? '').trim();

  if (!directory) {
    return NextResponse.json({ error: 'directory is required' }, { status: 400 });
  }

  try {
    const job = await createScanJob({
      directory,
      fetchAlbumArt: body?.fetchAlbumArt !== false,
      fastScan: Boolean(body?.fastScan),
      verbose: Boolean(body?.verbose),
      rescanMode: (body?.rescanMode ?? 'smart') as 'smart' | 'missing-metadata' | 'missing-analysis' | 'missing-art' | 'full',
    });
    await startScanJob(job.id);
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    const details =
      error && typeof error === 'object' && 'details' in error
        ? (error as { details?: Record<string, unknown> }).details
        : undefined;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'unexpected error',
        details,
      },
      { status: 500 },
    );
  }
}
