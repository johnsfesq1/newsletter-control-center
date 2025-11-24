import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs';

interface ServiceAccount {
  email?: string;
  uniqueId?: string;
  name?: string;
}

interface IAMBinding {
  role?: string;
  members?: string[];
}

interface IAMPolicy {
  bindings?: IAMBinding[];
}

function shell(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    return '';
  }
}

function shellOrFail(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch (error: any) {
    const stderr = error.stderr?.toString() || '';
    throw new Error(`Command failed: ${cmd}\n${stderr}`);
  }
}

function shellJSON<T>(cmd: string): T | null {
  try {
    const output = shellOrFail(cmd);
    return output ? JSON.parse(output) : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  // Resolve project ID
  let PROJECT_ID = process.env.BQ_PROJECT_ID;
  if (!PROJECT_ID) {
    PROJECT_ID = shell('gcloud config get-value project');
  }
  if (!PROJECT_ID) {
    throw new Error('No project: set BQ_PROJECT_ID or run `gcloud config set project <id>`');
  }

  // Resolve project number
  let PROJECT_NUMBER = '';
  try {
    const projectInfo = shellJSON<{ projectNumber?: string }>(
      `gcloud projects describe ${PROJECT_ID} --format=json`,
    );
    PROJECT_NUMBER = projectInfo?.projectNumber || '';
  } catch (error: any) {
    console.error(`⚠️  Failed to get project number: ${error.message}`);
  }

  // Resolve caller SA from credentials
  let CALLER_SA = '';
  const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'secrets/gcp/ncc-local-dev.json';
  if (fs.existsSync(KEY)) {
    try {
      const keyContent = JSON.parse(fs.readFileSync(KEY, 'utf8'));
      CALLER_SA = keyContent.client_email || '';
    } catch (error: any) {
      console.error(`⚠️  Failed to read service account from ${KEY}: ${error.message}`);
    }
  }

  // Compute expected SA emails
  const CLOUDBUILD_SA = PROJECT_NUMBER ? `${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com` : '';
  const COMPUTE_DEFAULT_SA = PROJECT_NUMBER ? `${PROJECT_NUMBER}-compute@developer.gserviceaccount.com` : '';

  console.log('---');
  console.log('CLOUD BUILD PERMISSIONS DIAGNOSIS');
  console.log(`Project ID: ${PROJECT_ID}`);
  console.log(`Project Number: ${PROJECT_NUMBER || '(unknown)'}`);
  console.log(`Caller SA: ${CALLER_SA || '(unknown)'}`);
  console.log(`Cloud Build SA: ${CLOUDBUILD_SA || '(unknown)'}`);
  console.log(`Compute Default SA: ${COMPUTE_DEFAULT_SA || '(unknown)'}`);
  console.log('');

  // List all service accounts to map uniqueId → email
  console.log('1. SERVICE ACCOUNTS:');
  let allSAs: ServiceAccount[] = [];
  try {
    const output = shellOrFail(`gcloud iam service-accounts list --project=${PROJECT_ID} --format=json`);
    allSAs = output ? JSON.parse(output) : [];
    console.log(`   Found ${allSAs.length} service accounts:`);
    for (const sa of allSAs) {
      console.log(`   - ${sa.email || '(no email)'} (uniqueId: ${sa.uniqueId || 'unknown'})`);
    }
  } catch (error: any) {
    console.error(`   ❌ Failed to list service accounts: ${error.message}`);
  }
  console.log('');

  // Resolve the target SA with uniqueId 117326338887774071653
  const TARGET_UNIQUE_ID = '117326338887774071653';
  const targetSA = allSAs.find((sa) => sa.uniqueId === TARGET_UNIQUE_ID);
  const TARGET_SA_EMAIL = targetSA?.email || '';

  console.log('2. ACT-AS TARGET:');
  if (TARGET_SA_EMAIL) {
    console.log(`   ✅ Resolved uniqueId ${TARGET_UNIQUE_ID} → ${TARGET_SA_EMAIL}`);
  } else {
    console.log(`   ❌ Could not resolve uniqueId ${TARGET_UNIQUE_ID} to any service account`);
  }
  console.log('');

  // Get project IAM policy
  console.log('3. PROJECT IAM POLICY (relevant bindings):');
  let projectPolicy: IAMPolicy | null = null;
  try {
    projectPolicy = shellJSON<IAMPolicy>(`gcloud projects get-iam-policy ${PROJECT_ID} --format=json`);
  } catch (error: any) {
    console.error(`   ❌ Failed to get IAM policy: ${error.message}`);
  }

  const relevantSAs = [CALLER_SA, CLOUDBUILD_SA, COMPUTE_DEFAULT_SA, TARGET_SA_EMAIL].filter(Boolean);
  const callerRoles: string[] = [];
  const cloudbuildRoles: string[] = [];
  const targetRoles: string[] = [];

  if (projectPolicy?.bindings) {
    for (const binding of projectPolicy.bindings) {
      if (!binding.role || !binding.members) continue;
      for (const member of binding.members) {
        if (member.includes(CALLER_SA)) {
          callerRoles.push(binding.role);
        }
        if (member.includes(CLOUDBUILD_SA)) {
          cloudbuildRoles.push(binding.role);
        }
        if (member.includes(TARGET_SA_EMAIL)) {
          targetRoles.push(binding.role);
        }
      }
    }
  }

  console.log(`   Caller SA (${CALLER_SA}):`);
  if (callerRoles.length > 0) {
    callerRoles.forEach((role) => console.log(`     - ${role}`));
  } else {
    console.log('     (no bindings found)');
  }

  console.log(`   Cloud Build SA (${CLOUDBUILD_SA}):`);
  if (cloudbuildRoles.length > 0) {
    cloudbuildRoles.forEach((role) => console.log(`     - ${role}`));
  } else {
    console.log('     (no bindings found)');
  }

  if (TARGET_SA_EMAIL) {
    console.log(`   Target SA (${TARGET_SA_EMAIL}):`);
    if (targetRoles.length > 0) {
      targetRoles.forEach((role) => console.log(`     - ${role}`));
    } else {
      console.log('     (no bindings found)');
    }
  }
  console.log('');

  // Check if CALLER_SA has serviceAccountUser on TARGET_SA
  console.log('4. SERVICE ACCOUNT USER PERMISSION:');
  let hasServiceAccountUser = false;
  if (TARGET_SA_EMAIL && CALLER_SA) {
    try {
      const testPolicy = shellJSON<IAMPolicy>(
        `gcloud iam service-accounts get-iam-policy ${TARGET_SA_EMAIL} --format=json`,
      );
      if (testPolicy?.bindings) {
        for (const binding of testPolicy.bindings) {
          if (binding.role === 'roles/iam.serviceAccountUser' && binding.members) {
            if (binding.members.includes(`serviceAccount:${CALLER_SA}`)) {
              hasServiceAccountUser = true;
              break;
            }
          }
        }
      }
    } catch (error: any) {
      console.error(`   ⚠️  Failed to check SA IAM policy: ${error.message}`);
    }
  }
  const targetLabel = TARGET_SA_EMAIL || 'target';
  const serviceAccountUserStatus = hasServiceAccountUser ? '✅ Yes' : '❌ No';
  console.log(`   Does ${CALLER_SA} have roles/iam.serviceAccountUser on ${targetLabel}: ${serviceAccountUserStatus}`);
  console.log('');

  // Check storage.objectCreator permission
  console.log('5. STORAGE PERMISSIONS:');
  const hasStorageObjectCreator = callerRoles.some((r) => r.includes('storage.objectCreator'));
  const storageStatus = hasStorageObjectCreator ? '✅ Yes' : '❌ No';
  console.log(`   Does ${CALLER_SA} have roles/storage.objectCreator (project level): ${storageStatus}`);

  // Check Cloud Build staging bucket
  const stagingBucket = `gs://${PROJECT_ID}_cloudbuild`;
  try {
    shellOrFail(`gsutil ls -L ${stagingBucket}`);
    console.log(`   ✅ Staging bucket exists: ${stagingBucket}`);
    try {
      const bucketIAM = shellJSON<IAMPolicy>(`gsutil iam get ${stagingBucket}`);
      console.log(`   Bucket IAM bindings: ${bucketIAM?.bindings?.length || 0} bindings`);
    } catch (error: any) {
      console.error(`   ⚠️  Cannot read bucket IAM: ${error.message}`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Staging bucket may not exist or is inaccessible: ${stagingBucket}`);
  }
  console.log('');

  // Check enabled APIs
  console.log('6. ENABLED APIs:');
  const requiredAPIs = [
    'cloudbuild.googleapis.com',
    'artifactregistry.googleapis.com',
    'run.googleapis.com',
    'cloudscheduler.googleapis.com',
    'secretmanager.googleapis.com',
    'cloudresourcemanager.googleapis.com',
  ];
  let enabledAPIs: string[] = [];
  try {
    const services = shellJSON<Array<{ name?: string; state?: string }>>(
      `gcloud services list --project=${PROJECT_ID} --format=json`,
    );
    enabledAPIs = (services || []).filter((s) => s.state === 'ENABLED').map((s) => s.name || '');
  } catch (error: any) {
    console.error(`   ⚠️  Failed to list services: ${error.message}`);
  }

  const missingAPIs = requiredAPIs.filter((api) => !enabledAPIs.includes(api));
  for (const api of requiredAPIs) {
    const enabled = enabledAPIs.includes(api);
    console.log(`   ${enabled ? '✅' : '❌'} ${api}`);
  }
  if (missingAPIs.length > 0) {
    console.log(`   Missing APIs: ${missingAPIs.join(', ')}`);
  }
  console.log('');

  // Check Artifact Registry repo IAM
  console.log('7. ARTIFACT REGISTRY PERMISSIONS:');
  const repoPath = `projects/${PROJECT_ID}/locations/us-central1/repositories/ncc`;
  try {
    const repoIAM = shellJSON<IAMPolicy>(
      `gcloud artifacts repositories get-iam-policy ncc --location=us-central1 --project=${PROJECT_ID} --format=json`,
    );
    if (repoIAM?.bindings) {
      console.log(`   Repository IAM bindings: ${repoIAM.bindings.length} bindings`);
      for (const binding of repoIAM.bindings) {
        if (binding.members && binding.members.some((m) => m.includes(CLOUDBUILD_SA))) {
          console.log(`     Cloud Build SA has: ${binding.role}`);
        }
      }
    }
  } catch (error: any) {
    console.error(`   ⚠️  Failed to check Artifact Registry IAM: ${error.message}`);
  }
  console.log('');

  // Summary
  console.log('---');
  console.log('SUMMARY:');
  console.log(`ACT-AS target: ${TARGET_SA_EMAIL || `unknown (uniqueId: ${TARGET_UNIQUE_ID})`}`);
  console.log(
    `ServiceAccountUser on target: ${hasServiceAccountUser ? '✅ Yes' : '❌ No'} ${TARGET_SA_EMAIL ? `(on ${TARGET_SA_EMAIL})` : ''}`,
  );
  console.log(`Storage.objectCreator: ${hasStorageObjectCreator ? '✅ Yes' : '❌ No'} (project level)`);
  console.log(`Missing APIs: ${missingAPIs.length > 0 ? `❌ ${missingAPIs.join(', ')}` : '✅ None'}`);
  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

