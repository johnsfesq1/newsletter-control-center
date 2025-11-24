import 'dotenv/config';
import { execSync } from 'child_process';

interface AuthAccount {
  account?: string;
  status?: string;
}

function runCommand(cmd: string, silent = true): { success: boolean; output: string } {
  try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' });
    return { success: true, output: output.trim() };
  } catch (error: any) {
    return { success: false, output: error.message || String(error) };
  }
}

async function main(): Promise<void> {
  console.log('---');
  console.log('GCLOUD DOCTOR');
  console.log('');

  // Check if gcloud is installed
  const whichResult = runCommand('which gcloud');
  const isInstalled = whichResult.success && whichResult.output.length > 0;

  if (!isInstalled) {
    console.log('❌ gcloud: NOT INSTALLED');
    console.log('');
    console.log('Install gcloud CLI: https://cloud.google.com/sdk/docs/install');
    console.log('---');
    process.exit(1);
  }

  console.log('✅ gcloud: INSTALLED');
  console.log('');

  // Get version
  const versionResult = runCommand('gcloud --version', true);
  if (versionResult.success) {
    const firstLine = versionResult.output.split('\n')[0];
    console.log(`Version: ${firstLine}`);
  } else {
    console.log('Version: (error)');
  }
  console.log('');

  // Get current project
  const projectResult = runCommand('gcloud config get-value project', true);
  const currentProject = projectResult.success && projectResult.output.length > 0
    ? projectResult.output
    : '(unset)';
  console.log(`Project: ${currentProject}`);
  console.log('');

  // Get run/region
  const regionResult = runCommand('gcloud config get-value run/region', true);
  const currentRegion = regionResult.success && regionResult.output.length > 0
    ? regionResult.output
    : '(unset)';
  console.log(`Run Region: ${currentRegion}`);
  console.log('');

  // Get active account
  const authResult = runCommand('gcloud auth list --format=json', true);
  let activeAccount = 'none';
  let hasActiveAccount = false;

  if (authResult.success) {
    try {
      const accounts = JSON.parse(authResult.output) as AuthAccount[];
      const active = accounts.find((acc) => acc.status === 'ACTIVE');
      if (active && active.account) {
        activeAccount = active.account;
        hasActiveAccount = true;
      }
    } catch (e) {
      // Parse failed, try simple grep
      const lines = authResult.output.split('\n');
      for (const line of lines) {
        if (line.includes('ACTIVE') && line.includes('@')) {
          const match = line.match(/([^\s@]+@[^\s@]+)/);
          if (match) {
            activeAccount = match[1];
            hasActiveAccount = true;
            break;
          }
        }
      }
    }
  }

  console.log(`Active Account: ${activeAccount}`);
  console.log('');

  // Provide next steps
  if (!hasActiveAccount) {
    console.log('---');
    console.log('NEXT STEPS (no active account):');
    console.log('');
    console.log('1) gcloud auth login --update-adc');
    console.log('2) gcloud config set project newsletter-control-center');
    console.log('3) gcloud config set run/region us-central1');
    console.log('---');
  } else {
    console.log('---');
    console.log('✅ Active account found');
    console.log('');
    console.log('If discovery still fails, you may need service account impersonation:');
    console.log('');
    console.log('export NCC_IMPERSONATE_SA=\'<service-account>@newsletter-control-center.iam.gserviceaccount.com\'');
    console.log('');
    console.log('Then use: gcloud config set auth/impersonate_service_account $NCC_IMPERSONATE_SA');
    console.log('---');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

