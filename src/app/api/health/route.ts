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
import { googleFeaturesEnabled } from '@/lib/app-flavor';

export const runtime = 'nodejs';

export async function GET() {
  const googleEnabled = googleFeaturesEnabled();
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
  const googleOauth = googleEnabled
    ? await effectiveGoogleOauthCredentials()
    : { credentials: null, summary: { configured: false, source: 'none', client_id_masked: null, has_secret: false, missing: [] as string[] } };
  if (googleOauth.credentials) applyGoogleOauthCredentialsToEnv(googleOauth.credentials);
  const googleOauthDiag = googleEnabled ? await googleOauthDiagnostics() : null;
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
