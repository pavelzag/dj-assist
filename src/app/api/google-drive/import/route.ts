import { NextRequest, NextResponse } from 'next/server';
import {
  effectiveServerSettings,
  getClientId,
  getGoogleDriveAccessToken,
} from '@/lib/runtime-settings';

export const runtime = 'nodejs';

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
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const raw = await response.text();
    let payload: Record<string, unknown> | null = null;
    try {
      payload = raw ? JSON.parse(raw) as Record<string, unknown> : null;
    } catch {
      payload = raw ? { error: raw } : null;
    }

    return NextResponse.json(
      payload ?? { ok: response.ok },
      { status: response.status },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
