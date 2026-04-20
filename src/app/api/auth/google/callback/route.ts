import { NextRequest, NextResponse } from 'next/server';
import { saveGoogleAuth } from '@/lib/runtime-settings';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code') ?? '';
  const state = searchParams.get('state') ?? '';
  const expectedState = request.cookies.get('dj_assist_google_oauth_state')?.value ?? '';

  if (!clientId || !clientSecret) {
    return redirectWithMessage(request, 'Google sign-in is not configured.');
  }

  if (!code || !state || state !== expectedState) {
    return redirectWithMessage(request, 'Google sign-in could not be verified.');
  }

  const redirectUri = new URL('/api/auth/google/callback', request.url).toString();
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
    cache: 'no-store',
  });

  if (!tokenResponse.ok) {
    return redirectWithMessage(request, 'Google sign-in failed.');
  }

  const tokens = await tokenResponse.json() as Record<string, unknown>;
  const idToken = String(tokens.id_token ?? '');
  const payload = parseJwtPayload(idToken);
  const id = String(payload.sub ?? '').trim();

  if (!id || !idToken) {
    return redirectWithMessage(request, 'Google sign-in returned no user identity.');
  }

  await saveGoogleAuth({
    id,
    email: stringOrUndefined(payload.email),
    name: stringOrUndefined(payload.name),
    picture: stringOrUndefined(payload.picture),
    idToken,
  });

  return redirectWithMessage(request, 'Google sign-in connected.');
}

function redirectWithMessage(request: NextRequest, message: string) {
  const url = new URL('/', request.url);
  url.searchParams.set('auth', message);
  const response = NextResponse.redirect(url);
  response.cookies.delete('dj_assist_google_oauth_state');
  return response;
}

function parseJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1] ?? '';
  if (!part) return {};
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
}

function stringOrUndefined(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}
