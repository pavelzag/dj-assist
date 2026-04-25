import { NextRequest, NextResponse } from 'next/server';
import {
  applyGoogleOauthCredentialsToEnv,
  effectiveGoogleOauthCredentials,
  saveGoogleOauthSettings,
} from '@/lib/runtime-settings';

export const runtime = 'nodejs';

export async function GET() {
  const googleOauth = await effectiveGoogleOauthCredentials();
  if (googleOauth.credentials) applyGoogleOauthCredentialsToEnv(googleOauth.credentials);
  return NextResponse.json({
    ok: true,
    googleOauth: googleOauth.summary,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const incomingClientId = String(body.clientId ?? '').trim();
  const incomingClientSecret = String(body.clientSecret ?? '').trim();
  const existingCredentials = (await effectiveGoogleOauthCredentials()).credentials;
  const clientId = incomingClientId || String(existingCredentials?.clientId ?? '').trim();
  const clientSecret = incomingClientSecret || String(existingCredentials?.clientSecret ?? '').trim();

  if (!clientId) {
    return NextResponse.json({
      ok: false,
      error: 'Google Client ID is required.',
    }, { status: 400 });
  }

  const credentials = clientSecret ? { clientId, clientSecret } : { clientId };
  await saveGoogleOauthSettings(credentials);
  applyGoogleOauthCredentialsToEnv(credentials);
  const googleOauth = await effectiveGoogleOauthCredentials();

  return NextResponse.json({
    ok: true,
    googleOauth: googleOauth.summary,
  });
}
