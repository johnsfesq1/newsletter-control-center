import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { BigQuery } from '@google-cloud/bigquery';
import { getGmail, extractEmailAddress, markAsIngested } from '../src/lib/gmail';
import { extractPlaintext, getHeader } from '../src/lib/parseMessage';
import vipConfig from '../config/vip.json';
import paidConfig from '../config/paid-senders.json';
import type { gmail_v1 } from 'googleapis';

dotenv.config();

// BigQuery configuration
const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const TABLE_ID = 'messages';

// Batch processing configuration
const BATCH_SIZE = 500;
const PROGRESS_LOG_INTERVAL = 100;
const BIGQUERY_INSERT_CHUNK_SIZE = 50;  // Insert messages in chunks of 50

const TEST_MODE = false;  // Set to false for full ingestion
const TEST_LIMIT = 100;  // Only used when TEST_MODE is true

// Initialize BigQuery client using Application Default Credentials
const bigquery = new BigQuery({ projectId: PROJECT_ID });

// Statistics tracking
interface ProcessingStats {
  totalFetched: number;
  totalProcessed: number;
  totalInserted: number;
  duplicatesSkipped: number;
  failures: number;
  startTime: Date;
  batchTimes: number[];
}

interface FailedMessage {
  id: string;
  error: string;
  timestamp: string;
}

interface NewsletterMessage {
  id: string;
  sender: string;
  subject: string;
  sent_date: string | null;
  received_date: string | null;
  body_text: string;
  body_html: string | null;
  is_vip: boolean;
  is_paid: boolean | null;
  publisher_name: string;
  source_type: string;
  word_count: number;
  has_attachments: boolean;
  doc_id: string | null;
  doc_version: number | null;
  from_domain: string | null;
  list_id: string | null;
  was_forwarded: boolean | null;
  source_inbox: string | null;
}

/**
 * Generate stable doc_id from message metadata
 */
function generateDocId(sender: string, subject: string, sentDate: string | null): string {
  const data = `${sender}|${subject}|${sentDate || ''}`;
  return createHash('sha256').update(data).digest('hex').substring(0, 32);
}

/**
 * Check if an email address is VIP based on config
 */
function isVipEmail(fromEmail: string): boolean {
  // Check if email exactly matches any VIP sender
  if (vipConfig.senders.includes(fromEmail)) {
    return true;
  }
  
  // Check if domain matches any VIP domain
  const domain = fromEmail.split('@')[1]?.toLowerCase();
  if (domain && vipConfig.domains.includes(domain)) {
    return true;
  }
  
  return false;
}

/**
 * Check if an email address is a paid newsletter based on config
 */
function isPaidNewsletter(fromEmail: string): boolean {
  // Check if email exactly matches any paid sender
  if (paidConfig.senders.includes(fromEmail)) {
    return true;
  }
  
  return false;
}

/**
 * Extract publisher name from sender email or From header
 */
function extractPublisherName(fromHeader: string, fromEmail: string): string {
  // Try to extract name from "Name <email@domain.com>" format
  const nameMatch = fromHeader.match(/^(.+?)\s*<.+>$/);
  if (nameMatch && nameMatch[1]) {
    return nameMatch[1].trim();
  }
  
  // Fallback to domain name (everything before @)
  return fromEmail.split('@')[0] || 'Unknown';
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Check if message has attachments
 */
function hasAttachments(msg: gmail_v1.Schema$Message): boolean {
  return !!(msg.payload?.parts?.some((part: gmail_v1.Schema$MessagePart) => 
    part.filename && part.filename.length > 0
  ));
}

/**
 * Extract HTML content from message parts
 */
function extractHtmlContent(msg: gmail_v1.Schema$Message): string | null {
  if (!msg || !msg.payload) return null;

  const parts: gmail_v1.Schema$MessagePart[] = [];
  
  // Flatten all parts recursively
  function walk(part?: gmail_v1.Schema$MessagePart) {
    if (!part) return;
    parts.push(part);
    if (part.parts) part.parts.forEach(walk);
  }
  
  walk(msg.payload);

  // Look for text/html part
  for (const part of parts) {
    if ((part.mimeType || '').toLowerCase().startsWith('text/html')) {
      const data = part.body?.data;
      if (data) {
        // Decode base64 URL
        const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
        const buff = Buffer.from(normalized, 'base64');
        return buff.toString('utf-8');
      }
    }
  }
  
  return null;
}

/**
 * Convert Gmail internal date to ISO string
 */
function convertInternalDate(internalDate: string): string | null {
  try {
    const timestamp = parseInt(internalDate);
    return new Date(timestamp).toISOString();
  } catch {
    return null;
  }
}

/**
 * Convert Date header to ISO string
 */
function convertDateHeader(dateHeader: string): string | null {
  try {
    return new Date(dateHeader).toISOString();
  } catch {
    return null;
  }
}

/**
 * Check which message IDs already exist in BigQuery
 */
async function getExistingMessageIds(messageIds: string[]): Promise<Set<string>> {
  try {
    const query = `
      SELECT id 
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      WHERE id IN (${messageIds.map(id => `'${id}'`).join(', ')})
    `;
    
    const [rows] = await bigquery.query(query);
    return new Set(rows.map((row: any) => row.id));
  } catch (error) {
    console.error('Error checking existing messages:', error);
    return new Set(); // Return empty set on error to be safe
  }
}

/**
 * Process a single message with error handling
 */
async function processMessage(
  gmail: gmail_v1.Gmail, 
  msgId: string, 
  stats: ProcessingStats, 
  failedMessages: FailedMessage[]
): Promise<NewsletterMessage | null> {
  try {
    // Get full message content
    const fullMsg = await gmail.users.messages.get({
      userId: 'me',
      id: msgId,
      format: 'full'
    });
    
    // Extract headers
    const fromHeader = getHeader(fullMsg.data, 'From');
    const subject = getHeader(fullMsg.data, 'Subject') || '(no subject)';
    const dateHeader = getHeader(fullMsg.data, 'Date');
    const listIdHeader = getHeader(fullMsg.data, 'List-Id');
    
    // Extract email address
    const fromEmail = extractEmailAddress(fromHeader);
    const fromDomain = fromEmail.split('@')[1] || null;
    
    // Extract content
    const bodyText = extractPlaintext(fullMsg.data);
    const bodyHtml = extractHtmlContent(fullMsg.data);
    
    // Check if forwarded
    const wasForwarded = getHeader(fullMsg.data, 'X-Forwarded-For') !== '' || 
                         getHeader(fullMsg.data, 'X-Original-To') !== '' ||
                         fromHeader.toLowerCase().includes('forwarded message');
    
    // Generate doc_id
    const sentDate = convertDateHeader(dateHeader);
    const docId = generateDocId(fromEmail, subject, sentDate);
    
    // Build message object
    const message: NewsletterMessage = {
      id: msgId,
      sender: fromEmail,
      subject: subject,
      sent_date: sentDate,
      received_date: convertInternalDate(fullMsg.data.internalDate || ''),
      body_text: bodyText,
      body_html: bodyHtml,
      is_vip: isVipEmail(fromEmail),
      is_paid: isPaidNewsletter(fromEmail),
      publisher_name: extractPublisherName(fromHeader, fromEmail),
      source_type: 'newsletter',
      word_count: countWords(bodyText),
      has_attachments: hasAttachments(fullMsg.data),
      doc_id: docId,
      doc_version: 1,
      from_domain: fromDomain,
      list_id: listIdHeader || null,
      was_forwarded: wasForwarded,
      source_inbox: null  // Will be set by caller if needed
    };
    
    return message;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    failedMessages.push({
      id: msgId,
      error: errorMsg,
      timestamp: new Date().toISOString()
    });
    stats.failures++;
    console.error(`Failed to process message ${msgId}:`, errorMsg);
    return null;
  }
}

/**
 * Insert messages to BigQuery in chunks to avoid 413 errors
 * Optionally applies Gmail labels for successfully inserted messages
 */
async function insertMessagesInChunks(
  messages: NewsletterMessage[],
  stats: ProcessingStats,
  gmail?: gmail_v1.Gmail,
  inboxType?: 'legacy' | 'clean'
): Promise<void> {
  if (messages.length === 0) return;
  
  const dataset = bigquery.dataset(DATASET_ID);
  const table = dataset.table(TABLE_ID);
  
  // Split messages into chunks
  const chunks: NewsletterMessage[][] = [];
  for (let i = 0; i < messages.length; i += BIGQUERY_INSERT_CHUNK_SIZE) {
    chunks.push(messages.slice(i, i + BIGQUERY_INSERT_CHUNK_SIZE));
  }
  
  console.log(`💾 Inserting ${messages.length} messages in ${chunks.length} chunks of ${BIGQUERY_INSERT_CHUNK_SIZE}...`);
  
  // Insert each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkNumber = i + 1;
    
    try {
      console.log(`📤 Inserting chunk ${chunkNumber}/${chunks.length} (${chunk.length} messages)...`);
      
      const insertResult = await table.insert(chunk);
      
      // Check for insertion errors
      const response = insertResult[0] as any;
      if (response?.insertErrors && response.insertErrors.length > 0) {
        console.error(`❌ Chunk ${chunkNumber} had insertion errors:`, response.insertErrors);
        // Continue with next chunk even if this one failed
      } else {
        stats.totalInserted += chunk.length;
        console.log(`✅ Chunk ${chunkNumber} inserted successfully (${chunk.length} messages)`);
        
        // Apply Gmail labels for successfully inserted messages (only for clean inbox)
        if (gmail && inboxType === 'clean') {
          console.log(`🏷️  Applying labels to ${chunk.length} messages...`);
          for (const msg of chunk) {
            await markAsIngested(gmail, msg.id);
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Failed to insert chunk ${chunkNumber}:`, error);
      // Continue with next chunk
    }
  }
}

/**
 * Write failed messages to file
 */
function writeFailedMessages(failedMessages: FailedMessage[]): void {
  if (failedMessages.length === 0) return;
  
  const failedFile = path.join(process.cwd(), 'failed-messages.json');
  try {
    fs.writeFileSync(failedFile, JSON.stringify(failedMessages, null, 2));
    console.log(`\n⚠️  ${failedMessages.length} failed messages written to: ${failedFile}`);
  } catch (error) {
    console.error('Failed to write failed messages file:', error);
  }
}

(async () => {
  const stats: ProcessingStats = {
    totalFetched: 0,
    totalProcessed: 0,
    totalInserted: 0,
    duplicatesSkipped: 0,
    failures: 0,
    startTime: new Date(),
    batchTimes: []
  };
  
  const failedMessages: FailedMessage[] = [];
  
  try {
    console.log('🚀 Starting newsletter ingestion...');
    console.log(`📊 Batch size: ${BATCH_SIZE} messages`);
    console.log(`⏰ Started at: ${stats.startTime.toISOString()}\n`);
    
    // Get Gmail client (default to legacy inbox)
    const GMAIL_INBOX = (process.env.GMAIL_INBOX as 'legacy' | 'clean') || 'legacy';
    const gmail = getGmail(GMAIL_INBOX);
    
    // Get custom query from env or default to inbox
    const customQuery = process.env.GMAIL_INGESTION_QUERY || 'in:inbox';
    
    // Get total message count estimate
    const initialListRes = await gmail.users.messages.list({
      userId: 'me',
      q: customQuery,
      maxResults: 1
    });
    
    const totalEstimate = initialListRes.data.resultSizeEstimate || 0;
    console.log(`📧 Estimated total messages: ${totalEstimate.toLocaleString()}`);
    
    let pageToken: string | undefined;
    let batchNumber = 1;
    
    // Process messages in batches
    while (true) {
      const batchStartTime = Date.now();
      console.log(`\n📦 Fetching batch ${batchNumber}...`);
      
      // Fetch batch of messages
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: customQuery,
        maxResults: BATCH_SIZE,
        pageToken: pageToken || undefined
      });
      
      const messageIds = (listRes.data.messages || []).map((msg: gmail_v1.Schema$Message) => msg.id!);
      
      // Check if we should stop for test mode
      if (TEST_MODE && stats.totalFetched >= TEST_LIMIT) {
        console.log(`\n⚠️  TEST MODE: Stopping after ${stats.totalFetched} messages\n`);
        break;
      }
      
      if (messageIds.length === 0) {
        console.log('✅ No more messages to process');
        break;
      }
      
      stats.totalFetched += messageIds.length;
      console.log(`📥 Fetched ${messageIds.length} message IDs`);
      
      // Check for duplicates
      console.log('🔍 Checking for duplicates...');
      const existingIds = await getExistingMessageIds(messageIds);
      const newMessageIds = messageIds.filter(id => !existingIds.has(id));
      const duplicatesInBatch = messageIds.length - newMessageIds.length;
      
      stats.duplicatesSkipped += duplicatesInBatch;
      
      if (duplicatesInBatch > 0) {
        console.log(`⏭️  Skipping ${duplicatesInBatch} duplicates`);
      }
      
      if (newMessageIds.length === 0) {
        console.log('⏭️  All messages in this batch are duplicates, skipping...');
        pageToken = listRes.data.nextPageToken || undefined;
        batchNumber++;
        continue;
      }
      
      console.log(`🔄 Processing ${newMessageIds.length} new messages...`);
      
      // Process each message in the batch
      const messages: NewsletterMessage[] = [];
      
      for (let i = 0; i < newMessageIds.length; i++) {
        const msgId = newMessageIds[i];
        stats.totalProcessed++;
        
        // Progress logging
        if (stats.totalProcessed % PROGRESS_LOG_INTERVAL === 0) {
          const progress = totalEstimate > 0 ? (stats.totalProcessed / totalEstimate * 100).toFixed(1) : '?';
          console.log(`📈 Processed ${stats.totalProcessed}/${totalEstimate} (${progress}% complete)`);
        }
        
        const message = await processMessage(gmail, msgId, stats, failedMessages);
        if (message) {
          message.source_inbox = GMAIL_INBOX;
          messages.push(message);
        }
      }
      
      // Insert batch to BigQuery in chunks
      if (messages.length > 0) {
        await insertMessagesInChunks(messages, stats, gmail, GMAIL_INBOX);
      }
      
      // Update pagination
      pageToken = listRes.data.nextPageToken || undefined;
      if (!pageToken) {
        console.log('✅ Reached end of messages');
        break;
      }
      
      // Log batch timing
      const batchTime = (Date.now() - batchStartTime) / 1000;
      stats.batchTimes.push(batchTime);
      console.log(`⏱️  Batch ${batchNumber} took ${batchTime.toFixed(1)} seconds`);
      
      batchNumber++;
    }
    
    // Final summary
    const totalTime = (Date.now() - stats.startTime.getTime()) / 1000;
    const avgBatchTime = stats.batchTimes.length > 0 
      ? stats.batchTimes.reduce((a, b) => a + b, 0) / stats.batchTimes.length 
      : 0;
    
    console.log('\n🎉 INGESTION COMPLETE!');
    console.log('='.repeat(50));
    console.log(`📊 Total fetched: ${stats.totalFetched.toLocaleString()}`);
    console.log(`🔄 Total processed: ${stats.totalProcessed.toLocaleString()}`);
    console.log(`💾 Total inserted: ${stats.totalInserted.toLocaleString()}`);
    console.log(`⏭️  Duplicates skipped: ${stats.duplicatesSkipped.toLocaleString()}`);
    console.log(`❌ Failures: ${stats.failures.toLocaleString()}`);
    console.log(`⏰ Total time: ${(totalTime / 60).toFixed(1)} minutes`);
    console.log(`⚡ Average batch time: ${avgBatchTime.toFixed(1)} seconds`);
    console.log(`📈 Processing rate: ${(stats.totalProcessed / totalTime).toFixed(1)} messages/second`);
    
    // Write failed messages to file
    writeFailedMessages(failedMessages);
    
    if (stats.failures > 0) {
      console.log(`\n⚠️  ${stats.failures} messages failed to process. Check failed-messages.json for details.`);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('💥 Fatal error during ingestion:', error);
    writeFailedMessages(failedMessages);
    process.exit(1);
  }
})();
