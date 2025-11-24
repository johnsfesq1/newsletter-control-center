
import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const PROJECT_ID = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_production';

async function main() {
  const bq = new BigQuery({ projectId: PROJECT_ID });

  console.log('Sampling 200 random chunks...');

  const query = `
    SELECT 
      c.chunk_id,
      c.chunk_text,
      LENGTH(c.chunk_text) as char_count,
      r.from_name,
      r.from_email,
      r.subject,
      r.is_paid
    FROM \`${PROJECT_ID}.${DATASET_ID}.chunks\` c
    JOIN \`${PROJECT_ID}.${DATASET_ID}.raw_emails\` r
    ON c.gmail_message_id = r.gmail_message_id
    WHERE RAND() < 0.01 -- Pre-filter to scan less data, assuming 1M rows
    LIMIT 200
  `;

  const [rows] = await bq.query({ query, location: 'US' });

  console.log(`Got ${rows.length} rows.`);
  
  // Analyze word counts
  const samples = rows.map(row => {
    const wordCount = row.chunk_text.split(/\s+/).length;
    return {
      ...row,
      word_count: wordCount
    };
  });

  fs.writeFileSync('chunk_sample.json', JSON.stringify(samples, null, 2));
  console.log('Saved to chunk_sample.json');
}

main().catch(console.error);

