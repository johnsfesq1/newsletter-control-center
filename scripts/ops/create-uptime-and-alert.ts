import 'dotenv/config';
import { execSync } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { GoogleAuth } from 'google-auth-library';

const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const REGION = process.env.NCC_REGION || 'us-central1';
const SERVICE_NAME = 'ncc-jobs-runner';
const EMAIL = 'john@internationalintrigue.io';
const CHANNEL_ID = process.env.UPTIME_CHANNEL_ID || '';

interface Args {
  apply?: boolean;
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

async function getServiceUrl(): Promise<string> {
  const cmd = `gcloud run services describe ${SERVICE_NAME} --region=${REGION} --project=${PROJECT} --format=json`;
  const service = shellJSON<any>(cmd, true);
  
  if (!service?.status?.url) {
    throw new Error(`Cannot find service URL for ${SERVICE_NAME}`);
  }
  
  return service.status.url;
}

async function findNotificationChannel(): Promise<string | null> {
  // If channel ID is provided via env var, use it directly
  if (CHANNEL_ID) {
    return CHANNEL_ID.startsWith('projects/') ? CHANNEL_ID : `projects/${PROJECT}/notificationChannels/${CHANNEL_ID}`;
  }
  
  // Try to find channel by listing (may fail due to permissions)
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;
    
    if (!token) {
      return null;
    }
    
    const url = `https://monitoring.googleapis.com/v3/projects/${PROJECT}/notificationChannels`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const channels = data.notificationChannels || [];
    
    // Find first email channel whose display name contains "Email" or matches project email
    const channel = channels.find((ch: any) => {
      if (ch.type !== 'email') return false;
      const displayName = (ch.displayName || '').toLowerCase();
      const emailAddress = ch.labels?.email_address || '';
      return displayName.includes('email') || emailAddress === EMAIL;
    });
    
    return channel?.name || null;
  } catch {
    return null;
  }
}

async function getNotificationChannel(): Promise<string> {
  // Never create channels - only reuse existing ones
  const channel = await findNotificationChannel();
  
  if (!channel) {
    throw new Error(
      `Missing notification channel. Please set UPTIME_CHANNEL_ID=<channel-id> or ensure an email channel exists with "Email" in the display name. ` +
      `Channels must be created in the Cloud Console (Monitoring > Alerting > Notification Channels).`
    );
  }
  
  return channel;
}

async function checkUptimeCheckExists(checkName: string): Promise<string | null> {
  const cmd = `gcloud monitoring uptime list-configs --project=${PROJECT} --format=json`;
  const checks = shellJSON<Array<{ name: string; displayName: string }>>(cmd, true);
  
  if (!checks) {
    return null;
  }
  
  const found = checks.find(ch => ch.displayName === checkName || ch.name?.includes(checkName));
  return found?.name || null;
}

async function createUptimeCheck(serviceUrl: string): Promise<string> {
  const checkName = 'ncc-health-check';
  const checkDisplayName = 'NCC Health Check';
  
  // Check if exists
  const existingName = await checkUptimeCheckExists(checkName);
  if (existingName) {
    console.log(`✓ Uptime check ${checkDisplayName} already exists: ${existingName}`);
    return existingName;
  }
  
  // Use /health-check (Cloud Run appears to reserve /healthz)
  const healthUrl = `${serviceUrl}/health-check`;
  const url = new URL(healthUrl);
  
  const cmd = `gcloud monitoring uptime create https \
    --display-name="${checkDisplayName}" \
    --hostname="${url.hostname}" \
    --path="${url.pathname}" \
    --project=${PROJECT} \
    --format=json`;
  
  const result = shellJSON<{ name: string }>(cmd, false);
  if (!result?.name) {
    throw new Error('Failed to create uptime check');
  }
  
  console.log(`✓ Created uptime check: ${result.name}`);
  return result.name;
}

async function checkAlertPolicyExists(policyName: string): Promise<boolean> {
  const cmd = `gcloud alpha monitoring policies list --project=${PROJECT} --format=json`;
  const policies = shellJSON<Array<{ name: string; displayName: string }>>(cmd, true);
  
  if (!policies) {
    return false;
  }
  
  return policies.some(p => p.displayName === policyName || p.name?.includes(policyName));
}

async function createAlertPolicy(notificationChannelName: string, uptimeCheckName: string): Promise<void> {
  const policyName = 'NCC Health Alert';
  
  // Check if exists
  const exists = await checkAlertPolicyExists(policyName);
  if (exists) {
    console.log(`✓ Alert policy ${policyName} already exists`);
    return;
  }
  
  // Extract check ID from full resource name
  const checkId = uptimeCheckName.split('/').pop() || '';
  
  // Create alert policy JSON (Monitoring v3 schema)
  const policyJson = {
    displayName: policyName,
    combiner: 'OR',
    conditions: [
      {
        displayName: 'Uptime check failed',
        conditionThreshold: {
          filter: `resource.type="uptime_url" AND metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND metric.labels.check_id="${checkId}"`,
          comparison: 'COMPARISON_LT',
          thresholdValue: 1,
          duration: '600s', // 10 minutes
          trigger: {
            count: 2,
          },
          evaluationMissingData: 'EVALUATION_MISSING_DATA_NO_OP',
        },
      },
    ],
    notificationChannels: [notificationChannelName],
    alertStrategy: {
      autoClose: '1800s', // 30 minutes
    },
  };
  
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const policyFile = path.join(os.tmpdir(), `ncc-alert-policy-${Date.now()}.json`);
  fs.writeFileSync(policyFile, JSON.stringify(policyJson, null, 2));
  
  try {
    // Install alpha component if needed (non-interactive)
    const installCmd = `gcloud components install alpha --quiet 2>&1 || true`;
    shell(installCmd, true);
    
    const cmd = `gcloud alpha monitoring policies create \
      --policy-from-file=${policyFile} \
      --project=${PROJECT} \
      --quiet`;
    
    shell(cmd, false);
    console.log(`✓ Created alert policy: ${policyName}`);
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(policyFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('apply', {
      type: 'boolean',
      default: false,
      description: 'Actually create resources (default: preview only)',
    })
    .parseAsync() as Args;
  
  console.log('---');
  console.log('UPTIME CHECK & ALERT SETUP');
  console.log(`Project: ${PROJECT}`);
  console.log(`Region: ${REGION}`);
  console.log(`Service: ${SERVICE_NAME}`);
  console.log('');
  
  if (!argv.apply) {
    console.log('🔍 PREVIEW MODE (use --apply to create resources)');
    console.log('');
  }
  
  // Get service URL
  console.log('Getting service URL...');
  const serviceUrl = await getServiceUrl();
  const healthUrl = `${serviceUrl}/health-check`;
  console.log(`✓ Service URL: ${serviceUrl}`);
  console.log(`✓ Health endpoint: ${healthUrl}`);
  console.log('');
  
  // Find notification channel (never create)
  console.log('Finding notification channel...');
  let notificationChannelName: string | null = null;
  
  try {
    notificationChannelName = await findNotificationChannel();
    
    if (notificationChannelName) {
      console.log(`✓ Found notification channel: ${notificationChannelName}`);
    } else {
      if (argv.apply) {
        console.error('');
        console.error('❌ ERROR: Notification channel not found.');
        if (CHANNEL_ID) {
          console.error(`   Using provided ID: ${CHANNEL_ID}`);
        } else {
          console.error(`   Set UPTIME_CHANNEL_ID=<channel-id> to use a specific channel`);
        }
        console.error('');
        console.error('   Channels must be created in Cloud Console:');
        console.error('   Monitoring > Alerting > Notification Channels');
        console.error('');
        process.exit(1);
      } else {
        console.log(`📋 Would use notification channel (first email channel with "Email" in name, or set UPTIME_CHANNEL_ID)`);
      }
    }
  } catch (error: any) {
    if (argv.apply) {
      console.error('');
      console.error(`❌ ERROR: ${error.message}`);
      process.exit(1);
      } else {
        console.log(`📋 Would use notification channel (requires UPTIME_CHANNEL_ID if listing fails)`);
      }
  }
  console.log('');
  
  // Check/create uptime check
  console.log('Checking uptime check...');
  let uptimeCheckName = await checkUptimeCheckExists('ncc-health-check');
  
      if (uptimeCheckName) {
        console.log(`✓ Uptime check already exists: ${uptimeCheckName}`);
      } else {
        if (argv.apply) {
          uptimeCheckName = await createUptimeCheck(serviceUrl);
        } else {
          console.log(`📋 Would create uptime check for: ${healthUrl}`);
        }
      }
  console.log('');
  
  // Check/create alert policy
  console.log('Checking alert policy...');
  const policyName = 'NCC Health Alert';
  const alertExists = await checkAlertPolicyExists(policyName);
  
  if (alertExists) {
    console.log(`✓ Alert policy already exists`);
  } else {
    if (argv.apply && notificationChannelName && uptimeCheckName) {
      await createAlertPolicy(notificationChannelName, uptimeCheckName);
    } else {
      console.log(`📋 Would create alert policy:`);
      console.log(`   - Name: ${policyName}`);
      console.log(`   - Combiner: OR`);
      console.log(`   - Condition: Uptime check fails (2 of 3 evaluations in 10 minutes)`);
      console.log(`   - Notification: ${notificationChannelName || 'email channel'}`);
    }
  }
  console.log('');
  
  if (!argv.apply) {
    console.log('---');
    console.log('To create these resources, run:');
    console.log('  npm run ops:alert:apply');
    console.log('---');
  } else {
    console.log('---');
    console.log('✅ Setup complete');
    console.log('---');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

