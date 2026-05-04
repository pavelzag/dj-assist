import {
  effectiveServerSettings,
  effectiveUserData,
  getClientId,
} from '@/lib/runtime-settings';
import { fetchServerEntitlements } from '@/lib/server-account';

type CollectionTrackReference = {
  position: number;
  client_entry_id?: string;
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
  base_revision?: number | null;
  base_updated_at?: string | null;
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
  revision?: number | null;
  updated_at?: string | null;
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
  client_entry_id?: string | null;
  spotify_id?: string | null;
  file_hash?: string | null;
  path?: string | null;
};

type SyncedCollectionInfo = {
  id?: string | null;
  client_id?: string | null;
  client_collection_id?: string | null;
  revision?: number | null;
  updated_at?: string | null;
} | null;

export type CollectionSyncResult = {
  ok: true;
  collection?: SyncedCollectionInfo;
} | {
  ok: false;
  skipped: 'server disabled' | 'server url missing' | 'playlist sync not entitled';
};

export class CollectionSyncConflictError extends Error {
  latestCollection: Record<string, unknown> | null;

  constructor(message: string, latestCollection: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'CollectionSyncConflictError';
    this.latestCollection = latestCollection;
  }
}

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

async function postCollectionPayload(payload: Record<string, unknown>): Promise<CollectionSyncResult> {
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

  if (response.status === 409) {
    let conflictPayload: Record<string, unknown> | null = null;
    try {
      conflictPayload = await response.json() as Record<string, unknown>;
    } catch {
      conflictPayload = null;
    }
    throw new CollectionSyncConflictError(
      'collection sync conflict',
      (
        (conflictPayload?.collection as Record<string, unknown> | undefined)
        ?? (conflictPayload?.latest_collection as Record<string, unknown> | undefined)
        ?? conflictPayload
        ?? null
      ),
    );
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300).trim();
    throw new Error(`collection sync failed status=${response.status}${detail ? ` detail=${detail}` : ''}`);
  }

  let resultPayload: Record<string, unknown> | null = null;
  try {
    resultPayload = await response.json() as Record<string, unknown>;
  } catch {
    resultPayload = null;
  }

  return {
    ok: true,
    collection: (
      (resultPayload?.collection as SyncedCollectionInfo | undefined)
      ?? (resultPayload?.synced_collection as SyncedCollectionInfo | undefined)
      ?? null
    ),
  };
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

async function canUsePlaylistSyncFeature() {
  const appFlavor = process.env.NEXT_PUBLIC_DJ_ASSIST_APP_FLAVOR === 'prod' || process.env.DJ_ASSIST_APP_FLAVOR === 'prod'
    ? 'prod'
    : 'debug';
  if (appFlavor !== 'prod') return true;
  const response = await fetchServerEntitlements();
  return Array.isArray(response?.entitlements) && response.entitlements.includes('playlist_sync');
}

export async function syncCollectionSnapshot(snapshot: CollectionSnapshot): Promise<CollectionSyncResult> {
  if (!(await canUsePlaylistSyncFeature())) {
    return { ok: false, skipped: 'playlist sync not entitled' };
  }
  return postCollectionPayload({ collections: [snapshot] });
}

export async function syncCollectionDeletion(input: {
  localCollectionId: number;
  name: string;
  createdAt: string | null;
  serverCollectionId?: string | null;
  sourceClientId?: string | null;
  sourceClientCollectionId?: string | null;
  baseRevision?: number | null;
  baseUpdatedAt?: string | null;
}): Promise<void> {
  if (!(await canUsePlaylistSyncFeature())) return;
  await postCollectionPayload({
    collections: [
      {
        server_collection_id: input.serverCollectionId ?? undefined,
        source_client_id: input.sourceClientId ?? undefined,
        client_collection_id: input.sourceClientCollectionId ?? `set:${input.localCollectionId}`,
        local_collection_id: input.localCollectionId,
        name: input.name,
        created_at: input.createdAt,
        base_revision: input.baseRevision ?? null,
        base_updated_at: input.baseUpdatedAt ?? null,
        deleted_at: new Date().toISOString(),
        tracks: [],
      },
    ],
  });
}

export async function listCollectionsFromServer(): Promise<ServerCollectionSummary[]> {
  if (!(await canUsePlaylistSyncFeature())) return [];
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
  if (!(await canUsePlaylistSyncFeature())) return [];
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
