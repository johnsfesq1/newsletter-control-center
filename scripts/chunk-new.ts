import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getBigQuery, getTable } from '../src/bq/client';
import { htmlToText } from '../src/lib/parseMessage';
import { v4 as uuidv4 } from 'uuid';

interface ChunkRow {
  chunk_id: string;
  gmail_message_id: string;
  publisher_id: string | null;
  source_part: string | null;
  char_start: number | null;
  char_end: number | null;
  chunk_index: number;
  chunk_text: string;
  created_at: string;
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('limit', {
      type: 'number',
      default: 10,
      description: 'Number of emails to process',
    })
    .option('dry-run', {
      type: 'boolean',
      default: true,
      description: 'Run in dry-run mode (no actual writes)',
    })
    .parse();

  const projectId = process.env.BQ_PROJECT_ID;
  const datasetId = process.env.BQ_DATASET || 'ncc_production';
  const location = process.env.BQ_LOCATION || 'US';

  if (!projectId) {
    throw new Error('BQ_PROJECT_ID environment variable is required');
  }

  const bq = getBigQuery();
  const limit = argv.limit;
  const dryRun = argv['dry-run'];

  console.log('Chunk Config:');
  console.log(`  project: ${projectId}`);
  console.log(`  dataset: ${datasetId}`);
  console.log(`  location: ${location}`);
  console.log(`  limit: ${limit}`);
  console.log(`  dry_run: ${dryRun}\n`);

  // Select emails that don't have chunks yet
  const selectQuery = `
    SELECT 
      gmail_message_id,
      body_html,
      body_text,
      sent_date
    FROM \`${projectId}.${datasetId}.raw_emails\`
    WHERE gmail_message_id NOT IN (
      SELECT DISTINCT gmail_message_id 
      FROM \`${projectId}.${datasetId}.chunks\`
      WHERE gmail_message_id IS NOT NULL
    )
    ORDER BY sent_date DESC NULLS LAST
    LIMIT @limit
  `;

  const [rows] = await bq.query({
    query: selectQuery,
    params: { limit },
    location,
  });

  const selectedEmails = rows as Array<{
    gmail_message_id: string;
    body_html: string | null;
    body_text: string | null;
    sent_date: string | null;
  }>;

  console.log(`Selected ${selectedEmails.length} emails to chunk\n`);

  let tooShort = 0;
  let chunksBuilt = 0;
  const allChunks: ChunkRow[] = [];

  for (const email of selectedEmails) {
    // Pick content: prefer HTML, fall back to text
    const content = email.body_html
      ? htmlToText(email.body_html)
      : email.body_text || '';

    if (content.length < 10) {
      tooShort++;
      continue;
    }

    // Split into ~800-char chunks with 100-char overlap
    const chunks = splitIntoChunks(content, 800, 100);

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const charStart = content.indexOf(chunkText);
      const charEnd = charStart + chunkText.length;

      allChunks.push({
        chunk_id: uuidv4(),
        gmail_message_id: email.gmail_message_id,
        publisher_id: null,
        source_part: null,
        char_start: charStart >= 0 ? charStart : null,
        char_end: charEnd >= 0 ? charEnd : null,
        chunk_index: i,
        chunk_text: chunkText,
        created_at: new Date().toISOString(),
      });

      chunksBuilt++;
    }
  }

  console.log(`Results:`);
  console.log(`  selected_emails: ${selectedEmails.length}`);
  console.log(`  too_short: ${tooShort}`);
  console.log(`  chunks_built: ${chunksBuilt}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Would insert chunks if --no-dry-run');
    return;
  }

  if (allChunks.length === 0) {
    console.log('No chunks to insert.');
    return;
  }

  // Check for existing chunks (idempotency)
  const existingChunkKeys = new Set<string>();
  if (allChunks.length > 0) {
    const gmailIds = Array.from(new Set(allChunks.map((c) => c.gmail_message_id)));
    const existingQuery = `
      SELECT gmail_message_id, chunk_index
      FROM \`${projectId}.${datasetId}.chunks\`
      WHERE gmail_message_id IN UNNEST(@gmailIds)
    `;
    const [existingRows] = await bq.query({
      query: existingQuery,
      params: { gmailIds },
      location,
    });
    for (const row of existingRows as Array<{ gmail_message_id: string; chunk_index: number }>) {
      existingChunkKeys.add(`${row.gmail_message_id}:${row.chunk_index}`);
    }
  }

  // Filter out existing chunks
  const newChunks = allChunks.filter(
    (c) => !existingChunkKeys.has(`${c.gmail_message_id}:${c.chunk_index}`)
  );

  if (newChunks.length === 0) {
    console.log('All chunks already exist. Nothing to insert.');
    return;
  }

  // Insert new chunks in batches (BigQuery has limits on insert size)
  const chunksTable = await getTable('chunks');
  const INSERT_BATCH_SIZE = 500;
  
  let totalInserted = 0;
  for (let i = 0; i < newChunks.length; i += INSERT_BATCH_SIZE) {
    const batch = newChunks.slice(i, i + INSERT_BATCH_SIZE);
    await chunksTable.insert(batch);
    totalInserted += batch.length;
  }

  console.log(`Inserted ${totalInserted} chunks`);
}

// Simple chunking: split text into ~targetSize chunks with overlap
function splitIntoChunks(text: string, targetSize: number, overlap: number): string[] {
  if (text.length <= targetSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + targetSize, text.length);
    chunks.push(text.slice(start, end));
    
    // Advance start position, ensuring we make progress
    const nextStart = end - overlap;
    if (nextStart <= start) {
      // Prevent infinite loop: ensure we always advance
      start = end;
    } else {
      start = nextStart;
    }
    
    // Safety check: if we've reached the end, break
    if (end >= text.length) {
      break;
    }
  }

  return chunks;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

