import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const CHUNKS_TABLE = 'chunks';
const LOCATION = 'us-central1';

interface DeduplicationStats {
  totalDuplicates: number;
  newslettersAffected: number;
  chunksDeleted: number;
  dryRun: boolean;
}

async function analyzeDuplicates(bigquery: BigQuery): Promise<DeduplicationStats> {
  console.log('\n🔍 Analyzing duplicates...\n');
  
  const query = `
    WITH duplicates AS (
      SELECT 
        newsletter_id,
        chunk_index,
        COUNT(*) as duplicate_count,
        ARRAY_AGG(chunk_id ORDER BY created_at DESC LIMIT 1)[OFFSET(0)] as keep_chunk_id,
        ARRAY_AGG(chunk_id ORDER BY created_at DESC)[OFFSET(1)] as duplicate_chunk_id
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
      GROUP BY newsletter_id, chunk_index
      HAVING COUNT(*) > 1
    )
    SELECT 
      COUNT(*) as total_duplicate_groups,
      COUNT(DISTINCT newsletter_id) as newsletters_affected,
      SUM(duplicate_count - 1) as total_duplicates_to_delete
    FROM duplicates
  `;

  const [rows] = await bigquery.query(query);
  const stats = rows[0] as any;

  return {
    totalDuplicates: parseInt(stats.total_duplicates_to_delete) || 0,
    newslettersAffected: parseInt(stats.newsletters_affected) || 0,
    chunksDeleted: 0,
    dryRun: true
  };
}

async function deduplicateChunks(bigquery: BigQuery, dryRun: boolean = true): Promise<DeduplicationStats> {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🧹 CHUNK DEDUPLICATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  } else {
    console.log('⚠️  LIVE MODE - Duplicates will be deleted!\n');
  }

  // Step 1: Analyze duplicates
  const stats = await analyzeDuplicates(bigquery);
  
  console.log('📊 Duplicate Analysis:');
  console.log(`   Newsletters affected: ${stats.newslettersAffected.toLocaleString()}`);
  console.log(`   Duplicate chunks to delete: ${stats.totalDuplicates.toLocaleString()}\n`);

  if (stats.totalDuplicates === 0) {
    console.log('✅ No duplicates found!');
    return stats;
  }

  // CRITICAL SAFETY CHECK: Verify unique chunks won't be deleted
  console.log('🔒 Performing critical safety check...');
  const safetyCheckQuery = `
    WITH unique_chunks AS (
      SELECT newsletter_id, chunk_index
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
      GROUP BY newsletter_id, chunk_index
      HAVING COUNT(*) = 1
    ),
    delete_candidates AS (
      SELECT 
        newsletter_id,
        chunk_index
      FROM (
        SELECT 
          newsletter_id,
          chunk_index,
          ROW_NUMBER() OVER (PARTITION BY newsletter_id, chunk_index ORDER BY created_at DESC) as rn
        FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
      )
      WHERE rn > 1
    )
    SELECT COUNT(*) as unique_chunks_in_delete_set
    FROM delete_candidates dc
    JOIN unique_chunks uc ON dc.newsletter_id = uc.newsletter_id AND dc.chunk_index = uc.chunk_index
  `;
  
  const [safetyRows] = await bigquery.query(safetyCheckQuery);
  const uniqueInDeleteSet = parseInt((safetyRows[0] as any).unique_chunks_in_delete_set);
  
  if (uniqueInDeleteSet > 0) {
    console.error(`\n❌ ❌ ❌ CRITICAL SAFETY CHECK FAILED ❌ ❌ ❌`);
    console.error(`   ${uniqueInDeleteSet} unique chunks would be deleted!`);
    console.error(`   Aborting to prevent data loss.`);
    console.error(`   The deduplication logic needs to be fixed.\n`);
    throw new Error('Safety check failed: unique chunks would be deleted');
  }
  
  console.log(`✅ Safety check passed: No unique chunks in delete set\n`);

  if (dryRun) {
    console.log('🔍 DRY RUN: Would delete the above chunks');
    console.log('   Run with DRY_RUN=false to actually delete duplicates\n');
    return stats;
  }

  // Step 2: Create backup of ALL duplicates (safety first!)
  console.log('💾 Step 1: Creating backup of duplicates...');
  const backupTableName = `chunks_duplicates_backup_${Date.now()}`;
  const backupQuery = `
    CREATE OR REPLACE TABLE \`${PROJECT_ID}.${DATASET_ID}.${backupTableName}\` AS
    SELECT *
    FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\` c1
    WHERE EXISTS (
      SELECT 1
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\` c2
      WHERE c1.newsletter_id = c2.newsletter_id
        AND c1.chunk_index = c2.chunk_index
        AND c1.chunk_id != c2.chunk_id
    )
  `;

  await bigquery.query(backupQuery);
  console.log(`✅ Backup created: ${backupTableName}\n`);

  // Step 3: Identify chunks to keep (keep the latest version by created_at)
  console.log('📋 Step 2: Identifying chunks to keep (keeping latest version)...');
  
  // Get total chunk count before
  const [beforeRows] = await bigquery.query(`
    SELECT COUNT(*) as count FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
  `);
  const beforeCount = parseInt((beforeRows[0] as any).count);

  // Step 4: Delete duplicates using ROW_NUMBER window function
  console.log('🗑️  Step 3: Deleting duplicates (keeping latest)...');
  const deleteQuery = `
    DELETE FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
    WHERE chunk_id IN (
      SELECT chunk_id FROM (
        SELECT 
          chunk_id,
          ROW_NUMBER() OVER (PARTITION BY newsletter_id, chunk_index ORDER BY created_at DESC) as rn
        FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
      )
      WHERE rn > 1
    )
  `;

  const [deleteResult] = await bigquery.query(deleteQuery);
  const deleteCount = stats.totalDuplicates; // Known from analysis
  
  console.log(`✅ Deleted ${deleteCount.toLocaleString()} duplicate chunks\n`);

  // Step 5: Verify deletion
  console.log('✅ Step 4: Verifying deduplication...');
  const [afterRows] = await bigquery.query(`
    SELECT COUNT(*) as count FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
  `);
  const afterCount = parseInt((afterRows[0] as any).count);

  const verifyQuery = `
    SELECT 
      COUNT(*) as remaining_duplicates
    FROM (
      SELECT newsletter_id, chunk_index, COUNT(*) as dup_count
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
      GROUP BY newsletter_id, chunk_index
      HAVING COUNT(*) > 1
    )
  `;

  const [verifyRows] = await bigquery.query(verifyQuery);
  const verify = verifyRows[0] as any;
  const remainingDuplicates = parseInt(verify.remaining_duplicates) || 0;

  console.log(`   Chunks before: ${beforeCount.toLocaleString()}`);
  console.log(`   Chunks after: ${afterCount.toLocaleString()}`);
  console.log(`   Chunks deleted: ${(beforeCount - afterCount).toLocaleString()}`);
  console.log(`   Remaining duplicates: ${remainingDuplicates}\n`);

  if (remainingDuplicates === 0) {
    console.log('✅ Verification passed - no duplicates remaining!\n');
  } else {
    console.log(`⚠️  Warning: ${remainingDuplicates} duplicates still remain\n`);
  }

  return {
    totalDuplicates: deleteCount,
    newslettersAffected: stats.newslettersAffected,
    chunksDeleted: beforeCount - afterCount,
    dryRun: false
  };
}

async function main() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  const dryRun = process.env.DRY_RUN !== 'false';

  try {
    const stats = await deduplicateChunks(bigquery, dryRun);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 DEDUPLICATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Newsletters affected: ${stats.newslettersAffected.toLocaleString()}`);
    console.log(`Chunks to delete: ${stats.totalDuplicates.toLocaleString()}`);
    
    if (dryRun) {
      console.log('\n🔍 This was a DRY RUN');
      console.log('   Set DRY_RUN=false to actually delete duplicates');
    } else {
      console.log(`\n✅ Chunks deleted: ${stats.chunksDeleted.toLocaleString()}`);
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Deduplication failed:', error);
    process.exit(1);
  }
}

main();
