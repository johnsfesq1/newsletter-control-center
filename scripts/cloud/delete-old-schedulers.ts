#!/usr/bin/env ts-node
/**
 * Delete old 3x daily scheduler jobs (0710, 1210, 1710)
 * Run this before creating new 2x daily schedulers
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('apply', {
      type: 'boolean',
      default: false,
      description: 'Actually delete scheduler jobs (default: preview)',
    })
    .parse();

  const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const REGION = process.env.NCC_REGION || 'us-central1';

  console.log('🗑️  DELETE OLD SCHEDULER JOBS\n');
  console.log(`Project: ${PROJECT}`);
  console.log(`Region: ${REGION}`);
  console.log(`Mode: ${argv.apply ? 'APPLY' : 'PREVIEW'}`);
  console.log('');

  // Old 3x daily jobs to delete
  const oldJobs = [
    'schedule-ncc-ingest-me-0710',
    'schedule-ncc-ingest-me-1210',
    'schedule-ncc-ingest-me-1710',
    'schedule-ncc-ingest-other-0710',
    'schedule-ncc-ingest-other-1210',
    'schedule-ncc-ingest-other-1710',
  ];

  if (!argv.apply) {
    console.log('PREVIEW: Would delete the following scheduler jobs:\n');
    for (const job of oldJobs) {
      console.log(`   ❌ ${job}`);
    }
    console.log('');
    console.log('Run with --apply to delete these scheduler jobs.');
    console.log('');
    return;
  }

  // Apply mode
  console.log('APPLY MODE: Deleting old scheduler jobs...\n');

  for (const job of oldJobs) {
    console.log(`Deleting: ${job}...`);
    
    try {
      execSync(
        `gcloud scheduler jobs delete ${job} --location=${REGION} --project=${PROJECT} --quiet`,
        { stdio: 'inherit' }
      );
      console.log(`✅ Deleted: ${job}\n`);
    } catch (error: any) {
      const errorMsg = (error.stderr?.toString() || error.message || String(error)).toLowerCase();
      if (errorMsg.includes('not found') || errorMsg.includes('404')) {
        console.log(`⚠️  Job not found (already deleted): ${job}\n`);
      } else {
        console.error(`❌ Failed to delete: ${job}`);
        console.error(error.message || String(error));
        console.log('');
      }
    }
  }

  console.log('─'.repeat(80));
  console.log('');
  console.log('✅ Old scheduler jobs deleted!');
  console.log('');
  console.log('Next step: Create new 2x daily schedulers');
  console.log('   npm run cloud:schedule:apply');
  console.log('');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

