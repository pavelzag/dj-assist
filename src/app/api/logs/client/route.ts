import { NextRequest, NextResponse } from 'next/server';
import { appendClientDiagnosticLog, getClientDiagnosticLogs, getClientLogPath } from '@/lib/app-log';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const rawLimit = Number(request.nextUrl.searchParams.get('limit') ?? '100');
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, Math.round(rawLimit))) : 100;
  return NextResponse.json({
    ok: true,
    path: getClientLogPath(),
    entries: await getClientDiagnosticLogs(limit),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const level = body.level === 'warning' || body.level === 'error' || body.level === 'success' ? body.level : 'info';
  const message = String(body.message ?? '').trim();
  const category = String(body.category ?? '').trim() || undefined;
  const context = body.context && typeof body.context === 'object'
    ? body.context as Record<string, unknown>
    : undefined;

  if (!message) {
    return NextResponse.json({ ok: false, error: 'message is required' }, { status: 400 });
  }

  const filePath = await appendClientDiagnosticLog({
    timestamp: new Date().toISOString(),
    level,
    message,
    source: 'renderer',
    category,
    context,
  });

  return NextResponse.json({ ok: true, path: filePath });
}
