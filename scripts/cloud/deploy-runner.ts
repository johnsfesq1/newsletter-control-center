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

async function resolveImage(override?: string): Promise<string> {
  if (override) {
    return override;
  }

  // Try reading from docs/LATEST_IMAGE.txt
  const fs = require('fs');
  const path = require('path');
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
    const tags = JSON.parse(
      shell(`gcloud artifacts docker tags list ${REPO} --format=json --project=${PROJECT}`),
    );

    if (tags && tags.length > 0) {
      const sorted = tags
        .filter((t: any) => t.name && t.createTime)
        .sort((a: any, b: any) => (b.createTime || '').localeCompare(a.createTime || ''));
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
      description: 'Actually deploy the service (default: preview)',
    })
    .option('image', {
      type: 'string',
      description: 'Override image URI',
    })
    .parse();

  const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const REGION = process.env.NCC_REGION || 'us-central1';
  const SA = 'newsletter-local-dev@newsletter-control-center.iam.gserviceaccount.com';
  const SERVICE_NAME = 'ncc-jobs-runner';
  const HEALTH_PUBLIC = process.env.RUNNER_HEALTH_PUBLIC === 'true';

  console.log('---');
  console.log('DEPLOY JOBS RUNNER SERVICE');
  console.log(`Project: ${PROJECT}`);
  console.log(`Region: ${REGION}`);
  console.log(`Service Account: ${SA}`);
  console.log(`Service Name: ${SERVICE_NAME}`);
  console.log(`Mode: ${argv.apply ? 'APPLY' : 'PREVIEW'}`);
  if (HEALTH_PUBLIC) {
    console.log(`⚠️  WARNING: RUNNER_HEALTH_PUBLIC=true`);
    console.log(`   Service will be publicly invokable at IAM level (--allow-unauthenticated)`);
    console.log(`   App-level guards protect /run and other endpoints (only GET /health-check is unauthenticated)`);
  }
  console.log('');

  // Resolve image
  const IMAGE = await resolveImage(argv.image);
  console.log(`Image: ${IMAGE}`);
  console.log('');

  const authFlag = HEALTH_PUBLIC ? '--allow-unauthenticated' : '--no-allow-unauthenticated';
  const deployCmd = `gcloud run deploy ${SERVICE_NAME} \\
  --image=${IMAGE} \\
  --region=${REGION} \\
  --project=${PROJECT} \\
  ${authFlag} \\
  --service-account=${SA} \\
  --port=8080 \\
  --set-env-vars=BQ_PROJECT_ID=${PROJECT},NCC_REGION=${REGION} \\
  --command=node \\
  --args=dist/src/api/jobs-runner.js`;

  if (!argv.apply) {
    // Preview mode
    console.log('PREVIEW: Would execute the following:');
    console.log('');
    console.log(deployCmd);
    console.log('');
    console.log('Run with --apply to execute this command.');
    console.log('---');
    return;
  }

  // Apply mode
  console.log('APPLY MODE: Deploying service...');
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
    const { spawnSync } = require('child_process');
    spawnSync('gcloud', ['auth', 'login', '--update-adc', '--quiet'], { stdio: 'inherit' });
    shell(`gcloud config set project ${PROJECT}`);
    console.log('✅ Switched to human user');
    console.log('');
  }

  try {
    // Build command array properly
    const cmdArgs = [
      'run', 'deploy', SERVICE_NAME,
      `--image=${IMAGE}`,
      `--region=${REGION}`,
      `--project=${PROJECT}`,
      ...(HEALTH_PUBLIC ? ['--allow-unauthenticated'] : ['--no-allow-unauthenticated']),
      `--service-account=${SA}`,
      '--port=8080',
      `--set-env-vars=BQ_PROJECT_ID=${PROJECT},NCC_REGION=${REGION},BQ_DATASET=ncc_production,BQ_LOCATION=US`,
      '--command=node',
      `--args=dist/src/api/jobs-runner.js`,
    ];
    
    execSync(`gcloud ${cmdArgs.join(' ')}`, { stdio: 'inherit' });
    console.log('');
    console.log('✅ Service deployed successfully!');
    console.log('');

    // Get the service URL
    const url = shell(
      `gcloud run services describe ${SERVICE_NAME} --region=${REGION} --project=${PROJECT} --format="value(status.url)"`,
    );
    console.log(`Service URL: ${url}`);
    console.log('---');

    // Switch back to service account if we switched
    if (needsHumanAuth) {
      const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'secrets/gcp/ncc-local-dev.json';
      console.log('Switching back to service account...');
      execSync(`gcloud auth activate-service-account ${SA} --key-file "${KEY}" --project ${PROJECT}`, { stdio: 'inherit' });
      console.log('✅ Switched back to service account');
    }
  } catch (error: any) {
    console.error('❌ Deployment failed:', error.message);
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

