export type CloudSourceKind = 'google_drive' | 'onedrive' | 'dropbox';

const CLOUD_SOURCE_LABELS: Record<CloudSourceKind, string> = {
  google_drive: 'Google Drive',
  onedrive: 'OneDrive',
  dropbox: 'Dropbox',
};

const CLOUD_SOURCE_PREFIXES: Record<CloudSourceKind, string> = {
  google_drive: 'gdrive',
  onedrive: 'onedrive',
  dropbox: 'dropbox',
};

export function normalizeCloudSourceKind(value: unknown): CloudSourceKind | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'google_drive' || raw === 'gdrive' || raw === 'google') return 'google_drive';
  if (raw === 'onedrive' || raw === 'one_drive' || raw === 'microsoft') return 'onedrive';
  if (raw === 'dropbox' || raw === 'dbx') return 'dropbox';
  return null;
}

export function cloudSourceLabel(kind: CloudSourceKind): string {
  return CLOUD_SOURCE_LABELS[kind];
}

export function cloudSourcePrefix(kind: CloudSourceKind): string {
  return CLOUD_SOURCE_PREFIXES[kind];
}

export function cloudTrackPath(kind: CloudSourceKind, id: string): string {
  return `${cloudSourcePrefix(kind)}:${String(id ?? '').trim()}`;
}

export function parseCloudTrackPath(pathValue: string | null | undefined): {
  kind: CloudSourceKind;
  id: string;
} | null {
  const path = String(pathValue ?? '').trim();
  if (!path) return null;
  const matchedKind = (Object.entries(CLOUD_SOURCE_PREFIXES) as Array<[CloudSourceKind, string]>)
    .find(([, prefix]) => path.startsWith(`${prefix}:`));
  if (!matchedKind) return null;
  const [kind, prefix] = matchedKind;
  const id = path.slice(prefix.length + 1).trim();
  if (!id) return null;
  return { kind, id };
}

export function isCloudTrackPath(pathValue: string | null | undefined): boolean {
  return parseCloudTrackPath(pathValue) !== null;
}

export function cloudSourceKindFromPath(pathValue: string | null | undefined): CloudSourceKind | null {
  return parseCloudTrackPath(pathValue)?.kind ?? null;
}
