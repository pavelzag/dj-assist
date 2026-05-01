import { NextRequest, NextResponse } from 'next/server';
import { getGoogleDriveAccessToken } from '@/lib/runtime-settings';

export const runtime = 'nodejs';

type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  size: string | null;
  parents: string[];
};

export async function GET(request: NextRequest) {
  try {
    const { accessToken } = await getGoogleDriveAccessToken();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Math.trunc(Number(searchParams.get('limit') ?? 100) || 100), 1), 200);
    const pageToken = String(searchParams.get('pageToken') ?? '').trim();

    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', "trashed = false and mimeType contains 'audio/'");
    url.searchParams.set('fields', 'nextPageToken, files(id,name,mimeType,modifiedTime,size,parents)');
    url.searchParams.set('orderBy', 'modifiedTime desc,name');
    url.searchParams.set('pageSize', String(limit));
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
        { error: String((payload.error ?? raw) || 'Could not list Google Drive files.') },
        { status: response.status },
      );
    }

    const files = Array.isArray(payload.files)
      ? payload.files
        .filter((file): file is Record<string, unknown> => Boolean(file && typeof file === 'object'))
        .map((file): GoogleDriveFile => ({
          id: String(file.id ?? '').trim(),
          name: String(file.name ?? '').trim() || 'Untitled',
          mimeType: String(file.mimeType ?? '').trim(),
          modifiedTime: String(file.modifiedTime ?? '').trim() || null,
          size: String(file.size ?? '').trim() || null,
          parents: Array.isArray(file.parents) ? file.parents.map((value) => String(value)).filter(Boolean) : [],
        }))
      : [];

    return NextResponse.json({
      files,
      nextPageToken: String(payload.nextPageToken ?? '').trim() || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
