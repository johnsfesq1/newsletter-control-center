import type { gmail_v1 } from 'googleapis';

/**
 * Generate a unique deduplication key for a Gmail message
 * Uses Message-ID + List-Id headers for newsletter uniqueness
 */
export interface DedupeKey {
  messageId: string;      // Gmail Message-ID header
  listId?: string;        // List-Id header (newsletter unique)
  sender: string;         // From email address
  subject: string;        // Subject line
  sentDate: string;       // Sent date
}

/**
 * Extract deduplication key from a Gmail message
 */
export function generateDedupeKey(message: gmail_v1.Schema$Message): DedupeKey {
  const headers = message.payload?.headers || [];
  
  const getHeader = (name: string): string => {
    return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
  };
  
  const messageId = getHeader('Message-ID') || '';
  const listId = getHeader('List-Id') || getHeader('List-ID') || '';
  const fromHeader = getHeader('From') || '';
  const subject = getHeader('Subject') || '';
  const date = getHeader('Date') || '';
  
  // Extract email address from From header
  const sender = extractEmailFromHeader(fromHeader);
  
  return {
    messageId,
    listId: listId || undefined,
    sender,
    subject,
    sentDate: date
  };
}

/**
 * Generate a canonical string key for comparison
 */
export function keyToString(key: DedupeKey): string {
  // Use List-Id for newsletters (most reliable), fall back to Message-ID
  const primaryId = key.listId || key.messageId;
  return `${primaryId}|${key.sender}|${key.subject}|${key.sentDate}`;
}

/**
 * Extract email address from From header
 */
function extractEmailFromHeader(fromHeader: string): string {
  if (!fromHeader) return '';
  
  // Extract from angle brackets: "Name <user@example.com>"
  const angleMatch = fromHeader.match(/<([^>]+)>/);
  if (angleMatch && angleMatch[1]) return angleMatch[1].trim().toLowerCase();
  
  // Fallback: try bare email in string
  const emailMatch = fromHeader.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch ? emailMatch[0].trim().toLowerCase() : fromHeader.trim().toLowerCase();
}

/**
 * Check if a message is a duplicate based on existing keys
 */
export function isDuplicate(key: DedupeKey, existingKeys: Set<string>): boolean {
  const keyStr = keyToString(key);
  return existingKeys.has(keyStr);
}
