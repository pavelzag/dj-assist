import { NextRequest, NextResponse } from 'next/server';
import { googleFeaturesEnabled } from '@/lib/app-flavor';
import { normalizeCloudSourceKind } from '@/lib/cloud-source';
import { getOneDriveAccessToken, getDropboxAccessToken } from '@/lib/runtime-settings';
import { listOneDriveAudioFiles } from '@/lib/onedrive-files';
import { listDropboxAudioFiles } from '@/lib/dropbox-files';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  if (!googleFeaturesEnabled()) {
    return NextResponse.json({ error: 'Unavailable in this app version.' }, { status: 404 });
  }
  const { provider: rawProvider } = await context.params;
  const provider = normalizeCloudSourceKind(rawProvider);
  if (!provider || provider === 'google_drive') {
    return NextResponse.json({ error: `Unsupported cloud provider: ${rawProvider}` }, { status: 404 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Math.trunc(Number(searchParams.get('limit') ?? 100) || 100), 1), 1000);
    const pageToken = String(searchParams.get('pageToken') ?? '').trim();
    const folderId = String(searchParams.get('folderId') ?? '').trim();
    const search = String(searchParams.get('search') ?? '').trim();
    const accessToken = provider === 'onedrive'
      ? (await getOneDriveAccessToken()).accessToken
      : (await getDropboxAccessToken()).accessToken;
    const payload = provider === 'onedrive'
      ? await listOneDriveAudioFiles({
        accessToken,
        folderId,
        search,
        limit,
        pageToken,
      })
      : await listDropboxAudioFiles({
        accessToken,
        folderId,
        search,
        limit,
        pageToken,
      });
    return NextResponse.json({
      provider,
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
