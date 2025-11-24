
import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

dotenv.config();

const PROJECT_ID = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = process.env.BQ_DATASET || 'ncc_production';
const REGION = 'us-central1';
const HEALTH_ENDPOINT = 'https://ncc-jobs-runner-d6cqllgv7a-uc.a.run.app/health-check';

// ANSI Colors
const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

// Logging helpers
let logBuffer = '';

function log(message: string = '') {
  console.log(message);
  logBuffer += message + '\n';
}

function section(title: string) {
  log('\n' + BOLD + CYAN + '=== ' + title + ' ===' + RESET);
}

function pass(message: string) {
  log(GREEN + '✓ ' + message + RESET);
}

function fail(message: string) {
  log(RED + '✗ ' + message + RESET);
}

function warn(message: string) {
  log(YELLOW + '! ' + message + RESET);
}

function info(message: string) {
  log('  ' + message);
}

async function checkHealthEndpoint() {
  section('1. HEALTH ENDPOINT CHECK');
  info(`Target: ${HEALTH_ENDPOINT}`);

  try {
    const start = Date.now();
    const response = await fetch(HEALTH_ENDPOINT);
    const duration = Date.now() - start;

    if (response.ok) {
      const data = await response.json();
      pass(`Endpoint reachable (${duration}ms)`);
      info(`Status: ${data.status}`);
      info(`Uptime: ${Math.floor(data.uptime / 3600)}h ${Math.floor((data.uptime % 3600) / 60)}m`);
      
      if (data.last_execution) {
        info(`Last Execution: ${data.last_execution}`);
      }
      
      if (data.errors && data.errors.length > 0) {
        warn(`Reported Errors: ${data.errors.length}`);
        data.errors.slice(0, 3).forEach((e: string) => info(`  - ${e}`));
      } else {
        pass('No recent errors reported by endpoint');
      }
      return true;
    } else {
      fail(`Endpoint returned ${response.status}: ${response.statusText}`);
      return false;
    }
  } catch (error: any) {
    fail(`Failed to connect: ${error.message}`);
    return false;
  }
}

function checkCloudScheduler() {
  section('2. CLOUD SCHEDULER CHECK');
  const jobName = 'ncc-daily';
  info(`Checking job: ${jobName}`);

  try {
    const cmd = `gcloud scheduler jobs describe ${jobName} --location=${REGION} --project=${PROJECT_ID} --format=json`;
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const job = JSON.parse(output);

    if (job.state === 'ENABLED') {
      pass(`Job state: ${job.state}`);
    } else {
      warn(`Job state: ${job.state}`);
    }

    info(`Schedule: ${job.schedule}`);
    info(`Timezone: ${job.timeZone}`);
    
    if (job.lastAttemptTime) {
      info(`Last Attempt: ${job.lastAttemptTime}`);
    } else {
      warn('No last attempt time found');
    }
    
    if (job.status && job.status.code === 0) {
       pass('Last execution status: SUCCESS');
    } else if (job.status) {
       fail(`Last execution status: FAILED (Code ${job.status.code})`);
    }

    return true;
  } catch (error: any) {
    fail(`Could not fetch scheduler job: ${error.message.split('\n')[0]}`);
    info('Make sure you are authenticated with gcloud and have permissions.');
    return false;
  }
}

async function checkBigQueryData() {
  section('3. BIGQUERY RECENT DATA CHECK');
  const bq = new BigQuery({ projectId: PROJECT_ID });

  const query = `
    WITH dates AS (
      SELECT date 
      FROM UNNEST(GENERATE_DATE_ARRAY(DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY), CURRENT_DATE())) as date
    ),
    email_counts AS (
      SELECT 
        DATE(ingested_at) as d,
        COUNT(*) as count
      FROM \`${PROJECT_ID}.${DATASET_ID}.raw_emails\`
      WHERE ingested_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
      GROUP BY 1
    ),
    chunk_counts AS (
      SELECT 
        DATE(created_at) as d,
        COUNT(*) as count
      FROM \`${PROJECT_ID}.${DATASET_ID}.chunks\`
      WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
      GROUP BY 1
    ),
    emb_counts AS (
      SELECT 
        DATE(created_at) as d,
        COUNT(*) as count
      FROM \`${PROJECT_ID}.${DATASET_ID}.chunk_embeddings\`
      WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
      GROUP BY 1
    )
    SELECT 
      dates.date,
      COALESCE(e.count, 0) as emails,
      COALESCE(c.count, 0) as chunks,
      COALESCE(em.count, 0) as embeddings
    FROM dates
    LEFT JOIN email_counts e ON dates.date = e.d
    LEFT JOIN chunk_counts c ON dates.date = c.d
    LEFT JOIN emb_counts em ON dates.date = em.d
    ORDER BY dates.date DESC
  `;

  try {
    const [rows] = await bq.query({ query, location: 'US' });
    
    log('Date       | Emails | Chunks | Embeddings');
    log('-----------|--------|--------|-----------');
    
    let totalEmails = 0;
    let totalChunks = 0;
    let totalEmbeddings = 0;
    let hasGaps = false;

    rows.forEach((row: any) => {
      const dateStr = row.date.value;
      const emails = row.emails;
      const chunks = row.chunks;
      const embeddings = row.embeddings;
      
      totalEmails += emails;
      totalChunks += chunks;
      totalEmbeddings += embeddings;

      let line = `${dateStr} | ${emails.toString().padEnd(6)} | ${chunks.toString().padEnd(6)} | ${embeddings.toString().padEnd(9)}`;
      
      if (emails === 0 && dateStr !== new Date().toISOString().split('T')[0]) {
        // Warning if no emails on a past day (might be weekend/holiday, but noteworthy)
         line += YELLOW + ' (Low activity)' + RESET;
      }
      
      log(line);
    });

    if (totalEmails > 0) pass(`Found data for last 7 days (${totalEmails} emails)`);
    else fail('No emails found in last 7 days');

    return { totalEmails, totalChunks, totalEmbeddings, rows };
  } catch (error: any) {
    fail(`BigQuery check failed: ${error.message}`);
    return null;
  }
}

async function verifyPipelineFlow(data: any) {
  section('4. PIPELINE FLOW VERIFICATION');
  
  if (!data) {
    info('Skipping flow verification due to missing data.');
    return false;
  }

  const { totalEmails, totalChunks, totalEmbeddings, rows } = data;

  info(`Total Emails (7d): ${totalEmails}`);
  info(`Total Chunks (7d): ${totalChunks}`);
  info(`Total Embeddings (7d): ${totalEmbeddings}`);

  // Check 1: Email -> Chunk Ratio
  // Approx 5-20 chunks per email usually, but if 0 chunks and >0 emails, that's bad.
  if (totalEmails > 0 && totalChunks === 0) {
    fail('CRITICAL: Emails ingested but NO chunks created.');
  } else if (totalEmails > 0) {
    const ratio = (totalChunks / totalEmails).toFixed(1);
    pass(`Chunking active (Avg ${ratio} chunks/email)`);
  }

  // Check 2: Chunk -> Embedding Coverage
  // Should be close to 100% (minus junk chunks)
  if (totalChunks > 0) {
    const coverage = (totalEmbeddings / totalChunks) * 100;
    const coverageStr = coverage.toFixed(1) + '%';
    
    if (coverage >= 90) {
      pass(`Embedding coverage healthy: ${coverageStr}`);
    } else if (coverage >= 50) {
      warn(`Embedding coverage low: ${coverageStr} (Check for backlog or junk filtering)`);
    } else {
      fail(`Embedding coverage CRITICAL: ${coverageStr}`);
    }
  }

  // Check 3: Daily Consistency
  // Look for days where we have emails but 0 chunks/embeddings
  let inconsistentDays = 0;
  rows.forEach((row: any) => {
    if (row.emails > 0 && (row.chunks === 0 || row.embeddings === 0)) {
      warn(`Incomplete processing on ${row.date.value}: ${row.emails} emails, ${row.chunks} chunks, ${row.embeddings} embeddings`);
      inconsistentDays++;
    }
  });

  if (inconsistentDays === 0) {
    pass('Daily processing consistency looks good');
  }

  return inconsistentDays === 0;
}

async function main() {
  log(BOLD + `INGESTION HEALTH CHECK - ${new Date().toISOString()}` + RESET);
  
  const healthOk = await checkHealthEndpoint();
  const schedulerOk = checkCloudScheduler();
  const data = await checkBigQueryData();
  const flowOk = await verifyPipelineFlow(data);

  section('SUMMARY');
  
  const issues: string[] = [];
  if (!healthOk) issues.push('Health Endpoint Unreachable');
  if (!schedulerOk) issues.push('Cloud Scheduler Issue');
  if (!data) issues.push('BigQuery Check Failed');
  if (!flowOk) issues.push('Pipeline Flow Issues');

  if (issues.length === 0) {
    log(GREEN + BOLD + 'OVERALL STATUS: HEALTHY ✅' + RESET);
    log('All systems operational.');
  } else {
    log(RED + BOLD + 'OVERALL STATUS: ISSUES DETECTED ❌' + RESET);
    issues.forEach(i => log(RED + `- ${i}` + RESET));
  }

  // Save report
  const reportDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir);
  }
  
  const dateStr = new Date().toISOString().split('T')[0];
  const reportFile = path.join(reportDir, `ingestion-health-${dateStr}.txt`);
  
  // Strip ANSI codes for file output
  const cleanLog = logBuffer.replace(/\x1b\[[0-9;]*m/g, '');
  fs.writeFileSync(reportFile, cleanLog);
  log(`\nReport saved to: ${reportFile}`);
  
  if (issues.length > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

