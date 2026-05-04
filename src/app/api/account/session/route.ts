import { NextResponse } from 'next/server';
import { fetchServerAccountSession } from '@/lib/server-account';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await fetchServerAccountSession();
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Could not load account session.' },
      { status: 502 },
    );
  }
}
