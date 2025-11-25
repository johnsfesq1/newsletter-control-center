/**
 * GET/POST /api/cron/daily-briefing
 * 
 * Automated endpoint for daily briefing generation.
 * Designed to be triggered by a cron scheduler (e.g., Vercel Cron, GitHub Actions)
 * at 8:15 AM daily.
 * 
 * Security: Protected by CRON_SECRET header/query param
 * 
 * Flow:
 * 1. Validate CRON_SECRET
 * 2. Generate briefing (last 24 hours)
 * 3. Send email to admin
 * 4. Return success response
 * 
 * Headers or Query Params:
 * - Authorization: Bearer <CRON_SECRET>
 * - ?secret=<CRON_SECRET>
 * 
 * Response:
 * {
 *   "success": true,
 *   "briefingId": "uuid",
 *   "emailSent": true,
 *   "emailCount": 42,
 *   "clusterCount": 5
 * }
 * 
 * Vercel Cron Configuration (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/cron/daily-briefing?secret=YOUR_SECRET",
 *     "schedule": "15 8 * * *"
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateBriefing } from '@/lib/briefing';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Maximum execution time (Vercel Pro: 300s, Hobby: 60s)
export const maxDuration = 300;

// Cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Validate the cron secret from request
 */
function isAuthorized(request: NextRequest): boolean {
  // If no secret configured, deny access in production
  if (!CRON_SECRET) {
    console.warn('⚠️  CRON_SECRET not configured');
    // Allow in development for testing
    return process.env.NODE_ENV === 'development';
  }

  // Check Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '').trim();
    if (token === CRON_SECRET) return true;
  }

  // Check query param (for Vercel Cron)
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret');
  if (secretParam === CRON_SECRET) return true;

  return false;
}

/**
 * Trigger email sending via internal API
 */
async function sendBriefingEmail(briefingId: string, baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/intelligence/briefing/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ briefingId }),
    });

    if (!response.ok) {
      console.error('❌ Email send failed:', await response.text());
      return false;
    }

    console.log('✅ Email send triggered successfully');
    return true;
  } catch (error) {
    console.error('❌ Email send error:', error);
    return false;
  }
}

async function handleCronRequest(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log('🕐 CRON: Daily Briefing Job Started');
  console.log('   Time:', new Date().toISOString());
  console.log('='.repeat(60) + '\n');

  // Check authorization
  if (!isAuthorized(request)) {
    console.error('❌ Unauthorized cron request');
    return NextResponse.json(
      { 
        error: 'Unauthorized', 
        message: 'Valid CRON_SECRET required',
      },
      { status: 401 }
    );
  }

  try {
    // Step 1: Generate the briefing (last 24 hours)
    console.log('📊 Step 1: Generating briefing (24h window)...');
    const result = await generateBriefing({ windowHours: 24 });

    console.log(`✅ Briefing generated: ${result.briefing_id}`);
    console.log(`   Emails processed: ${result.email_count}`);
    console.log(`   Clusters: ${result.content.narrative_clusters?.length || 0}`);

    // Step 2: Send email notification
    console.log('\n📧 Step 2: Sending email notification...');
    
    // Determine base URL for internal API call
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    const emailSent = await sendBriefingEmail(result.briefing_id, baseUrl);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log(`✅ CRON: Daily Briefing Job Complete (${duration}s)`);
    console.log('='.repeat(60) + '\n');

    return NextResponse.json({
      success: true,
      briefingId: result.briefing_id,
      generatedAt: result.generated_at,
      emailCount: result.email_count,
      clusterCount: result.content.narrative_clusters?.length || 0,
      emailSent,
      duration: `${duration}s`,
    });

  } catch (error) {
    console.error('❌ CRON job failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        success: false,
        error: 'Cron job failed',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

// Support both GET (Vercel Cron) and POST (manual trigger)
export async function GET(request: NextRequest) {
  return handleCronRequest(request);
}

export async function POST(request: NextRequest) {
  return handleCronRequest(request);
}

