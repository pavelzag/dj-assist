import { NextResponse } from 'next/server';
import { getDatabasePath } from '@/lib/db';
import { resolveWorkingPython } from '@/lib/scan';
import {
  applyGoogleOauthCredentialsToEnv,
  effectiveGoogleOauthCredentials,
  googleOauthDiagnostics,
  applySpotifyCredentialsToEnv,
  effectiveSpotifyCredentials,
  serverRuntimeSummary,
} from '@/lib/runtime-settings';
import { getClientLogPath } from '@/lib/app-log';

export const runtime = 'nodejs';

export async function GET() {
  const appFlavor = process.env.NEXT_PUBLIC_DJ_ASSIST_APP_FLAVOR === 'prod' || process.env.DJ_ASSIST_APP_FLAVOR === 'prod'
    ? 'prod'
    : 'debug';
  let python: string | null = null;
  let pythonError: string | null = null;
  try {
    python = await resolveWorkingPython();
  } catch (error) {
    pythonError = error instanceof Error ? error.message : String(error);
  }

  const databasePath = getDatabasePath();
  const spotify = await effectiveSpotifyCredentials();
  if (spotify.credentials) applySpotifyCredentialsToEnv(spotify.credentials);
  const googleOauth = appFlavor === 'prod'
    ? { credentials: null, summary: { configured: false, source: 'none', client_id_masked: null, has_secret: false, missing: [] as string[] } }
    : await effectiveGoogleOauthCredentials();
  if (googleOauth.credentials) applyGoogleOauthCredentialsToEnv(googleOauth.credentials);
  const googleOauthDiag = appFlavor === 'prod' ? null : await googleOauthDiagnostics();
  const server = await serverRuntimeSummary();

  return NextResponse.json({
    ok: true,
    runtime: {
      node: process.version,
      python,
      python_executable: process.env.PYTHON_EXECUTABLE ?? null,
      python_ok: Boolean(python),
      python_error: pythonError,
      database_url_set: Boolean(databasePath),
      database_url_masked: databasePath,
      database_path: databasePath,
      database_driver: 'sqlite',
      spotify_missing: spotify.summary.missing,
      spotify: spotify.summary,
      google_oauth: googleOauth.summary,
      google_oauth_diagnostics: googleOauthDiag,
      server,
      client_log_path: getClientLogPath(),
      cwd: process.cwd(),
    },
  });
}
