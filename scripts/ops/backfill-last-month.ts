import { execSync } from 'child_process';

/**
 * BACKFILL SCRIPT
 * 
 * Goals:
 * 1. Ingest emails from last 30 days
 * 2. Support both inboxes
 * 3. Apply "Ingested" labels (requires READONLY=false)
 * 4. Loop to handle pagination/limits
 * 5. Trigger processing
 */

const BATCH_SIZE = 100; // Safe batch size
const MAX_LOOPS = 20;   // Prevent infinite loops (2000 emails max per inbox)
const INBOXES = ['me', 'other'];
const QUERY = 'newer_than:30d -label:Ingested';

function runCommand(cmd: string): string {
  // Clone env to modify it
  const env = { ...process.env };
  
  // Remove credentials file path to force fallback to ADC (which is working)
  delete env.GOOGLE_APPLICATION_CREDENTIALS;
  
  // Set required overrides
  env.GMAIL_READONLY = 'false';
  env.GMAIL_QUERY = QUERY;
  env.GMAIL_MARK_READ = 'false'; // Keep read status as is

  try {
    return execSync(cmd, { 
      encoding: 'utf8', 
      stdio: 'pipe', // Capture output to parse
      env: env
    });
  } catch (error: any) {
    console.error('Command failed:', error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    throw error;
  }
}

async function backfillInbox(inbox: string, dryRun: boolean) {
  console.log(`\n📥 Starting backfill for inbox: ${inbox}`);
  console.log(`   Query: "${QUERY}"`);
  console.log(`   Batch Size: ${BATCH_SIZE}`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (Preview)' : 'LIVE (Execution)'}`);

  let totalIngested = 0;
  let loopCount = 0;

  while (loopCount < MAX_LOOPS) {
    loopCount++;
    console.log(`\n--- Batch ${loopCount} ---`);

    const cmd = `npm run ingest:gmail -- --inbox ${inbox} --limit ${BATCH_SIZE} ${dryRun ? '--dry-run' : '--no-dry-run'}`;
    const output = runCommand(cmd);

    // Parse output to see what happened
    console.log(output);

    // Extract metrics from output
    const ingestedMatch = output.match(/New emails ingested: (\d+)/);
    const ingestedCount = ingestedMatch ? parseInt(ingestedMatch[1], 10) : 0;

    const labeledMatch = output.match(/Gmail labels applied: (\d+)/);
    const labeledCount = labeledMatch ? parseInt(labeledMatch[1], 10) : 0;
    
    totalIngested += ingestedCount;

    // Stop conditions
    if (ingestedCount === 0) {
      const fetchedMatch = output.match(/Gmail: fetched (\d+) messages/);
      const fetchedCount = fetchedMatch ? parseInt(fetchedMatch[1], 10) : 0;
      
      if (fetchedCount === 0) {
         console.log(`\n✅ No more matching emails found in Gmail.`);
         break;
      }

      if (fetchedCount > 0 && ingestedCount === 0) {
         if (labeledCount > 0) {
            console.log(`\n🔄 Batch labeled ${labeledCount} messages (0 ingested). Continuing to next batch...`);
            continue;
         }
         console.log(`\n⚠️  Fetched ${fetchedCount} messages but ingested 0 and labeled 0.`);
         console.log(`   Assuming backfill complete OR labeling failed.`);
         break;
      }
    }
    
    if (dryRun) {
      console.log(`\nℹ️  Dry run batch complete. Stopping loop to prevent spamming logs.`);
      break;
    }
  }

  console.log(`\n🏁 Finished backfill for ${inbox}. Total new emails: ${totalIngested}`);
  return totalIngested;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('=== BACKFILL LAST 30 DAYS ===');
  if (dryRun) {
    console.log('⚠️  RUNNING IN PREVIEW MODE');
    console.log('   Run with --execute to actually ingest and label emails.');
  }

  let grandTotal = 0;

  for (const inbox of INBOXES) {
    try {
      grandTotal += await backfillInbox(inbox, dryRun);
    } catch (err: any) {
      console.error(`❌ Failed processing inbox ${inbox}:`, err.message);
    }
  }

  console.log('\n================================');
  console.log(`GRAND TOTAL INGESTED: ${grandTotal}`);
  
  if (!dryRun && grandTotal > 0) {
    console.log('\n🚀 Triggering processing pipeline...');
    try {
      // Step 2: Chunk
      console.log('\nrunning: npm run process:chunks:run');
      runCommand('npm run process:chunks:run');

      // Step 3: Embed
      console.log('\nrunning: npm run process:embeddings:run');
      runCommand('npm run process:embeddings:run');
      
      console.log('\n✅ Pipeline complete.');
    } catch (err) {
      console.error('❌ Processing failed:', err);
    }
  } else if (!dryRun) {
    console.log('\nNo new emails to process.');
  }
}

if (require.main === module) {
  main().catch(console.error);
}
