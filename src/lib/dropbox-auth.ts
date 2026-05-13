import { createLoopbackRedirectUri, createDesktopAuthState, createPkceChallenge } from '@/lib/desktop-oauth';

export const DROPBOX_AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize';
export const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
export const DROPBOX_USERINFO_URL = 'https://api.dropboxapi.com/2/openid/userinfo';
export const DROPBOX_SCOPES = [
  'openid',
  'profile',
  'email',
  'files.metadata.read',
  'files.content.read',
];

export function createDropboxDesktopAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): URL {
  const url = new URL(DROPBOX_AUTHORIZE_URL);
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', DROPBOX_SCOPES.join(' '));
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('token_access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url;
}

export async function exchangeDropboxAuthCode(input: {
  clientId: string;
  clientSecret?: string;
  code: string;
  verifier: string;
  redirectUri: string;
}) {
  return exchangeDropboxToken({
    body: new URLSearchParams({
      client_id: input.clientId,
      ...(String(input.clientSecret ?? '').trim() ? { client_secret: String(input.clientSecret ?? '').trim() } : {}),
      code: input.code,
      code_verifier: input.verifier,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri,
    }).toString(),
  });
}

export async function refreshDropboxAccessToken(input: {
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
}) {
  return exchangeDropboxToken({
    body: new URLSearchParams({
      client_id: input.clientId,
      ...(String(input.clientSecret ?? '').trim() ? { client_secret: String(input.clientSecret ?? '').trim() } : {}),
      refresh_token: input.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
}

async function exchangeDropboxToken(input: { body: string }) {
  const response = await fetch(DROPBOX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: input.body,
    cache: 'no-store',
  });
  const raw = await response.text();
  let payload: Record<string, unknown> | null = null;
  try {
    payload = raw ? JSON.parse(raw) as Record<string, unknown> : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(String(payload?.error_description ?? payload?.error ?? raw ?? 'Dropbox token exchange failed.'));
  }
  return {
    accessToken: String(payload?.access_token ?? '').trim() || null,
    refreshToken: String(payload?.refresh_token ?? '').trim() || null,
    scope: String(payload?.scope ?? '').trim() || null,
    expiresIn: Number(payload?.expires_in ?? 0) || null,
    idToken: String(payload?.id_token ?? '').trim() || null,
  };
}

export async function fetchDropboxProfile(accessToken: string): Promise<{
  id: string;
  email?: string;
  name?: string;
  picture?: string;
}> {
  const response = await fetch(DROPBOX_USERINFO_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const raw = await response.text();
  let payload: Record<string, unknown> | null = null;
  try {
    payload = raw ? JSON.parse(raw) as Record<string, unknown> : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(String(payload?.error_summary ?? payload?.error ?? raw ?? 'Could not load Dropbox account.'));
  }
  return {
    id: String(payload?.account_id ?? payload?.sub ?? '').trim() || 'dropbox-account',
    email: String(payload?.email ?? '').trim() || undefined,
    name: [payload?.given_name, payload?.family_name].map((part) => String(part ?? '').trim()).filter(Boolean).join(' ') || undefined,
    picture: undefined,
  };
}

export { createLoopbackRedirectUri, createDesktopAuthState, createPkceChallenge };
