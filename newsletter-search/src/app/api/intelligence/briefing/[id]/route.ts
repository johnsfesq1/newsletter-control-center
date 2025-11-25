/**
 * GET /api/intelligence/briefing/[id]
 * 
 * Fetches a specific briefing by ID from BigQuery.
 * No authentication required (public read).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBriefingById } from '@/lib/briefing';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  console.log(`\n📖 GET /api/intelligence/briefing/${id}`);

  try {
    const briefing = await getBriefingById(id);

    if (!briefing) {
      return NextResponse.json(
        {
          error: 'Briefing not found',
          message: `No briefing found with ID: ${id}`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(briefing);

  } catch (error) {
    console.error('❌ Failed to fetch briefing:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to fetch briefing',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

