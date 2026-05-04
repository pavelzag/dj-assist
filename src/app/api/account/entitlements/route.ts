import { NextResponse } from 'next/server';
import { fetchServerEntitlements } from '@/lib/server-account';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const entitlements = await fetchServerEntitlements();
    return NextResponse.json({ ok: true, entitlements });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Could not load entitlements.' },
      { status: 502 },
    );
  }
}
