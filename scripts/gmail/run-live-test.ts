import 'dotenv/config';
import { execSync } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const REGION = process.env.NCC_REGION || 'us-central1';

interface Args {
  inbox: 'me' | 'other';
  limit?: number;
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

function extractMetrics(logText: string): {
  inserted_messages: number;
  already_present: number;
  labels_inserted: number;
  already_labeled: number;
  marked_read: number;
  errors: string[];
} {
  const metrics = {
    inserted_messages: 0,
    already_present: 0,
    labels_inserted: 0,
    already_labeled: 0,
    marked_read: 0,
    errors: [] as string[],
  };

  // Extract from RECONCILE SUMMARY or similar patterns
  const insertedMatch = logText.match(/New emails ingested:\s*(\d+)/i);
  if (insertedMatch) {
    metrics.inserted_messages = parseInt(insertedMatch[1], 10);
  }

  const skippedMatch = logText.match(/Existing emails skipped:\s*(\d+)/i);
  if (skippedMatch) {
    metrics.already_present = parseInt(skippedMatch[1], 10);
  }

  const labelsMatch = logText.match(/New labels applied:\s*(\d+)/i);
  if (labelsMatch) {
    metrics.labels_inserted = parseInt(labelsMatch[1], 10);
  }

  // Extract Gmail API results
  const labeledMatch = logText.match(/Gmail labels applied:\s*(\d+)/i);
  if (labeledMatch) {
    metrics.labels_inserted = parseInt(labeledMatch[1], 10);
  }

  const alreadyLabeledMatch = logText.match(/\((\d+)\s+already had label\)/i);
  if (alreadyLabeledMatch) {
    metrics.already_labeled = parseInt(alreadyLabeledMatch[1], 10);
  }

  const markedReadMatch = logText.match(/Messages marked read:\s*(\d+)/i);
  if (markedReadMatch) {
    metrics.marked_read = parseInt(markedReadMatch[1], 10);
  }

  // Extract errors
  const errorLines = logText.match(/Error[^:]*:\s*[^\n]+/gi) || [];
  metrics.errors = errorLines.filter((e: string) => 
    !e.includes('dry-run') && 
    !e.includes('dry run') &&
    !e.includes('DRY RUN')
  );

  return metrics;
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('inbox', {
      type: 'string',
      choices: ['me', 'other'],
      demandOption: true,
      describe: 'Inbox type (me or other)',
    })
    .option('limit', {
      type: 'number',
      default: 25,
      describe: 'Message limit (default: 25)',
    })
    .parseAsync() as Args;

  const jobName = `ncc-ingest-${argv.inbox}`;
  const limit = argv.limit || 25;

  console.log(`\n=== Running Live Test: ${argv.inbox.toUpperCase()} ===\n`);
  console.log(`Job: ${jobName}`);
  console.log(`Limit: ${limit}\n`);

  // Execute job
  console.log('Executing job...');
  const execCmd = `gcloud run jobs execute ${jobName} --region=${REGION} --project=${PROJECT} --args="dist/scripts/ingest-gmail.js,--inbox,${argv.inbox},--limit,${limit},--no-dry-run" --wait --format=json`;
  const execResult = shell(execCmd, true);

  if (!execResult.success) {
    console.error('❌ FAIL: Job execution failed');
    console.error(execResult.output);
    process.exit(1);
  }

  // Parse execution result
  let execName: string | null = null;
  try {
    const execData = JSON.parse(execResult.output);
    if (execData.metadata?.name) {
      execName = execData.metadata.name.split('/').pop() || null;
    }
  } catch {
    // Try to get from list
    const listCmd = `gcloud run jobs executions list --job=${jobName} --region=${REGION} --project=${PROJECT} --format=json --limit=1`;
    const listResult = shell(listCmd, true);
    if (listResult.success) {
      try {
        const executions = JSON.parse(listResult.output);
        if (executions && executions.length > 0 && executions[0].name) {
          execName = executions[0].name.split('/').pop() || null;
        }
      } catch {}
    }
  }

  if (!execName) {
    console.error('❌ FAIL: Cannot find execution name');
    process.exit(1);
  }

  console.log(`Execution: ${execName}\n`);

  // Wait for logs
  console.log('Waiting for logs...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Fetch logs
  const logCmd = `gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${jobName} AND resource.labels.execution_name=${execName}" --limit=500 --format="value(textPayload)" --project=${PROJECT}`;
  const logResult = shell(logCmd, true);

  if (!logResult.success || !logResult.output) {
    console.error('❌ FAIL: Cannot fetch logs');
    console.error('Try: gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=' + jobName + '" --limit=100 --project=' + PROJECT);
    process.exit(1);
  }

  // Extract metrics
  const metrics = extractMetrics(logResult.output);

  // Print summary
  console.log('---');
  console.log('METRICS SUMMARY:');
  console.log('---');
  console.log(`inserted_messages: ${metrics.inserted_messages}`);
  console.log(`already_present: ${metrics.already_present}`);
  console.log(`labels_inserted: ${metrics.labels_inserted}`);
  console.log(`already_labeled: ${metrics.already_labeled}`);
  console.log(`marked_read: ${metrics.marked_read}`);
  
  if (metrics.errors.length > 0) {
    console.log(`\nerrors: ${metrics.errors.length}`);
    metrics.errors.slice(0, 5).forEach((err: string) => {
      console.log(`  - ${err.substring(0, 100)}`);
    });
  } else {
    console.log(`\nerrors: 0`);
  }
  console.log('---\n');

  // Check for permission errors
  const hasPermissionError = logResult.output.includes('Insufficient Permission') || 
                             logResult.output.includes('403') ||
                             logResult.output.includes('Forbidden');

  if (hasPermissionError) {
    console.log('❌ FAIL: Gmail permission errors detected');
    console.log('Check token scopes - tokens need gmail.modify scope');
    process.exit(1);
  }

  if (metrics.inserted_messages === 0 && metrics.already_present === 0) {
    console.log('⚠ WARNING: No messages processed (may be no unread emails)');
  }

  console.log('✅ PASS: Job completed successfully');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

