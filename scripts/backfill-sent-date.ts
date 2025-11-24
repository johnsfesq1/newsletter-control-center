import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getBigQuery, getTable } from '../src/bq/client';
import { getGmail } from '../src/gmail/client';
import { getHeader } from '../src/lib/parseMessage';
import type { gmail_v1 } from 'googleapis';

// Helper to parse Date header string (copied from ingest-gmail.ts)
function parseHeaderDate(raw?: string): Date | null {
  if (!raw) return null;
  // remove " (UTC)" or similar comment blocks to help the parser
  const cleaned = raw.replace(/\s+\([^)]*\)/g, ' ').trim();
  const d = new Date(cleaned);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('limit', {
      type: 'number',
      default: 200,
      description: 'Number of rows to process',
    })
    .option('dry-run', {
      type: 'boolean',
      default: true,
      description: 'Run in dry-run mode (no actual updates)',
    })
    .parse();

  const projectId = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const datasetId = process.env.BQ_DATASET || 'ncc_production';
  const location = process.env.BQ_LOCATION || 'US';

  if (!projectId) {
    throw new Error('BQ_PROJECT_ID environment variable is required');
  }

  const bq = getBigQuery();
  const limit = argv.limit;
  const dryRun = argv['dry-run'];

  console.log('Backfill Config:');
  console.log(`  project: ${projectId}`);
  console.log(`  dataset: ${datasetId}`);
  console.log(`  limit: ${limit}`);
  console.log(`  dry_run: ${dryRun}\n`);

  // Check if internal_date_ms or internal_date columns exist
  const columnsQuery = `
    SELECT column_name
    FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.COLUMNS\`
    WHERE table_name = 'raw_emails'
      AND column_name IN ('internal_date_ms', 'internal_date')
  `;

  const [columnRows] = await bq.query({
    query: columnsQuery,
    location,
  });

  const availableColumns = (columnRows as Array<{ column_name: string }>).map((r) => r.column_name);
  const hasInternalDateMs = availableColumns.includes('internal_date_ms');
  const hasInternalDate = availableColumns.includes('internal_date');

  // Build column selection based on what's available
  const selectColumns = ['gmail_message_id', 'inbox', 'ingested_at'];
  if (hasInternalDateMs) selectColumns.push('internal_date_ms');
  if (hasInternalDate) selectColumns.push('internal_date');

  // Select rows with NULL sent_date
  const selectQuery = `
    SELECT ${selectColumns.join(', ')}
    FROM \`${projectId}.${datasetId}.raw_emails\`
    WHERE sent_date IS NULL
    ORDER BY ingested_at DESC
    LIMIT @limit
  `;

  const [rows] = await bq.query({
    query: selectQuery,
    params: { limit },
    location,
  });

  const nullRows = rows as Array<{
    gmail_message_id: string;
    inbox: string;
    ingested_at: string;
    internal_date_ms?: number;
    internal_date?: number;
  }>;

  console.log(`Found ${nullRows.length} rows with NULL sent_date\n`);

  let checked = 0;
  let updated = 0;
  let skipped = 0;

  // Group by inbox to minimize Gmail API calls
  const inboxGroups = new Map<string, gmail_v1.Gmail>();
  const getGmailClient = async (inbox: string): Promise<gmail_v1.Gmail> => {
    const inboxType = inbox === 'other' ? 'other' : 'me';
    if (!inboxGroups.has(inboxType)) {
      inboxGroups.set(inboxType, await getGmail(inboxType));
    }
    return inboxGroups.get(inboxType)!;
  };

  for (const row of nullRows) {
    checked++;
    let sentDate: Date | null = null;

    // Try internal_date_ms or internal_date column first
    if (hasInternalDateMs && row.internal_date_ms !== undefined && row.internal_date_ms !== null) {
      const ms = Number(row.internal_date_ms);
      if (Number.isFinite(ms) && ms > 0) {
        sentDate = new Date(ms);
      }
    } else if (hasInternalDate && row.internal_date !== undefined && row.internal_date !== null) {
      const ms = Number(row.internal_date);
      if (Number.isFinite(ms) && ms > 0) {
        sentDate = new Date(ms);
      }
    }

    // If still no date, fetch from Gmail API
    if (!sentDate) {
      try {
        const gmail = await getGmailClient(row.inbox);
        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: row.gmail_message_id,
          format: 'metadata',
        });

        const msg = msgRes.data;
        if (msg.internalDate) {
          const ms = Number(msg.internalDate);
          if (Number.isFinite(ms) && ms > 0) {
            sentDate = new Date(ms);
          }
        }

        // Fallback to Date header
        if (!sentDate) {
          const dateHeaderString = getHeader(msg, 'Date');
          sentDate = parseHeaderDate(dateHeaderString);
        }
      } catch (error: any) {
        console.error(`Error fetching message ${row.gmail_message_id}:`, error.message);
        skipped++;
        continue;
      }
    }

    if (!sentDate) {
      skipped++;
      continue;
    }

    const sentDateIso = sentDate.toISOString();

    if (dryRun) {
      console.log(`[DRY RUN] Would update ${row.gmail_message_id}: ${sentDateIso}`);
      updated++;
    } else {
      // Update using parameterized query
      const updateQuery = `
        UPDATE \`${projectId}.${datasetId}.raw_emails\`
        SET sent_date = @sentDate
        WHERE gmail_message_id = @gmailMessageId
      `;

      try {
        await bq.query({
          query: updateQuery,
          params: {
            sentDate: sentDateIso,
            gmailMessageId: row.gmail_message_id,
          },
          location,
        });
        updated++;
      } catch (error: any) {
        console.error(`Error updating ${row.gmail_message_id}:`, error.message);
        skipped++;
      }
    }
  }

  console.log(`\nResults: checked=${checked}, updated=${updated}, skipped=${skipped}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

