/**
 * Quick ingestion script for specific inbox
 * Ingests, chunks, and updates publishers in one go
 */

import * as dotenv from 'dotenv';
import { spawn } from 'child_process';
import { promisify } from 'util';

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

async function ingestAndChunkInbox() {
  console.log('🚀 Quick ingestion: CLEAN inbox (nsm@internationalintrigue.io)\n');
  console.log('This will:');
  console.log('  1. Ingest emails from CLEAN inbox (nsm@internationalintrigue.io)');
  console.log('  2. Chunk the messages');
  console.log('  3. Update publishers list\n');
  
  try {
    // Step 1: Ingest emails from the CLEAN inbox
    console.log('📥 Step 1: Ingesting emails from CLEAN inbox (nsm@internationalintrigue.io)...\n');
    
    // Use clean inbox (GMAIL_INBOX=clean)
    await runCommand('npx', ['tsx', 'scripts/ingest-to-bigquery.ts'], {
      GMAIL_INBOX: 'clean'
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
    
    console.log('🎉 All done! Inbox ingested, chunked, and publishers updated.\n');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error('\n   The process may have partially completed.');
    console.error('   Check the output above to see which step failed.\n');
    process.exit(1);
  }
}

ingestAndChunkInbox()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

