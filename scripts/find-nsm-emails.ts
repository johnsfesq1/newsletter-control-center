/**
 * Find emails to nsm@internationalintrigue.io
 * Check various search strategies
 */

import * as dotenv from 'dotenv';
import { getGmail } from '../src/lib/gmail';

dotenv.config();

const TARGET_EMAIL = 'nsm@internationalintrigue.io';

async function findNsmEmails() {
  const gmail = getGmail('legacy');
  
  console.log(`🔍 Finding emails for: ${TARGET_EMAIL}\n`);
  
  // Check which account we're connected to
  const profile = await gmail.users.getProfile({ userId: 'me' });
  console.log(`📧 Connected to Gmail account: ${profile.data.emailAddress}\n`);
  
  // Try various search queries
  const queries = [
    `to:${TARGET_EMAIL}`,
    `to:${TARGET_EMAIL} in:inbox`,
    `to:${TARGET_EMAIL} -in:trash -in:spam`,
    `deliveredto:${TARGET_EMAIL}`,
    `"${TARGET_EMAIL}"`,
    `to:${TARGET_EMAIL} newer_than:7d`, // Last week
    `to:${TARGET_EMAIL} newer_than:1d`, // Last 24 hours
  ];
  
  console.log('Trying different search queries:\n');
  
  for (const query of queries) {
    try {
      const res = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 5
      });
      
      const count = res.data.resultSizeEstimate || 0;
      const messages = res.data.messages || [];
      
      console.log(`   "${query}": ${count.toLocaleString()} messages`);
      
      if (messages.length > 0) {
        console.log(`      ✅ Found ${messages.length} messages! Sample message IDs:`);
        messages.slice(0, 3).forEach((msg, i) => {
          console.log(`         ${i + 1}. ${msg.id}`);
        });
      }
    } catch (error: any) {
      console.log(`   "${query}": ERROR - ${error.message}`);
    }
  }
  
  console.log('\n💡 If emails were found, we can use that query for ingestion.\n');
}

findNsmEmails()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

