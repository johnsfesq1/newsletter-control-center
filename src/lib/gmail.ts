import { google } from 'googleapis';

import type { gmail_v1 } from 'googleapis';

/**
 * Returns an authenticated Gmail client using a long-lived refresh token.
 * Supports multiple inboxes: 'legacy' or 'clean'
 * 
 * Legacy mode: Uses GMAIL_LEGACY_REFRESH_TOKEN (backward compatible with GMAIL_REFRESH_TOKEN)
 * Clean mode: Uses GMAIL_CLEAN_REFRESH_TOKEN
 * 
 * Assumes the following environment variables are already set at runtime:
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, 
 *   GMAIL_LEGACY_REFRESH_TOKEN (or GMAIL_REFRESH_TOKEN for backward compatibility),
 *   GMAIL_CLEAN_REFRESH_TOKEN (for clean inbox)
 */
export function getGmail(inboxType: 'legacy' | 'clean' = 'legacy'): gmail_v1.Gmail {
  const {
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    GMAIL_REFRESH_TOKEN,           // Backward compatible
    GMAIL_LEGACY_REFRESH_TOKEN,    // New dual inbox
    GMAIL_CLEAN_REFRESH_TOKEN,     // New dual inbox
  } = process.env;

  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    throw new Error('Missing Gmail env vars: GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET');
  }

  // Select the appropriate refresh token
  let refreshToken: string | undefined;
  
  if (inboxType === 'clean') {
    refreshToken = GMAIL_CLEAN_REFRESH_TOKEN;
  } else {
    // For legacy, try GMAIL_LEGACY_REFRESH_TOKEN first, fall back to GMAIL_REFRESH_TOKEN
    refreshToken = GMAIL_LEGACY_REFRESH_TOKEN || GMAIL_REFRESH_TOKEN;
  }
  
  if (!refreshToken) {
    throw new Error(`Missing refresh token for ${inboxType} inbox. Check your .env file for GMAIL_${inboxType.toUpperCase()}_REFRESH_TOKEN or GMAIL_REFRESH_TOKEN`);
  }

  const oAuth2Client = new google.auth.OAuth2({
    clientId: GMAIL_CLIENT_ID,
    clientSecret: GMAIL_CLIENT_SECRET,
    redirectUri: 'urn:ietf:wg:oauth:2.0:oob', // unused with refresh token but required by constructor
  });

  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  return google.gmail({ version: 'v1', auth: oAuth2Client });
}

/**
 * Extracts a plain email address from a From header.
 * Examples:
 *   "Name <user@example.com>" -> "user@example.com"
 *   "user@example.com"        -> "user@example.com"
 */
export function extractEmailAddress(fromHeader: string): string {
  if (!fromHeader) return '';

  // Common cases: `"Name" <user@example.com>` or `Name <user@example.com>`
  const angleMatch = fromHeader.match(/<([^>]+)>/);
  if (angleMatch && angleMatch[1]) return angleMatch[1].trim().toLowerCase();

  // Fallback: try a bare email inside the string
  const emailMatch = fromHeader.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch ? emailMatch[0].trim().toLowerCase() : fromHeader.trim().toLowerCase();
}

/**
 * Apply "Ingested" label to a message in Gmail
 * 
 * This function automatically creates the "Ingested" label if it doesn't exist,
 * then applies it to the specified message.
 * 
 * Used to mark newsletters that have been successfully processed.
 * 
 * @param gmail Authenticated Gmail client
 * @param messageId Gmail message ID to label
 * @param labelName Optional label name (defaults to "Ingested")
 * @returns void (logs on failure, doesn't throw)
 */
export async function markAsIngested(
  gmail: gmail_v1.Gmail, 
  messageId: string,
  labelName: string = 'Ingested'
): Promise<void> {
  try {
    // Get or create the label
    const labels = await gmail.users.labels.list({ userId: 'me' });
    let ingestedLabel = labels.data.labels?.find(l => l.name?.toLowerCase() === labelName.toLowerCase());
    
    if (!ingestedLabel) {
      // Create it if doesn't exist
      const newLabel = await gmail.users.labels.create({
        userId: 'me',
        requestBody: { name: labelName }
      });
      ingestedLabel = newLabel.data;
    }
    
    if (!ingestedLabel.id) {
      throw new Error(`Could not get or create "${labelName}" label`);
    }
    
    // Apply the label
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: [ingestedLabel.id]
      }
    });
    
  } catch (error) {
    console.error(`⚠️  Failed to apply "${labelName}" label to ${messageId}:`, error instanceof Error ? error.message : error);
    // Don't throw - labeling failure shouldn't stop ingestion
  }
}
