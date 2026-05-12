import { createLoopbackRedirectUri, createDesktopAuthState, createPkceChallenge } from '@/lib/desktop-oauth';

export const ONEDRIVE_AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
export const ONEDRIVE_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Files.Read',
];

export function createOneDriveDesktopAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): URL {
  const url = new URL(`${ONEDRIVE_AUTHORITY}/authorize`);
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', ONEDRIVE_SCOPES.join(' '));
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account consent');
  return url;
}

export async function exchangeOneDriveAuthCode(input: {
  clientId: string;
  clientSecret?: string;
  code: string;
  verifier: string;
  redirectUri: string;
}) {
  return exchangeOneDriveToken({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
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

export async function refreshOneDriveAccessToken(input: {
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
}) {
  return exchangeOneDriveToken({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    body: new URLSearchParams({
      client_id: input.clientId,
      ...(String(input.clientSecret ?? '').trim() ? { client_secret: String(input.clientSecret ?? '').trim() } : {}),
      refresh_token: input.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
}

async function exchangeOneDriveToken(input: {
  clientId: string;
  clientSecret?: string;
  body: string;
}) {
  const response = await fetch(`${ONEDRIVE_AUTHORITY}/token`, {
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
    throw new Error(String(payload?.error_description ?? payload?.error ?? raw ?? 'OneDrive token exchange failed.'));
  }
  return {
    accessToken: String(payload?.access_token ?? '').trim() || null,
    refreshToken: String(payload?.refresh_token ?? '').trim() || null,
    scope: String(payload?.scope ?? '').trim() || null,
    expiresIn: Number(payload?.expires_in ?? 0) || null,
    idToken: String(payload?.id_token ?? '').trim() || null,
  };
}

export async function fetchOneDriveProfile(accessToken: string): Promise<{
  id: string;
  email?: string;
  name?: string;
  picture?: string;
}> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', {
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
    const error = payload?.error as Record<string, unknown> | undefined;
    throw new Error(String(error?.message ?? payload?.error ?? raw ?? 'Could not load OneDrive account.'));
  }
  return {
    id: String(payload?.id ?? '').trim() || 'onedrive-account',
    email: String(payload?.mail ?? payload?.userPrincipalName ?? '').trim() || undefined,
    name: String(payload?.displayName ?? '').trim() || undefined,
  };
}

export { createLoopbackRedirectUri, createDesktopAuthState, createPkceChallenge };
