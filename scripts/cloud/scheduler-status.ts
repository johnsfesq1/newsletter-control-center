#!/usr/bin/env ts-node
/**
 * Check Cloud Scheduler status - shows all jobs with their state and run times
 */
import 'dotenv/config';
import { execSync } from 'child_process';

function shell(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch (error: any) {
    const stderr = error.stderr?.toString() || '';
    throw new Error(`Command failed: ${cmd}\n${stderr}`);
  }
}

async function main(): Promise<void> {
  const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const REGION = process.env.NCC_REGION || 'us-central1';

  console.log('📅 CLOUD SCHEDULER STATUS\n');
  console.log(`Project: ${PROJECT}`);
  console.log(`Region: ${REGION}\n`);
  console.log('─'.repeat(120));
  console.log('');

  try {
    // Get scheduler jobs as JSON
    const output = shell(
      `gcloud scheduler jobs list --location=${REGION} --project=${PROJECT} --format=json`
    );
    const jobs = JSON.parse(output);

    if (jobs.length === 0) {
      console.log('⚠️  No scheduler jobs found.');
      console.log('\nCreate them with: npm run cloud:schedule:apply');
      return;
    }

    // Group by job type
    const ingestJobs = jobs.filter((j: any) => j.name.includes('ingest'));
    const processingJobs = jobs.filter((j: any) => !j.name.includes('ingest'));

    // Show ingestion jobs
    console.log('📧 INGESTION JOBS (Email ingestion from Gmail)\n');
    if (ingestJobs.length === 0) {
      console.log('   No ingestion jobs scheduled.\n');
    } else {
      for (const job of ingestJobs) {
        const name = job.name.split('/').pop();
        const state = job.state === 'ENABLED' ? '✅ ENABLED' : '⏸️  PAUSED';
        const schedule = job.schedule || 'N/A';
        const lastRun = job.lastAttemptTime 
          ? new Date(job.lastAttemptTime).toLocaleString('en-US', { timeZone: 'America/New_York' })
          : 'Never';
        const nextRun = job.status?.nextAttemptTime
          ? new Date(job.status.nextAttemptTime).toLocaleString('en-US', { timeZone: 'America/New_York' })
          : 'N/A';
        const lastStatus = job.status?.code === 200 ? '✅' : job.status?.code ? `❌ ${job.status.code}` : '?';

        console.log(`   ${state}  ${name}`);
        console.log(`            Schedule: ${schedule} (${job.timeZone || 'UTC'})`);
        console.log(`            Last run: ${lastRun} ${lastStatus}`);
        console.log(`            Next run: ${nextRun}`);
        console.log('');
      }
    }

    console.log('─'.repeat(120));
    console.log('');

    // Show processing jobs
    console.log('⚙️  PROCESSING JOBS (Chunking, embeddings, monitoring)\n');
    if (processingJobs.length === 0) {
      console.log('   No processing jobs scheduled.\n');
    } else {
      for (const job of processingJobs) {
        const name = job.name.split('/').pop();
        const state = job.state === 'ENABLED' ? '✅ ENABLED' : '⏸️  PAUSED';
        const schedule = job.schedule || 'N/A';
        const lastRun = job.lastAttemptTime 
          ? new Date(job.lastAttemptTime).toLocaleString('en-US', { timeZone: 'America/New_York' })
          : 'Never';
        const nextRun = job.status?.nextAttemptTime
          ? new Date(job.status.nextAttemptTime).toLocaleString('en-US', { timeZone: 'America/New_York' })
          : 'N/A';
        const lastStatus = job.status?.code === 200 ? '✅' : job.status?.code ? `❌ ${job.status.code}` : '?';

        console.log(`   ${state}  ${name}`);
        console.log(`            Schedule: ${schedule} (${job.timeZone || 'UTC'})`);
        console.log(`            Last run: ${lastRun} ${lastStatus}`);
        console.log(`            Next run: ${nextRun}`);
        console.log('');
      }
    }

    console.log('─'.repeat(120));
    console.log('');

    // Show summary
    const enabledCount = jobs.filter((j: any) => j.state === 'ENABLED').length;
    const pausedCount = jobs.filter((j: any) => j.state === 'PAUSED').length;
    const failedCount = jobs.filter((j: any) => j.status?.code && j.status.code !== 200).length;

    console.log('📊 SUMMARY\n');
    console.log(`   Total jobs: ${jobs.length}`);
    console.log(`   Enabled: ${enabledCount}`);
    console.log(`   Paused: ${pausedCount}`);
    if (failedCount > 0) {
      console.log(`   ❌ Failed last run: ${failedCount}`);
    }
    console.log('');

    // Show helpful commands
    console.log('─'.repeat(120));
    console.log('');
    console.log('💡 HELPFUL COMMANDS\n');
    console.log('   View this status:           npm run cloud:schedule:status');
    console.log('   Disable all schedulers:     npm run cloud:schedule:disable:apply');
    console.log('   Enable all schedulers:      npm run cloud:schedule:enable:apply');
    console.log('   Test-fire a job manually:   npm run cloud:job:execute <job-name>');
    console.log('   Update schedules:           npm run cloud:schedule:apply');
    console.log('');

  } catch (error: any) {
    console.error('❌ Error fetching scheduler status:', error.message);
    console.log('\nMake sure you are authenticated: gcloud auth login');
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

