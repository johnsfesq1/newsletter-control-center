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

// Convert ET time to UTC cron
function etToUtcCron(hour: number, minute: number): string {
  // ET is UTC-5 (EST) or UTC-4 (EDT). We'll use UTC-5 for simplicity.
  // For EDT, adjust accordingly.
  let utcHour = hour + 5;
  if (utcHour >= 24) {
    utcHour -= 24;
  }
  return `${minute} ${utcHour} * * *`; // minute hour * * *
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('apply', {
      type: 'boolean',
      default: false,
      description: 'Actually create scheduler jobs (default: preview)',
    })
    .parse();

  const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const REGION = process.env.NCC_REGION || 'us-central1';
  const SERVICE_NAME = 'ncc-jobs-runner';

  // Get runner service URL
  let runnerUrl = '';
  try {
    runnerUrl = shell(
      `gcloud run services describe ${SERVICE_NAME} --region=${REGION} --project=${PROJECT} --format="value(status.url)"`,
    );
  } catch (error: any) {
    throw new Error(`Could not get runner service URL. Deploy the runner first with: npm run cloud:runner:apply`);
  }

  console.log('---');
  console.log('SCHEDULE CLOUD RUN JOBS');
  console.log(`Project: ${PROJECT}`);
  console.log(`Region: ${REGION}`);
  console.log(`Runner URL: ${runnerUrl}`);
  console.log(`Mode: ${argv.apply ? 'APPLY' : 'PREVIEW'}`);
  console.log('');

  const schedules = [
    {
      name: 'schedule-ncc-chunks',
      job: 'ncc-chunks',
      description: 'Hourly at :20 ET',
      cron: '20 * * * *', // Every hour at :20
      timeZone: 'America/New_York',
    },
    {
      name: 'schedule-ncc-embeddings',
      job: 'ncc-embeddings',
      description: 'Hourly at :35 ET',
      cron: '35 * * * *', // Every hour at :35
      timeZone: 'America/New_York',
    },
    {
      name: 'schedule-ncc-smoke',
      job: 'ncc-smoke',
      description: 'Daily at 18:00 ET',
      cron: '0 18 * * *', // 18:00 ET (timezone handles DST automatically)
      timeZone: 'America/New_York',
    },
    // Ingest schedules (2x daily at 07:00, 13:00 ET)
    {
      name: 'schedule-ncc-ingest-me-0700',
      job: 'ncc-ingest-me',
      description: 'Daily at 07:00 ET (morning)',
      cron: '0 7 * * *',
      timeZone: 'America/New_York',
    },
    {
      name: 'schedule-ncc-ingest-me-1300',
      job: 'ncc-ingest-me',
      description: 'Daily at 13:00 ET (afternoon)',
      cron: '0 13 * * *',
      timeZone: 'America/New_York',
    },
    {
      name: 'schedule-ncc-ingest-other-0700',
      job: 'ncc-ingest-other',
      description: 'Daily at 07:00 ET (morning)',
      cron: '0 7 * * *',
      timeZone: 'America/New_York',
    },
    {
      name: 'schedule-ncc-ingest-other-1300',
      job: 'ncc-ingest-other',
      description: 'Daily at 13:00 ET (afternoon)',
      cron: '0 13 * * *',
      timeZone: 'America/New_York',
    },
  ];

  const commands: string[] = [];

  for (const schedule of schedules) {
    const payload = JSON.stringify({ job: schedule.job });

    const createCmd = `gcloud scheduler jobs create http ${schedule.name} \\
  --location=${REGION} \\
  --project=${PROJECT} \\
  --schedule="${schedule.cron}" \\
  --time-zone="${schedule.timeZone}" \\
  --uri="${runnerUrl}/run" \\
  --http-method=POST \\
  --headers="Content-Type=application/json" \\
  --message-body='${payload}' \\
  --oidc-service-account-email=newsletter-local-dev@newsletter-control-center.iam.gserviceaccount.com`;

    commands.push(createCmd);
  }

  if (!argv.apply) {
    // Preview mode
    console.log('PREVIEW: Would create the following scheduler jobs:');
    console.log('');
    for (let i = 0; i < schedules.length; i++) {
      const schedule = schedules[i];
      const cmd = commands[i];
      console.log(`${i + 1}. ${schedule.name} (${schedule.description})`);
      console.log(`   Command: ${cmd.split('\\')[0]}...`);
      console.log('');
    }
    console.log('Run with --apply to create these scheduler jobs.');
    console.log('---');
    return;
  }

  // Apply mode
  console.log('APPLY MODE: Creating scheduler jobs...');
  console.log('');

  // Check if we need to switch to human user for deployment
  let currentAccount = '';
  try {
    currentAccount = shell('gcloud config get-value account');
  } catch {
    currentAccount = '';
  }

  const needsHumanAuth = currentAccount.endsWith('.iam.gserviceaccount.com');

  if (needsHumanAuth) {
    console.log('Authenticated as service account. Deployment requires human user.');
    console.log('Switching to human user...');
    spawnSync('gcloud', ['auth', 'login', '--update-adc', '--quiet'], { stdio: 'inherit' });
    shell(`gcloud config set project ${PROJECT}`);
    console.log('✅ Switched to human user');
    console.log('');
  }

  for (let i = 0; i < schedules.length; i++) {
    const schedule = schedules[i];

    console.log(`Creating scheduler job: ${schedule.name}...`);

    const payload = JSON.stringify({ job: schedule.job });
    const createArgs = [
      'scheduler', 'jobs', 'create', 'http', schedule.name,
      `--location=${REGION}`,
      `--project=${PROJECT}`,
      `--schedule="${schedule.cron}"`,
      `--time-zone="${schedule.timeZone}"`,
      `--uri="${runnerUrl}/run"`,
      '--http-method=POST',
      '--headers=Content-Type=application/json',
      `--message-body='${payload}'`,
      `--oidc-service-account-email=newsletter-local-dev@newsletter-control-center.iam.gserviceaccount.com`,
    ];

    try {
      execSync(`gcloud ${createArgs.join(' ')}`, { stdio: 'inherit' });
      console.log(`✅ Created scheduler job: ${schedule.name}`);
    } catch (error: any) {
      const errorMsg = (error.stderr?.toString() || error.stdout?.toString() || error.message || String(error)).toLowerCase();
      if (errorMsg.includes('already exists') || errorMsg.includes('409')) {
        console.log(`   Scheduler job exists, updating...`);
        const updateArgs = createArgs.map(arg => arg.replace('create', 'update'));
        updateArgs[3] = 'update'; // Fix the command name
        try {
          execSync(`gcloud ${updateArgs.join(' ')}`, { stdio: 'inherit' });
          console.log(`✅ Updated scheduler job: ${schedule.name}`);
        } catch (updateError: any) {
          console.error(`❌ Failed to update scheduler job ${schedule.name}: ${updateError.message}`);
        }
      } else {
        console.error(`❌ Failed to create scheduler job ${schedule.name}`);
        console.error(error.stderr?.toString() || error.message || String(error));
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
  console.log('✅ Scheduler deployment complete!');
  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;


