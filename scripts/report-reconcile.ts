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
  console.log('RECONCILIATION REPORT (PROD)');
  console.log('');

  // Define t0 = 24 hours ago
  const t0 = 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)';

  // Last 24h queries
  const raw24hQuery = `
    SELECT COUNT(*) AS count
    FROM \`${projectId}.${datasetId}.raw_emails\`
    WHERE ingested_at >= ${t0}
  `;

  const emailsWithChunks24hQuery = `
    SELECT COUNT(DISTINCT gmail_message_id) AS count
    FROM \`${projectId}.${datasetId}.chunks\`
    WHERE gmail_message_id IN (
      SELECT gmail_message_id
      FROM \`${projectId}.${datasetId}.raw_emails\`
      WHERE ingested_at >= ${t0}
    )
  `;

  const chunks24hQuery = `
    SELECT COUNT(*) AS count
    FROM \`${projectId}.${datasetId}.chunks\`
    WHERE gmail_message_id IN (
      SELECT gmail_message_id
      FROM \`${projectId}.${datasetId}.raw_emails\`
      WHERE ingested_at >= ${t0}
    )
  `;

  const embeddedChunks24hQuery = `
    SELECT COUNT(*) AS count
    FROM \`${projectId}.${datasetId}.chunk_embeddings\`
    WHERE chunk_id IN (
      SELECT chunk_id
      FROM \`${projectId}.${datasetId}.chunks\`
      WHERE gmail_message_id IN (
        SELECT gmail_message_id
        FROM \`${projectId}.${datasetId}.raw_emails\`
        WHERE ingested_at >= ${t0}
      )
    )
  `;

  // All-time queries
  const rawAllQuery = `
    SELECT COUNT(*) AS count
    FROM \`${projectId}.${datasetId}.raw_emails\`
  `;

  const emailsWithChunksAllQuery = `
    SELECT COUNT(DISTINCT gmail_message_id) AS count
    FROM \`${projectId}.${datasetId}.chunks\`
  `;

  const chunksAllQuery = `
    SELECT COUNT(*) AS count
    FROM \`${projectId}.${datasetId}.chunks\`
  `;

  const embeddedChunksAllQuery = `
    SELECT COUNT(*) AS count
    FROM \`${projectId}.${datasetId}.chunk_embeddings\`
  `;

  // Execute queries
  let raw24h = 0;
  let emailsWithChunks24h = 0;
  let chunks24h = 0;
  let embeddedChunks24h = 0;
  let rawAll = 0;
  let emailsWithChunksAll = 0;
  let chunksAll = 0;
  let embeddedChunksAll = 0;

  try {
    const [raw24hRows] = await bq.query({ query: raw24hQuery, location });
    raw24h = (raw24hRows[0] as { count: number }).count;

    const [emailsWithChunks24hRows] = await bq.query({ query: emailsWithChunks24hQuery, location });
    emailsWithChunks24h = (emailsWithChunks24hRows[0] as { count: number }).count;

    const [chunks24hRows] = await bq.query({ query: chunks24hQuery, location });
    chunks24h = (chunks24hRows[0] as { count: number }).count;

    const [embeddedChunks24hRows] = await bq.query({ query: embeddedChunks24hQuery, location });
    embeddedChunks24h = (embeddedChunks24hRows[0] as { count: number }).count;

    const [rawAllRows] = await bq.query({ query: rawAllQuery, location });
    rawAll = (rawAllRows[0] as { count: number }).count;

    const [emailsWithChunksAllRows] = await bq.query({ query: emailsWithChunksAllQuery, location });
    emailsWithChunksAll = (emailsWithChunksAllRows[0] as { count: number }).count;

    const [chunksAllRows] = await bq.query({ query: chunksAllQuery, location });
    chunksAll = (chunksAllRows[0] as { count: number }).count;

    const [embeddedChunksAllRows] = await bq.query({ query: embeddedChunksAllQuery, location });
    embeddedChunksAll = (embeddedChunksAllRows[0] as { count: number }).count;
  } catch (error: any) {
    console.error(`Error executing queries: ${error.message}`);
    process.exit(1);
  }

  // Calculate percentages (with divide-by-zero guards)
  const pctEmailsWithChunks24h = raw24h > 0 ? Math.round((emailsWithChunks24h / raw24h) * 1000) / 10 : 0;
  const pctChunksEmbedded24h = chunks24h > 0 ? Math.round((embeddedChunks24h / chunks24h) * 1000) / 10 : 0;
  const pctEmailsWithChunksAll = rawAll > 0 ? Math.round((emailsWithChunksAll / rawAll) * 1000) / 10 : 0;
  const pctChunksEmbeddedAll = chunksAll > 0 ? Math.round((embeddedChunksAll / chunksAll) * 1000) / 10 : 0;

  // Print report
  console.log('Window: last_24h');
  console.log(`raw_emails: ${raw24h}`);
  console.log(`emails_chunked: ${emailsWithChunks24h} (${pctEmailsWithChunks24h}%)`);
  console.log(`chunks: ${chunks24h}`);
  console.log(`chunks_embedded: ${embeddedChunks24h} (${pctChunksEmbedded24h}%)`);
  console.log('');
  console.log('Window: all_time');
  console.log(`raw_emails: ${rawAll}`);
  console.log(`emails_chunked: ${emailsWithChunksAll} (${pctEmailsWithChunksAll}%)`);
  console.log(`chunks: ${chunksAll}`);
  console.log(`chunks_embedded: ${embeddedChunksAll} (${pctChunksEmbeddedAll}%)`);
  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

