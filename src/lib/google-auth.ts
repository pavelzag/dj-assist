import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

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
  const { payload } = await jwtVerify(input.token, GOOGLE_JWKS, {
    algorithms: ['RS256'],
    audience: input.clientId,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
  });

  if (String(payload.nonce ?? '') !== input.nonce) {
    throw new Error('Google sign-in returned an invalid nonce.');
  }

  const sub = normalizeRequiredString(payload.sub, 'Google sign-in returned no account ID.');
  return {
    sub,
    email: normalizeOptionalString(payload.email),
    emailVerified: typeof payload.email_verified === 'boolean' ? payload.email_verified : undefined,
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
