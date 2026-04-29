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
  client_collection_id: string;
  local_collection_id: number;
  name: string;
  created_at: string | null;
  deleted_at?: string;
  tracks: CollectionTrackReference[];
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
}): Promise<void> {
  try {
    await postCollectionPayload({
      collections: [
        {
          client_collection_id: `set:${input.localCollectionId}`,
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
