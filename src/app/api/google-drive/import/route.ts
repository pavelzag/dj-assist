import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  effectiveServerSettings,
  getClientId,
  getGoogleDriveAccessToken,
} from '@/lib/runtime-settings';
import {
  collectFolderTree,
  isIgnoredGoogleDriveAudioFileName,
  listGoogleDriveAudioFiles,
} from '@/lib/google-drive-files';
import {
  getTracksByPaths,
  importGoogleDriveTracks,
  purgeIgnoredGoogleDriveTracks,
  reuseExistingAlbumArtForTrack,
  updateGoogleDriveTrackLocalMetadata,
  type Track,
} from '@/lib/db';
import { appendClientDiagnosticLog, logServerEvent } from '@/lib/app-log';
import { ensureLocalGoogleDriveTrackFile, readLocalAudioMetadata } from '@/lib/google-drive-cache';
import { resolveWorkingPython } from '@/lib/scan';
import { fetchServerEntitlements } from '@/lib/server-account';

export const runtime = 'nodejs';
const GOOGLE_DRIVE_IMPORT_TIMEOUT_MS = 5 * 60_000;
const IMPORT_REANALYZE_ART_TIMEOUT_MS = 45_000;
const execFileAsync = promisify(execFile);

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

function parseStderrEvents(stderr: string | null | undefined): Array<Record<string, unknown>> | string {
  const text = String(stderr || '').trim();
  if (!text) return text;
  const lines = text.split('\n').filter(Boolean);
  const events = lines.map((line) => {
    const match = line.match(/^\[([^\]]+)\]\s+(.*)$/);
    if (match) {
      const [, category, content] = match;
      try {
        return { category, ...JSON.parse(content) };
      } catch {
        return { category, raw: content };
      }
    }
    return { raw: line };
  });
  return events.length > 0 ? events : text;
}

function sanitizeArtworkUrlForServer(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.startsWith('data:')) return null;
  return normalized;
}

function serializeTrackForServer(track: Track) {
  const artworkUrl = sanitizeArtworkUrlForServer(track.album_art_url);
  const hasArtwork = Boolean(artworkUrl);
  return {
    client_track_id: track.file_hash || track.path || String(track.id),
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    bitrate: track.bitrate,
    bpm: track.bpm,
    bpm_confidence: track.bpm_confidence,
    key: track.key,
    key_numeric: track.key_numeric,
    spotify_id: track.spotify_id,
    spotify_uri: track.spotify_uri,
    spotify_url: track.spotify_url,
    spotify_tempo: track.spotify_tempo,
    spotify_key: track.spotify_key,
    spotify_mode: track.spotify_mode,
    bpm_source: track.bpm_source,
    analysis_status: track.analysis_status,
    analysis_error: track.analysis_error,
    decode_failed: track.decode_failed,
    file_hash: track.file_hash,
    file_size: track.file_size,
    file_mtime: track.file_mtime,
    effective_bpm: track.bpm ?? track.spotify_tempo,
    effective_key: track.key || track.spotify_key || track.key_numeric,
    artwork_url: artworkUrl,
    artwork_source: hasArtwork ? track.album_art_source : null,
    artwork_status: hasArtwork ? 'present' : 'missing',
    album_art_url: artworkUrl,
    album_art_source: hasArtwork ? track.album_art_source : null,
    album_art_status: hasArtwork ? 'present' : 'missing',
  };
}

async function uploadTracksToServer(input: {
  serverUrl: string;
  googleIdToken?: string;
  googleAccessToken: string;
  clientId: string;
  userData: Record<string, unknown>;
  tracks: Track[];
}) {
  if (!input.tracks.length) {
    return { status: 200, tracksReceived: 0, rawPreview: '{"tracks_received":0}' };
  }
  const response = await fetch(`${input.serverUrl}/api/v1/ingest`, {
    method: 'POST',
    headers: buildServerHeaders({
      googleIdToken: String(input.googleIdToken ?? '').trim() || undefined,
      googleAccessToken: input.googleAccessToken,
    }),
    body: JSON.stringify({
      client_id: input.clientId,
      user_data: input.userData,
      sent_at: new Date().toISOString(),
      tracks: input.tracks.map(serializeTrackForServer),
      usage_events: [],
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
  if (!response.ok) {
    const detail = String(payload?.error ?? raw ?? response.statusText).slice(0, 500);
    throw new Error(`server ingest failed status=${response.status}${detail ? ` detail=${detail}` : ''}`);
  }
  return {
    status: response.status,
    tracksReceived: Number(payload?.tracks_received ?? 0),
    rawPreview: raw.slice(0, 500),
  };
}

async function reanalyzeImportedArtwork(input: {
  tracks: Track[];
  port: string;
  onProgress: (entry: {
    trackId: number;
    title: string;
    index: number;
    total: number;
    ok: boolean;
    message: string;
    debug?: Record<string, unknown>;
  }) => Promise<void>;
}) {
  const targets = input.tracks.filter((track) => {
    const source = String(track.album_art_source ?? '').trim().toLowerCase();
    const hasArt = Boolean(String(track.album_art_url ?? '').trim());
    return !hasArt || source === 'embedded';
  });
  if (!targets.length) {
    return { attempted: 0, succeeded: 0, failed: 0 };
  }

  const python = await resolveWorkingPython();
  let succeeded = 0;
  let failed = 0;
  for (let index = 0; index < targets.length; index += 1) {
    const track = targets[index];
    try {
      const { stdout, stderr } = await execFileAsync(
        python,
        ['-m', 'dj_assist.cli', 'reanalyze-art', String(track.id), '--force', '--json-output'],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DJ_ASSIST_LIVE_SPOTIFY_DEBUG: '1',
            DJ_ASSIST_FAIL_FAST_ON_SPOTIFY_429: '1',
            DJ_ASSIST_LOCAL_APP_URL: `http://localhost:${input.port}`,
          },
          timeout: IMPORT_REANALYZE_ART_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
        },
      );
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(stdout || '{}') as Record<string, unknown>;
      } catch {
        parsed = { ok: true, message: String(stdout || '').trim() };
      }
      succeeded += 1;
      await input.onProgress({
        trackId: track.id,
        title: String(track.title ?? '').trim() || `Track ${track.id}`,
        index: index + 1,
        total: targets.length,
        ok: true,
        message: String(parsed.message ?? 'Artwork refresh complete.'),
        debug: {
          stdout: parsed,
          stderr: parseStderrEvents(stderr),
        },
      });
    } catch (error) {
      failed += 1;
      const execError = error as Error & { stdout?: string; stderr?: string; signal?: string; code?: number };
      await input.onProgress({
        trackId: track.id,
        title: String(track.title ?? '').trim() || `Track ${track.id}`,
        index: index + 1,
        total: targets.length,
        ok: false,
        message: execError.message || 'Unable to refresh artwork.',
        debug: {
          code: execError?.code ?? null,
          signal: execError?.signal ?? null,
          stdout: String(execError?.stdout ?? '').trim(),
          stderr: parseStderrEvents(execError?.stderr),
        },
      });
    }
  }

  return {
    attempted: targets.length,
    succeeded,
    failed,
  };
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
    // Accept an array of folder IDs for multi-folder imports.
    const folderIds: string[] = Array.isArray(body.folderIds)
      ? (body.folderIds as unknown[]).map((id) => String(id ?? '').trim()).filter(Boolean)
      : (folderId ? [folderId] : []);
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

    // Collect the full folder subtree for all selected root folders so that
    // audio files in subfolders are included (Drive API only queries direct parents).
    let allFolderIds: string[] | undefined;
    if (folderIds.length > 0) {
      const merged = new Set<string>();
      for (const rootId of folderIds) {
        const tree = await collectFolderTree({ accessToken, rootFolderId: rootId });
        tree.forEach((id) => merged.add(id));
      }
      allFolderIds = [...merged];
      logGoogleDriveImport('info', 'folder_tree_collected', {
        rootFolderIds: folderIds,
        totalFolders: allFolderIds.length,
      });
      await logGoogleDriveProgress(
        'info',
        `Folder tree collected: ${allFolderIds.length} folder${allFolderIds.length === 1 ? '' : 's'} across ${folderIds.length} root${folderIds.length === 1 ? '' : 's'}.`,
        { event: 'folder_tree_collected', rootFolderIds: folderIds, totalFolders: allFolderIds.length },
      );
    }

    const localFiles: Awaited<ReturnType<typeof listGoogleDriveAudioFiles>>['files'] = [];
    let nextPageToken: string | null = null;
    let pagesFetched = 0;
    do {
      const page = await listGoogleDriveAudioFiles({
        accessToken,
        folderId: folderId || undefined,
        allFolderIds,
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

    const filteredLocalFiles = localFiles.filter((file) => !isIgnoredGoogleDriveAudioFileName(file.name));
    const ignoredLocalFiles = localFiles.length - filteredLocalFiles.length;
    if (ignoredLocalFiles > 0) {
      logGoogleDriveImport('info', 'ignored_non_audio_files_filtered', {
        ignored: ignoredLocalFiles,
        totalBufferedBeforeFilter: localFiles.length,
        totalBufferedAfterFilter: filteredLocalFiles.length,
      });
      await logGoogleDriveProgress(
        'info',
        `Filtered ${ignoredLocalFiles} ignored non-audio file${ignoredLocalFiles === 1 ? '' : 's'} from the Google Drive import buffer.`,
        {
          event: 'ignored_non_audio_files_filtered',
          ignored: ignoredLocalFiles,
          totalBufferedBeforeFilter: localFiles.length,
          totalBufferedAfterFilter: filteredLocalFiles.length,
        },
      );
    }

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
      files: filteredLocalFiles,
      folderId: folderId || undefined,
      folderName: folderName || undefined,
    });
    logGoogleDriveImport('info', 'local_import_completed', {
      totalBuffered: filteredLocalFiles.length,
      localImported: localImport.imported,
      localUpdated: localImport.updated,
    });
    await logGoogleDriveProgress(
      'info',
      `Local Google Drive import completed: ${localImport.imported} added, ${localImport.updated} updated from ${filteredLocalFiles.length} buffered files.`,
      {
        event: 'local_import_completed',
        totalBuffered: filteredLocalFiles.length,
        localImported: localImport.imported,
        localUpdated: localImport.updated,
      },
    );

    let localMetadataEnriched = 0;
    let localMetadataFailed = 0;
    let localAlbumArtReused = 0;
    for (let index = 0; index < filteredLocalFiles.length; index += 1) {
      const file = filteredLocalFiles[index];
      const fileId = String(file.id ?? '').trim();
      if (!fileId) continue;
      try {
        await logGoogleDriveProgress(
          'info',
          `Reading embedded metadata ${index + 1}/${filteredLocalFiles.length}: ${file.name}`,
          {
            event: 'local_metadata_started',
            index: index + 1,
            total: filteredLocalFiles.length,
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
          spotify_id: metadata.spotify_id,
          spotify_album_name: metadata.spotify_album_name,
          metadata_source: metadata.metadata_source,
          metadata_recovery_debug: metadata.metadata_recovery_debug,
        });
        const reusedArt = await reuseExistingAlbumArtForTrack(Number(
          (await getTracksByPaths([`gdrive:${fileId}`]))[0]?.id ?? 0,
        ));
        if (reusedArt.reused) {
          localAlbumArtReused += 1;
        }
        localMetadataEnriched += 1;
        logGoogleDriveImport('info', 'local_metadata_completed', {
          index: index + 1,
          total: filteredLocalFiles.length,
          fileId,
          name: file.name,
          cached: localFile.cached,
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          bpm: metadata.bpm,
          key: metadata.key,
          hasEmbeddedArt: Boolean(metadata.embedded_album_art_url),
          metadataSource: metadata.metadata_source,
          spotifyId: metadata.spotify_id,
          spotifyAlbumName: metadata.spotify_album_name,
          reusedAlbumArt: reusedArt.reused,
          reusedAlbumArtFromTrackId: reusedArt.sourceTrackId ?? null,
          reusedAlbumArtSource: reusedArt.albumArtSource ?? null,
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
            total: filteredLocalFiles.length,
            fileId,
            name: file.name,
            error: message,
          },
        );
      }
    }
    await logGoogleDriveProgress(
      localMetadataFailed ? 'warning' : 'success',
      `Local Google Drive metadata enrichment completed: ${localMetadataEnriched} succeeded, ${localMetadataFailed} failed, ${localAlbumArtReused} album art reuse${localAlbumArtReused === 1 ? '' : 's'}.`,
      {
        event: 'local_metadata_summary',
        succeeded: localMetadataEnriched,
        failed: localMetadataFailed,
        total: filteredLocalFiles.length,
        albumArtReused: localAlbumArtReused,
      },
    );
    await logGoogleDriveProgress(
      'info',
      'Syncing imported Google Drive metadata to the server…',
      {
        event: 'server_import_started',
        total: filteredLocalFiles.length,
        folderId: folderId || null,
        folderName: folderName || null,
      },
    );
    let syncedTracks = await getTracksByPaths(filteredLocalFiles.map((file) => `gdrive:${String(file.id ?? '').trim()}`));
    const artworkRefresh = await reanalyzeImportedArtwork({
      tracks: syncedTracks,
      port: process.env.PORT ?? '3000',
      onProgress: async (entry) => {
        const level = entry.ok ? 'info' : 'warning';
        const context = {
          event: 'initial_artwork_enrichment',
          trackId: entry.trackId,
          title: entry.title,
          index: entry.index,
          total: entry.total,
          ok: entry.ok,
          message: entry.message,
          debug: entry.debug ?? null,
        };
        logGoogleDriveImport(entry.ok ? 'info' : 'warn', 'initial_artwork_enrichment', context);
        await logGoogleDriveProgress(
          level,
          `Artwork enrichment ${entry.index}/${entry.total}: ${entry.title} ${entry.ok ? 'completed' : 'failed'}${entry.message ? ` (${entry.message})` : ''}`,
          context,
        );
      },
    });
    if (artworkRefresh.attempted > 0) {
      await logGoogleDriveProgress(
        artworkRefresh.failed > 0 ? 'warning' : 'success',
        `Initial artwork enrichment completed: ${artworkRefresh.succeeded} succeeded, ${artworkRefresh.failed} failed.`,
        {
          event: 'initial_artwork_enrichment_summary',
          attempted: artworkRefresh.attempted,
          succeeded: artworkRefresh.succeeded,
          failed: artworkRefresh.failed,
        },
      );
    }
    syncedTracks = await getTracksByPaths(filteredLocalFiles.map((file) => `gdrive:${String(file.id ?? '').trim()}`));
    const uploadResult = await uploadTracksToServer({
      serverUrl,
      googleIdToken: String(userData.google_id_token ?? '').trim() || undefined,
      googleAccessToken: accessToken,
      clientId,
      userData,
      tracks: syncedTracks,
    });
    logGoogleDriveImport('info', 'server_import_response', {
      status: uploadResult.status,
      ok: true,
      rawPreview: uploadResult.rawPreview,
      tracksPrepared: syncedTracks.length,
      tracksReceived: uploadResult.tracksReceived,
    });
    await logGoogleDriveProgress(
      'success',
      `Google Drive server import response: status=${uploadResult.status} ok=yes.`,
      {
        event: 'server_import_response',
        status: uploadResult.status,
        ok: true,
        rawPreview: uploadResult.rawPreview,
        tracksPrepared: syncedTracks.length,
        tracksReceived: uploadResult.tracksReceived,
      },
    );

    return NextResponse.json(
      {
        accepted: true,
        ok: true,
        tracks_received: uploadResult.tracksReceived,
        drive_files_scanned: filteredLocalFiles.length,
        folder_id: folderId || null,
        fallback_download_scan: fallbackDownloadScan,
        local_tracks_imported: localImport.imported,
        local_tracks_updated: localImport.updated,
        local_metadata_enriched: localMetadataEnriched,
        local_metadata_failed: localMetadataFailed,
        local_album_art_reused: localAlbumArtReused,
        initial_artwork_enrichment_attempted: artworkRefresh.attempted,
        initial_artwork_enrichment_succeeded: artworkRefresh.succeeded,
        initial_artwork_enrichment_failed: artworkRefresh.failed,
      },
      { status: 200 },
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
