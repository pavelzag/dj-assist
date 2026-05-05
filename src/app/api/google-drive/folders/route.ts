import { NextRequest, NextResponse } from 'next/server';
import { getGoogleDriveAccessToken } from '@/lib/runtime-settings';
import { logServerEvent } from '@/lib/app-log';

export const runtime = 'nodejs';

type GoogleDriveFolder = {
  id: string;
  name: string;
  parents: string[];
};

function logGoogleDriveFolders(
  level: 'info' | 'warning' | 'error',
  event: string,
  context: Record<string, unknown>,
) {
  const payload = {
    timestamp: new Date().toISOString(),
    event,
    ...context,
  };
  const line = `[google-drive-folders] ${JSON.stringify(payload)}`;
  void logServerEvent({
    level,
    message: line,
    category: 'google-drive-folders',
    context: payload,
    alsoConsole: true,
  }).catch(() => {});
}

const MAX_FOLDERS_PER_REQUEST = 1000;

function escapeDriveQueryValue(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

export async function GET(request: NextRequest) {
  try {
    const { accessToken } = await getGoogleDriveAccessToken();
    const { searchParams } = new URL(request.url);
    const parentId = String(searchParams.get('parentId') ?? '').trim();
    const search = String(searchParams.get('search') ?? '').trim();
    logGoogleDriveFolders('info', 'started', {
      parentId: parentId || 'root',
      search: search || null,
      hasAccessToken: Boolean(accessToken),
    });

    const queryParts = [
      'trashed = false',
      "mimeType = 'application/vnd.google-apps.folder'",
    ];
    if (search) {
      queryParts.push(`name contains '${escapeDriveQueryValue(search)}'`);
    } else if (parentId) {
      queryParts.push(`'${escapeDriveQueryValue(parentId)}' in parents`);
    } else {
      queryParts.push("'root' in parents");
    }
    const query = queryParts.join(' and ');

    const folders: GoogleDriveFolder[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    do {
      const url = new URL('https://www.googleapis.com/drive/v3/files');
      url.searchParams.set('q', query);
      url.searchParams.set('fields', 'nextPageToken, files(id,name,parents)');
      url.searchParams.set('orderBy', 'folder,name_natural');
      url.searchParams.set('pageSize', '200');
      url.searchParams.set('supportsAllDrives', 'true');
      url.searchParams.set('includeItemsFromAllDrives', 'true');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
      });

      const raw = await response.text();
      const payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
      if (!response.ok) {
        return NextResponse.json(
          { error: String((payload.error ?? raw) || 'Could not list Google Drive folders.') },
          { status: response.status },
        );
      }

      if (Array.isArray(payload.files)) {
        for (const file of payload.files) {
          if (!file || typeof file !== 'object') continue;
          const f = file as Record<string, unknown>;
          folders.push({
            id: String(f.id ?? '').trim(),
            name: String(f.name ?? '').trim() || 'Untitled folder',
            parents: Array.isArray(f.parents)
              ? (f.parents as unknown[]).map((v) => String(v)).filter(Boolean)
              : [],
          });
        }
      }

      pageToken = String(payload.nextPageToken ?? '').trim() || undefined;
      pages += 1;
    } while (pageToken && folders.length < MAX_FOLDERS_PER_REQUEST);

    logGoogleDriveFolders('info', 'completed', {
      parentId: parentId || 'root',
      search: search || null,
      returned: folders.length,
      pages,
      truncated: folders.length >= MAX_FOLDERS_PER_REQUEST,
    });

    return NextResponse.json({
      parentId: parentId || null,
      folders,
      truncated: folders.length >= MAX_FOLDERS_PER_REQUEST,
    });
  } catch (error) {
    logGoogleDriveFolders('error', 'failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
