#!/usr/bin/env ts-node
/**
 * Check Vector Search Index Status
 * 
 * Queries BigQuery INFORMATION_SCHEMA to check if vector search indexes exist
 * and their current status.
 */

import { getBigQuery } from '../../src/bq/client';

const PROJECT_ID = 'newsletter-control-center';
const DATASET = 'ncc_production';
const TABLE = 'chunk_embeddings';

async function checkIndexStatus() {
  const bq = getBigQuery();
  
  console.log('🔍 Checking Vector Search Index Status...\n');
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Dataset: ${DATASET}`);
  console.log(`Table: ${TABLE}\n`);

  try {
    // Query INFORMATION_SCHEMA for vector indexes
    const [rows] = await bq.query({
      query: `
        SELECT 
          table_name,
          index_name,
          index_status,
          coverage_percentage,
          ddl
        FROM \`${PROJECT_ID}.${DATASET}.INFORMATION_SCHEMA.VECTOR_INDEXES\`
        WHERE table_name = '${TABLE}'
        ORDER BY creation_time DESC
      `,
      location: 'US'
    });

    if (rows.length === 0) {
      console.log('❌ No vector search indexes found');
      console.log('\nTo create a vector index, run:');
      console.log('  npm run vector:build');
      return { exists: false };
    }

    console.log(`✅ Found ${rows.length} vector index(es):\n`);
    
    for (const row of rows) {
      console.log(`Index: ${row.index_name}`);
      console.log(`  Status: ${row.index_status}`);
      console.log(`  Coverage: ${row.coverage_percentage}%`);
      console.log(`  DDL: ${row.ddl}\n`);
    }

    return { exists: true, indexes: rows };

  } catch (error: any) {
    if (error.message?.includes('Not found: Table')) {
      console.log('❌ INFORMATION_SCHEMA.VECTOR_INDEXES table not found');
      console.log('   This could mean:');
      console.log('   1. No vector indexes have been created yet');
      console.log('   2. Vector search is not enabled in this region\n');
      return { exists: false };
    }
    throw error;
  }
}

async function checkTableStats() {
  const bq = getBigQuery();
  
  console.log('\n📊 Table Statistics:\n');
  
  const [rows] = await bq.query({
    query: `
      SELECT 
        COUNT(*) as total_embeddings,
        COUNTIF(embedding IS NOT NULL) as non_null_embeddings,
        COUNTIF(ARRAY_LENGTH(embedding) = 768) as valid_768dim_embeddings
      FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
    `,
    location: 'US'
  });

  const stats = rows[0];
  console.log(`Total rows: ${stats.total_embeddings.toLocaleString()}`);
  console.log(`Non-null embeddings: ${stats.non_null_embeddings.toLocaleString()}`);
  console.log(`Valid 768-dim embeddings: ${stats.valid_768dim_embeddings.toLocaleString()}`);
}

async function main() {
  try {
    const result = await checkIndexStatus();
    await checkTableStats();
    
    console.log('\n' + '='.repeat(60));
    
    if (!result.exists) {
      console.log('\n🎯 NEXT STEP: Build the vector search index');
      console.log('   Run: npm run vector:build');
      process.exit(1);
    } else {
      console.log('\n✅ Vector search index exists and is ready');
      process.exit(0);
    }
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();

