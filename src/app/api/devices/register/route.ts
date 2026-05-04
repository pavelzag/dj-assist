import { NextRequest, NextResponse } from 'next/server';
import { registerCurrentServerDevice } from '@/lib/server-account';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const accepted = await registerCurrentServerDevice({
      platform: String(body.platform ?? '').trim() || undefined,
      deviceName: String(body.deviceName ?? '').trim() || undefined,
    });
    return NextResponse.json({ ok: true, accepted });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Could not register device.' },
      { status: 502 },
    );
  }
}
