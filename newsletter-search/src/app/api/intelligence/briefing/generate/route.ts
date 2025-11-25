/**
 * POST /api/intelligence/briefing/generate
 * 
 * Triggers the briefing generation pipeline.
 * Protected by Admin Key (Authorization header).
 * 
 * Request body (optional):
 * {
 *   "windowHours": 24,    // Override: process last N hours instead of delta
 *   "maxEmails": 100      // Override: limit number of emails to process
 * }
 * 
 * Response:
 * {
 *   "briefing_id": "uuid",
 *   "generated_at": "ISO timestamp",
 *   "time_window_start": "ISO timestamp",
 *   "time_window_end": "ISO timestamp",
 *   "email_count": 42,
 *   "content": { ... }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateBriefing } from '@/lib/briefing';
import type { BriefingPipelineOptions } from '@/lib/briefing';

// Admin key for protecting the generate endpoint
const ADMIN_KEY = process.env.BRIEFING_ADMIN_KEY || process.env.NEXT_PUBLIC_API_KEY;

/**
 * Validate admin authorization
 */
function isAuthorized(request: NextRequest): boolean {
  // If no admin key is configured, allow access (dev mode)
  if (!ADMIN_KEY) {
    console.warn('⚠️  No BRIEFING_ADMIN_KEY configured - running in dev mode');
    return true;
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return false;
  }

  // Support both "Bearer <key>" and just "<key>"
  const key = authHeader.replace('Bearer ', '').trim();
  return key === ADMIN_KEY;
}

export async function POST(request: NextRequest) {
  console.log('\n📬 POST /api/intelligence/briefing/generate');

  // Check authorization
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { 
        error: 'Unauthorized', 
        message: 'Valid admin key required in Authorization header',
        hint: 'Set BRIEFING_ADMIN_KEY environment variable and pass it as Bearer token'
      },
      { status: 401 }
    );
  }

  try {
    // Parse optional request body
    const options: BriefingPipelineOptions = {};
    
    try {
      const body = await request.json();
      if (body.windowHours && typeof body.windowHours === 'number') {
        options.windowStart = new Date(Date.now() - body.windowHours * 60 * 60 * 1000);
        options.windowEnd = new Date();
      }
      if (body.maxEmails && typeof body.maxEmails === 'number') {
        options.maxEmails = body.maxEmails;
      }
    } catch {
      // No body or invalid JSON - use defaults
    }

    // Run the pipeline
    const result = await generateBriefing(options);

    return NextResponse.json({
      success: true,
      ...result,
    });

  } catch (error) {
    console.error('❌ Briefing generation failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      {
        error: 'Briefing generation failed',
        message: errorMessage,
        hint: 'Check server logs for detailed error information',
      },
      { status: 500 }
    );
  }
}

// Also support GET for easy testing (same auth required)
export async function GET(request: NextRequest) {
  return POST(request);
}

