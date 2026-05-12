import { NextRequest, NextResponse } from 'next/server';
import { getClientId, effectiveServerSettings, getOneDriveAccessToken, getDropboxAccessToken, effectiveUserData } from '@/lib/runtime-settings';
import { normalizeCloudSourceKind, cloudTrackPath } from '@/lib/cloud-source';
import { importCloudTracks, purgeIgnoredCloudTracks, reuseExistingAlbumArtForTrack, updateCloudTrackLocalMetadata, getTracksByPaths } from '@/lib/db';
import { readLocalAudioMetadata } from '@/lib/google-drive-cache';
import { ensureLocalOneDriveTrackFile } from '@/lib/onedrive-cache';
import { ensureLocalDropboxTrackFile } from '@/lib/dropbox-cache';
import { listOneDriveAudioFiles } from '@/lib/onedrive-files';
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
  if (!provider || provider === 'google_drive') {
    return NextResponse.json({ error: `Unsupported cloud provider: ${rawProvider}` }, { status: 404 });
  }

  try {
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

    const accessToken = provider === 'onedrive'
      ? (await getOneDriveAccessToken()).accessToken
      : (await getDropboxAccessToken()).accessToken;
    const filesResponse = provider === 'onedrive'
      ? await listOneDriveAudioFiles({ accessToken, folderId, allFolderIds: folderIds, limit: maxFiles })
      : await listDropboxAudioFiles({ accessToken, folderId, allFolderIds: folderIds, limit: maxFiles });
    const filteredFiles = filesResponse.files;
    logCloudImport(provider, 'info', 'started', {
      folderId: folderId || null,
      folderName: folderName || null,
      maxFiles,
      fileCount: filteredFiles.length,
    });
    await logCloudProgress(provider, 'info', `Starting ${provider} import for ${folderName || folderId || 'all audio files'}.`, {
      event: 'started',
      folderId: folderId || null,
      folderName: folderName || null,
      maxFiles,
      fileCount: filteredFiles.length,
    });

    const localImport = await importCloudTracks({
      kind: provider,
      files: filteredFiles.map((file) => ({
        id: file.id,
        name: file.name,
        modifiedTime: file.modifiedTime,
        size: file.size,
      })),
      folderId: folderId || undefined,
      folderName: folderName || undefined,
    });
    await logCloudProgress(provider, 'info', `Imported ${localImport.imported} new tracks and updated ${localImport.updated} existing tracks.`, {
      event: 'local_import_completed',
      imported: localImport.imported,
      updated: localImport.updated,
      total: filteredFiles.length,
    });

    let enriched = 0;
    let failed = 0;
    let reused = 0;
    for (let index = 0; index < filteredFiles.length; index += 1) {
      const file = filteredFiles[index];
      const filePath = cloudTrackPath(provider, file.id);
      try {
        const localFile = provider === 'onedrive'
          ? await ensureLocalOneDriveTrackFile(file.id, file)
          : await ensureLocalDropboxTrackFile(file.id, file);
        const metadata = await readLocalAudioMetadata(localFile.localPath, localFile.name);
        await updateCloudTrackLocalMetadata(provider, file.id, {
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
        await logCloudProgress(provider, 'warning', `Embedded metadata read failed for ${file.name}: ${error instanceof Error ? error.message : String(error)}`, {
          event: 'local_metadata_failed',
          fileId: file.id,
          name: file.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if ((index + 1) % 25 === 0) {
        await logCloudProgress(provider, 'info', `${index + 1}/${filteredFiles.length} files processed.`, {
          event: 'progress',
          processed: index + 1,
          total: filteredFiles.length,
        });
      }
    }

    await purgeIgnoredCloudTracks(provider);

    const userData = await effectiveUserData();
    const syncedTracks = await getTracksByPaths(filteredFiles.map((file) => cloudTrackPath(provider, file.id)));
    const uploadResponse = await fetch(`${serverUrl}/api/v1/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'dj-assist-client',
      },
      body: JSON.stringify({
        client_id: await getClientId(),
        user_data: userData,
        sent_at: new Date().toISOString(),
        tracks: syncedTracks.map((track) => ({
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
          artwork_url: track.album_art_url && !String(track.album_art_url).startsWith('data:') ? track.album_art_url : null,
          artwork_source: track.album_art_source,
          artwork_status: track.album_art_url ? 'present' : 'missing',
          album_art_url: track.album_art_url && !String(track.album_art_url).startsWith('data:') ? track.album_art_url : null,
          album_art_source: track.album_art_source,
          album_art_status: track.album_art_url ? 'present' : 'missing',
        })),
        usage_events: [],
      }),
    });
    const raw = await uploadResponse.text();
    const payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    if (!uploadResponse.ok) {
      throw new Error(String(payload.error ?? raw ?? `Cloud import failed status=${uploadResponse.status}`));
    }

    await logCloudProgress(provider, 'success', `Cloud import complete: ${enriched} enriched, ${failed} failed, ${reused} album-art reuse${reused === 1 ? '' : 's'}.`, {
      event: 'completed',
      imported: localImport.imported,
      updated: localImport.updated,
      enriched,
      failed,
      reused,
      tracksReceived: Number(payload.tracks_received ?? 0),
    });

    return NextResponse.json({
      ok: true,
      provider,
      drive_files_scanned: filteredFiles.length,
      local_tracks_imported: localImport.imported,
      local_tracks_updated: localImport.updated,
      local_metadata_enriched: enriched,
      local_metadata_failed: failed,
      local_album_art_reused: reused,
      tracks_received: Number(payload.tracks_received ?? 0),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
