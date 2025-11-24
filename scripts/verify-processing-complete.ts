import 'dotenv/config';
import { getBigQuery } from '../src/bq/client';
import { execSync } from 'child_process';

const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const DATASET = process.env.BQ_DATASET || 'ncc_production';

async function main() {
  const bq = getBigQuery();
  console.log('🔍 Verifying Processing Pipeline State...\n');

  // 1. ROW COUNTS
  console.log('1. ROW COUNTS');
  console.log('----------------------------------------');
  
  const queries = {
    emails: `SELECT count(*) as c FROM \`${PROJECT}.${DATASET}.raw_emails\``,
    chunks: `SELECT count(*) as c FROM \`${PROJECT}.${DATASET}.chunks\``,
    embeddings: `SELECT count(*) as c FROM \`${PROJECT}.${DATASET}.chunk_embeddings\``,
    junk_chunks: `SELECT count(*) as c FROM \`${PROJECT}.${DATASET}.chunks\` WHERE is_junk = TRUE`
  };

  const results: any = {};
  for (const [key, query] of Object.entries(queries)) {
    const [rows] = await bq.query(query);
    results[key] = rows[0].c;
  }

  const baseline = {
    emails: 74916,
    chunks: 1010720,
    embeddings: 956015
  };

  console.log(`Metric          | Current     | Baseline    | Delta`);
  console.log(`----------------|-------------|-------------|-------------`);
  console.log(`raw_emails      | ${results.emails.toString().padEnd(11)} | ${baseline.emails.toString().padEnd(11)} | +${results.emails - baseline.emails}`);
  console.log(`chunks          | ${results.chunks.toString().padEnd(11)} | ${baseline.chunks.toString().padEnd(11)} | +${results.chunks - baseline.chunks}`);
  console.log(`chunk_embeddings| ${results.embeddings.toString().padEnd(11)} | ${baseline.embeddings.toString().padEnd(11)} | +${results.embeddings - baseline.embeddings}`);
  console.log(`junk_chunks     | ${results.junk_chunks.toString().padEnd(11)} | N/A         | N/A`);
  console.log('');

  // 2. PIPELINE COVERAGE (Gaps)
  console.log('2. PIPELINE COVERAGE (Gaps)');
  console.log('----------------------------------------');

  // Unchunked Emails (orphans)
  const unchunkedQuery = `
    SELECT count(*) as c
    FROM \`${PROJECT}.${DATASET}.raw_emails\` e
    LEFT JOIN \`${PROJECT}.${DATASET}.chunks\` c ON e.gmail_message_id = c.gmail_message_id
    WHERE c.chunk_id IS NULL
  `;
  const [unchunkedRows] = await bq.query(unchunkedQuery);
  const unchunkedCount = unchunkedRows[0].c;

  // Unembedded Chunks (valid only, handle potential NULL is_junk)
  const unembeddedQuery = `
    SELECT count(*) as c
    FROM \`${PROJECT}.${DATASET}.chunks\` c
    LEFT JOIN \`${PROJECT}.${DATASET}.chunk_embeddings\` e ON c.chunk_id = e.chunk_id
    WHERE e.chunk_id IS NULL 
    AND (c.is_junk = FALSE OR c.is_junk IS NULL)
  `;
  const [unembeddedRows] = await bq.query(unembeddedQuery);
  const unembeddedCount = unembeddedRows[0].c;

  console.log(`Emails awaiting chunking:   ${unchunkedCount > 0 ? `❌ ${unchunkedCount}` : '✅ 0'}`);
  console.log(`Chunks awaiting embedding:  ${unembeddedCount > 0 ? `❌ ${unembeddedCount}` : '✅ 0'}`);
  
  // New Data Coverage (Last 24h)
  const newEmailsQuery = `
    SELECT count(*) as c
    FROM \`${PROJECT}.${DATASET}.raw_emails\`
    WHERE ingested_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
  `;
  const [newEmailRows] = await bq.query(newEmailsQuery);
  const newEmailCount = newEmailRows[0].c;
  console.log(`Newly ingested emails (24h): ${newEmailCount}`);
  console.log('');

  // 3. RECENT ACTIVITY
  console.log('3. RECENT ACTIVITY');
  console.log('----------------------------------------');
  // Get latest timestamps
  const timestampsQuery = `
    SELECT 
      MAX(ingested_at) as last_email,
      (SELECT MAX(ingested_at) FROM \`${PROJECT}.${DATASET}.raw_emails\` e JOIN \`${PROJECT}.${DATASET}.chunks\` c ON e.gmail_message_id = c.gmail_message_id) as last_chunk_source,
      (SELECT MAX(created_at) FROM \`${PROJECT}.${DATASET}.chunk_embeddings\`) as last_embedding
    FROM \`${PROJECT}.${DATASET}.raw_emails\`
  `;
  // Note: chunks doesn't typically store created_at, so we approximate by source email or separate audit. 
  // Actually, checking if we have chunks for the LATEST email is a good proxy.
  
  const [tsRows] = await bq.query(timestampsQuery);
  console.log(`Latest Email Ingested:    ${tsRows[0].last_email ? new Date(tsRows[0].last_email.value).toLocaleString() : 'N/A'}`);
  console.log(`Latest Embedding Created: ${tsRows[0].last_embedding ? new Date(tsRows[0].last_embedding.value).toLocaleString() : 'N/A'}`);
  console.log('');

  // 4. CLOUD RUN JOB STATUS
  console.log('4. CLOUD RUN JOB STATUS');
  console.log('----------------------------------------');
  
  function checkJob(jobName: string) {
    try {
      const cmd = `gcloud run jobs executions list --job=${jobName} --region=${process.env.NCC_REGION || 'us-central1'} --limit=1 --format="value(status.state,createTime,status.completionTime)"`;
      const output = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      
      // gcloud output with value(...) often separates fields by tabs.
      // If completionTime is empty, it might just be missing from the split or be an empty string.
      const parts = output.split(/\t+/); 
      const state = parts[0];
      const createTime = parts[1];
      const completionTime = parts[2]; // might be undefined or empty string
      
      // Check if currently running
      // If running, completionTime is undefined/empty AND state is not SUCCEEDED/FAILED
      const isRunning = !completionTime && (state === 'EXECUTION_STATE_UNSPECIFIED' || state === 'RUNNING' || state === 'PENDING'); 
      
      // For display
      const lastRun = new Date(createTime);
      const validDate = !isNaN(lastRun.getTime()) ? lastRun.toLocaleString() : 'Unknown';

      console.log(`${jobName.padEnd(20)}: ${state} (Last: ${validDate}) ${isRunning ? '🏃 RUNNING' : '✅ DONE'}`);
      return isRunning;
    } catch (err) {
      console.log(`${jobName.padEnd(20)}: ❓ Unknown (Could not query status)`);
      return false;
    }
  }

  const chunksRunning = checkJob('ncc-chunks');
  const embeddingsRunning = checkJob('ncc-embeddings');
  console.log('');

  // 5. SUMMARY & RECOMMENDATION
  console.log('5. VERIFICATION SUMMARY');
  console.log('----------------------------------------');
  
  const allProcessed = unchunkedCount === 0 && unembeddedCount === 0;
  const jobsFinished = !chunksRunning && !embeddingsRunning;
  const dataVariance = Math.abs(results.emails - (baseline.emails + newEmailCount)) < 50; // Allow small variance

  console.log(`Data Consistency: ${dataVariance ? '✅ PASS' : '⚠️  VARIANCE DETECTED'} (Expected ~${baseline.emails + newEmailCount}, Got ${results.emails})`);
  console.log(`Pipeline Clear:   ${allProcessed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Jobs Idle:        ${jobsFinished ? '✅ PASS' : '⏳ WAITING'}`);
  
  console.log('\n----------------------------------------');
  if (allProcessed && jobsFinished) {
    console.log('✅ READY to build vector search index.');
    console.log('   The pipeline is clear and all new data is embedded.');
  } else {
    console.log('🛑 WAIT - Processing still in progress or incomplete.');
    console.log('   Please run processing jobs again or wait for them to finish.');
    console.log('   Commands:');
    if (unchunkedCount > 0) console.log('   - npm run process:chunks:run');
    if (unembeddedCount > 0) console.log('   - npm run process:embeddings:run');
  }
}

main().catch(console.error);

