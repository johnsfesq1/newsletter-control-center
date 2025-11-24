import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

interface CloudRunJob {
  name?: string;
  metadata?: {
    name?: string;
  };
}

interface SchedulerJob {
  name?: string;
  schedule?: string;
}

async function main(): Promise<void> {
  // Resolve project
  let PROJECT = process.env.BQ_PROJECT_ID;
  if (!PROJECT) {
    try {
      PROJECT = execSync('gcloud config get-value project', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      PROJECT = '';
    }
  }
  if (!PROJECT) {
    throw new Error('No project: set BQ_PROJECT_ID or run `gcloud config set project <id>`');
  }

  // Resolve region
  const REGION = process.env.NCC_REGION || 'us-central1';

  // Fetch existing Cloud Run Jobs
  let existingRunJobs: CloudRunJob[] = [];
  let runJobsError: string | null = null;
  try {
    const cmd = `gcloud run jobs list --region ${REGION} --project ${PROJECT} --format=json`;
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    if (output) {
      existingRunJobs = JSON.parse(output);
    }
  } catch (error: any) {
    runJobsError = error.message || String(error);
    const stderr = error.stderr?.toString() || '';
    if (stderr) {
      const lines = stderr.split('\n').filter((l: string) => l.trim());
      if (lines.length > 0) {
        runJobsError = lines[0];
      }
    }
  }

  // Fetch existing Scheduler Jobs
  let existingSchedulerJobs: SchedulerJob[] = [];
  let schedulerError: string | null = null;
  try {
    const cmd = `gcloud scheduler jobs list --location ${REGION} --project ${PROJECT} --format=json`;
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    if (output) {
      existingSchedulerJobs = JSON.parse(output);
    }
  } catch (error: any) {
    schedulerError = error.message || String(error);
    const stderr = error.stderr?.toString() || '';
    if (stderr) {
      const lines = stderr.split('\n').filter((l: string) => l.trim());
      if (lines.length > 0) {
        schedulerError = lines[0];
      }
    }
  }

  // Build sets of existing names
  const existingRunJobNames = new Set<string>();
  for (const job of existingRunJobs) {
    const name = job.name || job.metadata?.name || '';
    if (name) {
      // Extract just the job name (remove path)
      const parts = name.split('/');
      existingRunJobNames.add(parts[parts.length - 1]);
    }
  }

  const existingSchedulerJobNames = new Set<string>();
  for (const job of existingSchedulerJobs) {
    const name = job.name || '';
    if (name) {
      // Extract just the job name (remove path)
      const parts = name.split('/');
      existingSchedulerJobNames.add(parts[parts.length - 1]);
    }
  }

  // Read SCHEDULING_PLAN.md
  const planPath = path.resolve(__dirname, '../../docs/SCHEDULING_PLAN.md');
  let planContent = '';
  try {
    planContent = await fs.readFile(planPath, 'utf8');
  } catch (error: any) {
    // Continue with defaults if file doesn't exist
  }

  // Extract desired jobs from plan (heuristic: look for job names or use defaults)
  const desiredRunJobs = [
    { name: 'ncc-ingest-me', cron: null as string | null },
    { name: 'ncc-ingest-other', cron: null as string | null },
    { name: 'ncc-chunks', cron: null as string | null },
    { name: 'ncc-embeddings', cron: null as string | null },
    { name: 'ncc-smoke', cron: null as string | null },
  ];

  const desiredSchedulerJobs = [
    { name: 'schedule-ncc-ingest-me', cron: '(cron TBD)' },
    { name: 'schedule-ncc-ingest-other', cron: '(cron TBD)' },
    { name: 'schedule-ncc-chunks', cron: '(cron TBD)' },
    { name: 'schedule-ncc-embeddings', cron: '(cron TBD)' },
    { name: 'schedule-ncc-smoke', cron: '(cron TBD)' },
  ];

  // Try to extract cron info from plan doc
  if (planContent) {
    // Look for ingest schedules (3x daily at 07:10, 12:10, 17:10 ET)
    if (/07:10.*?12:10.*?17:10/i.test(planContent) || /Schedule:.*?07:10.*?12:10.*?17:10/i.test(planContent)) {
      desiredSchedulerJobs[0].cron = '07:10,12:10,17:10 ET';
      // Assume other ingest is offset (could be 5 minutes later, but doc doesn't specify - mark as TBD)
      desiredSchedulerJobs[1].cron = '(cron TBD)';
    }

    // Look for chunk schedule (hourly :20)
    if (/hourly.*?:20/i.test(planContent) || /Schedule:.*?hourly.*?:20/i.test(planContent)) {
      desiredSchedulerJobs[2].cron = 'hourly :20';
    }

    // Look for embeddings schedule (hourly :35)
    if (/hourly.*?:35/i.test(planContent) || /Schedule:.*?hourly.*?:35/i.test(planContent)) {
      desiredSchedulerJobs[3].cron = 'hourly :35';
    }

    // Look for smoke schedule (18:00 ET)
    if (/18:00/i.test(planContent) && /smoke|Smoke/i.test(planContent)) {
      desiredSchedulerJobs[4].cron = '18:00 ET';
    }
  }

  // Print plan
  console.log('---');
  console.log('CLOUD PLAN (read-only)');
  console.log(`Project: ${PROJECT}  Region: ${REGION}`);
  console.log('');

  if (runJobsError) {
    console.log(`⚠️  Cloud Run Jobs listing failed: ${runJobsError}`);
    console.log('');
  }

  if (schedulerError) {
    console.log(`⚠️  Scheduler Jobs listing failed: ${schedulerError}`);
    console.log('');
  }

  console.log('Cloud Run Jobs:');
  for (const job of desiredRunJobs) {
    const status = existingRunJobNames.has(job.name) ? 'KEEP' : 'CREATE';
    const dots = '.'.repeat(Math.max(1, 30 - job.name.length));
    console.log(`  - ${job.name} ${dots} ${status}`);
  }
  console.log('');

  console.log('Cloud Scheduler Jobs:');
  for (const job of desiredSchedulerJobs) {
    const status = existingSchedulerJobNames.has(job.name) ? 'KEEP' : 'CREATE';
    const dots = '.'.repeat(Math.max(1, 35 - job.name.length - job.cron.length));
    console.log(`  - ${job.name} (cron: ${job.cron}) ${dots} ${status}`);
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

