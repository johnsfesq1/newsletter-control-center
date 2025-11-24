import 'dotenv/config';
import { execSync } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const RUNTIME_SA = 'newsletter-local-dev@newsletter-control-center.iam.gserviceaccount.com';

interface Args {
  inbox: 'me' | 'other';
  token: string;
}

function shell(cmd: string, allowFail = false): { success: boolean; output: string } {
  try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
    return { success: true, output: output.trim() };
  } catch (error: any) {
    if (allowFail) {
      return { success: false, output: error.stderr?.toString() || error.message || String(error) };
    }
    throw new Error(`Command failed: ${cmd}\n${error.stderr?.toString() || error.message}`);
  }
}

function shellJSON<T>(cmd: string, allowFail = false): T | null {
  try {
    const result = shell(cmd, allowFail);
    return result.success ? JSON.parse(result.output) : null;
  } catch {
    return null;
  }
}

async function checkSecretAccess(secretName: string): Promise<boolean> {
  const cmd = `gcloud secrets get-iam-policy ${secretName} --project=${PROJECT} --format=json`;
  const policy = shellJSON<any>(cmd, true);
  
  if (!policy) {
    return false;
  }
  
  const bindings = policy.bindings || [];
  return bindings.some((b: any) => 
    b.role === 'roles/secretmanager.secretAccessor' &&
    b.members?.includes(`serviceAccount:${RUNTIME_SA}`)
  );
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('inbox', {
      type: 'string',
      choices: ['me', 'other'],
      demandOption: true,
      describe: 'Inbox type (me or other)',
    })
    .option('token', {
      type: 'string',
      demandOption: true,
      describe: 'Refresh token value',
    })
    .parseAsync() as Args;
  
  const secretName = argv.inbox === 'me' ? 'GMAIL_REFRESH_TOKEN_ME' : 'GMAIL_REFRESH_TOKEN_OTHER';
  const inboxLabel = argv.inbox.toUpperCase();
  
  console.log(`\n=== Updating Secret Manager (${inboxLabel}) ===\n`);
  
  // Verify secret exists
  const checkCmd = `gcloud secrets describe ${secretName} --project=${PROJECT} --format=json`;
  const secretExists = shellJSON<any>(checkCmd, true);
  
  if (!secretExists) {
    console.error(`❌ Secret ${secretName} does not exist. Create it first:`);
    console.error(`   echo -n "${argv.token}" | gcloud secrets create ${secretName} \\`);
    console.error(`     --data-file=- --project=${PROJECT} --replication-policy="automatic"`);
    process.exit(1);
  }
  
  console.log(`✓ Secret ${secretName} exists\n`);
  
  // Check IAM access
  const hasAccess = await checkSecretAccess(secretName);
  if (!hasAccess) {
    console.warn(`⚠ Warning: ${RUNTIME_SA} may not have access to ${secretName}`);
    console.warn(`  Grant access with:`);
    console.warn(`    gcloud secrets add-iam-policy-binding ${secretName} \\`);
    console.warn(`      --member="serviceAccount:${RUNTIME_SA}" \\`);
    console.warn(`      --role="roles/secretmanager.secretAccessor" \\`);
    console.warn(`      --project=${PROJECT}`);
    console.warn('');
  } else {
    console.log(`✓ Service account has access\n`);
  }
  
  // Add new version
  console.log('Adding new secret version...');
  // Use printf to avoid shell interpretation issues with echo -n
  const addCmd = `printf '%s' "${argv.token}" | gcloud secrets versions add ${secretName} --data-file=- --project=${PROJECT}`;
  const result = shell(addCmd, false);
  
  if (!result.success) {
    console.error(`❌ Failed to add secret version: ${result.output}`);
    process.exit(1);
  }
  
  // Extract version number from output
  const versionMatch = result.output.match(/version (\d+)/i);
  const version = versionMatch ? versionMatch[1] : 'latest';
  
  console.log(`✓ Secret version added: ${version}\n`);
  
  // Verify we can read it back (confirms IAM is correct)
  const verifyCmd = `gcloud secrets versions access latest --secret=${secretName} --project=${PROJECT}`;
  const verifyResult = shell(verifyCmd, true);
  
  if (verifyResult.success && verifyResult.output === argv.token) {
    console.log('✓ Secret verified (can read back)\n');
  } else if (verifyResult.success) {
    console.warn('⚠ Secret added but verification read returned different value (may be IAM delay)');
    console.warn('   Cloud Run jobs will use latest version automatically\n');
  } else {
    console.warn('⚠ Secret added but cannot verify read (check IAM permissions)');
    console.warn('   Cloud Run jobs will use latest version automatically\n');
  }
  
  console.log('---');
  console.log(`✅ ${inboxLabel} refresh token updated in Secret Manager`);
  console.log(`   Secret: ${secretName}`);
  console.log(`   Version: ${version}`);
  console.log('---');
  console.log('\nNext steps:');
  console.log('  1. Run: npm run ingest:preflight -- --apply (verify modify capability)');
  console.log('  2. Test with a small live job:');
  console.log(`     gcloud run jobs execute ncc-ingest-${argv.inbox} --region=us-central1 \\`);
  console.log(`       --project=${PROJECT} --args="--limit=3","--no-dry-run","--mark-read=false"`);
  console.log('');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

