import 'dotenv/config';
import { execSync } from 'child_process';
import { getGmail } from '../../src/gmail/client';
import type { gmail_v1 } from 'googleapis';

const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const REGION = process.env.NCC_REGION || 'us-central1';
const PROCESSED_LABEL = process.env.GMAIL_PROCESSED_LABEL || 'Ingested';
// Use the exact query that jobs use (from deploy-jobs.ts)
const JOB_QUERY = 'is:unread -label:Ingested';

interface JobMetrics {
  fetched?: number;
  inserted?: number;
  labeled?: number;
  markedRead?: number;
  errors: string[];
}

interface MessageState {
  id: string;
  hasProcessedLabel: boolean;
  isRead: boolean;
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

function extractMetrics(logText: string): JobMetrics {
  const metrics: JobMetrics = { errors: [] };
  
  // Extract fetched count
  const fetchedMatch = logText.match(/Gmail:\s*fetched\s+(\d+)\s+messages/i);
  if (fetchedMatch) {
    metrics.fetched = parseInt(fetchedMatch[1], 10);
  }
  
  // Extract inserted count
  const insertedMatch = logText.match(/inserted_raw=(\d+)/i) || logText.match(/inserted\s+(\d+)\s+messages/i);
  if (insertedMatch) {
    metrics.inserted = parseInt(insertedMatch[1], 10);
  }
  
  // Extract labeled count
  const labeledMatch = logText.match(/labeled=(\d+)/i);
  if (labeledMatch) {
    metrics.labeled = parseInt(labeledMatch[1], 10);
  }
  
  // Extract marked_read count
  const markedReadMatch = logText.match(/marked_read=(\d+)/i);
  if (markedReadMatch) {
    metrics.markedRead = parseInt(markedReadMatch[1], 10);
  }
  
  // Extract errors
  const errorLines = logText.split('\n').filter(line => 
    line.toLowerCase().includes('error') && 
    !line.toLowerCase().includes('no error')
  );
  metrics.errors = errorLines.slice(0, 5);
  
  return metrics;
}

async function getMessageIdsBefore(inbox: 'me' | 'other'): Promise<string[]> {
  const gmail = await getGmail(inbox);
  const query = `${JOB_QUERY} newer_than:1d`;
  
  try {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 10,
    });
    
    const messageIds = (listRes.data.messages || [])
      .map(m => m.id!)
      .filter(Boolean);
    
    return messageIds;
  } catch (error: any) {
    console.error(`Failed to fetch messages for ${inbox}: ${error.message}`);
    return [];
  }
}

async function getMessageStates(inbox: 'me' | 'other', messageIds: string[]): Promise<MessageState[]> {
  if (messageIds.length === 0) return [];
  
  const gmail = await getGmail(inbox);
  
  // Get labels map
  let labelsMap = new Map<string, string>();
  try {
    const labelsRes = await gmail.users.labels.list({ userId: 'me' });
    if (labelsRes.data.labels) {
      for (const label of labelsRes.data.labels) {
        if (label.id && label.name) {
          labelsMap.set(label.id, label.name);
        }
      }
    }
  } catch (error: any) {
    console.error(`Failed to list labels for ${inbox}: ${error.message}`);
  }
  
  const states: MessageState[] = [];
  
  for (const msgId of messageIds) {
    try {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: msgId,
        format: 'metadata',
      });
      
      const labelIds = msgRes.data.labelIds || [];
      const labelNames = labelIds.map(id => labelsMap.get(id) || '').filter(Boolean);
      
      const hasProcessedLabel = labelNames.some(name => 
        name.toLowerCase() === PROCESSED_LABEL.toLowerCase()
      );
      const isRead = !labelIds.includes('UNREAD');
      
      states.push({
        id: msgId,
        hasProcessedLabel,
        isRead,
      });
    } catch (error: any) {
      // Message might have been deleted or inaccessible
      console.error(`Failed to get message ${msgId}: ${error.message}`);
    }
  }
  
  return states;
}

async function executeJob(jobName: string, inbox: 'me' | 'other'): Promise<{ metrics: JobMetrics; execName: string | null }> {
  console.log(`Executing ${jobName}...`);
  
  // Get script path from job config
  const jobDescCmd = `gcloud run jobs describe ${jobName} --region=${REGION} --project=${PROJECT} --format=json`;
  const jobDesc = shell(jobDescCmd, true);
  
  let scriptPath = 'dist/scripts/ingest-gmail.js';
  if (jobDesc.success) {
    try {
      const jobData = JSON.parse(jobDesc.output);
      const containers = jobData.spec?.template?.spec?.template?.spec?.containers || [];
      const container = containers[0];
      const existingArgs = container?.args || [];
      if (existingArgs.length > 0) {
        scriptPath = existingArgs[0];
      }
    } catch {
      // Use default
    }
  }
  
  // Execute job
  const execCmd = `gcloud run jobs execute ${jobName} --region=${REGION} --project=${PROJECT} --args="${scriptPath},--no-dry-run,--limit=5,--inbox,${inbox}" --wait --format=json`;
  const execResult = shell(execCmd, true);
  
  if (!execResult.success) {
    const errorMsg = execResult.output;
    console.error(`  ❌ Execution failed: ${errorMsg.substring(0, 200)}`);
    return {
      metrics: { errors: [errorMsg] },
      execName: null,
    };
  }
  
  // Parse execution name
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
  
  // Wait for logs to appear
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Get logs
  const logFilter = execName
    ? `resource.type=cloud_run_job AND resource.labels.job_name=${jobName} AND resource.labels.execution_name=${execName}`
    : `resource.type=cloud_run_job AND resource.labels.job_name=${jobName}`;
  
  const logCmd = `gcloud logging read "${logFilter}" --limit=200 --format="value(textPayload)" --project=${PROJECT} --freshness=10m`;
  const logResult = shell(logCmd, true);
  
  const metrics = extractMetrics(logResult.output);
  
  return { metrics, execName };
}

async function verifyInbox(inbox: 'me' | 'other'): Promise<{
  metrics: JobMetrics;
  beforeStates: MessageState[];
  afterStates: MessageState[];
  changed: number;
}> {
  const jobName = `ncc-ingest-${inbox}`;
  
  // Step 1: Get message IDs before execution
  console.log(`\n[${inbox.toUpperCase()}] Fetching candidate messages...`);
  const messageIds = await getMessageIdsBefore(inbox);
  console.log(`  Found ${messageIds.length} candidate message(s)`);
  
  if (messageIds.length === 0) {
    console.log(`  ⚠️  No unread messages found matching query: ${JOB_QUERY} newer_than:1d`);
    return {
      metrics: { errors: [] },
      beforeStates: [],
      afterStates: [],
      changed: 0,
    };
  }
  
  // Step 2: Get initial state
  const beforeStates = await getMessageStates(inbox, messageIds);
  const unprocessedCount = beforeStates.filter(s => !s.hasProcessedLabel && !s.isRead).length;
  console.log(`  ${unprocessedCount} message(s) are unread and unprocessed`);
  
  // Step 3: Execute job
  const { metrics, execName } = await executeJob(jobName, inbox);
  console.log(`  Execution: ${execName || 'unknown'}`);
  if (metrics.fetched !== undefined) console.log(`  Fetched: ${metrics.fetched}`);
  if (metrics.inserted !== undefined) console.log(`  Inserted: ${metrics.inserted}`);
  if (metrics.labeled !== undefined) console.log(`  Labeled: ${metrics.labeled}`);
  if (metrics.markedRead !== undefined) console.log(`  Marked read: ${metrics.markedRead}`);
  if (metrics.errors.length > 0) {
    console.log(`  Errors: ${metrics.errors.length}`);
    metrics.errors.slice(0, 2).forEach(err => {
      const shortErr = err.length > 150 ? err.substring(0, 150) + '...' : err;
      console.log(`    - ${shortErr}`);
    });
  }
  
  // Step 4: Wait a bit for Gmail API to reflect changes
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Step 5: Get state after execution
  const afterStates = await getMessageStates(inbox, messageIds);
  
  // Step 6: Count changes
  const changed = afterStates.filter((after, idx) => {
    const before = beforeStates[idx];
    if (!before) return false;
    // Changed if: now has processed label (didn't before) OR now is read (wasn't before)
    return (!before.hasProcessedLabel && after.hasProcessedLabel) ||
           (!before.isRead && after.isRead);
  }).length;
  
  console.log(`  Changed: ${changed} message(s)`);
  
  return {
    metrics,
    beforeStates,
    afterStates,
    changed,
  };
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('VERIFY INGEST LIVE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Query: ${JOB_QUERY}`);
  console.log(`Processed Label: ${PROCESSED_LABEL}\n`);
  
  // Verify both inboxes
  const meResult = await verifyInbox('me');
  const otherResult = await verifyInbox('other');
  
  // Determine PASS/FAIL
  const meChanged = meResult.changed;
  const otherChanged = otherResult.changed;
  const meLabeled = meResult.metrics.labeled || 0;
  const otherLabeled = otherResult.metrics.labeled || 0;
  const meMarkedRead = meResult.metrics.markedRead || 0;
  const otherMarkedRead = otherResult.metrics.markedRead || 0;
  
  const passed = meChanged >= 1 && otherChanged >= 1;
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  if (passed) {
    console.log(`VERIFY: PASS (me: ${meLabeled} labeled/${meMarkedRead} marked, other: ${otherLabeled} labeled/${otherMarkedRead} marked)`);
  } else {
    let reason = '';
    if (meChanged === 0 && otherChanged === 0) {
      reason = 'No messages changed in either inbox';
    } else if (meChanged === 0) {
      reason = 'No messages changed in me inbox';
    } else {
      reason = 'No messages changed in other inbox';
    }
    
    // Add hints
    const hints: string[] = [];
    if (meResult.beforeStates.length === 0 && otherResult.beforeStates.length === 0) {
      hints.push('No unread messages found - check query or wait for new emails');
    }
    if (meLabeled === 0 && otherLabeled === 0) {
      hints.push('No labels applied - check token scope (gmail.modify), label name, or GMAIL_READONLY=false');
    }
    if (meMarkedRead === 0 && otherMarkedRead === 0) {
      hints.push('No messages marked read - check GMAIL_MARK_READ=true');
    }
    if (meResult.metrics.errors.length > 0 || otherResult.metrics.errors.length > 0) {
      hints.push('Job errors detected - check logs');
    }
    
    console.log(`VERIFY: FAIL (reason: ${reason}${hints.length > 0 ? '; ' + hints.join('; ') : ''})`);
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  process.exit(passed ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

