import {
  effectiveServerSettings,
  effectiveUserData,
  getClientId,
} from '@/lib/runtime-settings';

type CollectionTrackReference = {
  position: number;
  local_track_id: number;
  file_hash: string | null;
  path: string | null;
  spotify_id: string | null;
};

type CollectionSnapshot = {
  server_collection_id?: string;
  source_client_id?: string;
  client_collection_id: string;
  local_collection_id: number;
  name: string;
  created_at: string | null;
  deleted_at?: string;
  tracks: CollectionTrackReference[];
};

export type ServerCollectionSummary = {
  id: string;
  client_id: string;
  client_collection_id: string;
  local_collection_id: number;
  name: string;
  track_count: number;
  created_at: string | null;
  synced_at: string | null;
};

export type ServerCollectionTrack = {
  id: string;
  client_id: string | null;
  client_track_id: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  duration: number | null;
  bpm: number | null;
  bpm_override: number | null;
  musical_key: string | null;
  spotify_tempo: number | null;
  spotify_key: string | null;
  effective_bpm: number | null;
  effective_key: string | null;
  album_art_url: string | null;
  custom_tags: string[] | unknown;
  updated_at: string | null;
  spotify_id?: string | null;
  file_hash?: string | null;
  path?: string | null;
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

async function postCollectionPayload(payload: Record<string, unknown>) {
  const server = await effectiveServerSettings();
  if (!server.enabled) return { ok: false, skipped: 'server disabled' as const };

  const user = await effectiveUserData();
  const clientId = await getClientId();
  const baseUrl = (server.localDebug ? server.localServerUrl : server.serverUrl).trim().replace(/\/+$/, '');
  if (!baseUrl) return { ok: false, skipped: 'server url missing' as const };

  const response = await fetch(`${baseUrl}/api/v1/collections/sync`, {
    method: 'POST',
    headers: buildServerHeaders(
      String(user.google_id_token ?? '').trim(),
      String(user.google_access_token ?? '').trim(),
    ),
    body: JSON.stringify({
      client_id: clientId,
      user_data: user,
      sent_at: new Date().toISOString(),
      ...payload,
    }),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300).trim();
    throw new Error(`collection sync failed status=${response.status}${detail ? ` detail=${detail}` : ''}`);
  }

  return { ok: true as const };
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

export async function syncCollectionSnapshot(snapshot: CollectionSnapshot): Promise<void> {
  try {
    await postCollectionPayload({ collections: [snapshot] });
  } catch (error) {
    console.warn('[dj-assist] collection sync snapshot failed', {
      collectionId: snapshot.local_collection_id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function syncCollectionDeletion(input: {
  localCollectionId: number;
  name: string;
  createdAt: string | null;
  serverCollectionId?: string | null;
  sourceClientId?: string | null;
  sourceClientCollectionId?: string | null;
}): Promise<void> {
  try {
    await postCollectionPayload({
      collections: [
        {
          server_collection_id: input.serverCollectionId ?? undefined,
          source_client_id: input.sourceClientId ?? undefined,
          client_collection_id: input.sourceClientCollectionId ?? `set:${input.localCollectionId}`,
          local_collection_id: input.localCollectionId,
          name: input.name,
          created_at: input.createdAt,
          deleted_at: new Date().toISOString(),
          tracks: [],
        },
      ],
    });
  } catch (error) {
    console.warn('[dj-assist] collection sync delete failed', {
      collectionId: input.localCollectionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function listCollectionsFromServer(): Promise<ServerCollectionSummary[]> {
  const baseUrl = await getServerBaseUrl();
  if (!baseUrl) return [];
  const headers = await getServerAuthHeaders();
  if (!headers) return [];
  const response = await fetch(`${baseUrl}/api/v1/collections`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300).trim();
    throw new Error(`collection list failed status=${response.status}${detail ? ` detail=${detail}` : ''}`);
  }
  const payload = await response.json() as { collections?: ServerCollectionSummary[] };
  return Array.isArray(payload.collections) ? payload.collections : [];
}

export async function getCollectionTracksFromServer(collectionId: string): Promise<ServerCollectionTrack[]> {
  const baseUrl = await getServerBaseUrl();
  if (!baseUrl) return [];
  const headers = await getServerAuthHeaders();
  if (!headers) return [];
  const response = await fetch(`${baseUrl}/api/v1/collections/${encodeURIComponent(collectionId)}/tracks`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300).trim();
    throw new Error(`collection tracks failed status=${response.status}${detail ? ` detail=${detail}` : ''}`);
  }
  const payload = await response.json() as { tracks?: ServerCollectionTrack[] };
  return Array.isArray(payload.tracks) ? payload.tracks : [];
}
