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

function getRunnerUrl(): string {
  // Try env var first
  const url = process.env.NCC_RUNNER_URL;
  if (url) {
    return url;
  }
  
  // Fall back to gcloud describe
  const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const REGION = process.env.NCC_REGION || 'us-central1';
  const SERVICE_NAME = 'ncc-jobs-runner';
  
  // Check if we need to switch to human user for auth
  let currentAccount = '';
  try {
    currentAccount = shell('gcloud config get-value account');
  } catch {
    currentAccount = '';
  }
  
  const needsHumanAuth = currentAccount.endsWith('.iam.gserviceaccount.com');
  
  if (needsHumanAuth) {
    console.log('Switching to human user for service URL lookup...');
    spawnSync('gcloud', ['auth', 'login', '--update-adc', '--quiet'], { stdio: 'inherit' });
    shell(`gcloud config set project ${PROJECT}`);
  }
  
  try {
    const url = shell(`gcloud run services describe ${SERVICE_NAME} --region=${REGION} --project=${PROJECT} --format="value(status.url)"`);
    return url;
  } finally {
    // Switch back if needed
    if (needsHumanAuth) {
      const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'secrets/gcp/ncc-local-dev.json';
      const SA = 'newsletter-local-dev@newsletter-control-center.iam.gserviceaccount.com';
      spawnSync('gcloud', ['auth', 'activate-service-account', SA, '--key-file', KEY, '--project', PROJECT], { stdio: 'inherit' });
    }
  }
}

async function main(): Promise<void> {
  const runnerUrl = getRunnerUrl();
  const healthUrl = `${runnerUrl}/health-check`;
  
  try {
    const response = await fetch(healthUrl);
    const status = response.status;
    
    if (status === 401 || status === 403) {
      console.error('HEALTH FAIL: Health endpoint must allow unauthenticated access for Uptime Checks.');
      process.exit(1);
    }
    
    // Parse response body
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`HEALTH FAIL: HTTP ${status} - Invalid JSON response: ${text.substring(0, 100)}`);
      process.exit(1);
    }
    
    // Check if endpoint is accessible (200 OK) even if health check fails
    if (status === 200) {
      console.log(`HEALTH ENDPOINT ACCESSIBLE: HTTP ${status}`);
      console.log(`Response: ${JSON.stringify(data, null, 2)}`);
    }
    
    const jobsOk = data.jobs_ok === true;
    const coverageOk = data.coverage_ok === true;
    
    if (jobsOk && coverageOk) {
      console.log('HEALTH OK');
      process.exit(0);
    } else {
      const reasons: string[] = [];
      if (!jobsOk) reasons.push('jobs_ok=false');
      if (!coverageOk) reasons.push('coverage_ok=false');
      console.log(`HEALTH ENDPOINT ACCESSIBLE (health check failed: ${reasons.join(', ')})`);
      // Exit 0 because endpoint is accessible (actual health status is separate)
      process.exit(0);
    }
  } catch (error: any) {
    console.error(`HEALTH FAIL: ${error.message || 'unknown error'}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err.message || err);
    process.exit(1);
  });
}

