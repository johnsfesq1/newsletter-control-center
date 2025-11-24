import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getBigQuery, getTable } from '../src/bq/client';
import { embedBatch } from '../src/embeddings/vertex';
import type { Table } from '@google-cloud/bigquery';

interface ChunkRow {
  chunk_id: string;
  gmail_message_id: string;
  chunk_index: number;
  chunk_text: string;
}

interface EmbeddingRow {
  chunk_id: string;
  model: string;
  dim: number;
  embedding: number[];
  created_at: string;
}

async function insertRowsSafe(
  table: Table,
  rows: any[],
  minBatch = 25,
  attempt = 1
): Promise<number> {
  // Inserts rows; if payload too big or RangeError, split batch recursively.
  // Returns number of rows successfully inserted.
  if (rows.length === 0) return 0;

  try {
    await table.insert(rows);
    return rows.length;
  } catch (err: any) {
    const msg = String(err?.message || err);
    const tooBig =
      msg.includes('Request payload size exceeds') ||
      msg.includes('request too large') ||
      msg.includes('413') ||
      msg.includes('Invalid string length') ||
      msg.includes('RangeError');

    if (tooBig && rows.length > minBatch) {
      const mid = Math.floor(rows.length / 2);
      const left = rows.slice(0, mid);
      const right = rows.slice(mid);
      const a = await insertRowsSafe(table, left, minBatch, attempt + 1);
      const b = await insertRowsSafe(table, right, minBatch, attempt + 1);
      return a + b;
    }

    // transient retry (Backoff on 5xx/EOF)
    const transient =
      msg.includes('internal') ||
      msg.includes('EAI_AGAIN') ||
      msg.includes('500') ||
      msg.includes('503') ||
      msg.includes('retry');

    if (transient && attempt <= 3) {
      const delay = 500 * attempt;
      await new Promise((r) => setTimeout(r, delay));
      return insertRowsSafe(table, rows, minBatch, attempt + 1);
    }

    throw err;
  }
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('limit', {
      type: 'number',
      default: 100,
      description: 'Number of chunks to process',
    })
    .option('dry-run', {
      type: 'boolean',
      default: true,
      description: 'Run in dry-run mode (no actual writes)',
    })
    .option('insert-batch', {
      type: 'number',
      description: 'Number of embeddings to insert per batch',
    })
    .parse();

  const projectId = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const datasetId = process.env.BQ_DATASET || 'ncc_production';
  const bqLocation = process.env.BQ_LOCATION || 'US';
  // Vertex AI uses region codes, not BigQuery locations
  const locationMap: Record<string, string> = {
    'US': 'us-central1',
    'EU': 'europe-west1',
    'asia-northeast1': 'asia-northeast1',
  };
  const vertexLocation = process.env.EMB_LOCATION || locationMap[bqLocation] || 'us-central1';
  const batchSize = parseInt(process.env.EMB_BATCH_SIZE || '32', 10);
  const insertBatchSize = argv['insert-batch'] ? argv['insert-batch'] : 500; // BigQuery streaming insert limit is usually higher, but safety first

  console.log('Embed Config:');
  console.log(`  project: ${projectId}`);
  console.log(`  dataset: ${datasetId}`);
  console.log(`  vertex_location: ${vertexLocation}`);
  console.log(`  batch_size: ${batchSize}`);
  console.log(`  limit: ${argv.limit}`);
  console.log(`  dry_run: ${argv['dry-run']}\n`);

  const bq = getBigQuery();

  // 1. Select chunks that don't have embeddings yet AND are not junk
  // We use a LEFT JOIN to find missing embeddings
  // Added condition: AND (c.is_junk IS NULL OR c.is_junk = FALSE)
  const query = `
    SELECT 
      c.chunk_id,
      c.gmail_message_id,
      c.chunk_index,
      c.chunk_text
    FROM \`${projectId}.${datasetId}.chunks\` c
    LEFT JOIN \`${projectId}.${datasetId}.chunk_embeddings\` e
      ON c.chunk_id = e.chunk_id
    WHERE e.chunk_id IS NULL
      AND (c.is_junk IS NULL OR c.is_junk = FALSE)
    ORDER BY c.created_at DESC
    LIMIT @limit
  `;

  const [rows] = await bq.query({
    query,
    params: { limit: argv.limit },
    location: bqLocation,
  });

  const chunks = rows as ChunkRow[];
  console.log(`Found ${chunks.length} chunks to embed (filtered junk).`);

  if (chunks.length === 0) {
    console.log('No work to do.');
    return;
  }

  if (argv['dry-run']) {
    console.log('[DRY RUN] Would generate embeddings for:', chunks.map(c => c.chunk_id));
    return;
  }

  // 2. Process in batches
  let processed = 0;
  let failures = 0;
  const embeddingsTable = await getTable('chunk_embeddings');
  let buffer: EmbeddingRow[] = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.chunk_text);

    try {
      // Generate embeddings
      const vectors = await embedBatch(texts, { location: vertexLocation });

      // Prepare rows
      const now = new Date().toISOString();
      const newRows: EmbeddingRow[] = batch.map((chunk, idx) => ({
        chunk_id: chunk.chunk_id,
        model: process.env.EMB_MODEL || 'text-embedding-004',
        dim: vectors[idx].length,
        embedding: vectors[idx],
        created_at: now,
      }));

      buffer.push(...newRows);
      processed += batch.length;
      process.stdout.write(`\rGenerated: ${processed}/${chunks.length}`);

      // Flush buffer if large enough or done
      if (buffer.length >= insertBatchSize || i + batchSize >= chunks.length) {
        const inserted = await insertRowsSafe(embeddingsTable, buffer);
        // console.log(`  -> Flushed ${inserted} embeddings to BigQuery`);
        buffer = [];
      }

    } catch (err: any) {
      console.error(`\nError batch ${i}:`, err.message);
      failures += batch.length;
    }
  }

  console.log(`\n\nDone. Processed: ${processed}, Failed: ${failures}`);
}

main().catch(console.error);
