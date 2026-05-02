import { NextRequest, NextResponse } from 'next/server';
import { aggregateTracks, getAllTrackRows, getDatabasePath, searchTrackRows, serializeTrackGroup } from '@/lib/db';

export const runtime = 'nodejs';

async function checkSpotifyConnection(
  clientId: string,
  clientSecret: string,
): Promise<{ token_ok: boolean; error: string }> {
  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { token_ok: false, error: text };
    }
    const data = await res.json();
    return { token_ok: Boolean(data.access_token), error: data.access_token ? '' : 'empty_token' };
  } catch (err) {
    return { token_ok: false, error: String(err) };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const query = searchParams.get('query');
    const bpmMin = searchParams.has('bpm_min') ? parseFloat(searchParams.get('bpm_min')!) : null;
    const bpmMax = searchParams.has('bpm_max') ? parseFloat(searchParams.get('bpm_max')!) : null;
    const key = searchParams.get('key');
    const highConfidenceOnly =
      ['1', 'true', 'yes', 'on'].includes(
        (searchParams.get('spotify_high_confidence') ?? 'false').toLowerCase(),
      );

    const hasFilter = query || bpmMin != null || bpmMax != null || key;
    const tracks = hasFilter
      ? await searchTrackRows({ query, bpmMin, bpmMax, key })
      : await getAllTrackRows();

    let payload = aggregateTracks(tracks).map((group) => serializeTrackGroup(group, { includeEmbeddedArtwork: false }));
    if (highConfidenceOnly) {
      payload = payload.filter((t) => t.spotify_high_confidence);
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID ?? '';
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? '';
    const spotifyMissing = [
      ...(clientId ? [] : ['SPOTIFY_CLIENT_ID']),
      ...(clientSecret ? [] : ['SPOTIFY_CLIENT_SECRET']),
    ];
    const spotifyEnabled = spotifyMissing.length === 0;
    const spotifyConn = spotifyEnabled
      ? await checkSpotifyConnection(clientId, clientSecret)
      : { token_ok: false, error: 'missing_credentials' };

    const debug = {
      database_path: getDatabasePath(),
      rows: payload.length,
      with_bpm: payload.filter((t) => t.effective_bpm).length,
      with_spotify: payload.filter((t) => t.spotify_id).length,
      with_album_art: payload.filter((t) => t.album_art_url).length,
      high_confidence: payload.filter((t) => t.spotify_high_confidence).length,
      missing_album_art: payload.filter((t) => t.spotify_id && !t.album_art_url).length,
      spotify_missing: spotifyMissing,
      spotify_connection: { enabled: spotifyEnabled, ...spotifyConn },
    };

    return NextResponse.json({ tracks: payload, debug });
  } catch (error) {
    return NextResponse.json(
      {
        tracks: [],
        debug: {
          database_path: getDatabasePath(),
          rows: 0,
          spotify_missing: [],
          route_error: error instanceof Error ? error.message : String(error),
        },
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
