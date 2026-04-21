import { NextRequest, NextResponse } from 'next/server';
import {
  createNonce,
  createOauthState,
  createPkceChallenge,
  createPkceVerifier,
  GOOGLE_OAUTH_NONCE_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
  googleClientId,
} from '@/lib/google-auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const clientId = googleClientId();
  if (!clientId) {
    return redirectWithMessage(request, 'Google sign-in is not configured.');
  }

  const state = createOauthState();
  const verifier = createPkceVerifier();
  const challenge = createPkceChallenge(verifier);
  const nonce = createNonce();
  const redirectUri = new URL('/api/auth/google/callback', request.url).toString();

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

  const response = NextResponse.redirect(url, { headers: { 'Cache-Control': 'no-store' } });
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600,
  };
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(GOOGLE_OAUTH_VERIFIER_COOKIE, verifier, cookieOptions);
  response.cookies.set(GOOGLE_OAUTH_NONCE_COOKIE, nonce, cookieOptions);
  return response;
}

function redirectWithMessage(request: NextRequest, message: string) {
  const url = new URL('/', request.url);
  url.searchParams.set('auth', message);
  return NextResponse.redirect(url, { headers: { 'Cache-Control': 'no-store' } });
}
