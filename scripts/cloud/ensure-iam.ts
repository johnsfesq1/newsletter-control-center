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
      description: 'Actually apply IAM bindings (default: preview)',
    })
    .parse();

  const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const REGION = process.env.NCC_REGION || 'us-central1';
  const SA = 'newsletter-local-dev@newsletter-control-center.iam.gserviceaccount.com';
  const SERVICE_NAME = 'ncc-jobs-runner';

  console.log('---');
  console.log('ENSURE IAM PERMISSIONS');
  console.log(`Project: ${PROJECT}`);
  console.log(`Region: ${REGION}`);
  console.log(`Service Account: ${SA}`);
  console.log(`Runner Service: ${SERVICE_NAME}`);
  console.log(`Mode: ${argv.apply ? 'APPLY' : 'PREVIEW'}`);
  console.log('');

  // Check 1: Project-level role for running Cloud Run Jobs
  console.log('1. Checking project-level IAM for Cloud Run Jobs execution...');
  let projectPolicy: IAMPolicy | null = null;
  try {
    projectPolicy = shellJSON<IAMPolicy>(`gcloud projects get-iam-policy ${PROJECT} --format=json`);
  } catch (error: any) {
    console.error(`   ❌ Failed to get project IAM policy: ${error.message}`);
    process.exit(1);
  }

  let hasRunDeveloper = false;
  if (projectPolicy?.bindings) {
    for (const binding of projectPolicy.bindings) {
      if (binding.role === 'roles/run.developer' && binding.members) {
        const member = `serviceAccount:${SA}`;
        if (binding.members.includes(member)) {
          hasRunDeveloper = true;
          break;
        }
      }
    }
  }

  const projectCmd = `gcloud projects add-iam-policy-binding ${PROJECT} \\
  --member=serviceAccount:${SA} \\
  --role=roles/run.developer`;

  if (hasRunDeveloper) {
    console.log(`   ✅ PASS: Service account has roles/run.developer at project level`);
  } else {
    console.log(`   ❌ FAIL: Service account missing roles/run.developer at project level`);
    if (!argv.apply) {
      console.log(`   Would run: ${projectCmd.split('\\')[0]}...`);
    }
  }
  console.log('');

  // Check 2: Service-level invoker role for Scheduler
  console.log('2. Checking service-level IAM for runner service invocation...');

  let servicePolicy: IAMPolicy | null = null;
  try {
    servicePolicy = shellJSON<IAMPolicy>(
      `gcloud run services get-iam-policy ${SERVICE_NAME} --region=${REGION} --project=${PROJECT} --format=json`,
    );
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    if (errorMsg.includes('not found') || errorMsg.includes('404')) {
      console.log(`   ⚠️  Service ${SERVICE_NAME} does not exist yet. Deploy it first with: npm run cloud:runner:apply`);
      console.log(`   Will skip this check until service exists.`);
    } else {
      console.error(`   ❌ Failed to get service IAM policy: ${errorMsg}`);
    }
    servicePolicy = null;
  }

  let hasRunInvoker = false;
  if (servicePolicy?.bindings) {
    for (const binding of servicePolicy.bindings) {
      if (binding.role === 'roles/run.invoker' && binding.members) {
        const member = `serviceAccount:${SA}`;
        if (binding.members.includes(member)) {
          hasRunInvoker = true;
          break;
        }
      }
    }
  }

  const serviceCmd = `gcloud run services add-iam-policy-binding ${SERVICE_NAME} \\
  --region=${REGION} \\
  --project=${PROJECT} \\
  --member=serviceAccount:${SA} \\
  --role=roles/run.invoker`;

  if (servicePolicy === null) {
    // Service doesn't exist, skip
    console.log(`   ⚠️  SKIP: Service does not exist yet`);
  } else if (hasRunInvoker) {
    console.log(`   ✅ PASS: Service account has roles/run.invoker on ${SERVICE_NAME}`);
  } else {
    console.log(`   ❌ FAIL: Service account missing roles/run.invoker on ${SERVICE_NAME}`);
    if (!argv.apply) {
      console.log(`   Would run: ${serviceCmd.split('\\')[0]}...`);
    }
  }
  console.log('');

  // Summary and apply
  const needsFix = !hasRunDeveloper || (servicePolicy !== null && !hasRunInvoker);

  if (!needsFix) {
    console.log('---');
    console.log('✅ All IAM permissions are correct!');
    console.log('---');
    return;
  }

  if (!argv.apply) {
    console.log('---');
    console.log('PREVIEW: The following commands would be executed:');
    console.log('');
    if (!hasRunDeveloper) {
      console.log(projectCmd);
      console.log('');
    }
    if (servicePolicy !== null && !hasRunInvoker) {
      console.log(serviceCmd);
      console.log('');
    }
    console.log('Run with --apply to execute these commands.');
    console.log('---');
    return;
  }

  // Apply mode
  console.log('---');
  console.log('APPLY MODE: Fixing IAM permissions...');
  console.log('');

  // Check if we need to switch to human user for IAM modifications
  let currentAccount = '';
  try {
    currentAccount = shell('gcloud config get-value account');
  } catch {
    currentAccount = '';
  }

  const needsHumanAuth = currentAccount.endsWith('.iam.gserviceaccount.com') && (!hasRunDeveloper || (servicePolicy !== null && !hasRunInvoker));

  if (needsHumanAuth) {
    console.log('Authenticated as service account. IAM modifications require human user.');
    console.log('Switching to human user...');
    spawnSync('gcloud', ['auth', 'login', '--update-adc', '--quiet'], { stdio: 'inherit' });
    shell(`gcloud config set project ${PROJECT}`);
    console.log('✅ Switched to human user');
    console.log('');
  }

  if (!hasRunDeveloper) {
    console.log('Granting roles/run.developer at project level...');
    try {
      execSync(`gcloud projects add-iam-policy-binding ${PROJECT} --member=serviceAccount:${SA} --role=roles/run.developer`, { stdio: 'inherit' });
      console.log('✅ Granted roles/run.developer');
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      if (errorMsg.includes('already has') || errorMsg.includes('already exists')) {
        console.log('✅ Permission already present');
      } else {
        console.error(`❌ Failed: ${errorMsg}`);
        process.exit(1);
      }
    }
    console.log('');
  }

  if (servicePolicy !== null && !hasRunInvoker) {
    console.log(`Granting roles/run.invoker on ${SERVICE_NAME}...`);
    try {
      execSync(`gcloud run services add-iam-policy-binding ${SERVICE_NAME} --region=${REGION} --project=${PROJECT} --member=serviceAccount:${SA} --role=roles/run.invoker`, { stdio: 'inherit' });
      console.log('✅ Granted roles/run.invoker');
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      if (errorMsg.includes('already has') || errorMsg.includes('already exists')) {
        console.log('✅ Permission already present');
      } else {
        console.error(`❌ Failed: ${errorMsg}`);
        process.exit(1);
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
  console.log('✅ IAM permissions check complete!');
  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

