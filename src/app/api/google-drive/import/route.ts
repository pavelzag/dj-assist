import { NextRequest, NextResponse } from 'next/server';
import {
  effectiveServerSettings,
  getClientId,
  getGoogleDriveAccessToken,
} from '@/lib/runtime-settings';
import { listGoogleDriveAudioFiles } from '@/lib/google-drive-files';
import { importGoogleDriveTracks } from '@/lib/db';
import { appendClientDiagnosticLog } from '@/lib/app-log';

export const runtime = 'nodejs';
const GOOGLE_DRIVE_IMPORT_TIMEOUT_MS = 5 * 60_000;

function logGoogleDriveImport(
  level: 'info' | 'warn' | 'error',
  event: string,
  context: Record<string, unknown>,
) {
  const line = `[google-drive-import] ${JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  })}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

async function logGoogleDriveProgress(
  level: 'info' | 'warning' | 'error' | 'success',
  message: string,
  context: Record<string, unknown>,
) {
  await appendClientDiagnosticLog({
    timestamp: new Date().toISOString(),
    level,
    message,
    source: 'renderer',
    category: 'google-drive-import',
    context,
  }).catch(() => {});
}

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
    const folderName = String(body.folderName ?? '').trim();
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

    logGoogleDriveImport('info', 'started', {
      folderId: folderId || null,
      folderName: folderName || null,
      maxFiles,
      fallbackDownloadScan,
      fallbackDownloadLimit: fallbackDownloadScan ? fallbackDownloadLimit : null,
      serverUrl,
    });
    await logGoogleDriveProgress(
      'info',
      `Google Drive import backend started for ${folderName || folderId || 'all audio files'} (max ${maxFiles} files).`,
      {
        event: 'started',
        folderId: folderId || null,
        folderName: folderName || null,
        maxFiles,
        fallbackDownloadScan,
        fallbackDownloadLimit: fallbackDownloadScan ? fallbackDownloadLimit : null,
      },
    );

    const localFiles: Awaited<ReturnType<typeof listGoogleDriveAudioFiles>>['files'] = [];
    let nextPageToken: string | null = null;
    let pagesFetched = 0;
    do {
      const page = await listGoogleDriveAudioFiles({
        accessToken,
        folderId: folderId || undefined,
        limit: Math.min(200, maxFiles - localFiles.length),
        pageToken: nextPageToken ?? undefined,
      });
      pagesFetched += 1;
      localFiles.push(...page.files);
      nextPageToken = page.nextPageToken;
      logGoogleDriveImport('info', 'drive_page_loaded', {
        page: pagesFetched,
        fetchedThisPage: page.files.length,
        totalBuffered: localFiles.length,
        hasNextPage: Boolean(nextPageToken),
      });
      await logGoogleDriveProgress(
        'info',
        `Google Drive page ${pagesFetched} loaded: ${page.files.length} files, ${localFiles.length} buffered${nextPageToken ? ', more remaining.' : '.'}`,
        {
          event: 'drive_page_loaded',
          page: pagesFetched,
          fetchedThisPage: page.files.length,
          totalBuffered: localFiles.length,
          hasNextPage: Boolean(nextPageToken),
        },
      );
    } while (nextPageToken && localFiles.length < maxFiles);

    const localImport = await importGoogleDriveTracks({
      files: localFiles,
      folderId: folderId || undefined,
      folderName: folderName || undefined,
    });
    logGoogleDriveImport('info', 'local_import_completed', {
      totalBuffered: localFiles.length,
      localImported: localImport.imported,
      localUpdated: localImport.updated,
    });
    await logGoogleDriveProgress(
      'info',
      `Local Google Drive import completed: ${localImport.imported} added, ${localImport.updated} updated from ${localFiles.length} buffered files.`,
      {
        event: 'local_import_completed',
        totalBuffered: localFiles.length,
        localImported: localImport.imported,
        localUpdated: localImport.updated,
      },
    );

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
    logGoogleDriveImport(response.ok ? 'info' : 'warn', 'server_import_response', {
      status: response.status,
      ok: response.ok,
      rawPreview: raw.slice(0, 500),
    });
    await logGoogleDriveProgress(
      response.ok ? 'success' : 'warning',
      `Google Drive server import response: status=${response.status} ok=${response.ok ? 'yes' : 'no'}.`,
      {
        event: 'server_import_response',
        status: response.status,
        ok: response.ok,
        rawPreview: raw.slice(0, 500),
      },
    );
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
    const normalized = message.toLowerCase();
    logGoogleDriveImport('error', 'failed', {
      error: message,
    });
    await logGoogleDriveProgress(
      'error',
      `Google Drive import failed: ${message}`,
      {
        event: 'failed',
        error: message,
      },
    );
    return NextResponse.json(
      {
        error:
          message === 'The operation was aborted due to timeout'
            ? 'Google Drive import exceeded the desktop timeout. Try importing a smaller folder, or preview and narrow the scope first.'
            : normalized.includes('database is locked')
              ? 'Google Drive import could not update the local Songs list because the DJ Assist database was busy. Wait a moment and try again.'
              : normalized.includes('database or disk is full')
                ? 'Google Drive import could not update the local Songs list because the DJ Assist database disk is full.'
                : message || 'Google Drive import failed.',
      },
      { status: 400 },
    );
  }
}
