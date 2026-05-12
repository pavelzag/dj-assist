import { NextRequest, NextResponse } from 'next/server';
import { googleFeaturesEnabled } from '@/lib/app-flavor';
import {
  applyDropboxOauthCredentialsToEnv,
  applyOneDriveOauthCredentialsToEnv,
  effectiveDropboxOauthCredentials,
  effectiveOneDriveOauthCredentials,
  saveDropboxOauthSettings,
  saveOneDriveOauthSettings,
} from '@/lib/runtime-settings';
import { normalizeCloudSourceKind } from '@/lib/cloud-source';

export const runtime = 'nodejs';

function unsupported(provider: string) {
  return NextResponse.json({ ok: false, error: `Unsupported cloud provider: ${provider}` }, { status: 404 });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: rawProvider } = await context.params;
  const provider = normalizeCloudSourceKind(rawProvider);
  if (!provider || provider === 'google_drive') {
    return unsupported(rawProvider);
  }
  if (!googleFeaturesEnabled()) {
    return NextResponse.json({ ok: false, error: 'Unavailable in this app version.' }, { status: 404 });
  }

  const oauth = provider === 'onedrive'
    ? await effectiveOneDriveOauthCredentials()
    : await effectiveDropboxOauthCredentials();
  if (provider === 'onedrive' && oauth.credentials) applyOneDriveOauthCredentialsToEnv(oauth.credentials);
  if (provider === 'dropbox' && oauth.credentials) applyDropboxOauthCredentialsToEnv(oauth.credentials);

  return NextResponse.json({
    ok: true,
    provider,
    oauth: oauth.summary,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: rawProvider } = await context.params;
  const provider = normalizeCloudSourceKind(rawProvider);
  if (!provider || provider === 'google_drive') {
    return unsupported(rawProvider);
  }
  if (!googleFeaturesEnabled()) {
    return NextResponse.json({ ok: false, error: 'Unavailable in this app version.' }, { status: 404 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const clientId = String(body.clientId ?? '').trim();
  const clientSecret = String(body.clientSecret ?? '').trim();
  if (!clientId) {
    return NextResponse.json({ ok: false, error: `${provider === 'onedrive' ? 'OneDrive' : 'Dropbox'} Client ID is required.` }, { status: 400 });
  }
  const credentials = { clientId, ...(clientSecret ? { clientSecret } : {}) };
  if (provider === 'onedrive') {
    await saveOneDriveOauthSettings(credentials);
    applyOneDriveOauthCredentialsToEnv(credentials);
    const oauth = await effectiveOneDriveOauthCredentials();
    return NextResponse.json({ ok: true, provider, oauth: oauth.summary });
  }
  await saveDropboxOauthSettings(credentials);
  applyDropboxOauthCredentialsToEnv(credentials);
  const oauth = await effectiveDropboxOauthCredentials();
  return NextResponse.json({ ok: true, provider, oauth: oauth.summary });
}
