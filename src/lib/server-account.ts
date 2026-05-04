import packageJson from '../../package.json';
import {
  effectiveServerSettings,
  effectiveUserData,
  getClientId,
} from '@/lib/runtime-settings';

type ServerAccountSession = {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    picture: string | null;
  };
  account: {
    id: string;
    status: string;
    created_at: string | null;
    updated_at: string | null;
  };
  subscription: {
    plan_key: string;
    status: string;
    period_ends_at: string | null;
  } | null;
  entitlements: string[];
};

type ServerEntitlementsResponse = {
  user_id: string;
  account_id: string;
  entitlements: string[];
  subscription: {
    plan_key: string;
    status: string;
    period_ends_at: string | null;
  } | null;
};

function buildServerHeaders(googleIdToken: string, googleAccessToken: string) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'User-Agent': 'dj-assist-client',
  });
  if (googleIdToken) {
    headers.set('Authorization', `Bearer ${googleIdToken}`);
    headers.set('X-Google-Id-Token', googleIdToken);
  }
  if (googleAccessToken) {
    headers.set('X-Google-Access-Token', googleAccessToken);
  }
  return headers;
}

async function getServerBaseUrl() {
  const server = await effectiveServerSettings();
  if (!server.enabled) return null;
  const baseUrl = (server.localDebug ? server.localServerUrl : server.serverUrl).trim().replace(/\/+$/, '');
  return baseUrl || null;
}

async function getServerAuthHeaders() {
  const user = await effectiveUserData();
  const googleIdToken = String(user.google_id_token ?? '').trim();
  const googleAccessToken = String(user.google_access_token ?? '').trim();
  if (!googleIdToken && !googleAccessToken) return null;
  return buildServerHeaders(googleIdToken, googleAccessToken);
}

export async function fetchServerAccountSession(): Promise<ServerAccountSession | null> {
  const baseUrl = await getServerBaseUrl();
  if (!baseUrl) return null;
  const headers = await getServerAuthHeaders();
  if (!headers) return null;
  const response = await fetch(`${baseUrl}/api/v1/account/session`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300).trim();
    throw new Error(`account session failed status=${response.status}${detail ? ` detail=${detail}` : ''}`);
  }
  return await response.json() as ServerAccountSession;
}

export async function fetchServerEntitlements(): Promise<ServerEntitlementsResponse | null> {
  const baseUrl = await getServerBaseUrl();
  if (!baseUrl) return null;
  const headers = await getServerAuthHeaders();
  if (!headers) return null;
  const response = await fetch(`${baseUrl}/api/v1/account/entitlements`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300).trim();
    throw new Error(`entitlements lookup failed status=${response.status}${detail ? ` detail=${detail}` : ''}`);
  }
  return await response.json() as ServerEntitlementsResponse;
}

export async function registerCurrentServerDevice(input: {
  platform?: string;
  deviceName?: string;
} = {}): Promise<boolean> {
  const baseUrl = await getServerBaseUrl();
  if (!baseUrl) return false;
  const headers = await getServerAuthHeaders();
  if (!headers) return false;
  const user = await effectiveUserData();
  const clientId = await getClientId();
  const response = await fetch(`${baseUrl}/api/v1/devices/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      client_id: clientId,
      user_data: user,
      platform: input.platform ?? 'electron',
      app_version: packageJson.version,
      device_name: input.deviceName ?? null,
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status === 401) return false;
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300).trim();
    throw new Error(`device registration failed status=${response.status}${detail ? ` detail=${detail}` : ''}`);
  }
  return true;
}
