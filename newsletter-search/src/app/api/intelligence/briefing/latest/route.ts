/**
 * GET /api/intelligence/briefing/latest
 * 
 * Fetches the most recent briefing from BigQuery.
 * No authentication required (public read).
 * 
 * Cache: revalidate every 5 minutes
 * 
 * Response (success):
 * {
 *   "briefing_id": "uuid",
 *   "generated_at": "ISO timestamp",
 *   "time_window_start": "ISO timestamp",
 *   "time_window_end": "ISO timestamp",
 *   "email_count": 42,
 *   "content_json": { ... }
 * }
 * 
 * Response (no briefings):
 * {
 *   "error": "No briefings found",
 *   "message": "No briefings have been generated yet"
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLatestBriefing, getBriefingArchive } from '@/lib/briefing';

// Force dynamic rendering (since we use request.url for optional params)
// Cache headers are set manually in the response
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  console.log('\n📖 GET /api/intelligence/briefing/latest');

  try {
    // Check if archive is requested
    const { searchParams } = new URL(request.url);
    const includeArchive = searchParams.get('includeArchive') === 'true';
    const archiveLimit = parseInt(searchParams.get('archiveLimit') || '30', 10);

    const briefing = await getLatestBriefing();

    if (!briefing) {
      return NextResponse.json(
        {
          error: 'No briefings found',
          message: 'No briefings have been generated yet. Trigger a generation first.',
          hint: 'POST to /api/intelligence/briefing/generate to create the first briefing',
        },
        { status: 404 }
      );
    }

    // Optionally include archive list
    let archive = null;
    if (includeArchive) {
      archive = await getBriefingArchive(archiveLimit);
    }

    const response = NextResponse.json({
      ...briefing,
      ...(archive ? { archive } : {}),
    });
    
    // Cache for 5 minutes
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    
    return response;

  } catch (error) {
    console.error('❌ Failed to fetch latest briefing:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to fetch briefing',
        message: errorMessage,
        hint: 'Check BigQuery connection and permissions',
      },
      { status: 500 }
    );
  }
}

