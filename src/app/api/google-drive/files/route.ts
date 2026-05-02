import { NextRequest, NextResponse } from 'next/server';
import { getGoogleDriveAccessToken } from '@/lib/runtime-settings';
import { listGoogleDriveAudioFiles } from '@/lib/google-drive-files';
import { logServerEvent } from '@/lib/app-log';

export const runtime = 'nodejs';

function logGoogleDriveFiles(
  level: 'info' | 'warning' | 'error',
  event: string,
  context: Record<string, unknown>,
) {
  const payload = {
    timestamp: new Date().toISOString(),
    event,
    ...context,
  };
  const line = `[google-drive-files] ${JSON.stringify(payload)}`;
  void logServerEvent({
    level,
    message: line,
    category: 'google-drive-files',
    context: payload,
    alsoConsole: true,
  }).catch(() => {});
}

export async function GET(request: NextRequest) {
  try {
    const { accessToken } = await getGoogleDriveAccessToken();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Math.trunc(Number(searchParams.get('limit') ?? 100) || 100), 1), 200);
    const pageToken = String(searchParams.get('pageToken') ?? '').trim();
    const folderId = String(searchParams.get('folderId') ?? '').trim();
    logGoogleDriveFiles('info', 'started', {
      folderId: folderId || null,
      limit,
      hasPageToken: Boolean(pageToken),
      hasAccessToken: Boolean(accessToken),
    });
    const payload = await listGoogleDriveAudioFiles({
      accessToken,
      folderId,
      limit,
      pageToken,
    });
    logGoogleDriveFiles('info', 'completed', {
      folderId: folderId || null,
      returned: payload.files.length,
      hasNextPage: Boolean(payload.nextPageToken),
    });

    return NextResponse.json({
      files: payload.files,
      nextPageToken: payload.nextPageToken,
    });
  } catch (error) {
    logGoogleDriveFiles('error', 'failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
