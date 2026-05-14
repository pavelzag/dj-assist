import { NextRequest, NextResponse } from 'next/server';
import { googleFeaturesEnabled } from '@/lib/app-flavor';
import { normalizeCloudSourceKind } from '@/lib/cloud-source';
import { getDropboxAccessToken } from '@/lib/runtime-settings';
import { listDropboxFolderChildren } from '@/lib/dropbox-files';
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
  if (provider !== 'dropbox') {
    return NextResponse.json({ error: `Unsupported cloud provider: ${rawProvider}` }, { status: 404 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const parentId = String(searchParams.get('parentId') ?? '').trim();
    const search = String(searchParams.get('search') ?? '').trim();
    const limit = Math.min(Math.max(Math.trunc(Number(searchParams.get('limit') ?? 1000) || 1000), 1), 2000);
    const accessTokenResult = await getDropboxAccessToken();
    const accessToken = accessTokenResult.accessToken;
    const scopes = Array.isArray(accessTokenResult.auth.scopes) ? accessTokenResult.auth.scopes : [];
    const authSummary = {
      provider: 'dropbox',
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
      parentId: parentId || null,
      search: search || null,
      limit,
    };
    void logServerEvent({
      level: 'info',
      category: 'cloud-folder',
      message: `[cloud-folder:dropbox] ${JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'folder_children_request',
        ...authSummary,
      })}`,
      context: {
        event: 'folder_children_request',
        ...authSummary,
      },
      alsoConsole: true,
    }).catch(() => {});
    await appendClientDiagnosticLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      source: 'renderer',
      category: 'cloud-folder-dropbox',
      message: 'Dropbox folder request queued.',
      context: authSummary,
    }).catch(() => {});
    const payload = await listDropboxFolderChildren({ accessToken, parentId, search, limit });
    return NextResponse.json({
      provider: 'dropbox',
      parentId: parentId || null,
      folders: payload.folders,
      files: payload.files,
      truncated: payload.truncated,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
