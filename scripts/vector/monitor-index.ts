#!/usr/bin/env ts-node
/**
 * Monitor Vector Index Build Progress
 * 
 * Checks the status of vector index builds and shows progress.
 * 
 * Usage:
 *   npm run vector:status           # Check status once
 *   npm run vector:status -- --watch # Watch continuously (every 30s)
 */

import { getBigQuery } from '../../src/bq/client';

const PROJECT_ID = 'newsletter-control-center';
const DATASET = 'ncc_production';
const TABLE = 'chunk_embeddings';

interface IndexStatus {
  index_name: string;
  index_status: 'PENDING' | 'ACTIVE' | 'ERROR';
  coverage_percentage: number;
  last_refresh_time?: string;
  ddl: string;
}

async function getIndexStatus(): Promise<IndexStatus[]> {
  const bq = getBigQuery();
  
  try {
    const [rows] = await bq.query({
      query: `
        SELECT 
          table_name,
          index_name,
          index_status,
          coverage_percentage,
          CAST(last_refresh_time AS STRING) as last_refresh_time,
          ddl
        FROM \`${PROJECT_ID}.${DATASET}.INFORMATION_SCHEMA.VECTOR_INDEXES\`
        WHERE table_name = '${TABLE}'
        ORDER BY creation_time DESC
      `,
      location: 'US'
    });

    return rows as IndexStatus[];
  } catch (error: any) {
    if (error.message?.includes('Not found: Table')) {
      return [];
    }
    throw error;
  }
}

function displayStatus(indexes: IndexStatus[]) {
  console.log('📊 Vector Index Status Report');
  console.log('='.repeat(70));
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Dataset: ${DATASET}`);
  console.log(`Table: ${TABLE}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(70));
  console.log();

  if (indexes.length === 0) {
    console.log('❌ No vector indexes found');
    console.log();
    console.log('To create an index:');
    console.log('  npm run vector:build -- --force');
    return { allActive: false };
  }

  let allActive = true;

  indexes.forEach((idx, i) => {
    console.log(`[${i + 1}] Index: ${idx.index_name}`);
    console.log();
    
    // Status with emoji
    let statusEmoji = '⏳';
    if (idx.index_status === 'ACTIVE') {
      statusEmoji = '✅';
    } else if (idx.index_status === 'ERROR') {
      statusEmoji = '❌';
      allActive = false;
    } else {
      allActive = false;
    }
    
    console.log(`    Status: ${statusEmoji} ${idx.index_status}`);
    console.log(`    Coverage: ${idx.coverage_percentage}%`);
    
    if (idx.last_refresh_time) {
      console.log(`    Last Refresh: ${idx.last_refresh_time}`);
    }
    
    console.log();
    
    // Progress bar
    const barWidth = 50;
    const filled = Math.round((idx.coverage_percentage / 100) * barWidth);
    const empty = barWidth - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    console.log(`    Progress: [${bar}] ${idx.coverage_percentage}%`);
    console.log();
    
    // Status-specific messages
    if (idx.index_status === 'PENDING') {
      console.log('    ⏳ Index is building... This typically takes 20-30 minutes.');
      console.log('       You can close this script - the build continues in BigQuery.');
      console.log();
    } else if (idx.index_status === 'ACTIVE') {
      console.log('    ✅ Index is ready for queries!');
      console.log();
      console.log('    To test the index:');
      console.log('      npm run vector:test');
      console.log();
    } else if (idx.index_status === 'ERROR') {
      console.log('    ❌ Index build failed. Check BigQuery logs for details.');
      console.log();
    }
    
    console.log(`    DDL: ${idx.ddl}`);
    console.log();
    console.log('-'.repeat(70));
    console.log();
  });

  return { allActive };
}

async function monitorOnce() {
  try {
    const indexes = await getIndexStatus();
    const { allActive } = displayStatus(indexes);
    
    if (allActive && indexes.length > 0) {
      console.log('✅ All indexes are ACTIVE and ready to use!');
      return true;
    } else if (indexes.length > 0) {
      console.log('⏳ Some indexes are still building or have errors.');
      return false;
    } else {
      console.log('❌ No indexes found.');
      return false;
    }
  } catch (error: any) {
    console.error('❌ Error checking index status:', error.message);
    throw error;
  }
}

async function watchMode() {
  console.log('👀 Watching index status (Ctrl+C to stop)...\n');
  
  const interval = 30000; // 30 seconds
  
  while (true) {
    const ready = await monitorOnce();
    
    if (ready) {
      console.log('\n🎉 All indexes are ready! Stopping watch mode.');
      break;
    }
    
    console.log(`\n⏰ Next check in 30 seconds...`);
    console.log('   (Press Ctrl+C to stop)\n');
    
    await new Promise(resolve => setTimeout(resolve, interval));
    
    // Clear screen for next update (optional)
    // console.clear();
  }
}

async function main() {
  const watch = process.argv.includes('--watch');
  
  try {
    if (watch) {
      await watchMode();
    } else {
      await monitorOnce();
    }
    
    process.exit(0);
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();

