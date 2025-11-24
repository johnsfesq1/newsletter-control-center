import 'dotenv/config';
import { getBigQuery } from '../../src/bq/client';

async function main(): Promise<void> {
  const projectId = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const datasetId = process.env.BQ_DATASET || 'ncc_production';
  const location = process.env.BQ_LOCATION || 'US';

  const bq = getBigQuery();

  console.log('---');
  console.log('RECENT BIGQUERY INSERTS (last 30 minutes)');
  console.log('---\n');

  // Count recent inserts
  const countQuery = `
    SELECT COUNT(*) as count
    FROM \`${projectId}.${datasetId}.raw_emails\`
    WHERE ingested_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 MINUTE)
  `;

  const [countRows] = await bq.query({ query: countQuery, location });
  const count = countRows[0]?.count || 0;
  console.log(`Count: ${count}\n`);

  if (count === 0) {
    console.log('No recent inserts found.\n');
    return;
  }

  // Get 5 most recent
  const recentQuery = `
    SELECT 
      gmail_message_id,
      subject,
      sent_date
    FROM \`${projectId}.${datasetId}.raw_emails\`
    WHERE ingested_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 MINUTE)
    ORDER BY ingested_at DESC
    LIMIT 5
  `;

  const [recentRows] = await bq.query({ query: recentQuery, location });
  console.log('Most recent 5:');
  recentRows.forEach((row: any, i: number) => {
    console.log(`  ${i + 1}. ID: ${row.gmail_message_id}`);
    console.log(`     Subject: ${row.subject || '(no subject)'}`);
    console.log(`     Sent: ${row.sent_date || 'N/A'}`);
  });
  console.log('');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

