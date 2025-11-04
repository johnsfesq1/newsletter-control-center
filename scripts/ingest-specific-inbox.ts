/**
 * Ingest emails from a specific inbox (email address)
 * Then chunk and update publishers
 */

import * as dotenv from 'dotenv';
import { getGmail } from '../src/lib/gmail';
import type { gmail_v1 } from 'googleapis';

dotenv.config();

const TARGET_INBOX = 'nsm@internationalintrigue.io';

async function ingestSpecificInbox() {
  console.log(`📥 Ingesting emails from inbox: ${TARGET_INBOX}\n`);

  try {
    // Use the existing ingestion script but with a custom query filter
    // The Gmail query will filter for emails TO this address
    const gmail = getGmail('legacy'); // or 'clean' depending on which inbox
    
    // Gmail search query: emails TO the specific address
    const query = `to:${TARGET_INBOX} in:inbox`;
    
    console.log(`   Search query: ${query}\n`);
    
    // Get message count estimate
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 1
    });
    
    const totalEstimate = listRes.data.resultSizeEstimate || 0;
    console.log(`   Estimated messages: ${totalEstimate}\n`);
    
    if (totalEstimate === 0) {
      console.log('⚠️  No messages found for this inbox.\n');
      return;
    }
    
    // Now run the normal ingestion process with this query
    // We'll need to modify the ingestion script to accept a custom query
    // For now, let's use environment variable to pass the query
    process.env.GMAIL_INGESTION_QUERY = query;
    
    console.log('✅ Setting up ingestion query...\n');
    console.log('   Now running standard ingestion process...\n');
    
    // Import and run the ingestion script
    const { spawn } = require('child_process');
    const ingestProcess = spawn('npx', ['tsx', 'scripts/ingest-to-bigquery.ts'], {
      env: { ...process.env, GMAIL_INGESTION_QUERY: query },
      stdio: 'inherit'
    });
    
    ingestProcess.on('close', (code: number) => {
      if (code === 0) {
        console.log('\n✅ Ingestion complete!');
        console.log('\n   Next: Running chunking and publisher update...\n');
        
        // Run chunking
        const chunkProcess = spawn('npx', ['tsx', 'scripts/process-newsletters.ts'], {
          stdio: 'inherit'
        });
        
        chunkProcess.on('close', (chunkCode: number) => {
          if (chunkCode === 0) {
            console.log('\n✅ Chunking complete!');
            console.log('\n   Next: Updating publishers list...\n');
            
            // Update publishers
            const publisherProcess = spawn('npx', ['tsx', 'scripts/publishers/extract-existing-publishers.ts'], {
              stdio: 'inherit'
            });
            
            publisherProcess.on('close', (pubCode: number) => {
              if (pubCode === 0) {
                console.log('\n✅ All done! Publishers updated.\n');
              } else {
                console.error('\n❌ Publisher update failed');
              }
            });
          } else {
            console.error('\n❌ Chunking failed');
          }
        });
      } else {
        console.error('\n❌ Ingestion failed');
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Actually, let's modify the ingestion script to accept a query parameter
// Or create a simpler wrapper that does all three steps

ingestSpecificInbox()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

