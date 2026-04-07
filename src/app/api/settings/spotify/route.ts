import { NextRequest, NextResponse } from 'next/server';
import {
  applySpotifyCredentialsToEnv,
  effectiveSpotifyCredentials,
  saveSpotifySettings,
  testSpotifyCredentials,
} from '@/lib/runtime-settings';

export const runtime = 'nodejs';

export async function GET() {
  const spotify = await effectiveSpotifyCredentials();
  if (spotify.credentials) applySpotifyCredentialsToEnv(spotify.credentials);
  return NextResponse.json({
    ok: true,
    spotify: {
      ...spotify.summary,
      test: null,
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const incomingClientId = String(body.clientId ?? '').trim();
  const incomingClientSecret = String(body.clientSecret ?? '').trim();
  const save = body.save !== false;
  const test = body.test !== false;

  let activeCredentials = incomingClientId || incomingClientSecret
    ? { clientId: incomingClientId, clientSecret: incomingClientSecret }
    : (await effectiveSpotifyCredentials()).credentials;

  if (!activeCredentials?.clientId || !activeCredentials?.clientSecret) {
    return NextResponse.json({
      ok: false,
      error: 'Both Spotify Client ID and Spotify Client Secret are required.',
    }, { status: 400 });
  }

  if (incomingClientId || incomingClientSecret) {
    if (!incomingClientId || !incomingClientSecret) {
      return NextResponse.json({
        ok: false,
        error: 'Both Spotify Client ID and Spotify Client Secret are required to save new credentials.',
      }, { status: 400 });
    }
    if (save) {
      await saveSpotifySettings(activeCredentials);
    }
  }

  applySpotifyCredentialsToEnv(activeCredentials);
  const spotify = await effectiveSpotifyCredentials();
  const result = test ? await testSpotifyCredentials(activeCredentials) : null;

  return NextResponse.json({
    ok: !test || Boolean(result?.ok),
    spotify: {
      ...spotify.summary,
      test: result,
    },
  }, { status: result && !result.ok ? 400 : 200 });
}
