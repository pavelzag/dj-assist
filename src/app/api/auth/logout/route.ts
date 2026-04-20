import { NextResponse } from 'next/server';
import { clearAuthSettings } from '@/lib/runtime-settings';

export const runtime = 'nodejs';

export async function POST() {
  await clearAuthSettings();
  return NextResponse.json({ ok: true });
}
