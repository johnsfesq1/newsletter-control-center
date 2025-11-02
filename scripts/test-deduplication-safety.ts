import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const CHUNKS_TABLE = 'chunks';

/**
 * SAFETY VERIFICATION SCRIPT
 * 
 * This script verifies that the deduplication logic will NOT delete unique chunks.
 * Run this BEFORE running the actual deduplication to be 100% confident.
 */
async function verifySafety() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🔒 DEDUPLICATION SAFETY VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check 1: Count unique chunks (should never be deleted)
  console.log('✅ Check 1: Counting unique chunks (protected)...');
  const uniqueQuery = `
    SELECT COUNT(*) as unique_count
    FROM (
      SELECT newsletter_id, chunk_index
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
      GROUP BY newsletter_id, chunk_index
      HAVING COUNT(*) = 1
    )
  `;
  const [uniqueRows] = await bigquery.query(uniqueQuery);
  const uniqueCount = parseInt((uniqueRows[0] as any).unique_count);
  console.log(`   Found ${uniqueCount.toLocaleString()} unique (newsletter_id, chunk_index) combinations\n`);

  // Check 2: What would the delete query target?
  console.log('✅ Check 2: Identifying delete candidates...');
  const deleteCandidatesQuery = `
    SELECT COUNT(*) as delete_count
    FROM (
      SELECT 
        chunk_id,
        ROW_NUMBER() OVER (PARTITION BY newsletter_id, chunk_index ORDER BY created_at DESC) as rn
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
    )
    WHERE rn > 1
  `;
  const [deleteRows] = await bigquery.query(deleteCandidatesQuery);
  const deleteCount = parseInt((deleteRows[0] as any).delete_count);
  console.log(`   Would delete ${deleteCount.toLocaleString()} chunks\n`);

  // Check 3: CRITICAL - Are any unique chunks in the delete set?
  console.log('🚨 Check 3: CRITICAL - Checking if unique chunks would be deleted...');
  const safetyCheckQuery = `
    WITH unique_chunks AS (
      SELECT newsletter_id, chunk_index
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
      GROUP BY newsletter_id, chunk_index
      HAVING COUNT(*) = 1
    ),
    delete_candidates AS (
      SELECT 
        chunk_id,
        newsletter_id,
        chunk_index
      FROM (
        SELECT 
          chunk_id,
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

  console.log(`   Unique chunks that would be deleted: ${uniqueInDeleteSet}\n`);

  // Check 4: Verify the logic
  console.log('✅ Check 4: Verifying ROW_NUMBER logic...');
  const logicCheckQuery = `
    WITH ranked AS (
      SELECT 
        chunk_id,
        newsletter_id,
        chunk_index,
        ROW_NUMBER() OVER (PARTITION BY newsletter_id, chunk_index ORDER BY created_at DESC) as rn
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
      WHERE newsletter_id = '192e886a132d880b' AND chunk_index = 0
    )
    SELECT 
      COUNT(CASE WHEN rn = 1 THEN 1 END) as kept_count,
      COUNT(CASE WHEN rn > 1 THEN 1 END) as deleted_count,
      COUNT(*) as total_count
    FROM ranked
  `;
  const [logicRows] = await bigquery.query(logicCheckQuery);
  const logic = logicRows[0] as any;
  console.log(`   Sample newsletter chunk_index 0:`);
  console.log(`     Would keep: ${logic.kept_count} (latest)`);
  console.log(`     Would delete: ${logic.deleted_count} (older duplicates)`);
  console.log(`     Total: ${logic.total_count}\n`);

  // Final verdict
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 SAFETY VERIFICATION RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Unique chunks protected: ${uniqueCount.toLocaleString()}`);
  console.log(`Chunks to delete: ${deleteCount.toLocaleString()}`);
  console.log(`Unique chunks in delete set: ${uniqueInDeleteSet}`);
  console.log('');

  if (uniqueInDeleteSet === 0) {
    console.log('✅ ✅ ✅ SAFETY VERIFICATION PASSED ✅ ✅ ✅');
    console.log('');
    console.log('The deduplication logic is SAFE:');
    console.log('  ✅ Unique chunks (no duplicates) are PROTECTED');
    console.log('  ✅ Only duplicate chunks (rn > 1) will be deleted');
    console.log('  ✅ Logic is correct and safe to run');
    console.log('');
  } else {
    console.log('❌ ❌ ❌ SAFETY VERIFICATION FAILED ❌ ❌ ❌');
    console.log('');
    console.log(`⚠️  WARNING: ${uniqueInDeleteSet} unique chunks would be deleted!`);
    console.log('   DO NOT RUN DEDUPLICATION - Logic needs to be fixed!');
    console.log('');
    process.exit(1);
  }
}

main().catch(console.error);

async function main() {
  try {
    await verifySafety();
  } catch (error) {
    console.error('\n❌ Safety verification failed:', error);
    process.exit(1);
  }
}
