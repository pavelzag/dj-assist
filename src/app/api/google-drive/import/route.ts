import { NextRequest, NextResponse } from 'next/server';
import {
  effectiveServerSettings,
  getClientId,
  getGoogleDriveAccessToken,
} from '@/lib/runtime-settings';
import { listGoogleDriveAudioFiles } from '@/lib/google-drive-files';
import { importGoogleDriveTracks } from '@/lib/db';

export const runtime = 'nodejs';
const GOOGLE_DRIVE_IMPORT_TIMEOUT_MS = 5 * 60_000;

function buildServerHeaders(input: {
  googleIdToken?: string;
  googleAccessToken: string;
}) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'User-Agent': 'dj-assist-client',
    'X-Google-Access-Token': input.googleAccessToken,
  });
  const googleIdToken = String(input.googleIdToken ?? '').trim();
  if (googleIdToken) {
    headers.set('Authorization', `Bearer ${googleIdToken}`);
    headers.set('X-Google-Id-Token', googleIdToken);
  }
  return headers;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const maxFiles = Math.min(Math.max(Math.trunc(Number(body.maxFiles ?? 2000) || 2000), 1), 5000);
    const folderId = String(body.folderId ?? '').trim();
    const fallbackDownloadScan = Boolean(body.fallbackDownloadScan);
    const fallbackDownloadLimit = Math.min(
      Math.max(Math.trunc(Number(body.fallbackDownloadLimit ?? 100) || 100), 1),
      500,
    );
    const { accessToken, userData } = await getGoogleDriveAccessToken();
    const clientId = await getClientId();
    const server = await effectiveServerSettings();
    const serverUrl = String(server.localDebug ? server.localServerUrl : server.serverUrl).trim().replace(/\/+$/, '');

    if (!server.enabled) {
      return NextResponse.json({ error: 'Server sync is disabled.' }, { status: 400 });
    }
    if (!serverUrl) {
      return NextResponse.json({ error: 'Server URL is not configured.' }, { status: 400 });
    }

    const localFiles: Awaited<ReturnType<typeof listGoogleDriveAudioFiles>>['files'] = [];
    let nextPageToken: string | null = null;
    do {
      const page = await listGoogleDriveAudioFiles({
        accessToken,
        folderId: folderId || undefined,
        limit: Math.min(200, maxFiles - localFiles.length),
        pageToken: nextPageToken ?? undefined,
      });
      localFiles.push(...page.files);
      nextPageToken = page.nextPageToken;
    } while (nextPageToken && localFiles.length < maxFiles);

    const localImport = await importGoogleDriveTracks({
      files: localFiles,
      folderId: folderId || undefined,
      folderName: String(body.folderName ?? '').trim() || undefined,
    });

    const response = await fetch(`${serverUrl}/api/v1/google-drive/import`, {
      method: 'POST',
      headers: buildServerHeaders({
        googleIdToken: userData.google_id_token,
        googleAccessToken: accessToken,
      }),
      body: JSON.stringify({
        client_id: clientId,
        user_data: userData,
        max_files: maxFiles,
        folder_id: folderId || undefined,
        fallback_download_scan: fallbackDownloadScan,
        fallback_download_limit: fallbackDownloadScan ? fallbackDownloadLimit : undefined,
      }),
      signal: AbortSignal.timeout(GOOGLE_DRIVE_IMPORT_TIMEOUT_MS),
    });

    const raw = await response.text();
    let payload: Record<string, unknown> | null = null;
    try {
      payload = raw ? JSON.parse(raw) as Record<string, unknown> : null;
    } catch {
      payload = raw ? { error: raw } : null;
    }

    return NextResponse.json(
      {
        ...(payload ?? { ok: response.ok }),
        local_tracks_imported: localImport.imported,
        local_tracks_updated: localImport.updated,
      },
      { status: response.status },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: message === 'The operation was aborted due to timeout'
          ? 'Google Drive import exceeded the desktop timeout. Try importing a smaller folder, or preview and narrow the scope first.'
          : message,
      },
      { status: 400 },
    );
  }
}
