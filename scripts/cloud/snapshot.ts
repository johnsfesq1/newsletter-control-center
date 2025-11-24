import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function shell(cmd: string, allowFail = false): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch (error: any) {
    if (allowFail) {
      return '';
    }
    const stderr = error.stderr?.toString() || '';
    throw new Error(`Command failed: ${cmd}\n${stderr}`);
  }
}

function shellJSON<T>(cmd: string, allowFail = false): T | null {
  try {
    const output = shell(cmd, allowFail);
    return output ? JSON.parse(output) : null;
  } catch {
    return null;
  }
}

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return 'N/A';
  try {
    const date = new Date(ts);
    return date.toISOString().replace('T', ' ').replace('Z', ' UTC');
  } catch {
    return ts;
  }
}

function getETTimestamp(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return et.toISOString().replace('T', ' ').substring(0, 19) + ' ET';
}

async function main(): Promise<void> {
  const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const REGION = process.env.NCC_REGION || 'us-central1';
  const SERVICE_NAME = 'ncc-jobs-runner';
  const JOBS = ['ncc-chunks', 'ncc-embeddings', 'ncc-smoke', 'ncc-ingest-me', 'ncc-ingest-other'];
  const SCHEDULER_JOBS = [
    'schedule-ncc-chunks',
    'schedule-ncc-embeddings',
    'schedule-ncc-smoke',
    'schedule-ncc-ingest-me-0710',
    'schedule-ncc-ingest-me-1210',
    'schedule-ncc-ingest-me-1710',
    'schedule-ncc-ingest-other-0710',
    'schedule-ncc-ingest-other-1210',
    'schedule-ncc-ingest-other-1710',
  ];

  console.log('---');
  console.log('DEPLOYMENT SNAPSHOT');
  console.log(`Project: ${PROJECT}`);
  console.log(`Region: ${REGION}`);
  console.log('');

  const snapshot: string[] = [];
  snapshot.push(`# Deploy Snapshot (${getETTimestamp()})`);
  snapshot.push('');

  // 1. Image URI
  snapshot.push('## Image');
  snapshot.push('');
  let imageUri = 'unknown';
  const imagePath = path.join(process.cwd(), 'docs', 'LATEST_IMAGE.txt');
  if (fs.existsSync(imagePath)) {
    try {
      imageUri = fs.readFileSync(imagePath, 'utf8').trim();
    } catch {
      // Keep as unknown
    }
  }
  snapshot.push(`- Latest image URI: ${imageUri}`);
  snapshot.push('');

  // 2. Runner Service
  snapshot.push('## Runner Service');
  snapshot.push('');
  let serviceInfo: any = null;
  try {
    serviceInfo = shell(`gcloud run services describe ${SERVICE_NAME} --region=${REGION} --project=${PROJECT} --format=json`);
    serviceInfo = JSON.parse(serviceInfo);
  } catch (error: any) {
    snapshot.push('- Status: NOT FOUND or ERROR');
    snapshot.push(`- Error: ${error.message || String(error)}`);
  }

  if (serviceInfo) {
    const url = serviceInfo.status?.url || 'N/A';
    const latestRevision = serviceInfo.status?.latestReadyRevisionName || 'N/A';
    const image = serviceInfo.spec?.template?.spec?.containers?.[0]?.image || 'N/A';
    const status = serviceInfo.status?.conditions?.[0]?.status || 'UNKNOWN';
    snapshot.push(`- URL: ${url}`);
    snapshot.push(`- Latest revision: ${latestRevision}`);
    snapshot.push(`- Image: ${image}`);
    snapshot.push(`- Status: ${status}`);
  }
  snapshot.push('');

  // 3. Cloud Run Jobs
  snapshot.push('## Cloud Run Jobs');
  snapshot.push('');
  snapshot.push('| Job | Last Status | Last Started | Last Completed |');
  snapshot.push('|-----|-------------|--------------|----------------|');

  for (const jobName of JOBS) {
    let jobInfo: any = null;
    let lastExecution: any = null;

    try {
      const jobDesc = shell(`gcloud run jobs describe ${jobName} --region=${REGION} --project=${PROJECT} --format=json`, true);
      if (jobDesc) {
        jobInfo = JSON.parse(jobDesc);
      }
    } catch {
      // Job might not exist
    }

    try {
      const execList = shell(`gcloud run jobs executions list --job=${jobName} --region=${REGION} --project=${PROJECT} --format=json --limit=1`, true);
      if (execList) {
        const executions = JSON.parse(execList);
        if (Array.isArray(executions) && executions.length > 0) {
          lastExecution = executions[0];
        }
      }
    } catch {
      // No executions yet
    }

    const status = lastExecution?.status?.conditions?.[0]?.status || 'N/A';
    const startTime = formatTimestamp(lastExecution?.status?.startTime);
    const completionTime = formatTimestamp(lastExecution?.status?.completionTime);

    snapshot.push(`| ${jobName} | ${status} | ${startTime} | ${completionTime} |`);
  }
  snapshot.push('');

  // 4. Cloud Scheduler
  snapshot.push('## Cloud Scheduler');
  snapshot.push('');
  snapshot.push('| Job | Cron | Time Zone | Target | Next Run |');
  snapshot.push('|-----|------|-----------|--------|----------|');

  let schedulerJobs: any[] = [];
  try {
    const schedulerList = shell(`gcloud scheduler jobs list --location=${REGION} --project=${PROJECT} --format=json`, true);
    if (schedulerList) {
      schedulerJobs = JSON.parse(schedulerList);
    }
  } catch {
    // No scheduler jobs or error
  }

  for (const schedulerName of SCHEDULER_JOBS) {
    const scheduler = schedulerJobs.find((j: any) => j.name?.includes(schedulerName) || j.name?.endsWith(schedulerName));
    
    if (!scheduler) {
      snapshot.push(`| ${schedulerName} | NOT FOUND | - | - | - |`);
      continue;
    }

    const cron = scheduler.schedule || 'N/A';
    const timeZone = scheduler.timeZone || 'N/A';
    const target = scheduler.httpTarget?.uri || scheduler.oidcToken?.serviceAccountEmail || 'N/A';
    
    // Get detailed info to fetch nextRunTime via describe command
    let nextRunTime: string | null = null;
    try {
      // Extract job name from full path (e.g., "projects/.../locations/.../jobs/schedule-ncc-chunks" -> "schedule-ncc-chunks")
      const jobNameFromPath = scheduler.name?.split('/').pop() || schedulerName;
      const describeOutput = shell(`gcloud scheduler jobs describe ${jobNameFromPath} --location=${REGION} --project=${PROJECT} --format=json`, true);
      if (describeOutput) {
        const detailed = JSON.parse(describeOutput);
        // scheduleTime is the field that contains the next run time
        nextRunTime = detailed.scheduleTime || null;
      }
    } catch (error) {
      // Failed to describe, will use N/A
    }

    let nextRunFormatted = 'N/A';
    if (scheduler.state === 'PAUSED') {
      nextRunFormatted = 'PAUSED';
    } else if (scheduler.state !== 'ENABLED') {
      nextRunFormatted = scheduler.state || 'UNKNOWN';
    } else if (nextRunTime) {
      nextRunFormatted = formatTimestamp(nextRunTime);
    } else {
      nextRunFormatted = 'N/A (not available)';
    }

    snapshot.push(`| ${schedulerName} | ${cron} | ${timeZone} | ${target.substring(0, 60)}... | ${nextRunFormatted} |`);
  }
  snapshot.push('');

  // 5. Reconcile Report
  snapshot.push('## Reconcile');
  snapshot.push('');
  snapshot.push('```');
  try {
    const reconcileOutput = shell('npm run report:reconcile', true);
    snapshot.push(reconcileOutput || 'Reconcile report unavailable');
  } catch (error: any) {
    snapshot.push(`Error running reconcile: ${error.message || String(error)}`);
  }
  snapshot.push('```');
  snapshot.push('');

  // 6. How to Resume
  snapshot.push('## How to Resume');
  snapshot.push('');
  snapshot.push('1. `npm run cloud:build:stream`');
  snapshot.push('2. `npm run cloud:runner:apply`');
  snapshot.push('3. `npm run cloud:jobs:apply`');
  snapshot.push('4. `npm run cloud:schedule:apply`');
  snapshot.push('5. `npm run report:reconcile`');
  snapshot.push('');

  // Write to file
  const outputPath = path.join(process.cwd(), 'docs', 'DEPLOY_SNAPSHOT.md');
  const output = snapshot.join('\n');
  fs.writeFileSync(outputPath, output, 'utf8');

  console.log('✅ Snapshot written to:', outputPath);
  console.log('');
  console.log('---');
  console.log('SNAPSHOT PREVIEW:');
  console.log('---');
  console.log(output);
  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

