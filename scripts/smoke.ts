import 'dotenv/config';
import { getBigQuery } from '../src/bq/client';

async function main(): Promise<void> {
  const projectId = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const datasetId = process.env.BQ_DATASET || 'ncc_production';
  const location = process.env.BQ_LOCATION || 'US';

  if (!projectId) {
    throw new Error('BQ_PROJECT_ID environment variable is required');
  }

  const bq = getBigQuery();

  console.log('---');
  console.log('NCC SMOKE TEST');
  console.log(`Project: ${projectId}`);
  console.log(`Dataset: ${datasetId}`);
  console.log(`Location: ${location}`);
  console.log('');

  // Query a: last 24h and all-time counts
  const countQuery = `
    SELECT 
      COUNTIF(ingested_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)) AS last_24h,
      COUNT(*) AS all_time
    FROM \`${projectId}.${datasetId}.raw_emails\`
  `;

  console.log('Query 1 (counts):');
  console.log(countQuery);
  console.log('');

  let counts: { last_24h: number; all_time: number };
  try {
    const [countRows] = await bq.query({
      query: countQuery,
      location,
    });
    counts = countRows[0] as { last_24h: number; all_time: number };
  } catch (error: any) {
    console.error('❌ Query 1 failed:');
    console.error(`   Location: ${location}`);
    console.error(`   Project: ${projectId}`);
    console.error(`   Dataset: ${datasetId}`);
    console.error(`   Error: ${error.message || String(error)}`);
    throw error;
  }

  // Query b: latest 5 emails
  const latestQuery = `
    SELECT 
      gmail_message_id,
      subject,
      is_paid,
      sent_date
    FROM \`${projectId}.${datasetId}.raw_emails\`
    ORDER BY sent_date DESC NULLS LAST
    LIMIT 5
  `;

  console.log('Query 2 (latest):');
  console.log(latestQuery);
  console.log('');

  let latest: Array<{
    gmail_message_id: string;
    subject: string | null;
    is_paid: boolean | null;
    sent_date: string | null;
  }>;
  try {
    const [latestRows] = await bq.query({
      query: latestQuery,
      location,
    });
    latest = latestRows as Array<{
      gmail_message_id: string;
      subject: string | null;
      is_paid: boolean | null;
      sent_date: string | null;
    }>;
  } catch (error: any) {
    console.error('❌ Query 2 failed:');
    console.error(`   Location: ${location}`);
    console.error(`   Project: ${projectId}`);
    console.error(`   Dataset: ${datasetId}`);
    console.error(`   Error: ${error.message || String(error)}`);
    throw error;
  }

  // Query c: chunk coverage
  const coverageQuery = `
    SELECT 
      COUNT(DISTINCT re.gmail_message_id) AS raw_ids,
      COUNT(DISTINCT ch.gmail_message_id) AS chunked_ids
    FROM \`${projectId}.${datasetId}.raw_emails\` re
    LEFT JOIN \`${projectId}.${datasetId}.chunks\` ch
           ON re.gmail_message_id = ch.gmail_message_id
  `;

  console.log('Query 3 (coverage):');
  console.log(coverageQuery);
  console.log('');

  let coverage: { raw_ids: number; chunked_ids: number };
  try {
    const [coverageRows] = await bq.query({
      query: coverageQuery,
      location,
    });
    coverage = coverageRows[0] as { raw_ids: number; chunked_ids: number };
  } catch (error: any) {
    console.error('❌ Query 3 failed:');
    console.error(`   Location: ${location}`);
    console.error(`   Project: ${projectId}`);
    console.error(`   Dataset: ${datasetId}`);
    console.error(`   Error: ${error.message || String(error)}`);
    throw error;
  }

  // Query d: chunk and embedding counts
  const embeddingQuery = `
    SELECT
      COUNT(*) AS total_chunks,
      COUNT(ce.chunk_id) AS embedded_chunks
    FROM \`${projectId}.${datasetId}.chunks\` ch
    LEFT JOIN \`${projectId}.${datasetId}.chunk_embeddings\` ce
           ON ce.chunk_id = ch.chunk_id
  `;

  console.log('Query 4 (embeddings):');
  console.log(embeddingQuery);
  console.log('');

  let embeddingCoverage: { total_chunks: number; embedded_chunks: number };
  try {
    const [embeddingRows] = await bq.query({
      query: embeddingQuery,
      location,
    });
    embeddingCoverage = embeddingRows[0] as { total_chunks: number; embedded_chunks: number };
  } catch (error: any) {
    console.error('❌ Query 4 failed:');
    console.error(`   Location: ${location}`);
    console.error(`   Project: ${projectId}`);
    console.error(`   Dataset: ${datasetId}`);
    console.error(`   Error: ${error.message || String(error)}`);
    throw error;
  }

  // Print output
  console.log('Results:');
  console.log(`Raw emails: last_24h=${counts.last_24h} | all_time=${counts.all_time}`);
  console.log('Latest 5:');
  for (const row of latest) {
    let sentDate = 'N/A';
    if (row.sent_date) {
      try {
        const date = new Date(row.sent_date);
        if (!isNaN(date.getTime())) {
          sentDate = date.toISOString();
        }
      } catch {
        // Keep as N/A
      }
    }
    const isPaid = row.is_paid ? 'paid' : 'free';
    const subject = row.subject || '(no subject)';
    console.log(`  - ${sentDate} | ${isPaid} | ${subject}`);
  }
  const chunkPct = coverage.raw_ids > 0 
    ? Math.round((coverage.chunked_ids / coverage.raw_ids) * 100)
    : 0;
  console.log(`Chunk coverage: raw_ids=${coverage.raw_ids} | chunked_ids=${coverage.chunked_ids} | ${chunkPct}%`);
  const embeddingPct = embeddingCoverage.total_chunks > 0
    ? Math.round((embeddingCoverage.embedded_chunks / embeddingCoverage.total_chunks) * 100)
    : 0;
  console.log(`Embedding coverage: total_chunks=${embeddingCoverage.total_chunks} | embedded_chunks=${embeddingCoverage.embedded_chunks} | ${embeddingPct}%`);
  console.log('');
  
  // PASS summary
  const rawCount = counts.all_time;
  const chunkedEmails = coverage.chunked_ids;
  const chunks = embeddingCoverage.total_chunks;
  const embedded = embeddingCoverage.embedded_chunks;
  
  console.log(`SMOKE PASS: raw=${rawCount} | chunked_emails=${chunkedEmails}/${rawCount} | chunks=${chunks} | embedded=${embedded}`);
  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

