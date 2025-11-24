import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getGmail } from '../src/gmail/client';
import { getTable } from '../src/bq/client';
import { extractPlaintext, getHeader } from '../src/lib/parseMessage';
import { extractEmailAddress } from '../src/lib/gmail';
import { createHash } from 'crypto';
import type { gmail_v1 } from 'googleapis';

interface IngestConfig {
  projectId: string;
  dataset: string;
  location: string;
  query: string;
  processedLabel: string;
  paidLabel: string;
  markRead: boolean;
  inbox: 'me' | 'other';
  dryRun: boolean;
  limit: number;
}

function validateEnv(): void {
  const required = [
    'BQ_PROJECT_ID',
    'BQ_DATASET',
    'BQ_LOCATION',
    'GMAIL_QUERY',
    'GMAIL_PROCESSED_LABEL',
    'GMAIL_PAID_LABEL',
    'GMAIL_MARK_READ',
  ];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('dry-run', {
      type: 'boolean',
      default: true,
      description: 'Run in dry-run mode (no actual API calls)',
    })
    .option('limit', {
      type: 'number',
      default: 10,
      description: 'Maximum number of emails to process',
    })
    .option('inbox', {
      type: 'string',
      choices: ['me', 'other'] as const,
      default: 'me',
      description: 'Inbox to process',
    })
    .option('reauth', {
      type: 'boolean',
      default: false,
      description: 'Force re-authorization by deleting existing token',
    })
    .parse();

  validateEnv();

  const config: IngestConfig = {
    projectId: process.env.BQ_PROJECT_ID!,
    dataset: process.env.BQ_DATASET!,
    location: process.env.BQ_LOCATION!,
    query: process.env.GMAIL_QUERY!,
    processedLabel: process.env.GMAIL_PROCESSED_LABEL!,
    paidLabel: process.env.GMAIL_PAID_LABEL!,
    markRead: process.env.GMAIL_MARK_READ === 'true',
    inbox: argv.inbox as 'me' | 'other',
    dryRun: argv['dry-run'],
    limit: argv.limit,
  };

  console.log('Ingest Config:');
  console.log(`  project: ${config.projectId}`);
  console.log(`  dataset: ${config.dataset}`);
  console.log(`  location: ${config.location}`);
  console.log(`  query: ${config.query}`);
  console.log(`  processed_label: ${config.processedLabel}`);
  console.log(`  paid_label: ${config.paidLabel}`);
  console.log(`  mark_read: ${config.markRead}`);
  console.log(`  inbox: ${config.inbox}`);
  console.log(`  dry_run: ${config.dryRun}`);
  console.log(`  limit: ${config.limit}\n`);

  const isReadonly = process.env.GMAIL_READONLY !== 'false'; // default true
  if (isReadonly) {
    console.log('Gmail: READONLY mode active — skipping modifications');
  }

  let gmail: gmail_v1.Gmail;
  try {
    gmail = await getGmail(config.inbox, { reauth: (argv as any).reauth ?? false });
  } catch (error: any) {
    const errorMsg = error.message || JSON.stringify(error);
    if (errorMsg.includes('invalid_rapt') || errorMsg.includes('invalid_grant')) {
      console.error('Auth requires re-consent. Re-run with --reauth (and ensure Desktop credentials).');
    } else {
      console.error('Auth failed. Try --reauth');
    }
    process.exit(1);
  }

  // Get labels map
  let labelsRes;
  try {
    labelsRes = await gmail.users.labels.list({ userId: 'me' });
  } catch (error: any) {
    throw new Error(`Gmail labels.list failed: ${error.message || 'unknown error'}`);
  }
  const labelsMap = new Map<string, string>();
  const labelIdMap = new Map<string, string>(); // name -> id for applying labels
  if (labelsRes.data.labels) {
    for (const label of labelsRes.data.labels) {
      if (label.id && label.name) {
        labelsMap.set(label.id, label.name);
        labelIdMap.set(label.name, label.id);
      }
    }
  }

  // List messages
  let listRes;
  try {
    listRes = await gmail.users.messages.list({
      userId: 'me',
      q: config.query,
      maxResults: config.limit,
    });
  } catch (error: any) {
    throw new Error(`Gmail messages.list failed: ${error.message || 'unknown error'}`);
  }

  const messageIds = (listRes.data.messages || []).map(m => m.id!).filter(Boolean);
  console.log(`Gmail: fetched ${messageIds.length} messages`);

  if (messageIds.length === 0) {
    console.log('No messages to process.');
    return;
  }

  // Check existing messages (idempotency)
  let existingIds: Set<string>;
  let rawEmailsTable;
  try {
    rawEmailsTable = await getTable('raw_emails');
    const existingQuery = `
      SELECT gmail_message_id
      FROM \`${config.projectId}.${config.dataset}.raw_emails\`
      WHERE gmail_message_id IN UNNEST(@messageIds)
    `;
    const [existingRows] = await rawEmailsTable.bigQuery.query({
      query: existingQuery,
      params: { messageIds },
      location: config.location,
    });
    existingIds = new Set(existingRows.map((row: any) => row.gmail_message_id));
  } catch (error: any) {
    throw new Error(`BQ idempotency query failed: ${error.message || 'unknown error'}`);
  }
  const newIds = messageIds.filter(id => !existingIds.has(id));

  if (config.dryRun) {
    // Dry run: fetch metadata only for preview
    const samples: Array<{
      date: string;
      from: string;
      subject: string;
      labelNames: string[];
    }> = [];

    for (const msgId of messageIds.slice(0, 10)) {
      let msgRes;
      try {
        msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: msgId,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'To', 'Date'],
        });
      } catch (error: any) {
        const errorMsg = error.message || JSON.stringify(error);
        if (errorMsg.includes('invalid_rapt') || errorMsg.includes('invalid_grant')) {
          throw new Error('Auth requires re-consent. Re-run with --reauth (and ensure Desktop credentials).');
        }
        throw new Error(`Gmail messages.get failed: ${error.message || 'unknown error'}`);
      }

      const headers = msgRes.data.payload?.headers || [];
      const getHeaderValue = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      const labelIds = msgRes.data.labelIds || [];
      const labelNames = labelIds
        .map(id => labelsMap.get(id))
        .filter((name): name is string => !!name);

      samples.push({
        date: getHeaderValue('Date'),
        from: getHeaderValue('From'),
        subject: getHeaderValue('Subject'),
        labelNames,
      });
    }

    console.log('Sample (first 10):');
    for (const sample of samples) {
      console.log(`  - ${sample.date} | ${sample.from} | ${sample.subject} | labels: [${sample.labelNames.join(', ')}]`);
    }

    const previewLabelCount = samples.filter(s => s.labelNames.includes(config.paidLabel)).length;
    console.log(`paid_label matches (preview): ${previewLabelCount}`);
    console.log('[DRY RUN] Would insert to BigQuery and apply Gmail labels if --no-dry-run');
    return;
  }

  // Non-dry-run: fetch full messages and insert to BigQuery
  // if (newIds.length === 0) {
  //   console.log('All messages already ingested. Proceeding to check labels...');
  // }

  const rawEmailsRows: any[] = [];
  const emailLabelsRows: any[] = [];
  const newMessageIds: string[] = [];

  // Helper to extract HTML content
  function extractHtmlContent(msg: gmail_v1.Schema$Message): string | null {
    if (!msg || !msg.payload) return null;
    const parts: gmail_v1.Schema$MessagePart[] = [];
    function walk(part?: gmail_v1.Schema$MessagePart) {
      if (!part) return;
      parts.push(part);
      if (part.parts) part.parts.forEach(walk);
    }
    walk(msg.payload);
    for (const part of parts) {
      if ((part.mimeType || '').toLowerCase().startsWith('text/html')) {
        const data = part.body?.data;
        if (data) {
          const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
          const buff = Buffer.from(normalized, 'base64');
          return buff.toString('utf-8');
        }
      }
    }
    return null;
  }

  // Helper to extract name from From header
  function extractFromName(fromHeader: string): string {
    const match = fromHeader.match(/^(.+?)\s*<[^>]+>$/);
    if (match && match[1]) {
      return match[1].replace(/^["']|["']$/g, '').trim();
    }
    return '';
  }

  // Helper to parse Date header string
  function parseHeaderDate(raw?: string): Date | null {
    if (!raw) return null;
    // remove " (UTC)" or similar comment blocks to help the parser
    const cleaned = raw.replace(/\s+\([^)]*\)/g, ' ').trim();
    const d = new Date(cleaned);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  for (const msgId of newIds) {
    try {
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msgId,
        format: 'full',
      });

      const msg = fullMsg.data;
      if (!msg || !msg.id) continue;

      const fromHeader = getHeader(msg, 'From');
      const fromEmail = extractEmailAddress(fromHeader);
      const fromName = extractFromName(fromHeader);
      const subject = getHeader(msg, 'Subject') || '';
      const replyTo = getHeader(msg, 'Reply-To') || '';
      const listId = getHeader(msg, 'List-Id') || '';
      const messageIdHeader = getHeader(msg, 'Message-ID') || '';
      const historyId = msg.historyId?.toString() || '';

      // Parse sent_date: prefer Date header, fallback to internalDate
      const dateHeaderString = getHeader(msg, 'Date');
      const headerDate = parseHeaderDate(dateHeaderString);
      const internalMs = Number(msg.internalDate);
      const sentDateObj = headerDate ?? (Number.isFinite(internalMs) ? new Date(internalMs) : null);
      const sentDate = sentDateObj ? sentDateObj.toISOString() : null;

      const bodyText = extractPlaintext(msg);
      const bodyHtml = extractHtmlContent(msg);

      // Compute content_hash
      const contentHash = createHash('sha256')
        .update(bodyText || bodyHtml || '')
        .digest('hex');

      // Check if paid (by label name match)
      const labelIds = msg.labelIds || [];
      const labelNames = labelIds
        .map(id => labelsMap.get(id))
        .filter((name): name is string => !!name);
      const isPaid = labelNames.includes(config.paidLabel);

      rawEmailsRows.push({
        gmail_message_id: msg.id,
        inbox: config.inbox,
        history_id: historyId || null,
        message_id_header: messageIdHeader || null,
        subject: subject || null,
        from_email: fromEmail || null,
        from_name: fromName || null,
        reply_to: replyTo || null,
        list_id: listId || null,
        sent_date: sentDate,
        body_html: bodyHtml,
        body_text: bodyText || null,
        content_hash: contentHash,
        is_paid: isPaid,
        ingested_at: new Date().toISOString(),
      });

      // Build label rows
      for (const labelId of labelIds) {
        const labelName = labelsMap.get(labelId);
        if (labelName) {
          emailLabelsRows.push({
            gmail_message_id: msg.id,
            label_id: labelId,
            label_name: labelName,
          });
        }
      }

      newMessageIds.push(msg.id);
    } catch (error: any) {
      console.error(`Error processing message ${msgId}:`, error.message);
    }
  }

  // Insert raw_emails
  if (rawEmailsRows.length > 0) {
    if (!rawEmailsTable) {
      rawEmailsTable = await getTable('raw_emails');
    }
    // Split into chunks to avoid 413 errors
    const CHUNK_SIZE = 50;
    for (let i = 0; i < rawEmailsRows.length; i += CHUNK_SIZE) {
       const chunk = rawEmailsRows.slice(i, i + CHUNK_SIZE);
       try {
          await rawEmailsTable.insert(chunk);
       } catch (err: any) {
          console.error(`BQ Insert Error (chunk ${i}-${i+chunk.length}):`, err.message);
          // If partial failure, we might want to continue or throw.
          // Throwing is safer to ensure we don't label messages that failed to insert.
          throw err; 
       }
    }
  }

  // Insert email_labels (idempotent: check existing pairs)
  const emailLabelsTable = await getTable('email_labels');
  let existingLabelPairs: Set<string> = new Set();
  if (emailLabelsRows.length > 0) {
    const uniqueGmailIds = Array.from(new Set(emailLabelsRows.map((r) => r.gmail_message_id)));
    const existingLabelsQuery = `
      SELECT gmail_message_id, label_name
      FROM \`${config.projectId}.${config.dataset}.email_labels\`
      WHERE gmail_message_id IN UNNEST(@gmailIds)
    `;
    try {
      const [existingLabelRows] = await emailLabelsTable.bigQuery.query({
        query: existingLabelsQuery,
        params: { gmailIds: uniqueGmailIds },
        location: config.location,
      });
      for (const row of existingLabelRows as Array<{ gmail_message_id: string; label_name: string }>) {
        existingLabelPairs.add(`${row.gmail_message_id}:${row.label_name}`);
      }
    } catch (error: any) {
      // If query fails, continue with empty set (will insert all, but better than failing)
    }
  }

  // Deduplicate and filter out existing pairs
  const labelMap = new Map<string, { gmail_message_id: string; label_id: string; label_name: string }>();
  for (const row of emailLabelsRows) {
    const key = `${row.gmail_message_id}:${row.label_id}`;
    const pairKey = `${row.gmail_message_id}:${row.label_name}`;
    if (!labelMap.has(key) && !existingLabelPairs.has(pairKey)) {
      labelMap.set(key, row);
    }
  }
  const uniqueLabelRows = Array.from(labelMap.values());
  if (uniqueLabelRows.length > 0) {
    await emailLabelsTable.insert(uniqueLabelRows);
  }

  const nullSentDateCount = rawEmailsRows.filter((r) => !r.sent_date).length;
  console.log(`BQ: existing/skipped=${existingIds.size}, inserted_raw=${rawEmailsRows.length}, inserted_labels=${uniqueLabelRows.length}, null_sent_date=${nullSentDateCount}`);

  // Apply Gmail labels and mark as read (skip if readonly or dry-run)
  let labeledCount = 0;
  let alreadyLabeledCount = 0;
  let markedReadCount = 0;

  // We want to check labels for ALL fetched messages because the query returned them (implying they might be missing labels)
  // even if they were already in BigQuery.
  const idsToLabel = messageIds;

  if (isReadonly) {
    console.log('Gmail: READONLY mode active — skipping modifications');
  } else if (config.dryRun) {
    // Dry run: no Gmail modifications
  } else if (idsToLabel.length > 0) {
    // Fetch message metadata to check current labels
    const messageMetadata = new Map<string, { labelIds: string[]; labelNames: string[] }>();
    for (const msgId of idsToLabel) {
      try {
        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: msgId,
          format: 'metadata',
        });
        const labelIds = msgRes.data.labelIds || [];
        const labelNames = labelIds
          .map((id) => labelsMap.get(id))
          .filter((name): name is string => !!name);
        messageMetadata.set(msgId, { labelIds, labelNames });
      } catch (error: any) {
        console.error(`Error fetching metadata for ${msgId}:`, error.message);
      }
    }

    const processedLabelId = labelIdMap.get(config.processedLabel);
    console.log(`[DEBUG] processedLabelId for '${config.processedLabel}': ${processedLabelId}`);

    if (!processedLabelId) {
      // Create label if it doesn't exist
      try {
        const createRes = await gmail.users.labels.create({
          userId: 'me',
          requestBody: { name: config.processedLabel },
        });
        if (createRes.data.id) {
          labelIdMap.set(config.processedLabel, createRes.data.id);
        }
      } catch (error: any) {
        // Label might already exist, try to find it
        const labelsRes = await gmail.users.labels.list({ userId: 'me' });
        if (labelsRes.data.labels) {
          for (const label of labelsRes.data.labels) {
            if (label.id && label.name === config.processedLabel) {
              labelIdMap.set(config.processedLabel, label.id);
              break;
            }
          }
        }
      }
    }

    const batchAddIds: string[] = [];
    const labelId = processedLabelId || labelIdMap.get(config.processedLabel);

    for (const msgId of idsToLabel) {
      const metadata = messageMetadata.get(msgId);
      if (!metadata) continue;

      if (!metadata.labelNames.includes(config.processedLabel)) {
        batchAddIds.push(msgId);
      } else {
        alreadyLabeledCount++;
      }
    }

    if (batchAddIds.length > 0 && labelId) {
       console.log(`Batch applying label to ${batchAddIds.length} messages...`);
       try {
          await gmail.users.messages.batchModify({
             userId: 'me',
             requestBody: {
                ids: batchAddIds,
                addLabelIds: [labelId],
                removeLabelIds: config.markRead ? ['UNREAD'] : undefined
             }
          });
          labeledCount += batchAddIds.length;
          if (config.markRead) markedReadCount += batchAddIds.length;
       } catch (err: any) {
          console.error('Error in batchModify:', err);
       }
    } else if (batchAddIds.length > 0 && !labelId) {
       console.error(`Cannot label messages: Label ID for '${config.processedLabel}' not found.`);
    }

    console.log(`Gmail: labeled=${labeledCount}, already_labeled=${alreadyLabeledCount}, marked_read=${markedReadCount}`);
  }

  // Post-run reconcile summary
  console.log('');
  console.log('---');
  console.log('RECONCILE SUMMARY:');
  console.log(`  New emails ingested: ${rawEmailsRows.length}`);
  console.log(`  New labels applied: ${uniqueLabelRows.length}`);
  console.log(`  Existing emails skipped: ${existingIds.size}`);
  if (!config.dryRun && !isReadonly && idsToLabel.length > 0) {
    console.log(`  Gmail labels applied: ${labeledCount} (${alreadyLabeledCount} already had label)`);
    console.log(`  Messages marked read: ${markedReadCount}`);
  }
  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

