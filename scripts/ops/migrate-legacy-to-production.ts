
import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';

dotenv.config();

const PROJECT_ID = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const SOURCE_DATASET = 'ncc_newsletters';
const DEST_DATASET = 'ncc_production';

async function migrateTable(bq: BigQuery, tableName: string, destTableName?: string) {
  const destName = destTableName || tableName;
  const sourceTable = `${PROJECT_ID}.${SOURCE_DATASET}.${tableName}`;
  const destTable = `${PROJECT_ID}.${DEST_DATASET}.${destName}`;

  console.log(`Migrating ${sourceTable} -> ${destTable}...`);

  // Check if source exists
  const [sourceExists] = await bq.dataset(SOURCE_DATASET).table(tableName).exists();
  if (!sourceExists) {
    console.log(`  Skipping: Source table ${tableName} does not exist.`);
    return;
  }

  // Check if dest exists
  const [destExists] = await bq.dataset(DEST_DATASET).table(destName).exists();
  if (destExists) {
    console.log(`  Skipping: Destination table ${destName} already exists.`);
    return;
  }

  // Copy table (schema + data)
  // Note: copy returns [Job, APIResponse]
  const [job] = await bq.dataset(SOURCE_DATASET).table(tableName).copy(
    bq.dataset(DEST_DATASET).table(destName)
  );
  console.log(`  Job ${job.id} started.`);
  
  // Wait for job to finish by listening for 'complete' or 'error'
  const jobEmitter = job as any;
  await new Promise((resolve, reject) => {
    jobEmitter.on('complete', (metadata: any) => {
      console.log(`  Success: Table copied.`);
      resolve(metadata);
    });
    
    jobEmitter.on('error', (err: any) => {
      console.error(`  Failed: ${err.message}`);
      reject(err);
    });
  });
}

async function main() {
  const bq = new BigQuery({ projectId: PROJECT_ID });

  console.log(`Migration: ${SOURCE_DATASET} -> ${DEST_DATASET}`);

  // 1. Migrate discovered_newsletters (Valuable data, no equivalent in prod)
  await migrateTable(bq, 'discovered_newsletters');

  // 2. Migrate eval_results (Valuable data, no equivalent in prod)
  await migrateTable(bq, 'eval_results');

  // 3. Migrate publishers -> publishers_legacy (Prod has empty 'publishers' with diff schema)
  // We preserve the old data for reference/merging later
  await migrateTable(bq, 'publishers', 'publishers_legacy');

  console.log('\nMigration complete.');
  console.log('Note: Core data (emails, chunks) was not migrated as ncc_production appears to have more recent/complete data already.');
}

main().catch(console.error);
