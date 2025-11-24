import 'dotenv/config';
import * as fs from 'fs';
import { execSync, spawnSync } from 'child_process';

const APIS = [
  'cloudresourcemanager.googleapis.com',
  'run.googleapis.com',
  'cloudscheduler.googleapis.com',
  'secretmanager.googleapis.com',
  'artifactregistry.googleapis.com',
  'containerregistry.googleapis.com',
  'cloudbuild.googleapis.com',
];

const ROLES = [
  'roles/viewer',
  'roles/run.viewer',
  'roles/cloudscheduler.viewer',
  'roles/secretmanager.viewer',
  'roles/iam.serviceAccountViewer',
  'roles/logging.viewer',
  'roles/cloudbuild.builds.editor',
  'roles/storage.objectCreator',
];

async function main(): Promise<void> {
  const argv = process.argv.includes('--apply');

  // Resolve project
  const PROJECT = process.env.BQ_PROJECT_ID || execSync('gcloud config get-value project', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  if (!PROJECT) {
    throw new Error('No project: set BQ_PROJECT_ID or run `gcloud config set project <id>`');
  }

  // Resolve key file
  const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'secrets/gcp/ncc-local-dev.json';
  if (!fs.existsSync(KEY)) {
    throw new Error(`Key file not found: ${KEY}`);
  }

  // Parse SA from key
  const SA = JSON.parse(fs.readFileSync(KEY, 'utf8')).client_email;
  if (!SA) {
    throw new Error('client_email missing in key');
  }

  // Build commands
  const commands = [
    { step: 1, cmd: 'gcloud auth login --update-adc', description: 'Authenticate as human user' },
    { step: 2, cmd: `gcloud config set project ${PROJECT}`, description: 'Set project' },
    ...APIS.map((api) => ({
      step: 3,
      cmd: `gcloud services enable ${api} --project ${PROJECT}`,
      description: `Enable ${api}`,
    })),
    ...ROLES.map((role) => ({
      step: 4,
      cmd: `gcloud projects add-iam-policy-binding ${PROJECT} --member serviceAccount:${SA} --role ${role}`,
      description: `Grant ${role}`,
    })),
    { step: 5, cmd: `gcloud auth activate-service-account ${SA} --key-file ${KEY} --project ${PROJECT}`, description: 'Switch back to service account' },
    { step: 6, cmd: 'echo "Now run: npm run cloud:discover:apply && npm run cloud:issues"', description: 'Next steps' },
  ];

  if (!argv) {
    // Preview mode: PRINT the exact commands
    console.log('---');
    console.log('CLOUD BOOTSTRAP PLAN (Preview)');
    console.log('');
    console.log(`Project: ${PROJECT}`);
    console.log(`Service Account: ${SA}`);
    console.log('');
    console.log('Commands to run:');
    console.log('');
    for (const cmd of commands) {
      console.log(`${cmd.step}) ${cmd.cmd}`);
    }
    console.log('');
    console.log('To execute, run with --apply');
    console.log('---');
    return;
  }

  // Apply mode: execute commands
  console.log('---');
  console.log('CLOUD BOOTSTRAP (Applying)');
  console.log(`Project: ${PROJECT}`);
  console.log(`Service Account: ${SA}`);
  console.log('');

  for (const cmd of commands) {
    console.log(`Step ${cmd.step}: ${cmd.description}`);
    console.log(`Running: ${cmd.cmd}`);

    try {
      if (cmd.step === 1) {
        // Step 1: auth login must use stdio: 'inherit' (opens browser)
        spawnSync('gcloud', ['auth', 'login', '--update-adc'], { stdio: 'inherit' });
      } else if (cmd.step === 6) {
        // Step 6: echo command
        console.log('Now run: npm run cloud:discover:apply && npm run cloud:issues');
      } else {
        // Steps 2-5: use execSync
        execSync(cmd.cmd, { stdio: 'inherit' });
      }
      console.log(`✅ Step ${cmd.step} completed`);
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      // Steps 3 and 4: continue on "already enabled" / "already has"
      if ((cmd.step === 3 || cmd.step === 4) && (errorMsg.includes('already enabled') || errorMsg.includes('already has') || errorMsg.includes('already exists'))) {
        console.log(`⚠️  Step ${cmd.step} skipped (already applied)`);
      } else {
        console.error(`❌ Step ${cmd.step} failed: ${cmd.cmd}`);
        console.error(`Error: ${errorMsg}`);
        process.exit(1);
      }
    }
    console.log('');
  }

  console.log('---');
  console.log('Bootstrap complete!');
  console.log('Now run: npm run cloud:discover:apply && npm run cloud:issues');
  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

