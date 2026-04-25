import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { googleAuthConfigured } from '@/lib/google-auth';

export type SpotifyCredentials = {
  clientId: string;
  clientSecret: string;
};

type RuntimeSettings = {
  spotify?: SpotifyCredentials & {
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
};

export type SpotifySettingsSummary = {
  configured: boolean;
  source: 'saved' | 'env' | 'none';
  client_id_masked: string | null;
  has_secret: boolean;
  missing: string[];
};

function envBoolean(name: string): boolean | undefined {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return undefined;
}

function settingsDirectory(): string {
  return process.env.DJ_ASSIST_CONFIG_DIR?.trim() || process.cwd();
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
    serverUrl: process.env.DJ_ASSIST_SERVER_URL?.trim() || 'https://dj-assist-server.vercel.app',
    localServerUrl: process.env.DJ_ASSIST_LOCAL_SERVER_URL?.trim() || 'http://localhost:3001',
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
  if (envEnabled !== undefined) resolved.enabled = envEnabled;
  if (envLocalDebug !== undefined) resolved.localDebug = envLocalDebug;
  if (process.env.DJ_ASSIST_SERVER_URL?.trim()) resolved.serverUrl = process.env.DJ_ASSIST_SERVER_URL.trim();
  if (process.env.DJ_ASSIST_LOCAL_SERVER_URL?.trim()) resolved.localServerUrl = process.env.DJ_ASSIST_LOCAL_SERVER_URL.trim();
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
  const next: AuthSettings = {
    provider: 'google',
    ...auth,
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
  const auth = settings.auth;
  if (auth?.provider === 'google' && auth.id) {
    return {
      type: 'google',
      id: auth.id,
      email: auth.email,
      emailVerified: auth.emailVerified,
      name: auth.name,
      picture: auth.picture,
      google_id_token: auth.idToken,
    };
  }
  return {
    type: 'anonymous',
    id: await getClientId(),
  };
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
  };
}

export async function serverRuntimeSummary() {
  const server = await effectiveServerSettings();
  const user = await effectiveUserData();
  return {
    ...server,
    activeUrl: server.localDebug ? server.localServerUrl : server.serverUrl,
    user: publicUserSummary(user),
    googleAuthConfigured: googleAuthConfigured(),
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
