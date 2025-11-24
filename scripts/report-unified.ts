import 'dotenv/config';
import { getBigQuery } from '../src/bq/client';

async function main(): Promise<void> {
  const projectId = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const location = process.env.BQ_LOCATION || 'US';

  if (!projectId) {
    throw new Error('BQ_PROJECT_ID environment variable is required');
  }

  const bq = getBigQuery();

  console.log('---');
  console.log('UNIFIED VIEWS REPORT');
  console.log('');

  // Query row counts for each view
  const views = [
    'newsletter-control-center.ncc_production.v_all_raw_emails',
    'newsletter-control-center.ncc_production.v_all_chunks',
    'newsletter-control-center.ncc_production.v_all_chunk_embeddings',
  ];

  for (const viewName of views) {
    const viewNameShort = viewName.split('.').pop() || viewName;
    const countQuery = `SELECT COUNT(*) AS row_count FROM \`${viewName}\``;

    try {
      const [rows] = await bq.query({
        query: countQuery,
        location,
      });
      const rowCount = (rows[0] as { row_count: number }).row_count;
      console.log(`${viewNameShort}: rows=${rowCount}`);
    } catch (error: any) {
      console.error(`Error querying ${viewNameShort}: ${error.message}`);
      console.log(`${viewNameShort}: rows=ERROR`);
    }
  }

  console.log('');
  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

