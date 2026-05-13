import { NextRequest, NextResponse } from 'next/server';
import { googleFeaturesEnabled } from '@/lib/app-flavor';
import { normalizeCloudSourceKind } from '@/lib/cloud-source';
import { getOneDriveAccessToken, getDropboxAccessToken } from '@/lib/runtime-settings';
import { listOneDriveAudioFiles } from '@/lib/onedrive-files';
import { listDropboxAudioFiles } from '@/lib/dropbox-files';
import { appendClientDiagnosticLog, logServerEvent } from '@/lib/app-log';
import { maskValue } from '@/lib/auth-log';

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
    const accessTokenResult = provider === 'onedrive'
      ? await getOneDriveAccessToken()
      : await getDropboxAccessToken();
    const accessToken = accessTokenResult.accessToken;
    const scopes = Array.isArray(accessTokenResult.auth.scopes) ? accessTokenResult.auth.scopes : [];
    const authSummary = {
      provider,
      hasAccessToken: Boolean(accessToken),
      hasRefreshToken: Boolean(accessTokenResult.auth.refreshToken),
      accessTokenExpiresAt: accessTokenResult.auth.accessTokenExpiresAt ?? null,
      scopeCount: scopes.length,
      scopes,
      authIdMasked: maskValue(accessTokenResult.auth.id),
      email: accessTokenResult.auth.email ?? null,
      name: accessTokenResult.auth.name ?? null,
      emailVerified: accessTokenResult.auth.emailVerified ?? null,
      authUpdatedAt: accessTokenResult.auth.updatedAt ?? null,
      folderId: folderId || null,
      search: search || null,
      limit,
      pageToken: pageToken || null,
    };
    void logServerEvent({
      level: 'info',
      category: 'cloud-file-list',
      message: `[cloud-file-list:${provider}] ${JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'audio_files_request',
        ...authSummary,
      })}`,
      context: {
        event: 'audio_files_request',
        ...authSummary,
      },
      alsoConsole: true,
    }).catch(() => {});
    await appendClientDiagnosticLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      source: 'renderer',
      category: `cloud-file-list-${provider}`,
      message: `${provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} file request queued.`,
      context: authSummary,
    }).catch(() => {});
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
