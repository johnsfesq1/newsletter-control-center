
import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';

dotenv.config();

const PROJECT_ID = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = process.env.BQ_DATASET || 'ncc_production';

async function main() {
  const bq = new BigQuery({ projectId: PROJECT_ID });
  
  console.log(`Checking most recent data in ${PROJECT_ID}.${DATASET_ID}...`);

  // Check most recent email
  const [emailRows] = await bq.query({
    query: `SELECT MAX(ingested_at) as last_ingest, MAX(sent_date) as last_sent FROM \`${PROJECT_ID}.${DATASET_ID}.raw_emails\``,
    location: 'US'
  });
  console.log('Last Email Ingested:', emailRows[0].last_ingest ? emailRows[0].last_ingest.value : 'NEVER');
  console.log('Last Email Sent Date:', emailRows[0].last_sent ? emailRows[0].last_sent.value : 'NEVER');

  // Check most recent chunk
  const [chunkRows] = await bq.query({
    query: `SELECT MAX(created_at) as last_chunk FROM \`${PROJECT_ID}.${DATASET_ID}.chunks\``,
    location: 'US'
  });
  console.log('Last Chunk Created:', chunkRows[0].last_chunk ? chunkRows[0].last_chunk.value : 'NEVER');

  // Check row counts
  const [countRows] = await bq.query({
    query: `SELECT COUNT(*) as cnt FROM \`${PROJECT_ID}.${DATASET_ID}.raw_emails\``,
    location: 'US'
  });
  console.log('Total Emails:', countRows[0].cnt);
}

main().catch(console.error);

