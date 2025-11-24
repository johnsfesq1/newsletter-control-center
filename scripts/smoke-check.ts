import 'dotenv/config';
import { getBigQuery } from '../src/bq/client';

async function main(): Promise<void> {
  const projectId = process.env.BQ_PROJECT_ID;
  const datasetId = process.env.BQ_DATASET || 'ncc_production';
  const location = process.env.BQ_LOCATION || 'US';

  if (!projectId) {
    throw new Error('BQ_PROJECT_ID environment variable is required');
  }

  const bq = getBigQuery();

  console.log('Smoke Check: Newsletter Control Center\n');

  // Check raw_emails
  const rawEmailsQuery = `
    SELECT 
      COUNT(*) as total,
      MAX(ingested_at) as latest_ingest,
      COUNT(DISTINCT gmail_message_id) as unique_messages
    FROM \`${projectId}.${datasetId}.raw_emails\`
  `;

  const [rawEmailsRows] = await bq.query({
    query: rawEmailsQuery,
    location,
  });

  const rawEmails = rawEmailsRows[0] as {
    total: number;
    latest_ingest: string | null;
    unique_messages: number;
  };

  console.log('raw_emails:');
  console.log(`  Total rows: ${rawEmails.total.toLocaleString()}`);
  console.log(`  Unique messages: ${rawEmails.unique_messages.toLocaleString()}`);
  console.log(`  Latest ingest: ${rawEmails.latest_ingest || 'N/A'}\n`);

  // Check chunks
  const chunksQuery = `
    SELECT 
      COUNT(*) as total,
      COUNT(DISTINCT gmail_message_id) as unique_messages,
      MAX(created_at) as latest_chunk
    FROM \`${projectId}.${datasetId}.chunks\`
  `;

  const [chunksRows] = await bq.query({
    query: chunksQuery,
    location,
  });

  const chunks = chunksRows[0] as {
    total: number;
    unique_messages: number;
    latest_chunk: string | null;
  };

  console.log('chunks:');
  console.log(`  Total chunks: ${chunks.total.toLocaleString()}`);
  console.log(`  Unique messages: ${chunks.unique_messages.toLocaleString()}`);
  console.log(`  Latest chunk: ${chunks.latest_chunk || 'N/A'}\n`);

  // Check recent ingestion (last 24h)
  const recentQuery = `
    SELECT COUNT(*) as recent_count
    FROM \`${projectId}.${datasetId}.raw_emails\`
    WHERE ingested_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
  `;

  const [recentRows] = await bq.query({
    query: recentQuery,
    location,
  });

  const recent = recentRows[0] as { recent_count: number };
  console.log(`Recent (24h): ${recent.recent_count.toLocaleString()} emails ingested`);

  if (recent.recent_count === 0 && rawEmails.total > 0) {
    console.log('\n⚠️  Warning: No recent ingestion in last 24 hours');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

