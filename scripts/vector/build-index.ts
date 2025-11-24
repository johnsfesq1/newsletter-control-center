#!/usr/bin/env ts-node
/**
 * Build Vector Search Index
 * 
 * Creates a BigQuery vector search index on chunk_embeddings.embedding column.
 * 
 * WARNING: This operation takes 20-30 minutes and cannot be interrupted.
 * The index is immutable once built - you can only drop and rebuild.
 * 
 * Usage:
 *   npm run vector:build              # Interactive mode (asks for confirmation)
 *   npm run vector:build -- --force   # Skip confirmation
 */

import { getBigQuery } from '../../src/bq/client';

const PROJECT_ID = 'newsletter-control-center';
const DATASET = 'ncc_production';
const TABLE = 'chunk_embeddings';
const INDEX_NAME = 'chunk_embedding_index';

interface BuildOptions {
  force?: boolean;
  indexType?: 'IVF';
  distanceType?: 'COSINE' | 'EUCLIDEAN' | 'DOT_PRODUCT';
}

async function checkExistingIndex(): Promise<boolean> {
  const bq = getBigQuery();
  
  try {
    const [rows] = await bq.query({
      query: `
        SELECT index_name, index_status, coverage_percentage
        FROM \`${PROJECT_ID}.${DATASET}.INFORMATION_SCHEMA.VECTOR_INDEXES\`
        WHERE table_name = '${TABLE}'
        LIMIT 1
      `,
      location: 'US'
    });

    if (rows.length > 0) {
      const existing = rows[0];
      console.log(`⚠️  Vector index already exists:`);
      console.log(`   Name: ${existing.index_name}`);
      console.log(`   Status: ${existing.index_status}`);
      console.log(`   Coverage: ${existing.coverage_percentage}%\n`);
      return true;
    }
    
    return false;
  } catch (error: any) {
    // INFORMATION_SCHEMA table doesn't exist means no indexes
    if (error.message?.includes('Not found: Table')) {
      return false;
    }
    throw error;
  }
}

async function buildIndex(options: BuildOptions = {}) {
  const bq = getBigQuery();
  
  const indexType = options.indexType || 'IVF';
  const distanceType = options.distanceType || 'COSINE';
  
  console.log('🏗️  Building Vector Search Index...\n');
  console.log(`Configuration:`);
  console.log(`  Project: ${PROJECT_ID}`);
  console.log(`  Dataset: ${DATASET}`);
  console.log(`  Table: ${TABLE}`);
  console.log(`  Index Name: ${INDEX_NAME}`);
  console.log(`  Index Type: ${indexType} (Inverted File Index)`);
  console.log(`  Distance Metric: ${distanceType} (semantic similarity)`);
  console.log(`  Estimated Time: 20-30 minutes\n`);

  const ddl = `
    CREATE VECTOR INDEX \`${INDEX_NAME}\`
    ON \`${PROJECT_ID}.${DATASET}.${TABLE}\`(\`embedding\`)
    OPTIONS (
      index_type = '${indexType}',
      distance_type = '${distanceType}'
    )
  `.trim();

  console.log('DDL to execute:');
  console.log('-'.repeat(60));
  console.log(ddl);
  console.log('-'.repeat(60));
  console.log();

  if (!options.force) {
    console.log('⚠️  WARNING: This operation:');
    console.log('   • Takes 20-30 minutes to complete');
    console.log('   • Cannot be interrupted once started');
    console.log('   • Creates an immutable index (can only drop and rebuild)');
    console.log('   • Charges for BigQuery slot usage during build');
    console.log();
    
    // In production, you'd use readline for interactive confirmation
    console.log('To proceed, rerun with --force flag');
    console.log('  npm run vector:build -- --force');
    return;
  }

  console.log('⏳ Submitting index build job to BigQuery...');
  console.log('   (This returns immediately, but build continues in background)\n');
  
  const startTime = Date.now();
  
  try {
    await bq.query({
      query: ddl,
      location: 'US'
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`✅ Index build job submitted successfully! (${duration}s)`);
    console.log();
    console.log('📊 Build is now running in the background...');
    console.log();
    console.log('To monitor progress:');
    console.log('  npm run vector:status');
    console.log();
    console.log('To test once complete (20-30 min):');
    console.log('  npm run vector:test');
    
  } catch (error: any) {
    console.error('❌ Failed to create index:', error.message);
    throw error;
  }
}

async function main() {
  const force = process.argv.includes('--force');
  
  try {
    console.log('🔍 Checking for existing indexes...\n');
    
    const exists = await checkExistingIndex();
    
    if (exists) {
      console.log('✅ Index already exists and is operational.');
      console.log();
      console.log('To test the index:');
      console.log('  npm run vector:test');
      console.log();
      console.log('To rebuild (drops existing index first):');
      console.log('  npm run vector:rebuild -- --force');
      process.exit(0);
    }
    
    console.log('✅ No existing index found. Ready to build.\n');
    
    await buildIndex({ force });
    
    process.exit(0);
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();

