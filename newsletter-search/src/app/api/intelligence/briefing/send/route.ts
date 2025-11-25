/**
 * POST /api/intelligence/briefing/send
 * 
 * Sends a briefing via email using Resend.
 * 
 * Request body:
 * {
 *   "briefingId": "optional-uuid",  // Defaults to latest
 *   "recipient": "optional-email"   // Defaults to ADMIN_EMAIL
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "briefingId": "uuid",
 *   "recipient": "email",
 *   "subject": "Intelligence Briefing: Nov 25",
 *   "emailId": "resend-email-id"
 * }
 * 
 * Environment Variables:
 * - RESEND_API_KEY: Required for email delivery
 * - ADMIN_EMAIL: Default recipient
 * - FROM_EMAIL: Sender address (defaults to onboarding@resend.dev)
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { getLatestBriefing, getBriefingById } from '@/lib/briefing';
import { DailyBriefingEmail } from '@/emails/daily-briefing-template';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Email configuration
const FROM_EMAIL = process.env.FROM_EMAIL || 'Intelligence Engine <onboarding@resend.dev>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export async function POST(request: NextRequest) {
  console.log('\n📧 POST /api/intelligence/briefing/send');

  // Check for API key
  if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY not configured');
    return NextResponse.json(
      {
        error: 'Email service not configured',
        message: 'RESEND_API_KEY environment variable is not set',
        hint: 'Add RESEND_API_KEY to your .env.local file',
      },
      { status: 500 }
    );
  }

  try {
    // Parse request body
    let briefingId: string | null = null;
    let recipient: string | null = null;

    try {
      const body = await request.json();
      if (body.briefingId) briefingId = body.briefingId;
      if (body.recipient) recipient = body.recipient;
    } catch {
      // No body or invalid JSON - use defaults
    }

    // Determine recipient
    const toEmail = recipient || ADMIN_EMAIL;
    if (!toEmail) {
      return NextResponse.json(
        {
          error: 'No recipient specified',
          message: 'Provide a recipient in the request body or set ADMIN_EMAIL environment variable',
        },
        { status: 400 }
      );
    }

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
          },
          { status: 404 }
        );
      }
    }

    // Format date for subject line
    const date = new Date(briefing.generated_at);
    const formattedDate = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const subject = `Intelligence Briefing: ${formattedDate}`;

    // Get the dashboard URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                   (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const dashboardUrl = `${baseUrl}/briefing`;

    // Render the email HTML
    console.log('   Rendering email template...');
    const html = await render(
      DailyBriefingEmail({
        content: briefing.content_json,
        briefingId: briefing.briefing_id,
        generatedAt: briefing.generated_at,
        emailCount: briefing.email_count,
        dashboardUrl,
      }),
      { pretty: false } // Minify for email
    );

    console.log(`   HTML rendered: ${html.length} bytes`);

    // Send email via Resend
    console.log(`   Sending to: ${toEmail}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   From: ${FROM_EMAIL}`);

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject: subject,
      html: html,
    });

    if (error) {
      console.error('❌ Resend API error:', error);
      return NextResponse.json(
        {
          error: 'Failed to send email',
          message: error.message || 'Unknown Resend error',
          details: error,
        },
        { status: 500 }
      );
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ EMAIL SENT SUCCESSFULLY`);
    console.log(`${'='.repeat(60)}`);
    console.log(`   To: ${toEmail}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Briefing ID: ${briefing.briefing_id}`);
    console.log(`   Resend Email ID: ${data?.id}`);
    console.log(`${'='.repeat(60)}\n`);

    return NextResponse.json({
      success: true,
      briefingId: briefing.briefing_id,
      recipient: toEmail,
      subject,
      emailId: data?.id,
    });

  } catch (error) {
    console.error('❌ Failed to send briefing email:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to send email',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
