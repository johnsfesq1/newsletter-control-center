import 'dotenv/config';
import { execSync, spawnSync } from 'child_process';

function shell(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch (error: any) {
    const stderr = error.stderr?.toString() || '';
    throw new Error(`Command failed: ${cmd}\n${stderr}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  // Resolve project
  const PROJECT = process.env.BQ_PROJECT_ID || shell('gcloud config get-value project');
  if (!PROJECT) {
    throw new Error('No project: set BQ_PROJECT_ID or run `gcloud config set project <id>`');
  }

  // Resolve region
  const REGION = process.env.NCC_REGION || 'us-central1';

  // Image configuration
  const REPO = 'ncc';
  const IMAGE = `us-central1-docker.pkg.dev/${PROJECT}/${REPO}/ncc-worker`;
  const TAG = shell('git rev-parse --short HEAD') || 'local';
  const FULL = `${IMAGE}:${TAG}`;

  console.log('---');
  console.log('BUILD IMAGE');
  console.log(`Project: ${PROJECT}`);
  console.log(`Region: ${REGION}`);
  console.log(`Repository: ${REPO}`);
  console.log(`Image: ${FULL}`);
  console.log('');

  // Ensure Artifact Registry repo exists
  console.log(`Ensuring Artifact Registry repository exists: ${REPO}...`);
  try {
    execSync(`gcloud artifacts repositories describe ${REPO} --location=${REGION} --project=${PROJECT}`, {
      stdio: 'ignore',
    });
    console.log(`✅ Repository ${REPO} already exists`);
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    if (errorMsg.includes('404') || errorMsg.includes('not found')) {
      console.log(`Creating repository ${REPO}...`);
      execSync(
        `gcloud artifacts repositories create ${REPO} --repository-format=docker --location=${REGION} --project=${PROJECT}`,
        { stdio: 'inherit' },
      );
      console.log(`✅ Repository ${REPO} created`);
    } else {
      throw error;
    }
  }
  console.log('');

  // Submit build asynchronously
  console.log(`Submitting build: ${FULL}...`);
  try {
    execSync(`gcloud builds submit --tag ${FULL} --async --timeout=1200s .`, { stdio: 'inherit' });
  } catch (error: any) {
    const stderr = error.stderr?.toString() || '';
    throw new Error(`Build submission failed: ${stderr}`);
  }
  console.log('✅ Build submitted');
  console.log('');

  // Poll for build ID
  console.log('Polling for build ID...');
  let BUILD_ID = '';
  const maxRetries = 20;
  const pollInterval = 3000; // 3 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      BUILD_ID = shell(
        `gcloud builds list --filter="images:${FULL}" --sort-by="~createTime" --limit=1 --format="value(ID)" --project=${PROJECT}`,
      );
      if (BUILD_ID) {
        break;
      }
    } catch (error: any) {
      // Continue polling
    }

    if (attempt < maxRetries) {
      console.log(`  Attempt ${attempt}/${maxRetries}: waiting for build ID...`);
      await sleep(pollInterval);
    }
  }

  if (!BUILD_ID) {
    throw new Error(`Failed to get build ID after ${maxRetries} attempts`);
  }

  console.log(`✅ Build ID: ${BUILD_ID}`);
  console.log('');

  // Stream logs
  console.log('Streaming build logs...');
  console.log('---');
  const logResult = spawnSync(
    'gcloud',
    ['builds', 'log', '--stream', '--project', PROJECT, BUILD_ID],
    { stdio: 'inherit' },
  );
  console.log('---');
  console.log('');

  // Verify status
  console.log('Verifying build status...');
  const status = shell(`gcloud builds describe --project ${PROJECT} ${BUILD_ID} --format="value(status)"`);

  if (status !== 'SUCCESS') {
    console.error(`❌ Build failed with status: ${status}`);
    process.exit(1);
  }

  console.log(`✅ Build status: ${status}`);
  console.log('');

  // Print digest
  console.log('Fetching image digest...');
  const digest = shell(
    `gcloud builds describe --project ${PROJECT} ${BUILD_ID} --format="value(results.images[0].digest)"`,
  );

  console.log('');
  console.log('---');
  console.log(`✅ Build complete!`);
  console.log(`Image URI: ${FULL}`);
  if (digest) {
    console.log(`Digest: ${digest}`);
  }
  console.log('---');

  // Write image URI to docs/LATEST_IMAGE.txt for deployment scripts
  const fs = require('fs');
  const path = require('path');
  const docsDir = path.resolve(__dirname, '../../docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  const imagePath = path.join(docsDir, 'LATEST_IMAGE.txt');
  fs.writeFileSync(imagePath, `${FULL}\n`);
  console.log(`Written image URI to: ${imagePath}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;
