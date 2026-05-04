import { NextRequest, NextResponse } from 'next/server';
import {
  effectiveServerSettings,
  getClientId,
  getGoogleDriveAccessToken,
} from '@/lib/runtime-settings';
import { listGoogleDriveAudioFiles } from '@/lib/google-drive-files';
import { importGoogleDriveTracks, purgeIgnoredGoogleDriveTracks, updateGoogleDriveTrackLocalMetadata } from '@/lib/db';
import { appendClientDiagnosticLog, logServerEvent } from '@/lib/app-log';
import { ensureLocalGoogleDriveTrackFile, readLocalAudioMetadata } from '@/lib/google-drive-cache';
import { fetchServerEntitlements } from '@/lib/server-account';

export const runtime = 'nodejs';
const GOOGLE_DRIVE_IMPORT_TIMEOUT_MS = 5 * 60_000;

function logGoogleDriveImport(
  level: 'info' | 'warn' | 'error',
  event: string,
  context: Record<string, unknown>,
) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  };
  const line = `[google-drive-import] ${JSON.stringify(payload)}`;
  void logServerEvent({
    level: level === 'warn' ? 'warning' : level,
    message: line,
    category: 'google-drive-import',
    context: payload,
    alsoConsole: true,
  }).catch(() => {});
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
    const appFlavor = process.env.NEXT_PUBLIC_DJ_ASSIST_APP_FLAVOR === 'prod' || process.env.DJ_ASSIST_APP_FLAVOR === 'prod'
      ? 'prod'
      : 'debug';
    if (appFlavor === 'prod') {
      const entitlementResponse = await fetchServerEntitlements();
      const entitlements = Array.isArray(entitlementResponse?.entitlements) ? entitlementResponse.entitlements : [];
      if (!entitlements.includes('google_drive')) {
        return NextResponse.json({ error: 'Google Drive import is part of DJ Assist Sync.' }, { status: 403 });
      }
    }
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

    const purgedIgnoredTracks = await purgeIgnoredGoogleDriveTracks();
    if (purgedIgnoredTracks > 0) {
      logGoogleDriveImport('info', 'purged_ignored_tracks', {
        removed: purgedIgnoredTracks,
      });
      await logGoogleDriveProgress(
        'info',
        `Removed ${purgedIgnoredTracks} previously imported Google Drive sidecar entries.`,
        {
          event: 'purged_ignored_tracks',
          removed: purgedIgnoredTracks,
        },
      );
    }

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

    let localMetadataEnriched = 0;
    let localMetadataFailed = 0;
    for (let index = 0; index < localFiles.length; index += 1) {
      const file = localFiles[index];
      const fileId = String(file.id ?? '').trim();
      if (!fileId) continue;
      try {
        await logGoogleDriveProgress(
          'info',
          `Reading embedded metadata ${index + 1}/${localFiles.length}: ${file.name}`,
          {
            event: 'local_metadata_started',
            index: index + 1,
            total: localFiles.length,
            fileId,
            name: file.name,
          },
        );
        const localFile = await ensureLocalGoogleDriveTrackFile(fileId, {
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
        });
        const metadata = await readLocalAudioMetadata(localFile.localPath, localFile.name);
        await updateGoogleDriveTrackLocalMetadata(fileId, {
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          duration: metadata.duration > 0 ? metadata.duration : null,
          bitrate: metadata.bitrate > 0 ? metadata.bitrate : null,
          bpm: metadata.bpm > 0 ? metadata.bpm : null,
          key: metadata.key,
          embedded_album_art_url: metadata.embedded_album_art_url || null,
        });
        localMetadataEnriched += 1;
        logGoogleDriveImport('info', 'local_metadata_completed', {
          index: index + 1,
          total: localFiles.length,
          fileId,
          name: file.name,
          cached: localFile.cached,
          title: metadata.title,
          artist: metadata.artist,
          bpm: metadata.bpm,
          key: metadata.key,
          hasEmbeddedArt: Boolean(metadata.embedded_album_art_url),
        });
      } catch (error) {
        localMetadataFailed += 1;
        const message = error instanceof Error ? error.message : String(error);
        logGoogleDriveImport('warn', 'local_metadata_failed', {
          index: index + 1,
          total: localFiles.length,
          fileId,
          name: file.name,
          error: message,
        });
        await logGoogleDriveProgress(
          'warning',
          `Embedded metadata read failed for ${file.name}: ${message}`,
          {
            event: 'local_metadata_failed',
            index: index + 1,
            total: localFiles.length,
            fileId,
            name: file.name,
            error: message,
          },
        );
      }
    }
    await logGoogleDriveProgress(
      localMetadataFailed ? 'warning' : 'success',
      `Local Google Drive metadata enrichment completed: ${localMetadataEnriched} succeeded, ${localMetadataFailed} failed.`,
      {
        event: 'local_metadata_summary',
        succeeded: localMetadataEnriched,
        failed: localMetadataFailed,
        total: localFiles.length,
      },
    );
    await logGoogleDriveProgress(
      'info',
      'Syncing imported Google Drive metadata to the server…',
      {
        event: 'server_import_started',
        total: localFiles.length,
        folderId: folderId || null,
        folderName: folderName || null,
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
        local_metadata_enriched: localMetadataEnriched,
        local_metadata_failed: localMetadataFailed,
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
