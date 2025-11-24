#!/usr/bin/env ts-node
/**
 * Debug Native VECTOR_SEARCH Function
 * 
 * Investigates the correct syntax and output schema for BigQuery's
 * native VECTOR_SEARCH function.
 */

import { getBigQuery } from '../../src/bq/client';

const PROJECT_ID = 'newsletter-control-center';
const DATASET = 'ncc_production';

async function testBasicVectorSearch() {
  const bq = getBigQuery();
  
  console.log('🔬 Test 1: Basic VECTOR_SEARCH (no joins)\n');
  
  // Get a sample embedding to use as query
  console.log('   Fetching sample embedding...');
  const [sampleRows] = await bq.query({
    query: `
      SELECT embedding 
      FROM \`${PROJECT_ID}.${DATASET}.chunk_embeddings\`
      LIMIT 1
    `,
    location: 'US'
  });
  
  const sampleEmbedding = sampleRows[0].embedding;
  console.log(`   ✓ Got embedding (${sampleEmbedding.length} dimensions)\n`);
  
  // Test 1: Simplest possible VECTOR_SEARCH
  console.log('   Testing: VECTOR_SEARCH with no table alias...');
  try {
    const [rows] = await bq.query({
      query: `
        SELECT *
        FROM VECTOR_SEARCH(
          TABLE \`${PROJECT_ID}.${DATASET}.chunk_embeddings\`,
          'embedding',
          (SELECT ${JSON.stringify(sampleEmbedding)} AS embedding),
          distance_type => 'COSINE',
          top_k => 5
        )
      `,
      location: 'US'
    });
    
    console.log(`   ✅ SUCCESS! Returned ${rows.length} rows`);
    console.log('\n   Output schema:');
    if (rows.length > 0) {
      const columns = Object.keys(rows[0]);
      columns.forEach(col => {
        console.log(`      - ${col}: ${typeof rows[0][col]}`);
      });
      
      console.log('\n   Sample row:');
      console.log(JSON.stringify(rows[0], null, 2));
    }
    
    return { success: true, schema: rows.length > 0 ? Object.keys(rows[0]) : [] };
    
  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testVectorSearchWithAlias() {
  const bq = getBigQuery();
  
  console.log('\n\n🔬 Test 2: VECTOR_SEARCH with table alias\n');
  
  const [sampleRows] = await bq.query({
    query: `SELECT embedding FROM \`${PROJECT_ID}.${DATASET}.chunk_embeddings\` LIMIT 1`,
    location: 'US'
  });
  const sampleEmbedding = sampleRows[0].embedding;
  
  console.log('   Testing: VECTOR_SEARCH AS base...');
  try {
    const [rows] = await bq.query({
      query: `
        SELECT *
        FROM VECTOR_SEARCH(
          TABLE \`${PROJECT_ID}.${DATASET}.chunk_embeddings\`,
          'embedding',
          (SELECT ${JSON.stringify(sampleEmbedding)} AS embedding),
          distance_type => 'COSINE',
          top_k => 5
        ) AS base
      `,
      location: 'US'
    });
    
    console.log(`   ✅ SUCCESS! Returned ${rows.length} rows`);
    
    if (rows.length > 0) {
      console.log('\n   Columns available:');
      Object.keys(rows[0]).forEach(col => {
        console.log(`      - base.${col}`);
      });
    }
    
    return { success: true, schema: rows.length > 0 ? Object.keys(rows[0]) : [] };
    
  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testVectorSearchWithJoins() {
  const bq = getBigQuery();
  
  console.log('\n\n🔬 Test 3: VECTOR_SEARCH with JOINs (accessing nested schema)\n');
  
  const [sampleRows] = await bq.query({
    query: `SELECT embedding FROM \`${PROJECT_ID}.${DATASET}.chunk_embeddings\` LIMIT 1`,
    location: 'US'
  });
  const sampleEmbedding = sampleRows[0].embedding;
  
  console.log('   Testing: VECTOR_SEARCH with proper nested column access...');
  try {
    const [rows] = await bq.query({
      query: `
        SELECT 
          base.base.chunk_id,
          base.distance,
          c.chunk_text
        FROM VECTOR_SEARCH(
          TABLE \`${PROJECT_ID}.${DATASET}.chunk_embeddings\`,
          'embedding',
          (SELECT ${JSON.stringify(sampleEmbedding)} AS embedding),
          distance_type => 'COSINE',
          top_k => 5
        ) AS base
        JOIN \`${PROJECT_ID}.${DATASET}.chunks\` c
          ON base.base.chunk_id = c.chunk_id
      `,
      location: 'US'
    });
    
    console.log(`   ✅ SUCCESS! Returned ${rows.length} rows with joined data`);
    
    if (rows.length > 0) {
      console.log('\n   Sample result:');
      console.log(`      ID: ${rows[0].chunk_id}`);
      console.log(`      Distance: ${rows[0].distance}`);
      console.log(`      Text: ${rows[0].chunk_text?.substring(0, 100)}...`);
    }
    
    return { success: true };
    
  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testOptimalQuery() {
  const bq = getBigQuery();
  
  console.log('\n\n🔬 Test 4: Optimal Full Query (with nested column access)\n');
  
  const [sampleRows] = await bq.query({
    query: `SELECT embedding FROM \`${PROJECT_ID}.${DATASET}.chunk_embeddings\` LIMIT 1`,
    location: 'US'
  });
  const sampleEmbedding = sampleRows[0].embedding;
  
  console.log('   Testing: Complete query with all metadata...');
  
  const startTime = Date.now();
  
  try {
    const [rows] = await bq.query({
      query: `
        SELECT 
          base.distance,
          c.chunk_id,
          c.chunk_text,
          re.subject,
          re.from_name,
          re.from_email,
          DATE(re.sent_date) as sent_date,
          p.display_name as publisher_name
        FROM VECTOR_SEARCH(
          TABLE \`${PROJECT_ID}.${DATASET}.chunk_embeddings\`,
          'embedding',
          (SELECT ${JSON.stringify(sampleEmbedding)} AS embedding),
          distance_type => 'COSINE',
          top_k => 10
        ) AS base
        JOIN \`${PROJECT_ID}.${DATASET}.chunks\` c
          ON base.base.chunk_id = c.chunk_id
        JOIN \`${PROJECT_ID}.${DATASET}.raw_emails\` re
          ON c.gmail_message_id = re.gmail_message_id
        LEFT JOIN \`${PROJECT_ID}.${DATASET}.publishers\` p
          ON c.publisher_id = p.publisher_id
        WHERE c.is_junk = FALSE
        ORDER BY base.distance ASC
      `,
      location: 'US'
    });
    
    const duration = Date.now() - startTime;
    
    console.log(`   ✅ SUCCESS! Query completed in ${duration}ms`);
    console.log(`   Returned ${rows.length} results`);
    
    if (rows.length > 0) {
      console.log('\n   Top 3 results:');
      rows.slice(0, 3).forEach((row, idx) => {
        console.log(`\n   [${idx + 1}] Distance: ${row.distance.toFixed(4)}`);
        console.log(`       From: ${row.from_name}`);
        console.log(`       Subject: ${row.subject}`);
        console.log(`       Text: ${row.chunk_text?.substring(0, 80)}...`);
      });
    }
    
    console.log(`\n   ⚡ Performance: ${duration}ms vs ~2000ms with manual distance = ${((2000 / duration) * 100).toFixed(0)}% faster!`);
    
    return { success: true, duration };
    
  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function generateFixedQueryTemplate() {
  console.log('\n\n' + '='.repeat(80));
  console.log('📝 OPTIMAL QUERY TEMPLATE');
  console.log('='.repeat(80));
  
  console.log(`
-- Use this query in your search implementation:

-- KEY: Note the base.base.chunk_id syntax!
-- VECTOR_SEARCH returns: { query: {...}, base: {chunk_id, embedding, ...}, distance }
-- So we need to access base.base.chunk_id to get the chunk ID

SELECT 
  base.distance,
  c.chunk_id,
  c.chunk_text,
  re.subject,
  re.from_name,
  re.from_email,
  DATE(re.sent_date) as sent_date,
  p.display_name as publisher_name
FROM VECTOR_SEARCH(
  TABLE \`${PROJECT_ID}.${DATASET}.chunk_embeddings\`,
  'embedding',
  (SELECT ${JSON.stringify([0.1, 0.2])}... AS embedding),  -- Your query embedding here
  distance_type => 'COSINE',
  top_k => 10
) AS base
JOIN \`${PROJECT_ID}.${DATASET}.chunks\` c
  ON base.base.chunk_id = c.chunk_id  -- ← Note: base.base.chunk_id!
JOIN \`${PROJECT_ID}.${DATASET}.raw_emails\` re
  ON c.gmail_message_id = re.gmail_message_id
LEFT JOIN \`${PROJECT_ID}.${DATASET}.publishers\` p
  ON c.publisher_id = p.publisher_id
WHERE c.is_junk = FALSE
ORDER BY base.distance ASC;

-- Expected performance: 100-500ms (vs 2000-5000ms with manual calculation)
-- This properly uses the vector search index!
  `);
}

async function main() {
  console.log('🔍 Debugging BigQuery Native VECTOR_SEARCH Function');
  console.log('='.repeat(80));
  console.log();
  
  try {
    // Test 1: Basic VECTOR_SEARCH
    const test1 = await testBasicVectorSearch();
    
    if (!test1.success) {
      console.log('\n❌ Basic VECTOR_SEARCH failed. Cannot proceed.');
      console.log('   This means VECTOR_SEARCH might not be supported in your BigQuery instance.');
      console.log('   Or there is a syntax issue with the function call.');
      return;
    }
    
    // Test 2: With alias
    const test2 = await testVectorSearchWithAlias();
    
    // Test 3: With JOINs
    if (test2.success) {
      await testVectorSearchWithJoins();
    }
    
    // Test 4: Optimal full query
    const test4 = await testOptimalQuery();
    
    if (test4.success) {
      // Generate template
      await generateFixedQueryTemplate();
      
      console.log('\n' + '='.repeat(80));
      console.log('✅ DIAGNOSIS COMPLETE');
      console.log('='.repeat(80));
      console.log(`
Summary:
  ✅ VECTOR_SEARCH function works correctly
  ✅ Can join with metadata tables
  ✅ Performance: ~${test4.duration || '100-500'}ms (much faster than manual)
  
Next Steps:
  1. Update scripts/vector/test-search.ts to use the optimal query template above
  2. Re-run benchmarks to verify 10x+ speedup
  3. Update documentation with correct implementation
  
The fix is ready to implement! 🚀
      `);
    }
    
    process.exit(0);
    
  } catch (error: any) {
    console.error('\n❌ Unexpected error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

