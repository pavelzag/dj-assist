import { NextRequest, NextResponse } from 'next/server';
import { proFeaturesEnabled } from '@/lib/app-flavor';
import {
  effectiveScanProfileSettings,
  saveScanProfileSettings,
  scanProfileRuntimeSummary,
} from '@/lib/runtime-settings';

export const runtime = 'nodejs';

export async function GET() {
  if (!proFeaturesEnabled()) {
    return NextResponse.json({ error: 'Scan profile settings are not available in this app version.' }, { status: 403 });
  }
  return NextResponse.json({
    ok: true,
    settings: await effectiveScanProfileSettings(),
    runtime: await scanProfileRuntimeSummary(),
  });
}

export async function POST(request: NextRequest) {
  if (!proFeaturesEnabled()) {
    return NextResponse.json({ error: 'Scan profile settings are not available in this app version.' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const settings = await saveScanProfileSettings({
    mode: String(body.mode ?? 'auto') as 'auto' | 'low' | 'high',
  });
  return NextResponse.json({
    ok: true,
    settings,
    runtime: await scanProfileRuntimeSummary(),
  });
}
