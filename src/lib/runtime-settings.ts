import path from 'node:path';
import { promises as fs } from 'node:fs';

export type SpotifyCredentials = {
  clientId: string;
  clientSecret: string;
};

type RuntimeSettings = {
  spotify?: SpotifyCredentials & {
    updatedAt?: string;
  };
};

export type SpotifySettingsSummary = {
  configured: boolean;
  source: 'saved' | 'env' | 'none';
  client_id_masked: string | null;
  has_secret: boolean;
  missing: string[];
};

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
