import { NextResponse } from 'next/server';
import { resetLibraryData } from '@/lib/db';
import { cancelAllScanJobs } from '@/lib/scan-jobs';
import { clearWatchFolders } from '@/lib/watch-folders';

export const runtime = 'nodejs';

export async function POST() {
  await cancelAllScanJobs();
  await clearWatchFolders();
  await resetLibraryData();
  return NextResponse.json({ ok: true });
}
