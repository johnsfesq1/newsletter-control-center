
import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';

dotenv.config();

const PROJECT_ID = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = process.env.BQ_DATASET || 'ncc_production';

async function main() {
  const bq = new BigQuery({ projectId: PROJECT_ID });
  const tableId = `${PROJECT_ID}.${DATASET_ID}.chunks`;

  console.log(`Updating schema for ${tableId}...`);

  // 1. Check if column exists
  const [metadata] = await bq.dataset(DATASET_ID).table('chunks').getMetadata();
  const schema = metadata.schema.fields;
  const hasIsJunk = schema.some((f: any) => f.name === 'is_junk');

  if (hasIsJunk) {
    console.log('  Column is_junk already exists.');
  } else {
    console.log('  Adding is_junk column...');
    const newSchema = [
      ...schema,
      { name: 'is_junk', type: 'BOOLEAN', mode: 'NULLABLE', description: 'True if chunk is low quality/admin text' }
    ];
    await bq.dataset(DATASET_ID).table('chunks').setMetadata({ schema: { fields: newSchema } });
    console.log('  Schema updated.');
  }

  // 2. Run update query to flag junk
  console.log('Flagging junk chunks (Strategy B)...');
  
  // Heuristics:
  // 1. Short content: < 300 chars (approx 50 words)
  // 2. Admin keywords (case insensitive)
  const query = `
    UPDATE \`${tableId}\`
    SET is_junk = (
      LENGTH(chunk_text) < 300
      OR REGEXP_CONTAINS(LOWER(chunk_text), r'(unsubscribe|view in browser|manage preferences|update your preferences|upgrade to paid|subscribe here|sponsored by|in partnership with)')
    )
    WHERE is_junk IS NULL
  `;

  const [job] = await bq.createQueryJob({ query, location: 'US' });
  console.log(`  Job ${job.id} started.`);
  
  const [result] = await (job as any).promise();
  console.log('  Update complete.');
  
  // 3. Verify results
  const statsQuery = `
    SELECT 
      is_junk,
      COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as pct
    FROM \`${tableId}\`
    GROUP BY 1
  `;
  
  const [rows] = await bq.query({ query: statsQuery, location: 'US' });
  console.log('\nJunk Analysis Results:');
  rows.forEach((row: any) => {
    console.log(`  is_junk=${row.is_junk}: ${row.count} chunks (${row.pct}%)`);
  });
}

main().catch(console.error);

