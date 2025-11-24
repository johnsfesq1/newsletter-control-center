import 'dotenv/config';
import { execSync } from 'child_process';

const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const REGION = process.env.NCC_REGION || 'us-central1';

interface JobSummary {
  job: string;
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  fetched?: number;
  inserted?: number;
  labeled?: number;
  markedRead?: number;
  errors?: string[];
  lastRun?: string;
}

async function getJobExecutionHistory(jobName: string): Promise<any> {
  try {
    const cmd = `gcloud run jobs executions list --job=${jobName} --region=${REGION} --project=${PROJECT} --limit=1 --format=json`;
    const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
    const data = JSON.parse(output);
    return data[0] || null;
  } catch (error: any) {
    return null;
  }
}

async function getJobLogs(jobName: string, executionName?: string): Promise<string[]> {
  try {
    let filter = `resource.type=cloud_run_job AND resource.labels.job_name=${jobName}`;
    if (executionName) {
      const execId = executionName.split('/').pop();
      filter += ` AND resource.labels.execution_name=${execId}`;
    }
    
    const cmd = `gcloud logging read "${filter}" --limit=100 --format="value(textPayload)" --project=${PROJECT} --freshness=24h`;
    const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
    return output.split('\n').filter(line => line.trim().length > 0);
  } catch (error: any) {
    return [];
  }
}

function extractMetrics(logs: string[]): Partial<JobSummary> {
  const metrics: Partial<JobSummary> = {};
  
  for (const line of logs) {
    // Extract fetched count
    const fetchedMatch = line.match(/Gmail:\s*fetched\s+(\d+)\s+messages/i);
    if (fetchedMatch) {
      metrics.fetched = parseInt(fetchedMatch[1], 10);
    }
    
    // Extract inserted count
    const insertedMatch = line.match(/inserted_raw=(\d+)/i) || line.match(/inserted\s+(\d+)\s+messages/i);
    if (insertedMatch) {
      metrics.inserted = parseInt(insertedMatch[1], 10);
    }
    
    // Extract labeled count
    const labeledMatch = line.match(/labeled=(\d+)/i) || line.match(/Gmail:\s*labeled=(\d+)/i);
    if (labeledMatch) {
      metrics.labeled = parseInt(labeledMatch[1], 10);
    }
    
    // Extract marked_read count
    const markedReadMatch = line.match(/marked_read=(\d+)/i);
    if (markedReadMatch) {
      metrics.markedRead = parseInt(markedReadMatch[1], 10);
    }
  }
  
  return metrics;
}

async function checkJob(jobName: string): Promise<JobSummary> {
  const summary: JobSummary = {
    job: jobName,
    status: 'UNKNOWN',
  };
  
  const execution = await getJobExecutionHistory(jobName);
  if (execution) {
    summary.lastRun = execution.metadata?.creationTimestamp || 'unknown';
    const status = execution.status?.conditions?.[0]?.status || 'Unknown';
    if (status === 'True' && execution.status?.conditions?.[0]?.type === 'Complete') {
      summary.status = 'PASS';
    } else if (status === 'True' && execution.status?.conditions?.[0]?.type === 'Failed') {
      summary.status = 'FAIL';
    }
  }
  
  const logs = await getJobLogs(jobName, execution?.metadata?.name);
  const metrics = extractMetrics(logs);
  Object.assign(summary, metrics);
  
  // Check for errors
  const errorLines = logs.filter(line => 
    line.toLowerCase().includes('error') || 
    line.toLowerCase().includes('failed') ||
    line.toLowerCase().includes('exception')
  );
  if (errorLines.length > 0) {
    summary.errors = errorLines.slice(0, 5); // Keep first 5 errors
  }
  
  return summary;
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PIPELINE STATUS REPORT');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const jobs = ['ncc-ingest-me', 'ncc-ingest-other'];
  const summaries: JobSummary[] = [];
  
  for (const jobName of jobs) {
    console.log(`Checking ${jobName}...`);
    const summary = await checkJob(jobName);
    summaries.push(summary);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  for (const summary of summaries) {
    console.log(`Job: ${summary.job}`);
    console.log(`  Status: ${summary.status}`);
    if (summary.lastRun) {
      console.log(`  Last Run: ${summary.lastRun}`);
    }
    if (summary.fetched !== undefined) {
      console.log(`  Fetched: ${summary.fetched}`);
    }
    if (summary.inserted !== undefined) {
      console.log(`  Inserted: ${summary.inserted}`);
    }
    if (summary.labeled !== undefined) {
      console.log(`  Labeled: ${summary.labeled}`);
    }
    if (summary.markedRead !== undefined) {
      console.log(`  Marked Read: ${summary.markedRead}`);
    }
    if (summary.errors && summary.errors.length > 0) {
      console.log(`  Errors: ${summary.errors.length} found`);
      summary.errors.forEach(err => console.log(`    - ${err.substring(0, 100)}`));
    }
    console.log('');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

