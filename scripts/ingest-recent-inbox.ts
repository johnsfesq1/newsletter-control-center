/**
 * Ingest recent emails from inbox (last 24-48 hours)
 * Useful for new subscriptions
 */

import * as dotenv from 'dotenv';
import { spawn } from 'child_process';

dotenv.config();

async function runCommand(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    console.log(`\n▶️  Running: ${command} ${args.join(' ')}\n`);
    
    const childProcess = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: 'inherit',
      shell: true
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve(0);
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });
    
    childProcess.on('error', (error) => {
      reject(error);
    });
  });
}

async function ingestRecentInbox() {
  console.log('🚀 Quick ingestion: Recent inbox emails (last 48 hours)\n');
  console.log('This will:');
  console.log('  1. Ingest emails from last 48 hours');
  console.log('  2. Chunk the messages');
  console.log('  3. Update publishers list\n');
  
  try {
    // Step 1: Ingest recent emails (last 48 hours)
    console.log('📥 Step 1: Ingesting recent emails (last 48 hours)...\n');
    
    // Search for emails from last 48 hours
    const query = 'in:inbox newer_than:2d';
    
    console.log(`   Search query: ${query}\n`);
    
    await runCommand('npx', ['tsx', 'scripts/ingest-to-bigquery.ts'], {
      GMAIL_INGESTION_QUERY: query
    });
    
    console.log('\n✅ Step 1 complete: Emails ingested\n');
    
    // Step 2: Chunk messages
    console.log('📦 Step 2: Chunking messages...\n');
    
    await runCommand('npx', ['tsx', 'scripts/process-newsletters.ts'], {});
    
    console.log('\n✅ Step 2 complete: Messages chunked\n');
    
    // Step 3: Update publishers
    console.log('👥 Step 3: Updating publishers list...\n');
    
    await runCommand('npx', ['tsx', 'scripts/publishers/extract-existing-publishers.ts'], {});
    
    console.log('\n✅ Step 3 complete: Publishers updated\n');
    
    console.log('🎉 All done! Recent emails ingested, chunked, and publishers updated.\n');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error('\n   The process may have partially completed.');
    console.error('   Check the output above to see which step failed.\n');
    process.exit(1);
  }
}

ingestRecentInbox()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

