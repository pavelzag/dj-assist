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
    const payload = await listGoogleDriveAudioFiles({
      accessToken,
      folderId,
      limit,
      pageToken,
    });

    return NextResponse.json({
      files: payload.files,
      nextPageToken: payload.nextPageToken,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
