/**
 * Diagnose discovery storage issues
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const TABLE_ID = 'discovered_newsletters';

async function diagnose() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 DIAGNOSING DISCOVERY STORAGE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Total count
  const [total] = await bigquery.query({
    query: `
      SELECT COUNT(*) as count
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
    `,
  });
  console.log(`Total in database: ${total[0].count}`);
  console.log('');

  // By discovery method
  const [methods] = await bigquery.query({
    query: `
      SELECT 
        discovery_method,
        COUNT(*) as count,
        SUM(CASE WHEN is_relevant IS NULL THEN 1 ELSE 0 END) as unclassified,
        MIN(discovered_at) as first,
        MAX(discovered_at) as last
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      GROUP BY discovery_method
      ORDER BY count DESC
    `,
  });

  console.log('By Discovery Method:');
  methods.forEach((row: any) => {
    const first = row.first?.value ? new Date(row.first.value).toISOString() : 'N/A';
    const last = row.last?.value ? new Date(row.last.value).toISOString() : 'N/A';
    console.log(`  ${row.discovery_method}:`);
    console.log(`    Count: ${row.count}`);
    console.log(`    Unclassified: ${row.unclassified}`);
    console.log(`    First: ${first}`);
    console.log(`    Last: ${last}`);
    console.log('');
  });

  // Check classification status
  const [classification] = await bigquery.query({
    query: `
      SELECT 
        COUNTIF(is_relevant = true) as relevant,
        COUNTIF(is_relevant = false) as not_relevant,
        COUNTIF(is_relevant IS NULL) as unclassified
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
    `,
  });

  const c = classification[0];
  console.log('Classification Status:');
  console.log(`  Relevant: ${c.relevant}`);
  console.log(`  Not Relevant: ${c.not_relevant}`);
  console.log(`  Unclassified: ${c.unclassified}`);
  console.log('');
}

diagnose().catch(console.error);

