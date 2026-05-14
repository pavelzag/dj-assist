import { NextRequest, NextResponse } from 'next/server';
import { effectiveServerSettings, getDropboxAccessToken } from '@/lib/runtime-settings';
import { normalizeCloudSourceKind, cloudTrackPath } from '@/lib/cloud-source';
import { importCloudTracks, purgeIgnoredCloudTracks, reuseExistingAlbumArtForTrack, updateCloudTrackLocalMetadata, getTracksByPaths } from '@/lib/db';
import { readLocalAudioMetadata } from '@/lib/google-drive-cache';
import { ensureLocalDropboxTrackFile } from '@/lib/dropbox-cache';
import { listDropboxAudioFiles } from '@/lib/dropbox-files';
import { appendClientDiagnosticLog, logServerEvent } from '@/lib/app-log';
import { proFeaturesEnabled } from '@/lib/app-flavor';

export const runtime = 'nodejs';

function logCloudImport(
  provider: string,
  level: 'info' | 'warn' | 'error',
  event: string,
  context: Record<string, unknown>,
) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    provider,
    ...context,
  };
  void logServerEvent({
    level: level === 'warn' ? 'warning' : level,
    message: `[cloud-import:${provider}] ${JSON.stringify(payload)}`,
    category: 'cloud-import',
    context: payload,
    alsoConsole: true,
  }).catch(() => {});
}

async function logCloudProgress(
  provider: string,
  level: 'info' | 'warning' | 'error' | 'success',
  message: string,
  context: Record<string, unknown>,
) {
  await appendClientDiagnosticLog({
    timestamp: new Date().toISOString(),
    level,
    message,
    source: 'renderer',
    category: `cloud-import-${provider}`,
    context,
  }).catch(() => {});
}

export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  if (!proFeaturesEnabled()) {
    return NextResponse.json({ error: 'Unavailable in this app version.' }, { status: 404 });
  }
  const { provider: rawProvider } = await context.params;
  const provider = normalizeCloudSourceKind(rawProvider);
  if (provider !== 'dropbox') {
    return NextResponse.json({ error: `Unsupported cloud provider: ${rawProvider}` }, { status: 404 });
  }

  try {
    const requestSignal = request.signal;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const maxFiles = Math.min(Math.max(Math.trunc(Number(body.maxFiles ?? 2000) || 2000), 1), 5000);
    const folderId = String(body.folderId ?? '').trim();
    const folderName = String(body.folderName ?? '').trim();
    const folderIds: string[] = Array.isArray(body.folderIds)
      ? (body.folderIds as unknown[]).map((id) => String(id ?? '').trim()).filter(Boolean)
      : (folderId ? [folderId] : []);
    const server = await effectiveServerSettings();
    const serverUrl = String(server.localDebug ? server.localServerUrl : server.serverUrl).trim().replace(/\/+$/, '');
    if (!server.enabled) {
      return NextResponse.json({ error: 'Server sync is disabled.' }, { status: 400 });
    }
    if (!serverUrl) {
      return NextResponse.json({ error: 'Server URL is not configured.' }, { status: 400 });
    }

    const accessTokenResult = await getDropboxAccessToken();
    const accessToken = accessTokenResult.accessToken;
    const scopes = Array.isArray(accessTokenResult.auth.scopes) ? accessTokenResult.auth.scopes : [];
    logCloudImport('dropbox', 'info', 'dropbox_auth_ready', {
      provider: 'dropbox',
      hasAccessToken: Boolean(accessToken),
      hasRefreshToken: Boolean(accessTokenResult.auth.refreshToken),
      accessTokenExpiresAt: accessTokenResult.auth.accessTokenExpiresAt ?? null,
      scopeCount: scopes.length,
      scopes,
      authIdMasked: String(accessTokenResult.auth.id ?? '').trim().slice(0, 6) || null,
      email: accessTokenResult.auth.email ?? null,
      name: accessTokenResult.auth.name ?? null,
      emailVerified: accessTokenResult.auth.emailVerified ?? null,
      hasIdToken: Boolean(accessTokenResult.auth.idToken),
      hasPicture: Boolean(accessTokenResult.auth.picture),
      authUpdatedAt: accessTokenResult.auth.updatedAt ?? null,
      tokenSummary: {
        accessToken: Boolean(accessToken),
        refreshToken: Boolean(accessTokenResult.auth.refreshToken),
        expiresAt: accessTokenResult.auth.accessTokenExpiresAt ?? null,
      },
    });
    await logCloudProgress('dropbox', 'info', 'Dropbox auth resolved for import.', {
      event: 'auth_ready',
      provider: 'dropbox',
      hasAccessToken: Boolean(accessToken),
      hasRefreshToken: Boolean(accessTokenResult.auth.refreshToken),
      accessTokenExpiresAt: accessTokenResult.auth.accessTokenExpiresAt ?? null,
      scopeCount: scopes.length,
      scopes,
      authIdMasked: String(accessTokenResult.auth.id ?? '').trim().slice(0, 6) || null,
      email: accessTokenResult.auth.email ?? null,
      name: accessTokenResult.auth.name ?? null,
      emailVerified: accessTokenResult.auth.emailVerified ?? null,
      hasIdToken: Boolean(accessTokenResult.auth.idToken),
      hasPicture: Boolean(accessTokenResult.auth.picture),
      authUpdatedAt: accessTokenResult.auth.updatedAt ?? null,
      tokenSummary: {
        accessToken: Boolean(accessToken),
        refreshToken: Boolean(accessTokenResult.auth.refreshToken),
        expiresAt: accessTokenResult.auth.accessTokenExpiresAt ?? null,
      },
    });

    logCloudImport('dropbox', 'info', 'dropbox_listing_request', {
      folderId: folderId || null,
      folderName: folderName || null,
      maxFiles,
      requestedFolderIds: folderIds.length ? folderIds : null,
      authScopes: Array.isArray(accessTokenResult.auth.scopes) ? accessTokenResult.auth.scopes : [],
      authSource: 'dropbox',
      hasAccessToken: Boolean(accessToken),
      hasRefreshToken: Boolean(accessTokenResult.auth.refreshToken),
      accessTokenExpiresAt: accessTokenResult.auth.accessTokenExpiresAt ?? null,
      authIdMasked: String(accessTokenResult.auth.id ?? '').trim().slice(0, 6) || null,
    });
    if (requestSignal.aborted) throw new Error('Import cancelled');
    const filesResponse = await listDropboxAudioFiles({ accessToken, folderId, allFolderIds: folderIds, limit: maxFiles, signal: requestSignal });
    const filteredFiles = filesResponse.files;
    logCloudImport('dropbox', 'info', 'dropbox_listing_ready', {
      folderId: folderId || null,
      folderName: folderName || null,
      maxFiles,
      requestedFolderIds: folderIds.length ? folderIds : null,
      fileCount: filteredFiles.length,
      hasNextPage: Boolean(filesResponse.nextPageToken),
      note: filteredFiles.length === 0
        ? 'No audio files were returned by the provider listing step.'
        : 'Audio files were returned by the provider listing step.',
    });
    await logCloudProgress('dropbox', 'info', `Dropbox listing returned ${filteredFiles.length} audio files.`, {
      event: 'listing_ready',
      folderId: folderId || null,
      folderName: folderName || null,
      maxFiles,
      requestedFolderIds: folderIds.length ? folderIds : null,
      fileCount: filteredFiles.length,
      hasNextPage: Boolean(filesResponse.nextPageToken),
      note: filteredFiles.length === 0
        ? 'No audio files were returned by the provider listing step.'
        : 'Audio files were returned by the provider listing step.',
    });
    if (filteredFiles.length === 0) {
      logCloudImport('dropbox', 'warn', 'dropbox_listing_empty', {
        folderId: folderId || null,
        folderName: folderName || null,
        maxFiles,
        requestedFolderIds: folderIds.length ? folderIds : null,
        authScopes: Array.isArray(accessTokenResult.auth.scopes) ? accessTokenResult.auth.scopes : [],
        authSource: 'dropbox',
        hasRefreshToken: Boolean(accessTokenResult.auth.refreshToken),
        hint: 'Dropbox returned no audio files after filtering. Check whether the files are in a visible Dropbox scope, have supported audio extensions, or are inside the selected folder.',
      });
    }
    if (requestSignal.aborted) throw new Error('Import cancelled');
    logCloudImport('dropbox', 'info', 'started', {
      folderId: folderId || null,
      folderName: folderName || null,
      maxFiles,
      fileCount: filteredFiles.length,
    });
    await logCloudProgress('dropbox', 'info', `Starting Dropbox import for ${folderName || folderId || 'all audio files'}.`, {
      event: 'started',
      folderId: folderId || null,
      folderName: folderName || null,
      maxFiles,
      fileCount: filteredFiles.length,
    });
    if (requestSignal.aborted) throw new Error('Import cancelled');

    const localImport = await importCloudTracks({
      kind: 'dropbox',
      files: filteredFiles.map((file) => ({
        id: file.id,
        name: file.name,
        modifiedTime: file.modifiedTime,
        size: file.size,
      })),
      folderId: folderId || undefined,
      folderName: folderName || undefined,
      signal: requestSignal,
    });
    logCloudImport('dropbox', 'info', 'dropbox_local_import_done', {
      folderId: folderId || null,
      folderName: folderName || null,
      imported: localImport.imported,
      updated: localImport.updated,
      total: filteredFiles.length,
    });
    await logCloudProgress('dropbox', 'info', `Imported ${localImport.imported} new tracks and updated ${localImport.updated} existing tracks.`, {
      event: 'local_import_completed',
      imported: localImport.imported,
      updated: localImport.updated,
      total: filteredFiles.length,
    });

    let enriched = 0;
    let failed = 0;
    let reused = 0;
    for (let index = 0; index < filteredFiles.length; index += 1) {
      if (requestSignal.aborted) throw new Error('Import cancelled');
      const file = filteredFiles[index];
      const filePath = cloudTrackPath('dropbox', file.id);
      try {
        const localFile = await ensureLocalDropboxTrackFile(file.id, file, requestSignal);
        if (requestSignal.aborted) throw new Error('Import cancelled');
        const metadata = await readLocalAudioMetadata(localFile.localPath, localFile.name);
        await updateCloudTrackLocalMetadata('dropbox', file.id, {
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          duration: metadata.duration > 0 ? metadata.duration : null,
          bitrate: metadata.bitrate > 0 ? metadata.bitrate : null,
          bpm: metadata.bpm > 0 ? metadata.bpm : null,
          key: metadata.key,
          embedded_album_art_url: metadata.embedded_album_art_url || null,
          spotify_id: metadata.spotify_id,
          spotify_tempo: metadata.spotify_tempo > 0 ? metadata.spotify_tempo : null,
          spotify_album_name: metadata.spotify_album_name,
          metadata_source: metadata.metadata_source,
          metadata_recovery_debug: metadata.metadata_recovery_debug,
        });
        const track = (await getTracksByPaths([filePath]))[0];
        if (track) {
          const art = await reuseExistingAlbumArtForTrack(track.id);
          if (art.reused) reused += 1;
        }
        enriched += 1;
      } catch (error) {
        failed += 1;
        logCloudImport('dropbox', 'warn', 'dropbox_enrichment_failed', {
          fileId: file.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (requestSignal.aborted) throw new Error('Import cancelled');
    logCloudImport('dropbox', 'info', 'completed', {
      folderId: folderId || null,
      folderName: folderName || null,
      imported: localImport.imported,
      updated: localImport.updated,
      enriched,
      failed,
      reused,
      tracksReceived: filteredFiles.length,
    });
    await logCloudProgress('dropbox', 'success', `Cloud import complete: ${enriched} enriched, ${failed} failed, ${reused} album-art reuses.`, {
      event: 'completed',
      imported: localImport.imported,
      updated: localImport.updated,
      enriched,
      failed,
      reused,
      tracksReceived: filteredFiles.length,
    });

    await purgeIgnoredCloudTracks('dropbox');

    return NextResponse.json({
      ok: true,
      provider: 'dropbox',
      imported: localImport.imported,
      updated: localImport.updated,
      enriched,
      failed,
      reused,
      files: filteredFiles.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Import cancelled') {
      await logCloudProgress('dropbox', 'warning', 'Dropbox import cancelled.', {
        event: 'cancelled',
      });
      return NextResponse.json({ ok: false, cancelled: true, error: 'Import cancelled' }, { status: 400 });
    }
    await logCloudProgress('dropbox', 'error', `Dropbox import failed: ${error instanceof Error ? error.message : String(error)}`, {
      event: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
