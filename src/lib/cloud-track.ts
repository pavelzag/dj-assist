import { parseCloudTrackPath, type CloudSourceKind } from '@/lib/cloud-source';
import { ensureLocalGoogleDriveTrackFile } from '@/lib/google-drive-cache';
import { ensureLocalOneDriveTrackFile } from '@/lib/onedrive-cache';
import { ensureLocalDropboxTrackFile } from '@/lib/dropbox-cache';

export async function ensureLocalCloudTrackFile(
  trackPath: string | null | undefined,
  knownMetadata?: { name?: string; mimeType?: string; size?: string | number | null },
): Promise<{
  localPath: string;
  cached: boolean;
  name: string;
  mimeType: string;
} | null> {
  const parsed = parseCloudTrackPath(trackPath);
  if (!parsed) return null;
  return ensureLocalCloudTrackFileByKind(parsed.kind, parsed.id, knownMetadata);
}

export async function ensureLocalCloudTrackFileByKind(
  kind: CloudSourceKind,
  fileId: string,
  knownMetadata?: { name?: string; mimeType?: string; size?: string | number | null },
) {
  if (kind === 'google_drive') {
    return ensureLocalGoogleDriveTrackFile(fileId, knownMetadata);
  }
  if (kind === 'onedrive') {
    return ensureLocalOneDriveTrackFile(fileId, knownMetadata);
  }
  return ensureLocalDropboxTrackFile(fileId, knownMetadata);
}

