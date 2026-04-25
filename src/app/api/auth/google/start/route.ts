import { NextRequest, NextResponse } from 'next/server';
import {
  createNonce,
  createOauthState,
  createPkceChallenge,
  createPkceVerifier,
} from '@/lib/google-auth';
import {
  applyGoogleOauthCredentialsToEnv,
  effectiveGoogleOauthCredentials,
  savePendingGoogleAuthSession,
} from '@/lib/runtime-settings';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const googleOauth = await effectiveGoogleOauthCredentials();
  if (googleOauth.credentials) applyGoogleOauthCredentialsToEnv(googleOauth.credentials);
  const clientId = String(googleOauth.credentials?.clientId ?? '').trim();
  if (!clientId) {
    return redirectWithMessage(request, 'Google sign-in is not configured.');
  }

  const state = createOauthState();
  const verifier = createPkceVerifier();
  const challenge = createPkceChallenge(verifier);
  const nonce = createNonce();
  const redirectUri = new URL('/api/auth/google/callback', request.url).toString();
  await savePendingGoogleAuthSession({
    state,
    verifier,
    nonce,
  });

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');

  return NextResponse.redirect(url, { headers: { 'Cache-Control': 'no-store' } });
}

function redirectWithMessage(request: NextRequest, message: string) {
  const url = new URL('/', request.url);
  url.searchParams.set('auth', message);
  return NextResponse.redirect(url, { headers: { 'Cache-Control': 'no-store' } });
}
