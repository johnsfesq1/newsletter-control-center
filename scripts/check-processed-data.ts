import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const CHUNKS_TABLE = 'chunks';

async function checkProcessedData() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  console.log('\n📊 DIAGNOSING OVERNIGHT PROCESSING FAILURE');
  console.log('==========================================\n');

  try {
    // Check total chunks in database
    const totalQuery = `SELECT COUNT(*) as total FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\``;
    const [totalRows] = await bigquery.query(totalQuery);
    const totalChunks = totalRows[0].total;
    console.log(`📦 Total chunks in database: ${totalChunks}`);

    // Check unique newsletters
    const newsletterQuery = `
      SELECT COUNT(DISTINCT newsletter_id) as unique_newsletters
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
    `;
    const [newsletterRows] = await bigquery.query(newsletterQuery);
    const uniqueNewsletters = newsletterRows[0].unique_newsletters;
    console.log(`📰 Unique newsletters processed: ${uniqueNewsletters}`);

    // Get breakdown by publisher
    const publisherQuery = `
      SELECT 
        publisher_name,
        COUNT(DISTINCT newsletter_id) as newsletter_count,
        COUNT(*) as chunk_count
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
      WHERE publisher_name IS NOT NULL
      GROUP BY publisher_name
      ORDER BY newsletter_count DESC
      LIMIT 10
    `;
    const [publisherRows] = await bigquery.query(publisherQuery);
    console.log('\n📊 Top 10 publishers by newsletters processed:');
    publisherRows.forEach((row: any, idx: number) => {
      console.log(`   ${idx + 1}. ${row.publisher_name}: ${row.newsletter_count} newsletters, ${row.chunk_count} chunks`);
    });

    // Check recent entries (to see if any succeeded late)
    const recentQuery = `
      SELECT 
        newsletter_id,
        subject,
        publisher_name,
        COUNT(*) as chunk_count,
        MAX(created_at) as last_processed
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
      GROUP BY newsletter_id, subject, publisher_name
      ORDER BY last_processed DESC
      LIMIT 20
    `;
    const [recentRows] = await bigquery.query(recentQuery);
    console.log('\n🕐 Most recently processed newsletters:');
    recentRows.forEach((row: any, idx: number) => {
      console.log(`   ${idx + 1}. ${row.publisher_name}: "${row.subject.substring(0, 50)}..." (${row.chunk_count} chunks)`);
    });

    // Calculate success rate
    const expectedChunks = totalChunks; // Rough estimate
    console.log(`\n📈 Processing stats from BigQuery:`);
    console.log(`   ✅ Successfully processed: ~${uniqueNewsletters} newsletters`);
    console.log(`   📦 Total chunks created: ${totalChunks}`);
    console.log(`   🎯 Based on ~12 chunks per newsletter: ${Math.round(totalChunks / 12)} fully processed`);

    // Check if we can resume
    const offsetQuery = `
      SELECT newsletter_id
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const [offsetRows] = await bigquery.query(offsetQuery);
    console.log(`\n💾 Database shows ${uniqueNewsletters} newsletters already processed.`);
    console.log(`   You can resume by setting START_FROM=${uniqueNewsletters + 119} to skip already processed items.`);

  } catch (error) {
    console.error('❌ Error querying BigQuery:', error);
  }
}

checkProcessedData();
