import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { googleAuthConfigured } from '@/lib/google-auth';
import { GOOGLE_DRIVE_METADATA_SCOPE } from '@/lib/google-desktop-auth';

export type SpotifyCredentials = {
  clientId: string;
  clientSecret: string;
};

export type GoogleOauthCredentials = {
  clientId: string;
  clientSecret?: string;
};

type RuntimeSettings = {
  spotify?: SpotifyCredentials & {
    updatedAt?: string;
  };
  googleOauth?: GoogleOauthCredentials & {
    updatedAt?: string;
  };
  server?: ServerSettings;
  auth?: AuthSettings;
  pendingGoogleAuth?: PendingGoogleAuthSession;
  clientId?: string;
};

export type ServerSettings = {
  enabled: boolean;
  localDebug: boolean;
  serverUrl: string;
  localServerUrl: string;
  updatedAt?: string;
};

export type AuthSettings = {
  provider: 'google';
  id: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
  idToken: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  refreshToken?: string;
  scopes?: string[];
  updatedAt?: string;
};

export type PendingGoogleAuthSession = {
  state: string;
  verifier: string;
  nonce: string;
  createdAt: string;
};

export type UserData = {
  type: 'google' | 'anonymous';
  id: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
  google_id_token?: string;
  google_access_token?: string;
};

export type SpotifySettingsSummary = {
  configured: boolean;
  source: 'saved' | 'env' | 'none';
  client_id_masked: string | null;
  has_secret: boolean;
  missing: string[];
};

export type GoogleOauthSettingsSummary = {
  configured: boolean;
  source: 'saved' | 'env' | 'none';
  client_id_masked: string | null;
  has_secret: boolean;
  missing: string[];
};

export type GoogleOauthDiagnostics = {
  settings_path: string;
  cwd: string;
  env_client_id_masked: string | null;
  env_has_secret: boolean;
  saved_client_id_masked: string | null;
  saved_has_secret: boolean;
  env_saved_client_id_match: boolean;
  effective: GoogleOauthSettingsSummary & {
    effective_secret_from: 'env' | 'saved' | 'none';
    effective_client_id_matches_saved: boolean;
  };
};

const DEFAULT_PRODUCTION_SERVER_URL = 'https://dj-assist-server.vercel.app';
const DEFAULT_LOCAL_SERVER_URL = 'http://localhost:3001';

function envBoolean(name: string): boolean | undefined {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return undefined;
}

function settingsDirectory(): string {
  return process.env.DJ_ASSIST_CONFIG_DIR?.trim() || path.join(homedir(), '.dj_assist');
}

export function runtimeSettingsPath(): string {
  return path.join(settingsDirectory(), 'dj-assist-settings.json');
}

async function ensureSettingsDirectory() {
  await fs.mkdir(settingsDirectory(), { recursive: true });
}

export async function loadRuntimeSettings(): Promise<RuntimeSettings> {
  try {
    const raw = await fs.readFile(runtimeSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw) as RuntimeSettings;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveRuntimeSettings(next: RuntimeSettings): Promise<void> {
  await ensureSettingsDirectory();
  await fs.writeFile(runtimeSettingsPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

export async function getClientId(): Promise<string> {
  const current = await loadRuntimeSettings();
  const existing = String(current.clientId ?? '').trim();
  if (existing) return existing;
  const clientId = `client_${randomUUID()}`;
  await saveRuntimeSettings({ ...current, clientId });
  return clientId;
}

export function defaultServerSettings(): ServerSettings {
  return {
    enabled: envBoolean('DJ_ASSIST_SERVER_ENABLED') ?? true,
    localDebug: envBoolean('DJ_ASSIST_SERVER_LOCAL_DEBUG') ?? false,
    serverUrl: process.env.DJ_ASSIST_SERVER_URL?.trim() || DEFAULT_PRODUCTION_SERVER_URL,
    localServerUrl: process.env.DJ_ASSIST_LOCAL_SERVER_URL?.trim() || DEFAULT_LOCAL_SERVER_URL,
  };
}

export async function effectiveServerSettings(): Promise<ServerSettings> {
  const settings = await loadRuntimeSettings();
  const resolved = {
    ...defaultServerSettings(),
    ...settings.server,
  };
  const envEnabled = envBoolean('DJ_ASSIST_SERVER_ENABLED');
  const envLocalDebug = envBoolean('DJ_ASSIST_SERVER_LOCAL_DEBUG');
  const envServerUrl = process.env.DJ_ASSIST_SERVER_URL?.trim();
  const envLocalServerUrl = process.env.DJ_ASSIST_LOCAL_SERVER_URL?.trim();
  if (envEnabled !== undefined) resolved.enabled = envEnabled;
  if (envLocalDebug !== undefined) resolved.localDebug = envLocalDebug;
  if (envServerUrl) resolved.serverUrl = envServerUrl;
  if (envLocalServerUrl) resolved.localServerUrl = envLocalServerUrl;

  const savedServerUrl = String(settings.server?.serverUrl ?? '').trim();
  const savedLocalServerUrl = String(settings.server?.localServerUrl ?? '').trim();
  const looksLikeLegacyLocalSelection =
    settings.server?.localDebug === true &&
    (!savedServerUrl || savedServerUrl === DEFAULT_PRODUCTION_SERVER_URL) &&
    (!savedLocalServerUrl || savedLocalServerUrl === DEFAULT_LOCAL_SERVER_URL);

  if (!envServerUrl && !envLocalServerUrl && envLocalDebug === undefined && looksLikeLegacyLocalSelection) {
    resolved.localDebug = false;
    resolved.serverUrl = DEFAULT_PRODUCTION_SERVER_URL;
    resolved.localServerUrl = DEFAULT_LOCAL_SERVER_URL;
  }

  return resolved;
}

export async function saveServerSettings(input: Partial<ServerSettings>): Promise<ServerSettings> {
  const current = await loadRuntimeSettings();
  const existing = await effectiveServerSettings();
  const next: ServerSettings = {
    ...existing,
    enabled: input.enabled ?? existing.enabled,
    localDebug: input.localDebug ?? existing.localDebug,
    serverUrl: String(input.serverUrl ?? existing.serverUrl).trim() || existing.serverUrl,
    localServerUrl: String(input.localServerUrl ?? existing.localServerUrl).trim() || existing.localServerUrl,
    updatedAt: new Date().toISOString(),
  };
  await saveRuntimeSettings({ ...current, server: next });
  return next;
}

export async function saveGoogleAuth(auth: Omit<AuthSettings, 'provider' | 'updatedAt'>): Promise<AuthSettings> {
  const current = await loadRuntimeSettings();
  const existing = current.auth?.provider === 'google' ? current.auth : null;
  const next: AuthSettings = {
    provider: 'google',
    ...(existing ?? {}),
    ...auth,
    accessToken: auth.accessToken ?? existing?.accessToken,
    accessTokenExpiresAt: auth.accessTokenExpiresAt ?? existing?.accessTokenExpiresAt,
    refreshToken: auth.refreshToken ?? existing?.refreshToken,
    scopes: auth.scopes ?? existing?.scopes,
    updatedAt: new Date().toISOString(),
  };
  await saveRuntimeSettings({ ...current, auth: next });
  return next;
}

export async function clearAuthSettings(): Promise<void> {
  const current = await loadRuntimeSettings();
  const next = { ...current };
  delete next.auth;
  await saveRuntimeSettings(next);
}

export async function savePendingGoogleAuthSession(session: Omit<PendingGoogleAuthSession, 'createdAt'>): Promise<void> {
  const current = await loadRuntimeSettings();
  await saveRuntimeSettings({
    ...current,
    pendingGoogleAuth: {
      ...session,
      createdAt: new Date().toISOString(),
    },
  });
}

export async function loadPendingGoogleAuthSession(): Promise<PendingGoogleAuthSession | null> {
  const current = await loadRuntimeSettings();
  const session = current.pendingGoogleAuth;
  if (!session?.state || !session.verifier || !session.nonce) return null;
  return session;
}

export async function clearPendingGoogleAuthSession(): Promise<void> {
  const current = await loadRuntimeSettings();
  if (!current.pendingGoogleAuth) return;
  const next = { ...current };
  delete next.pendingGoogleAuth;
  await saveRuntimeSettings(next);
}

export async function effectiveUserData(): Promise<UserData> {
  const settings = await loadRuntimeSettings();
  let auth = settings.auth;
  if (auth?.provider === 'google' && auth.id) {
    if (!isUsableGoogleAuth(auth) && auth.refreshToken) {
      const refreshedAuth = await refreshGoogleAuth(auth);
      auth = refreshedAuth ?? auth;
    }
    if (!auth || !isUsableGoogleAuth(auth)) {
      await clearAuthSettings();
      return {
        type: 'anonymous',
        id: await getClientId(),
      };
    }
    return {
      type: 'google',
      id: auth.id,
      email: auth.email,
      emailVerified: auth.emailVerified,
      name: auth.name,
      picture: auth.picture,
      google_id_token: hasUsableGoogleIdToken(auth) ? auth.idToken : undefined,
      google_access_token: hasUsableGoogleAccessToken(auth) ? auth.accessToken : undefined,
    };
  }
  return {
    type: 'anonymous',
    id: await getClientId(),
  };
}

function isUsableGoogleAuth(auth: AuthSettings): boolean {
  return hasUsableGoogleIdToken(auth) || hasUsableGoogleAccessToken(auth);
}

function hasUsableGoogleIdToken(auth: AuthSettings): boolean {
  const token = String(auth.idToken ?? '').trim();
  if (!token) return false;
  const expiresAt = googleIdTokenExpiresAt(token);
  if (!expiresAt) return false;
  return expiresAt > Date.now() + 30_000;
}

function hasUsableGoogleAccessToken(auth: AuthSettings): boolean {
  const token = String(auth.accessToken ?? '').trim();
  if (!token) return false;
  const expiresAt = Date.parse(String(auth.accessTokenExpiresAt ?? ''));
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt > Date.now() + 30_000;
}

function authScopes(auth: AuthSettings): string[] {
  return Array.isArray(auth.scopes)
    ? auth.scopes.filter((scope): scope is string => typeof scope === 'string' && scope.trim().length > 0)
    : [];
}

function hasGoogleDriveScope(auth: AuthSettings): boolean {
  const scopes = new Set(authScopes(auth));
  return scopes.has(GOOGLE_DRIVE_METADATA_SCOPE) || scopes.has('https://www.googleapis.com/auth/drive.readonly');
}

function computeAccessTokenExpiresAt(expiresInSeconds: unknown): string | undefined {
  const expiresIn = Number(expiresInSeconds);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return undefined;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function parseGoogleScopes(value: unknown): string[] {
  return String(value ?? '')
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

async function refreshGoogleAuth(auth: AuthSettings): Promise<AuthSettings | null> {
  const refreshToken = String(auth.refreshToken ?? '').trim();
  if (!refreshToken) return null;

  const googleOauth = await effectiveGoogleOauthCredentials();
  const clientId = String(googleOauth.credentials?.clientId ?? '').trim();
  const clientSecret = String(googleOauth.credentials?.clientSecret ?? '').trim();
  if (!clientId) return null;

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      cache: 'no-store',
    });

    if (!response.ok) return null;
    const payload = await response.json() as Record<string, unknown>;
    const next = await saveGoogleAuth({
      id: auth.id,
      email: auth.email,
      emailVerified: auth.emailVerified,
      name: auth.name,
      picture: auth.picture,
      idToken: String(payload.id_token ?? auth.idToken ?? '').trim(),
      accessToken: String(payload.access_token ?? auth.accessToken ?? '').trim() || undefined,
      accessTokenExpiresAt: computeAccessTokenExpiresAt(payload.expires_in) ?? auth.accessTokenExpiresAt,
      refreshToken,
      scopes: parseGoogleScopes(payload.scope).length ? parseGoogleScopes(payload.scope) : authScopes(auth),
    });
    return next;
  } catch {
    return null;
  }
}

export async function getGoogleDriveAccessToken(): Promise<{
  accessToken: string;
  userData: UserData;
}> {
  const settings = await loadRuntimeSettings();
  let auth = settings.auth;
  if (!auth || auth.provider !== 'google' || !auth.id) {
    throw new Error('Google sign-in is required before importing from Google Drive.');
  }
  if (!hasGoogleDriveScope(auth)) {
    throw new Error('Google Drive access has not been granted. Sign in with Google again to approve Drive metadata access.');
  }
  if (!hasUsableGoogleAccessToken(auth)) {
    const refreshedAuth = await refreshGoogleAuth(auth);
    auth = refreshedAuth ?? auth;
  }
  if (!auth || !hasUsableGoogleAccessToken(auth)) {
    throw new Error('Google Drive access token is unavailable. Sign in with Google again and retry the import.');
  }
  const userData = await effectiveUserData();
  if (userData.type !== 'google') {
    throw new Error('Google sign-in is required before importing from Google Drive.');
  }
  const accessToken = String(auth.accessToken ?? '').trim();
  if (!accessToken) {
    throw new Error('Google Drive access token is unavailable.');
  }
  return { accessToken, userData };
}

function googleIdTokenExpiresAt(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    const exp = Number(payload.exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function publicUserSummary(user: UserData) {
  return {
    type: user.type,
    id: user.id,
    email: user.email ?? null,
    emailVerified: user.emailVerified ?? null,
    name: user.name ?? null,
    picture: user.picture ?? null,
    canFetchServerData: user.type === 'google',
    hasGoogleAccessToken: Boolean(user.google_access_token),
  };
}

export async function serverRuntimeSummary() {
  const server = await effectiveServerSettings();
  const user = await effectiveUserData();
  const googleOauth = await effectiveGoogleOauthCredentials();
  const settings = await loadRuntimeSettings();
  const auth = settings.auth?.provider === 'google' ? settings.auth : null;
  return {
    ...server,
    activeUrl: server.localDebug ? server.localServerUrl : server.serverUrl,
    user: publicUserSummary(user),
    googleAuthConfigured: googleOauth.summary.configured || googleAuthConfigured(),
    googleOauth: googleOauth.summary,
    googleDrive: {
      connected: Boolean(auth && hasGoogleDriveScope(auth)),
      hasRefreshToken: Boolean(auth?.refreshToken),
      scopes: auth ? authScopes(auth) : [],
    },
  };
}

export async function saveSpotifySettings(credentials: SpotifyCredentials): Promise<void> {
  await ensureSettingsDirectory();
  const current = await loadRuntimeSettings();
  const next: RuntimeSettings = {
    ...current,
    spotify: {
      clientId: credentials.clientId.trim(),
      clientSecret: credentials.clientSecret.trim(),
      updatedAt: new Date().toISOString(),
    },
  };
  await fs.writeFile(runtimeSettingsPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

export async function saveGoogleOauthSettings(credentials: GoogleOauthCredentials): Promise<void> {
  await ensureSettingsDirectory();
  const current = await loadRuntimeSettings();
  const clientSecret = String(credentials.clientSecret ?? '').trim();
  const next: RuntimeSettings = {
    ...current,
    googleOauth: {
      clientId: credentials.clientId.trim(),
      ...(clientSecret ? { clientSecret } : {}),
      updatedAt: new Date().toISOString(),
    },
  };
  await fs.writeFile(runtimeSettingsPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

export function maskClientId(value: string | null | undefined): string | null {
  const clientId = String(value ?? '').trim();
  if (!clientId) return null;
  if (clientId.length <= 8) return `${clientId.slice(0, 2)}…${clientId.slice(-2)}`;
  return `${clientId.slice(0, 6)}…${clientId.slice(-4)}`;
}

export function applySpotifyCredentialsToEnv(credentials: Partial<SpotifyCredentials> | null | undefined) {
  const clientId = String(credentials?.clientId ?? '').trim();
  const clientSecret = String(credentials?.clientSecret ?? '').trim();
  if (clientId && clientSecret) {
    process.env.SPOTIFY_CLIENT_ID = clientId;
    process.env.SPOTIFY_CLIENT_SECRET = clientSecret;
    return;
  }
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.SPOTIFY_CLIENT_SECRET;
}

export function applyGoogleOauthCredentialsToEnv(credentials: Partial<GoogleOauthCredentials> | null | undefined) {
  const clientId = String(credentials?.clientId ?? '').trim();
  const clientSecret = String(credentials?.clientSecret ?? '').trim();
  if (clientId) process.env.GOOGLE_CLIENT_ID = clientId;
  else delete process.env.GOOGLE_CLIENT_ID;
  if (clientSecret) process.env.GOOGLE_CLIENT_SECRET = clientSecret;
  else delete process.env.GOOGLE_CLIENT_SECRET;
}

export async function effectiveSpotifyCredentials(): Promise<{
  credentials: SpotifyCredentials | null;
  summary: SpotifySettingsSummary;
}> {
  const settings = await loadRuntimeSettings();
  const savedId = String(settings.spotify?.clientId ?? '').trim();
  const savedSecret = String(settings.spotify?.clientSecret ?? '').trim();
  if (savedId && savedSecret) {
    return {
      credentials: { clientId: savedId, clientSecret: savedSecret },
      summary: {
        configured: true,
        source: 'saved',
        client_id_masked: maskClientId(savedId),
        has_secret: true,
        missing: [],
      },
    };
  }

  const envId = String(process.env.SPOTIFY_CLIENT_ID ?? '').trim();
  const envSecret = String(process.env.SPOTIFY_CLIENT_SECRET ?? '').trim();
  const missing = [
    ...(envId ? [] : ['SPOTIFY_CLIENT_ID']),
    ...(envSecret ? [] : ['SPOTIFY_CLIENT_SECRET']),
  ];
  return {
    credentials: envId && envSecret ? { clientId: envId, clientSecret: envSecret } : null,
    summary: {
      configured: missing.length === 0,
      source: missing.length === 0 ? 'env' : 'none',
      client_id_masked: maskClientId(envId),
      has_secret: Boolean(envSecret),
      missing,
    },
  };
}

export async function effectiveGoogleOauthCredentials(): Promise<{
  credentials: GoogleOauthCredentials | null;
  summary: GoogleOauthSettingsSummary;
}> {
  const settings = await loadRuntimeSettings();
  const savedId = String(settings.googleOauth?.clientId ?? '').trim();
  const savedSecret = String(settings.googleOauth?.clientSecret ?? '').trim();
  const envId = String(process.env.GOOGLE_CLIENT_ID ?? '').trim();
  const envSecret = String(process.env.GOOGLE_CLIENT_SECRET ?? '').trim();
  if (envId) {
    const mergedSecret = envSecret || (savedId && savedId === envId ? savedSecret : '');
    return {
      credentials: { clientId: envId, ...(mergedSecret ? { clientSecret: mergedSecret } : {}) },
      summary: {
        configured: true,
        source: 'env',
        client_id_masked: maskClientId(envId),
        has_secret: Boolean(mergedSecret),
        missing: [],
      },
    };
  }
  if (savedId) {
    return {
      credentials: { clientId: savedId, ...(savedSecret ? { clientSecret: savedSecret } : {}) },
      summary: {
        configured: true,
        source: 'saved',
        client_id_masked: maskClientId(savedId),
        has_secret: Boolean(savedSecret),
        missing: [],
      },
    };
  }

  return {
    credentials: null,
    summary: {
      configured: false,
      source: 'none',
      client_id_masked: null,
      has_secret: false,
      missing: ['GOOGLE_CLIENT_ID'],
    },
  };
}

export async function googleOauthDiagnostics(): Promise<GoogleOauthDiagnostics> {
  const settings = await loadRuntimeSettings();
  const savedId = String(settings.googleOauth?.clientId ?? '').trim();
  const savedSecret = String(settings.googleOauth?.clientSecret ?? '').trim();
  const envId = String(process.env.GOOGLE_CLIENT_ID ?? '').trim();
  const envSecret = String(process.env.GOOGLE_CLIENT_SECRET ?? '').trim();
  const effective = await effectiveGoogleOauthCredentials();
  const effectiveId = String(effective.credentials?.clientId ?? '').trim();
  const effectiveSecret = String(effective.credentials?.clientSecret ?? '').trim();

  return {
    settings_path: runtimeSettingsPath(),
    cwd: process.cwd(),
    env_client_id_masked: maskClientId(envId),
    env_has_secret: Boolean(envSecret),
    saved_client_id_masked: maskClientId(savedId),
    saved_has_secret: Boolean(savedSecret),
    env_saved_client_id_match: Boolean(envId && savedId && envId === savedId),
    effective: {
      ...effective.summary,
      effective_secret_from: envSecret
        ? 'env'
        : (effectiveId && savedId && effectiveId === savedId && effectiveSecret ? 'saved' : 'none'),
      effective_client_id_matches_saved: Boolean(effectiveId && savedId && effectiveId === savedId),
    },
  };
}

export async function testSpotifyCredentials(credentials: SpotifyCredentials): Promise<{
  ok: boolean;
  status: number | null;
  message: string;
}> {
  const auth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
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
      return {
        ok: false,
        status: response.status,
        message: String(payload?.error_description ?? payload?.error ?? (raw || `Spotify returned ${response.status}`)),
      };
    }
    const token = String(payload?.access_token ?? '');
    return {
      ok: Boolean(token),
      status: response.status,
      message: token ? 'Spotify credentials are valid.' : 'Spotify returned an empty token.',
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
