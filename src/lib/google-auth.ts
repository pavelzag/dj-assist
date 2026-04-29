import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

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
  const { status, raw } = await httpsGet(
    'oauth2.googleapis.com',
    `/tokeninfo?id_token=${encodeURIComponent(input.token)}`,
  );
  console.log(`[google-auth] tokeninfo status=${status} raw_length=${raw.length} raw_preview=${raw.slice(0, 120)}`);
  if (status < 200 || status >= 300) {
    throw new Error(raw.trim() || 'Google sign-in could not be verified.');
  }

  const payload = JSON.parse(raw) as Record<string, unknown>;
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

function httpsGet(hostname: string, path: string): Promise<{ status: number; raw: string }> {
  const proxyPort = process.env.DJ_ASSIST_GOOGLE_PROXY_PORT?.trim();
  if (proxyPort) {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: parseInt(proxyPort, 10), path, method: 'GET' }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', async () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (shouldRetryDirect(res.statusCode ?? 0, raw)) {
            console.warn(`[google-auth] proxy tokeninfo request failed on port=${proxyPort}; retrying direct HTTPS`);
            try {
              resolve(await directHttpsGet(hostname, path));
              return;
            } catch (error) {
              reject(error);
              return;
            }
          }
          resolve({ status: res.statusCode ?? 0, raw });
        });
      });
      req.on('error', async (error) => {
        console.warn(`[google-auth] proxy tokeninfo request error on port=${proxyPort}; retrying direct HTTPS: ${error.message}`);
        try {
          resolve(await directHttpsGet(hostname, path));
        } catch (directError) {
          reject(directError);
        }
      });
      req.end();
    });
  }
  return directHttpsGet(hostname, path);
}

function directHttpsGet(hostname: string, path: string): Promise<{ status: number; raw: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET' }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, raw: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

function shouldRetryDirect(status: number, raw: string): boolean {
  if (status !== 502) return false;
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    return String(payload.error ?? '').trim() === 'proxy_error';
  } catch {
    return false;
  }
}
