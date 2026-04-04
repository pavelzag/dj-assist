import { NextRequest, NextResponse } from 'next/server';
import { validateScanDirectory } from '@/lib/scan-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const directory = String(request.nextUrl.searchParams.get('directory') ?? '').trim();
  if (!directory) {
    return NextResponse.json({ error: 'directory is required' }, { status: 400 });
  }
  try {
    const validation = await validateScanDirectory(directory);
    return NextResponse.json({ validation });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unexpected error' },
      { status: 400 },
    );
  }
}
