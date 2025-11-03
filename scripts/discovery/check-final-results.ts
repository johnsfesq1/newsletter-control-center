/**
 * Check final discovery results from BigQuery
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const TABLE_ID = 'discovered_newsletters';

async function checkFinalResults() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 DISCOVERY FINAL RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Total counts
  const [totalRows] = await bigquery.query({
    query: `
      SELECT 
        COUNT(*) as total_discoveries,
        COUNT(DISTINCT canonical_url) as unique_urls,
        SUM(CASE WHEN is_relevant = true THEN 1 ELSE 0 END) as relevant,
        SUM(CASE WHEN is_relevant = false THEN 1 ELSE 0 END) as not_relevant,
        SUM(CASE WHEN needs_review = true THEN 1 ELSE 0 END) as manual_review
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
    `,
  });

  const totals = totalRows[0];
  console.log('📊 TOTAL DISCOVERIES:');
  console.log(`   Total: ${totals.total_discoveries}`);
  console.log(`   Unique URLs: ${totals.unique_urls}`);
  console.log(`   ✅ Relevant: ${totals.relevant}`);
  console.log(`   ❌ Not Relevant: ${totals.not_relevant}`);
  console.log(`   ⚠️  Manual Review: ${totals.manual_review}`);
  console.log('');

  // By discovery method
  const [methodRows] = await bigquery.query({
    query: `
      SELECT 
        discovery_method,
        COUNT(*) as count,
        SUM(CASE WHEN is_relevant = true THEN 1 ELSE 0 END) as relevant
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      GROUP BY discovery_method
      ORDER BY count DESC
    `,
  });

  console.log('📊 BY DISCOVERY METHOD:');
  methodRows.forEach((row: any) => {
    console.log(`   ${row.discovery_method}: ${row.count} total (${row.relevant} relevant)`);
  });
  console.log('');

  // Recent discoveries
  const [recentRows] = await bigquery.query({
    query: `
      SELECT 
        newsletter_name,
        canonical_url,
        discovery_method,
        is_relevant,
        relevance_confidence,
        needs_review
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      ORDER BY discovered_at DESC
      LIMIT 10
    `,
  });

  console.log('📋 RECENT DISCOVERIES (last 10):');
  recentRows.forEach((row: any, i: number) => {
    const status = row.is_relevant ? '✅ Relevant' : row.needs_review ? '⚠️ Review' : '❌ Not Relevant';
    console.log(`${i + 1}. ${row.newsletter_name}`);
    console.log(`   ${row.canonical_url}`);
    console.log(`   Method: ${row.discovery_method} | ${status}`);
    if (row.relevance_confidence) {
      console.log(`   Confidence: ${(row.relevance_confidence * 100).toFixed(1)}%`);
    }
    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════════════');
}

checkFinalResults().catch(console.error);

