import { NextResponse } from 'next/server';
import { getLibraryOverview } from '@/lib/db';

export async function GET() {
  const overview = await getLibraryOverview();
  return NextResponse.json(overview);
}
