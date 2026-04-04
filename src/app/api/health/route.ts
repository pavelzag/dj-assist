import { NextResponse } from 'next/server';
import { resolveWorkingPython } from '@/lib/scan';

export async function GET() {
  let python: string | null = null;
  let pythonError: string | null = null;
  try {
    python = await resolveWorkingPython();
  } catch (error) {
    pythonError = error instanceof Error ? error.message : String(error);
  }

  const databaseUrl = process.env.DATABASE_URL ?? '';
  const spotifyMissing = [
    ...(process.env.SPOTIFY_CLIENT_ID ? [] : ['SPOTIFY_CLIENT_ID']),
    ...(process.env.SPOTIFY_CLIENT_SECRET ? [] : ['SPOTIFY_CLIENT_SECRET']),
  ];

  return NextResponse.json({
    ok: true,
    runtime: {
      node: process.version,
      python,
      python_ok: Boolean(python),
      python_error: pythonError,
      database_url_set: Boolean(databaseUrl),
      database_url_masked: databaseUrl ? databaseUrl.replace(/:\/\/[^@]+@/, '://***@') : '',
      spotify_missing: spotifyMissing,
      cwd: process.cwd(),
    },
  });
}
