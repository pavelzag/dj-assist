import { NextRequest, NextResponse } from 'next/server';
import { getGoogleDriveAccessToken } from '@/lib/runtime-settings';
import { listGoogleDriveAudioFiles } from '@/lib/google-drive-files';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { accessToken } = await getGoogleDriveAccessToken();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Math.trunc(Number(searchParams.get('limit') ?? 100) || 100), 1), 200);
    const pageToken = String(searchParams.get('pageToken') ?? '').trim();
    const folderId = String(searchParams.get('folderId') ?? '').trim();
    console.log(`[google-drive-files] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'started',
      folderId: folderId || null,
      limit,
      hasPageToken: Boolean(pageToken),
      hasAccessToken: Boolean(accessToken),
    })}`);
    const payload = await listGoogleDriveAudioFiles({
      accessToken,
      folderId,
      limit,
      pageToken,
    });
    console.log(`[google-drive-files] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'completed',
      folderId: folderId || null,
      returned: payload.files.length,
      hasNextPage: Boolean(payload.nextPageToken),
    })}`);

    return NextResponse.json({
      files: payload.files,
      nextPageToken: payload.nextPageToken,
    });
  } catch (error) {
    console.error(`[google-drive-files] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
