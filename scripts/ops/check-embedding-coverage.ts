
import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';

dotenv.config();

const PROJECT_ID = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_production';

async function main() {
  const bq = new BigQuery({ projectId: PROJECT_ID });

  console.log('Checking chunk embedding coverage...');

  const query = `
    SELECT 
      COUNT(*) as total_chunks,
      COUNTIF(e.chunk_id IS NOT NULL) as embedded_chunks,
      COUNTIF(c.is_junk = TRUE) as junk_chunks,
      COUNTIF(e.chunk_id IS NULL AND (c.is_junk IS NULL OR c.is_junk = FALSE)) as pending_valid_chunks
    FROM \`${PROJECT_ID}.${DATASET_ID}.chunks\` c
    LEFT JOIN \`${PROJECT_ID}.${DATASET_ID}.chunk_embeddings\` e
    ON c.chunk_id = e.chunk_id
  `;

  const [rows] = await bq.query({ query, location: 'US' });
  const row = rows[0];

  console.log(`Total chunks: ${row.total_chunks}`);
  console.log(`Embedded chunks: ${row.embedded_chunks}`);
  console.log(`Junk chunks: ${row.junk_chunks}`);
  console.log(`Pending valid chunks: ${row.pending_valid_chunks}`);
}

main().catch(console.error);

