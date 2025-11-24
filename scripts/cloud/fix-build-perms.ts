import 'dotenv/config';
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
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

interface IAMBinding {
  role?: string;
  members?: string[];
}

interface IAMPolicy {
  bindings?: IAMBinding[];
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('apply', {
      type: 'boolean',
      default: false,
      description: 'Actually apply the changes (default: dry-run)',
    })
    .parse();

  // Resolve project ID
  let PROJECT_ID = process.env.BQ_PROJECT_ID;
  if (!PROJECT_ID) {
    PROJECT_ID = shell('gcloud config get-value project');
  }
  if (!PROJECT_ID) {
    throw new Error('No project: set BQ_PROJECT_ID or run `gcloud config set project <id>`');
  }

  // Resolve project number
  const PROJECT_NUMBER = shell(`gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)'`);
  if (!PROJECT_NUMBER) {
    throw new Error('Failed to get project number');
  }

  // Resolve caller SA from credentials
  const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'secrets/gcp/ncc-local-dev.json';
  if (!fs.existsSync(KEY)) {
    throw new Error(`Key file not found: ${KEY}`);
  }

  const keyContent = JSON.parse(fs.readFileSync(KEY, 'utf8'));
  const CALLER_SA = keyContent.client_email;
  if (!CALLER_SA) {
    throw new Error('client_email missing in key file');
  }

  // Compute target SA
  const TARGET_SA = `${PROJECT_NUMBER}-compute@developer.gserviceaccount.com`;

  console.log('---');
  console.log('FIX BUILD PERMISSIONS');
  console.log(`Mode: ${argv.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Project ID: ${PROJECT_ID}`);
  console.log(`Project Number: ${PROJECT_NUMBER}`);
  console.log(`Caller SA: ${CALLER_SA}`);
  console.log(`Target SA: ${TARGET_SA}`);
  console.log('');

  // Validate all values
  if (!PROJECT_ID || !PROJECT_NUMBER || !CALLER_SA || !TARGET_SA) {
    throw new Error('Missing required values');
  }

  // Check current IAM policy on target SA
  console.log(`Checking IAM policy on ${TARGET_SA}...`);
  const policy = shellJSON<IAMPolicy>(`gcloud iam service-accounts get-iam-policy ${TARGET_SA} --format=json`);

  let hasPermission = false;
  if (policy?.bindings) {
    for (const binding of policy.bindings) {
      if (binding.role === 'roles/iam.serviceAccountUser' && binding.members) {
        const member = `serviceAccount:${CALLER_SA}`;
        if (binding.members.includes(member)) {
          hasPermission = true;
          break;
        }
      }
    }
  }

  if (hasPermission) {
    console.log('✅ Permission already present');
    console.log('---');
    return;
  }

  console.log('❌ Permission missing');
  console.log('');

  if (!argv.apply) {
    // Dry-run mode: print what would be done
    console.log('DRY-RUN: Would execute the following:');
    console.log('');
    console.log('1. Check current gcloud account');
    console.log('2. If authenticated as service account, switch to human user:');
    console.log('   gcloud auth login --update-adc');
    console.log(`   gcloud config set project ${PROJECT_ID}`);
    console.log('');
    console.log('3. Grant permission:');
    console.log(`   gcloud iam service-accounts add-iam-policy-binding ${TARGET_SA} \\`);
    console.log(`     --member=serviceAccount:${CALLER_SA} \\`);
    console.log(`     --role=roles/iam.serviceAccountUser \\`);
    console.log(`     --project=${PROJECT_ID}`);
    console.log('');
    console.log('4. Switch back to service account:');
    console.log(`   gcloud auth activate-service-account ${CALLER_SA} --key-file "${KEY}" --project ${PROJECT_ID}`);
    console.log('');
    console.log('5. Verify permission was granted');
    console.log('');
    console.log('Run with --apply to execute these steps.');
    console.log('---');
    return;
  }

  // Apply mode: execute the fix
  console.log('APPLY MODE: Executing fix...');
  console.log('');

  // Step 1: Check current account
  let currentAccount = '';
  try {
    currentAccount = shell('gcloud config get-value account');
  } catch {
    currentAccount = '';
  }

  console.log(`Current gcloud account: ${currentAccount || '(unknown)'}`);

  // Step 2: Switch to human user if needed
  if (currentAccount.endsWith('.iam.gserviceaccount.com')) {
    console.log('Authenticated as service account, switching to human user...');
    console.log('(A browser window will open for OAuth login)');
    const loginResult = spawnSync('gcloud', ['auth', 'login', '--update-adc', '--quiet'], {
      stdio: 'inherit',
    });
    if (loginResult.status !== 0) {
      console.error('');
      console.error('❌ OAuth login failed or was canceled.');
      console.error('Please complete the login in your browser, then run this script again with --apply.');
      process.exit(1);
    }
    shell(`gcloud config set project ${PROJECT_ID}`);
    
    // Verify we switched
    const newAccount = shell('gcloud config get-value account');
    if (!newAccount || newAccount.endsWith('.iam.gserviceaccount.com')) {
      console.error('❌ Still authenticated as service account after login.');
      console.error('Please ensure you completed the browser login, then run this script again.');
      process.exit(1);
    }
    console.log(`✅ Switched to human user: ${newAccount}`);
  } else {
    console.log('✅ Already authenticated as human user');
    // Ensure project is set
    shell(`gcloud config set project ${PROJECT_ID}`);
  }
  console.log('');

  // Step 3: Grant permission
  console.log('Granting permission...');
  try {
    shell(
      `gcloud iam service-accounts add-iam-policy-binding ${TARGET_SA} --member=serviceAccount:${CALLER_SA} --role=roles/iam.serviceAccountUser --project=${PROJECT_ID}`,
    );
    console.log('✅ Permission granted');
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    if (errorMsg.includes('already has') || errorMsg.includes('already exists')) {
      console.log('✅ Permission already present (from previous run)');
    } else {
      throw error;
    }
  }
  console.log('');

  // Step 4: Switch back to service account
  console.log('Switching back to service account...');
  shell(`gcloud auth activate-service-account ${CALLER_SA} --key-file "${KEY}" --project ${PROJECT_ID}`);
  console.log('✅ Switched back to service account');
  console.log('');

  // Step 5: Verify
  console.log('Verifying permission...');
  const verifyPolicy = shellJSON<IAMPolicy>(`gcloud iam service-accounts get-iam-policy ${TARGET_SA} --format=json`);

  let verified = false;
  if (verifyPolicy?.bindings) {
    for (const binding of verifyPolicy.bindings) {
      if (binding.role === 'roles/iam.serviceAccountUser' && binding.members) {
        const member = `serviceAccount:${CALLER_SA}`;
        if (binding.members.includes(member)) {
          verified = true;
          break;
        }
      }
    }
  }

  if (verified) {
    console.log('✅ SA User granted and verified. OK to retry build.');
  } else {
    console.error('❌ Permission still missing after grant - this should not happen');
    process.exit(1);
  }

  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;
