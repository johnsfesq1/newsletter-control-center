import 'dotenv/config';
import { execSync, spawnSync } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

function shell(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch (error: any) {
    const stderr = error.stderr?.toString() || '';
    throw new Error(`Command failed: ${cmd}\n${stderr}`);
  }
}

function shellJSON<T>(cmd: string): T | null {
  try {
    const output = shell(cmd);
    return output ? JSON.parse(output) : null;
  } catch {
    return null;
  }
}

// Job names matching schedule-jobs.ts
const SCHEDULER_JOBS = [
  'schedule-ncc-chunks',
  'schedule-ncc-embeddings',
  'schedule-ncc-smoke',
  'schedule-ncc-ingest-me-0700',
  'schedule-ncc-ingest-me-1300',
  'schedule-ncc-ingest-other-0700',
  'schedule-ncc-ingest-other-1300',
];

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('enable', {
      type: 'boolean',
      default: false,
      description: 'Enable scheduler jobs',
    })
    .option('disable', {
      type: 'boolean',
      default: false,
      description: 'Disable scheduler jobs',
    })
    .option('all', {
      type: 'boolean',
      default: false,
      description: 'Apply to all scheduler jobs',
    })
    .option('apply', {
      type: 'boolean',
      default: false,
      description: 'Actually apply changes (default: preview)',
    })
    .option('jobs', {
      type: 'array',
      string: true,
      description: 'Specific job names to enable/disable',
    })
    .check((argv) => {
      if (!argv.enable && !argv.disable) {
        throw new Error('Must specify either --enable or --disable');
      }
      if (argv.enable && argv.disable) {
        throw new Error('Cannot specify both --enable and --disable');
      }
      if (!argv.all && (!argv.jobs || argv.jobs.length === 0)) {
        throw new Error('Must specify either --all or --jobs <name1> <name2> ...');
      }
      return true;
    })
    .parse();

  const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const REGION = process.env.NCC_REGION || 'us-central1';
  const action = argv.enable ? 'resume' : 'pause';
  const isEnable = argv.enable;

  // Determine which jobs to process
  let targetJobs: string[] = [];
  if (argv.all) {
    targetJobs = [...SCHEDULER_JOBS];
  } else if (argv.jobs) {
    // Validate job names
    for (const job of argv.jobs) {
      if (!SCHEDULER_JOBS.includes(job)) {
        throw new Error(`Invalid job name: ${job}. Valid names: ${SCHEDULER_JOBS.join(', ')}`);
      }
    }
    targetJobs = argv.jobs as string[];
  }

  console.log('---');
  console.log(`SCHEDULER TOGGLE: ${action.toUpperCase()}`);
  console.log(`Project: ${PROJECT}`);
  console.log(`Region: ${REGION}`);
  console.log(`Jobs: ${targetJobs.join(', ')}`);
  console.log(`Mode: ${argv.apply ? 'APPLY' : 'PREVIEW'}`);
  console.log('');

  // Check current state of jobs
  let existingJobs: any[] = [];
  try {
    const listOutput = shell(`gcloud scheduler jobs list --location=${REGION} --project=${PROJECT} --format=json`);
    existingJobs = JSON.parse(listOutput);
  } catch (error: any) {
    console.warn('⚠️  Could not list existing jobs:', error.message);
  }

  // Build commands for each job
  const commands: Array<{ job: string; cmd: string; currentState: string }> = [];

  for (const jobName of targetJobs) {
    // Find existing job to check current state
    const existing = existingJobs.find((j: any) => j.name?.includes(jobName) || j.name?.endsWith(jobName));
    const currentState = existing?.state || 'UNKNOWN';

    const cmd = `gcloud scheduler jobs ${action} ${jobName} --location=${REGION} --project=${PROJECT}`;
    commands.push({ job: jobName, cmd, currentState });
  }

  if (!argv.apply) {
    // Preview mode
    console.log('PREVIEW: Would execute the following commands:');
    console.log('');
    for (const { job, cmd, currentState } of commands) {
      const status = currentState === 'ENABLED' ? 'ENABLED' : currentState === 'PAUSED' ? 'PAUSED' : 'UNKNOWN';
      console.log(`Job: ${job} (current state: ${status})`);
      console.log(`  ${cmd}`);
      console.log('');
    }
    console.log('Run with --apply to execute these commands.');
    console.log('---');
    return;
  }

  // Apply mode
  console.log('APPLY MODE: Applying changes...');
  console.log('');

  // Check if we need to switch to human user for scheduler operations
  let currentAccount = '';
  try {
    currentAccount = shell('gcloud config get-value account');
  } catch {
    currentAccount = '';
  }

  const needsHumanAuth = currentAccount.endsWith('.iam.gserviceaccount.com');

  if (needsHumanAuth) {
    console.log('Authenticated as service account. Scheduler operations require human user.');
    console.log('Switching to human user...');
    spawnSync('gcloud', ['auth', 'login', '--update-adc', '--quiet'], { stdio: 'inherit' });
    shell(`gcloud config set project ${PROJECT}`);
    console.log('✅ Switched to human user');
    console.log('');
  }

  for (const { job, cmd, currentState } of commands) {
    console.log(`${isEnable ? 'Enabling' : 'Disabling'} ${job}...`);
    
    try {
      execSync(cmd, { stdio: 'inherit' });
      console.log(`✅ ${isEnable ? 'Enabled' : 'Disabled'} ${job}`);
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      // Handle idempotent cases
      if (
        (isEnable && (errorMsg.includes('already enabled') || errorMsg.includes('already ENABLED') || errorMsg.includes('already RESUMED'))) ||
        (!isEnable && (errorMsg.includes('already paused') || errorMsg.includes('already PAUSED')))
      ) {
        console.log(`✅ ${job} is already ${isEnable ? 'enabled' : 'paused'}`);
      } else {
        console.error(`❌ Failed to ${action} ${job}: ${errorMsg}`);
      }
    }
    console.log('');
  }

  // Switch back to service account if we switched
  if (needsHumanAuth) {
    const SA = 'newsletter-local-dev@newsletter-control-center.iam.gserviceaccount.com';
    const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'secrets/gcp/ncc-local-dev.json';
    console.log('Switching back to service account...');
    execSync(`gcloud auth activate-service-account ${SA} --key-file "${KEY}" --project ${PROJECT}`, { stdio: 'inherit' });
    console.log('✅ Switched back to service account');
    console.log('');
  }

  console.log('---');
  console.log(`✅ Scheduler ${action} complete!`);
  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

