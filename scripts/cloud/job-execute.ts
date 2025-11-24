#!/usr/bin/env ts-node
/**
 * Manually execute a Cloud Run job - useful for testing
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('job', {
      type: 'string',
      demandOption: true,
      description: 'Job name to execute (e.g., ncc-ingest-me, ncc-chunks)',
    })
    .option('wait', {
      type: 'boolean',
      default: false,
      description: 'Wait for job to complete',
    })
    .parse();

  const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const REGION = process.env.NCC_REGION || 'us-central1';
  const jobName = argv.job;

  console.log('🚀 MANUALLY EXECUTE CLOUD RUN JOB\n');
  console.log(`Project: ${PROJECT}`);
  console.log(`Region: ${REGION}`);
  console.log(`Job: ${jobName}`);
  console.log(`Wait: ${argv.wait ? 'Yes' : 'No (async)'}`);
  console.log('');
  console.log('─'.repeat(80));
  console.log('');

  try {
    const cmd = `gcloud run jobs execute ${jobName} --region=${REGION} --project=${PROJECT}${argv.wait ? ' --wait' : ''}`;
    
    console.log(`Executing: ${cmd}\n`);
    
    execSync(cmd, { stdio: 'inherit' });
    
    console.log('');
    console.log('─'.repeat(80));
    console.log('');
    
    if (argv.wait) {
      console.log('✅ Job completed successfully!\n');
    } else {
      console.log('✅ Job execution started (running async)\n');
      console.log('Check execution status:');
      console.log(`   gcloud run jobs executions list ${jobName} --region=${REGION} --project=${PROJECT} --limit=1`);
      console.log('');
      console.log('View logs:');
      console.log(`   gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${jobName}" --limit=50 --project=${PROJECT}`);
      console.log('');
    }

  } catch (error: any) {
    console.error('\n❌ Job execution failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('   1. Make sure you are authenticated: gcloud auth login');
    console.log('   2. Check if job exists: gcloud run jobs list --region=' + REGION);
    console.log('   3. Verify job name is correct (valid names: ncc-ingest-me, ncc-ingest-other, ncc-chunks, ncc-embeddings, ncc-smoke)');
    console.log('');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

