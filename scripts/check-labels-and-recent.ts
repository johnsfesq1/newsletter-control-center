/**
 * Check for labels and recent emails
 */

import * as dotenv from 'dotenv';
import { getGmail } from '../src/lib/gmail';

dotenv.config();

async function checkLabelsAndRecent() {
  const gmail = getGmail('legacy');
  
  console.log('🔍 Checking Gmail setup...\n');
  
  // Check labels
  const labels = await gmail.users.labels.list({ userId: 'me' });
  console.log('📋 Labels in this account:');
  const labelNames = labels.data.labels?.map(l => l.name) || [];
  labelNames.forEach(name => {
    if (name.toLowerCase().includes('nsm') || name.toLowerCase().includes('international')) {
      console.log(`   ✅ ${name}`);
    }
  });
  
  if (!labelNames.some(n => n.toLowerCase().includes('nsm'))) {
    console.log('   (No labels found with "nsm" or "international")\n');
  }
  
  // Check recent emails in inbox
  console.log('\n📧 Recent emails in inbox (last 10):');
  const recent = await gmail.users.messages.list({
    userId: 'me',
    q: 'in:inbox newer_than:1d',
    maxResults: 10
  });
  
  if (recent.data.messages && recent.data.messages.length > 0) {
    console.log(`   Found ${recent.data.messages.length} recent emails`);
    for (const msg of recent.data.messages.slice(0, 5)) {
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Delivered-To']
      });
      
      const from = fullMsg.data.payload?.headers?.find(h => h.name === 'From')?.value || 'unknown';
      const to = fullMsg.data.payload?.headers?.find(h => h.name === 'To')?.value || 'unknown';
      const deliveredTo = fullMsg.data.payload?.headers?.find(h => h.name === 'Delivered-To')?.value || to;
      
      console.log(`   - From: ${from}`);
      console.log(`     To: ${to}`);
      console.log(`     Delivered-To: ${deliveredTo}\n`);
    }
  } else {
    console.log('   No recent emails found\n');
  }
  
  console.log('\n💡 If nsm@internationalintrigue.io is a different Gmail account,');
  console.log('   you may need to authenticate with that account instead.\n');
}

checkLabelsAndRecent()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

