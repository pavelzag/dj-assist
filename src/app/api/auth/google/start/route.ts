import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for Google sign-in.',
    }, { status: 500 });
  }

  const state = randomBytes(24).toString('hex');
  const redirectUri = new URL('/api/auth/google/callback', request.url).toString();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');

  const response = NextResponse.redirect(url);
  response.cookies.set('dj_assist_google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return response;
}
