import { randomBytes } from 'node:crypto';

export function createLoopbackRedirectUri(port: number): string {
  return `http://127.0.0.1:${port}/`;
}

export function createGoogleDesktopAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  challenge: string;
}): URL {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', input.state);
  url.searchParams.set('nonce', input.nonce);
  url.searchParams.set('code_challenge', input.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');
  return url;
}

export async function exchangeGoogleDesktopAuthCode(input: {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri: string;
}) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.clientId,
      code: input.code,
      code_verifier: input.verifier,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri,
    }).toString(),
    cache: 'no-store',
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw.trim() || `${response.status} ${response.statusText}`);
  }

  const tokens = JSON.parse(raw) as Record<string, unknown>;
  return {
    accessToken: String(tokens.access_token ?? '').trim() || null,
    idToken: String(tokens.id_token ?? '').trim() || null,
    refreshToken: String(tokens.refresh_token ?? '').trim() || null,
    scope: String(tokens.scope ?? '').trim() || null,
  };
}

export function createDesktopAuthState() {
  return {
    state: randomBytes(24).toString('hex'),
    verifier: randomBytes(48).toString('base64url'),
    nonce: randomBytes(24).toString('base64url'),
  };
}
