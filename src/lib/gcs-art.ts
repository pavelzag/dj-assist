import { createHash, createSign } from 'node:crypto';
import { promises as fs } from 'node:fs';

// Service account credentials accepted from:
//   DJ_ASSIST_GCS_SERVICE_ACCOUNT_JSON  – inline JSON string (preferred for Electron)
//   GOOGLE_APPLICATION_CREDENTIALS      – path to a JSON key file (standard ADC)
// GCS target:
//   DJ_ASSIST_GCS_BUCKET   – required
//   DJ_ASSIST_GCS_PREFIX   – optional object prefix (default: "album-art")
//   DJ_ASSIST_GCS_PUBLIC_BASE_URL – optional custom base URL

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type TokenCache = { token: string; expiresAt: number };
let _tokenCache: TokenCache | null = null;

export function gcsEnabled(): boolean {
  return Boolean(process.env.DJ_ASSIST_GCS_BUCKET?.trim());
}

function gcsBucket(): string {
  return (process.env.DJ_ASSIST_GCS_BUCKET ?? '').trim();
}

function gcsPrefix(): string {
  return (process.env.DJ_ASSIST_GCS_PREFIX ?? 'album-art').trim().replace(/^\/|\/$/g, '');
}

function gcsPublicBaseUrl(): string {
  const explicit = (process.env.DJ_ASSIST_GCS_PUBLIC_BASE_URL ?? '').trim().replace(/\/$/, '');
  return explicit || `https://storage.googleapis.com/${gcsBucket()}`;
}

async function loadServiceAccount(): Promise<ServiceAccount> {
  // Preferred for Vercel: base64-encoded JSON avoids newline mangling in the UI.
  const b64 = (process.env.DJ_ASSIST_GCS_SERVICE_ACCOUNT_JSON_BASE64 ?? '').trim();
  if (b64) {
    const parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as ServiceAccount;
    if (parsed.client_email && parsed.private_key) return parsed;
  }
  // Fallback: raw JSON string (fine for .env files where newlines are preserved).
  const inline = (process.env.DJ_ASSIST_GCS_SERVICE_ACCOUNT_JSON ?? '').trim();
  if (inline) {
    const parsed = JSON.parse(inline) as ServiceAccount;
    if (parsed.client_email && parsed.private_key) return parsed;
  }
  // Fallback: file path (standard ADC for local dev).
  const keyPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '').trim();
  if (keyPath) {
    const raw = await fs.readFile(keyPath, 'utf8');
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (parsed.client_email && parsed.private_key) return parsed;
  }
  throw new Error(
    'GCS service account credentials are not configured. ' +
    'Set DJ_ASSIST_GCS_SERVICE_ACCOUNT_JSON_BASE64, DJ_ASSIST_GCS_SERVICE_ACCOUNT_JSON, or GOOGLE_APPLICATION_CREDENTIALS.',
  );
}

function signJwt(account: ServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.read_write',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');
  const unsigned = `${header}.${claims}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
  return `${unsigned}.${sig}`;
}

async function getAccessToken(): Promise<string> {
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 60_000) return _tokenCache.token;
  const account = await loadServiceAccount();
  const jwt = signJwt(account);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GCS token exchange failed (${res.status})`);
  const payload = await res.json() as Record<string, unknown>;
  const token = String(payload.access_token ?? '').trim();
  if (!token) throw new Error('GCS token exchange returned no access_token');
  _tokenCache = { token, expiresAt: Date.now() + (Number(payload.expires_in ?? 3600) - 120) * 1000 };
  return token;
}

function mimeToExtension(mime: string): string {
  const m = mime.toLowerCase().split(';')[0].trim();
  if (m === 'image/jpeg') return '.jpg';
  if (m === 'image/png') return '.png';
  if (m === 'image/webp') return '.webp';
  if (m === 'image/gif') return '.gif';
  if (m === 'image/avif') return '.avif';
  return '.bin';
}

function parseDataUri(uri: string): { data: Buffer; contentType: string } {
  const [header, payload] = uri.split(',', 2);
  if (!header?.startsWith('data:') || !payload) throw new Error('Invalid data URI');
  const meta = header.slice(5);
  const parts = meta.split(';');
  const contentType = parts[0].trim() || 'application/octet-stream';
  const isBase64 = parts.slice(1).some((p) => p.trim().toLowerCase() === 'base64');
  const data = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8');
  if (data.length > 12 * 1024 * 1024) throw new Error('Image exceeds 12 MB limit');
  return { data, contentType };
}

async function downloadUrl(url: string): Promise<{ data: Buffer; contentType: string }> {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Image download failed (${res.status}): ${url}`);
  const contentType = res.headers.get('content-type')?.split(';')[0].trim() ?? 'application/octet-stream';
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > 12 * 1024 * 1024) throw new Error('Image exceeds 12 MB limit');
  return { data, contentType };
}

async function objectExists(token: string, bucket: string, objectName: string): Promise<boolean> {
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  return res.status === 200;
}

async function uploadObject(
  token: string,
  bucket: string,
  objectName: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
    body: new Uint8Array(data),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GCS upload failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}

export function isGcsManagedUrl(url: string): boolean {
  const candidate = url.trim();
  if (!candidate) return false;
  const base = gcsPublicBaseUrl();
  const bucket = gcsBucket();
  return candidate.startsWith(`${base}/`) || candidate.startsWith(`gs://${bucket}/`);
}

// Upload any art URL (HTTP/S or data: URI) to GCS and return the public GCS URL.
// Skips upload if the object already exists (content-hash deduplication).
// Returns null if GCS is not configured or if the upload fails.
export async function uploadArtToGcs(sourceUrl: string): Promise<string | null> {
  if (!gcsEnabled()) return null;
  if (!sourceUrl?.trim()) return null;
  if (isGcsManagedUrl(sourceUrl)) return sourceUrl;

  let data: Buffer;
  let contentType: string;

  if (sourceUrl.startsWith('data:')) {
    ({ data, contentType } = parseDataUri(sourceUrl));
  } else {
    ({ data, contentType } = await downloadUrl(sourceUrl));
  }

  const sha256 = createHash('sha256').update(data).digest('hex');
  const ext = mimeToExtension(contentType);
  const prefix = gcsPrefix();
  const objectName = prefix ? `${prefix}/${sha256}${ext}` : `${sha256}${ext}`;
  const publicUrl = `${gcsPublicBaseUrl()}/${objectName}`;

  const token = await getAccessToken();

  // Skip upload if already stored (same hash = same bytes).
  const exists = await objectExists(token, gcsBucket(), objectName);
  if (!exists) {
    await uploadObject(token, gcsBucket(), objectName, data, contentType);
  }

  return publicUrl;
}
