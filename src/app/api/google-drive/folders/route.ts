import { NextRequest, NextResponse } from 'next/server';
import { getGoogleDriveAccessToken } from '@/lib/runtime-settings';

export const runtime = 'nodejs';

type GoogleDriveFolder = {
  id: string;
  name: string;
  parents: string[];
};

export async function GET(request: NextRequest) {
  try {
    const { accessToken } = await getGoogleDriveAccessToken();
    const { searchParams } = new URL(request.url);
    const parentId = String(searchParams.get('parentId') ?? '').trim();
    const pageSize = Math.min(Math.max(Math.trunc(Number(searchParams.get('limit') ?? 200) || 200), 1), 200);
    const query = parentId
      ? `trashed = false and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents`
      : "trashed = false and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents";

    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', query);
    url.searchParams.set('fields', 'files(id,name,parents)');
    url.searchParams.set('orderBy', 'folder,name_natural');
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');

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

    const folders = Array.isArray(payload.files)
      ? payload.files
        .filter((file): file is Record<string, unknown> => Boolean(file && typeof file === 'object'))
        .map((file): GoogleDriveFolder => ({
          id: String(file.id ?? '').trim(),
          name: String(file.name ?? '').trim() || 'Untitled folder',
          parents: Array.isArray(file.parents) ? file.parents.map((value) => String(value)).filter(Boolean) : [],
        }))
      : [];

    return NextResponse.json({
      parentId: parentId || null,
      folders,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
