/**
 * GET /api/intelligence/briefing/preview
 * 
 * Renders a briefing as HTML email for preview or testing.
 * Accepts either an ID or uses the latest briefing.
 * 
 * Query Params:
 * - id: Optional briefing_id to render (defaults to latest)
 * 
 * Response: Raw HTML string (text/html content-type)
 * 
 * Usage:
 * - GET /api/intelligence/briefing/preview → Latest briefing as HTML
 * - GET /api/intelligence/briefing/preview?id=abc-123 → Specific briefing as HTML
 */

import { NextRequest, NextResponse } from 'next/server';
import { render } from '@react-email/render';
import { getLatestBriefing, getBriefingById } from '@/lib/briefing';
import { DailyBriefingEmail } from '@/emails/daily-briefing-template';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  console.log('\n🖼️  GET /api/intelligence/briefing/preview');

  try {
    const { searchParams } = new URL(request.url);
    const briefingId = searchParams.get('id');
    
    // Fetch the briefing
    let briefing;
    if (briefingId) {
      console.log(`   Fetching briefing: ${briefingId}`);
      briefing = await getBriefingById(briefingId);
      
      if (!briefing) {
        return NextResponse.json(
          {
            error: 'Briefing not found',
            message: `No briefing found with ID: ${briefingId}`,
            hint: 'Check the briefing ID or use /api/intelligence/briefing/archive to list available briefings',
          },
          { status: 404 }
        );
      }
    } else {
      console.log('   Fetching latest briefing');
      briefing = await getLatestBriefing();
      
      if (!briefing) {
        return NextResponse.json(
          {
            error: 'No briefings found',
            message: 'No briefings have been generated yet.',
            hint: 'POST to /api/intelligence/briefing/generate to create the first briefing',
          },
          { status: 404 }
        );
      }
    }

    console.log(`   Rendering briefing: ${briefing.briefing_id}`);
    console.log(`   Generated at: ${briefing.generated_at}`);
    console.log(`   Email count: ${briefing.email_count}`);

    // Get the dashboard URL from environment or use a default
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                   (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const dashboardUrl = `${baseUrl}/briefing`;

    // Render the email to HTML
    const html = await render(
      DailyBriefingEmail({
        content: briefing.content_json,
        briefingId: briefing.briefing_id,
        generatedAt: briefing.generated_at,
        emailCount: briefing.email_count,
        dashboardUrl,
      }),
      {
        pretty: true,
      }
    );

    console.log(`   ✅ Rendered ${html.length} bytes of HTML`);

    // Return as HTML
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });

  } catch (error) {
    console.error('❌ Failed to render briefing preview:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to render preview',
        message: errorMessage,
        hint: 'Check server logs for detailed error information',
      },
      { status: 500 }
    );
  }
}

