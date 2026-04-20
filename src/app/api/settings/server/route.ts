import { NextRequest, NextResponse } from 'next/server';
import { saveServerSettings, serverRuntimeSummary } from '@/lib/runtime-settings';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    ok: true,
    server: await serverRuntimeSummary(),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  await saveServerSettings({
    enabled: Boolean(body.enabled),
    localDebug: Boolean(body.localDebug),
    serverUrl: String(body.serverUrl ?? '').trim(),
    localServerUrl: String(body.localServerUrl ?? '').trim(),
  });

  return NextResponse.json({
    ok: true,
    server: await serverRuntimeSummary(),
  });
}
