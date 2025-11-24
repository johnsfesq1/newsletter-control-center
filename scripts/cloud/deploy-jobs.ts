import 'dotenv/config';
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
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

interface JobConfig {
  name: string;
  command: string;
  args: string[];
}

interface IngestJobConfig extends JobConfig {
  inbox: 'me' | 'other';
  secrets?: string[]; // Secret bindings for Cloud Run
}

const JOBS: JobConfig[] = [
  {
    name: 'ncc-chunks',
    command: 'node',
    args: ['dist/scripts/chunk-new.js', '--limit', '800', '--no-dry-run'],
  },
  {
    name: 'ncc-embeddings',
    command: 'node',
    args: ['dist/scripts/embed-new-chunks.js', '--limit', '800', '--no-dry-run'],
  },
  {
    name: 'ncc-smoke',
    command: 'node',
    args: ['dist/scripts/smoke.js'],
  },
];

const INGEST_JOBS: IngestJobConfig[] = [
  {
    name: 'ncc-ingest-me',
    command: 'node',
    args: ['dist/scripts/ingest-gmail.js', '--inbox', 'me', '--limit', '500', '--no-dry-run'],
    inbox: 'me',
    secrets: [
      'GMAIL_CLIENT_ID=GMAIL_CLIENT_ID:latest',
      'GMAIL_CLIENT_SECRET=GMAIL_CLIENT_SECRET:latest',
      'GMAIL_REFRESH_TOKEN_ME=GMAIL_REFRESH_TOKEN_ME:latest',
    ],
  },
  {
    name: 'ncc-ingest-other',
    command: 'node',
    args: ['dist/scripts/ingest-gmail.js', '--inbox', 'other', '--limit', '500', '--no-dry-run'],
    inbox: 'other',
    secrets: [
      'GMAIL_CLIENT_ID=GMAIL_CLIENT_ID:latest',
      'GMAIL_CLIENT_SECRET=GMAIL_CLIENT_SECRET:latest',
      'GMAIL_REFRESH_TOKEN_OTHER=GMAIL_REFRESH_TOKEN_OTHER:latest',
    ],
  },
];

async function resolveImage(override?: string): Promise<string> {
  if (override) {
    return override;
  }

  // Try reading from docs/LATEST_IMAGE.txt
  const latestImagePath = path.resolve(__dirname, '../../docs/LATEST_IMAGE.txt');
  if (fs.existsSync(latestImagePath)) {
    const content = fs.readFileSync(latestImagePath, 'utf8').trim();
    if (content) {
      return content;
    }
  }

  // Fall back to querying Artifact Registry
  const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const REPO = 'us-central1-docker.pkg.dev/newsletter-control-center/ncc/ncc-worker';

  try {
    const tags = shellJSON<Array<{ name?: string; createTime?: string }>>(
      `gcloud artifacts docker tags list ${REPO} --format=json --project=${PROJECT}`,
    );

    if (tags && tags.length > 0) {
      // Sort by createTime descending and pick the newest
      const sorted = tags
        .filter((t) => t.name && t.createTime)
        .sort((a, b) => (b.createTime || '').localeCompare(a.createTime || ''));
      if (sorted.length > 0) {
        const latestTag = sorted[0].name || '';
        return `${REPO}:${latestTag}`;
      }
    }
  } catch (error: any) {
    console.warn(`⚠️  Could not query Artifact Registry: ${error.message}`);
  }

  throw new Error(
    'Could not resolve image. Either provide --image or ensure docs/LATEST_IMAGE.txt exists or Artifact Registry is accessible.',
  );
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('apply', {
      type: 'boolean',
      default: false,
      description: 'Actually create/update jobs (default: preview)',
    })
    .option('image', {
      type: 'string',
      description: 'Override image URI',
    })
    .parse();

  const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const REGION = process.env.NCC_REGION || 'us-central1';
  const SA = 'newsletter-local-dev@newsletter-control-center.iam.gserviceaccount.com';

  console.log('---');
  console.log('DEPLOY CLOUD RUN JOBS');
  console.log(`Project: ${PROJECT}`);
  console.log(`Region: ${REGION}`);
  console.log(`Service Account: ${SA}`);
  console.log(`Mode: ${argv.apply ? 'APPLY' : 'PREVIEW'}`);
  console.log('');

  // Resolve image
  const IMAGE = await resolveImage(argv.image);
  console.log(`Image: ${IMAGE}`);
  console.log('');

  // Build commands for each job
  const commands: Array<{ job: JobConfig | IngestJobConfig; createCmd: string; updateCmd: string }> = [];

  // Regular jobs (chunks, embeddings, smoke)
  for (const job of JOBS) {
    // Don't set GOOGLE_APPLICATION_CREDENTIALS - let jobs use ADC (metadata server)
    const envVars = [
      `BQ_PROJECT_ID=${PROJECT}`,
      `BQ_DATASET=ncc_production`,
      `BQ_LOCATION=US`,
    ].join(',');

    const argsStr = job.args.map((a) => `"${a}"`).join(',');

    const createCmd = `gcloud run jobs create ${job.name} \\
  --image=${IMAGE} \\
  --region=${REGION} \\
  --project=${PROJECT} \\
  --service-account=${SA} \\
  --set-env-vars=${envVars} \\
  --command=${job.command} \\
  --args=${argsStr}`;

    const updateCmd = `gcloud run jobs update ${job.name} \\
  --image=${IMAGE} \\
  --region=${REGION} \\
  --project=${PROJECT} \\
  --service-account=${SA} \\
  --set-env-vars=${envVars} \\
  --command=${job.command} \\
  --args=${argsStr}`;

    commands.push({ job, createCmd, updateCmd });
  }

  // Ingest jobs (with secrets and Gmail env vars)
  for (const job of INGEST_JOBS) {
    // Note: GMAIL_QUERY contains spaces - quote the value in the env var string
    const envVars = [
      `BQ_PROJECT_ID=${PROJECT}`,
      `BQ_DATASET=ncc_production`,
      `BQ_LOCATION=US`,
      `GMAIL_READONLY=false`,
      `GMAIL_PROCESSED_LABEL=Ingested`,
      `GMAIL_PAID_LABEL=Paid\\ $`,
      `GMAIL_MARK_READ=true`,
      `GMAIL_QUERY=is:unread\\ -label:Ingested`,
    ].join(',');

    const secretsStr = job.secrets?.join(',') || '';
    const setSecrets = secretsStr ? `--set-secrets=${secretsStr}` : '';

    const argsStr = job.args.map((a) => `"${a}"`).join(',');

    const createCmd = `gcloud run jobs create ${job.name} \\
  --image=${IMAGE} \\
  --region=${REGION} \\
  --project=${PROJECT} \\
  --service-account=${SA} \\
  --set-env-vars=${envVars} \\
  ${setSecrets} \\
  --command=${job.command} \\
  --args=${argsStr}`;

    const updateCmd = `gcloud run jobs update ${job.name} \\
  --image=${IMAGE} \\
  --region=${REGION} \\
  --project=${PROJECT} \\
  --service-account=${SA} \\
  --set-env-vars=${envVars} \\
  ${setSecrets} \\
  --command=${job.command} \\
  --args=${argsStr}`;

    commands.push({ job, createCmd, updateCmd });
  }

  if (!argv.apply) {
    // Preview mode
    console.log('PREVIEW: Would execute the following:');
    console.log('');
    for (const { job, createCmd, updateCmd } of commands) {
      console.log(`Job: ${job.name}`);
      console.log(`  1. Try: ${createCmd.split('\\')[0]}...`);
      console.log(`  2. If exists, run: ${updateCmd.split('\\')[0]}...`);
      console.log('');
    }
    console.log('Run with --apply to execute these commands.');
    console.log('---');
    return;
  }

  // Apply mode
  console.log('APPLY MODE: Creating/updating jobs...');
  console.log('');

  // Check if we need to switch to human user for deployment
  let currentAccount = '';
  try {
    currentAccount = execSync('gcloud config get-value account', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    currentAccount = '';
  }

  const needsHumanAuth = currentAccount.endsWith('.iam.gserviceaccount.com');

  if (needsHumanAuth) {
    console.log('Authenticated as service account. Deployment requires human user.');
    console.log('Switching to human user...');
    spawnSync('gcloud', ['auth', 'login', '--update-adc', '--quiet'], { stdio: 'inherit' });
    execSync(`gcloud config set project ${PROJECT}`, { stdio: 'ignore' });
    console.log('✅ Switched to human user');
    console.log('');
  }

  for (const { job, createCmd, updateCmd } of commands) {
    console.log(`Processing job: ${job.name}...`);

    try {
      // Build command properly
      const isIngestJob = 'inbox' in job;
      const ingestJob = isIngestJob ? job as IngestJobConfig : null;

      let envVars: string;
      if (isIngestJob && ingestJob) {
        envVars = [
          `BQ_PROJECT_ID=${PROJECT}`,
          `BQ_DATASET=ncc_production`,
          `BQ_LOCATION=US`,
          `GMAIL_READONLY=false`,
          `GMAIL_PROCESSED_LABEL=Ingested`,
          `GMAIL_PAID_LABEL=Paid\\ $`,
          `GMAIL_MARK_READ=true`,
          `GMAIL_QUERY=is:unread\\ -label:Ingested`,
        ].join(',');
      } else {
        envVars = `BQ_PROJECT_ID=${PROJECT},BQ_DATASET=ncc_production,BQ_LOCATION=US`;
      }

      const createArgs = [
        'run', 'jobs', 'create', job.name,
        `--image=${IMAGE}`,
        `--region=${REGION}`,
        `--project=${PROJECT}`,
        `--service-account=${SA}`,
        `--set-env-vars=${envVars}`,
        `--command=${job.command}`,
        `--args=${job.args.join(',')}`,
      ];

      // Add secrets for ingest jobs
      if (isIngestJob && ingestJob?.secrets) {
        createArgs.push(`--set-secrets=${ingestJob.secrets.join(',')}`);
      }
      
      execSync(`gcloud ${createArgs.join(' ')}`, { stdio: 'pipe' });
      console.log(`✅ Created job: ${job.name}`);
    } catch (error: any) {
      const errorMsg = (error.stderr?.toString() || error.stdout?.toString() || error.message || String(error)).toLowerCase();
      if (errorMsg.includes('already exists') || errorMsg.includes('409')) {
        // Job exists, update it
        console.log(`   Job exists, updating...`);
        try {
          const isIngestJob = 'inbox' in job;
          const ingestJob = isIngestJob ? job as IngestJobConfig : null;

          let envVars: string;
          if (isIngestJob && ingestJob) {
            envVars = [
              `BQ_PROJECT_ID=${PROJECT}`,
              `BQ_DATASET=ncc_production`,
              `BQ_LOCATION=US`,
              `GMAIL_READONLY=false`,
              `GMAIL_PROCESSED_LABEL=Ingested`,
              `GMAIL_PAID_LABEL=Paid\\ $`,
              `GMAIL_MARK_READ=true`,
              `GMAIL_QUERY=is:unread\\ -label:Ingested`,
            ].join(',');
          } else {
            envVars = `BQ_PROJECT_ID=${PROJECT},BQ_DATASET=ncc_production,BQ_LOCATION=US`;
          }

          const updateArgs = [
            'run', 'jobs', 'update', job.name,
            `--image=${IMAGE}`,
            `--region=${REGION}`,
            `--project=${PROJECT}`,
            `--service-account=${SA}`,
            `--set-env-vars=${envVars}`,
            `--command=${job.command}`,
            `--args=${job.args.join(',')}`,
          ];

          // Add secrets for ingest jobs
          if (isIngestJob && ingestJob?.secrets) {
            updateArgs.push(`--set-secrets=${ingestJob.secrets.join(',')}`);
          }

          execSync(`gcloud ${updateArgs.join(' ')}`, { stdio: 'inherit' });
          console.log(`✅ Updated job: ${job.name}`);
        } catch (updateError: any) {
          console.error(`❌ Failed to update job ${job.name}: ${updateError.message}`);
        }
      } else {
        // Print the error for debugging
        console.error(`❌ Failed to create job ${job.name}`);
        console.error(error.stderr?.toString() || error.message || String(error));
      }
    }
    console.log('');
  }

  // Switch back to service account if we switched
  if (needsHumanAuth) {
    const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'secrets/gcp/ncc-local-dev.json';
    console.log('Switching back to service account...');
    execSync(`gcloud auth activate-service-account ${SA} --key-file "${KEY}" --project ${PROJECT}`, { stdio: 'inherit' });
    console.log('✅ Switched back to service account');
    console.log('');
  }

  console.log('---');
  console.log('✅ Job deployment complete!');
  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;


