import { NextResponse } from 'next/server';
import { getLibraryOverview } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const overview = await getLibraryOverview();
  return NextResponse.json(overview);
}
