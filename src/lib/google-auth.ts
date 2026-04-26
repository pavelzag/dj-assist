import { createHash, randomBytes } from 'node:crypto';

export const GOOGLE_OAUTH_STATE_COOKIE = 'dj_assist_google_oauth_state';
export const GOOGLE_OAUTH_VERIFIER_COOKIE = 'dj_assist_google_oauth_verifier';
export const GOOGLE_OAUTH_NONCE_COOKIE = 'dj_assist_google_oauth_nonce';

export type GoogleIdentity = {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
};

export function googleClientId(): string {
  return process.env.GOOGLE_CLIENT_ID?.trim() ?? '';
}

export function googleAuthConfigured(): boolean {
  return Boolean(googleClientId());
}

export function createOauthState(): string {
  return randomBytes(24).toString('hex');
}

export function createPkceVerifier(): string {
  return randomBytes(48).toString('base64url');
}

export function createNonce(): string {
  return randomBytes(24).toString('base64url');
}

export function createPkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export async function verifyGoogleIdToken(input: {
  token: string;
  clientId: string;
  nonce: string;
}): Promise<GoogleIdentity> {
  const url = new URL('https://oauth2.googleapis.com/tokeninfo');
  url.searchParams.set('id_token', input.token);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw.trim() || 'Google sign-in could not be verified.');
  }

  const payload = await response.json() as Record<string, unknown>;
  const audience = normalizeRequiredString(payload.aud, 'Google sign-in returned no audience.');
  if (audience !== input.clientId) {
    throw new Error('Google sign-in returned an unexpected audience.');
  }

  const issuer = normalizeRequiredString(payload.iss, 'Google sign-in returned no issuer.');
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(issuer)) {
    throw new Error('Google sign-in returned an unexpected issuer.');
  }

  if (String(payload.nonce ?? '') !== input.nonce) {
    throw new Error('Google sign-in returned an invalid nonce.');
  }

  const sub = normalizeRequiredString(payload.sub, 'Google sign-in returned no account ID.');
  return {
    sub,
    email: normalizeOptionalString(payload.email),
    emailVerified: ['true', '1'].includes(String(payload.email_verified ?? '').toLowerCase()),
    name: normalizeOptionalString(payload.name),
    picture: normalizeOptionalString(payload.picture),
  };
}

export function stringOrUndefined(value: unknown): string | undefined {
  return normalizeOptionalString(value);
}

function normalizeRequiredString(value: unknown, message: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) throw new Error(message);
  return normalized;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}
