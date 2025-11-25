/**
 * GET /api/intelligence/briefing/archive
 * 
 * Fetches list of all briefings (metadata only, no content).
 * Used for the archive sidebar in the UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBriefingArchive } from '@/lib/briefing';

export async function GET(request: NextRequest) {
  console.log('\n📚 GET /api/intelligence/briefing/archive');

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '30', 10);

    const archive = await getBriefingArchive(limit);

    return NextResponse.json({
      count: archive.length,
      briefings: archive,
    });

  } catch (error) {
    console.error('❌ Failed to fetch briefing archive:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to fetch archive',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

