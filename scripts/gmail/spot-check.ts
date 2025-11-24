import 'dotenv/config';
import { getGmail } from '../../src/gmail/client';
import type { gmail_v1 } from 'googleapis';

async function spotCheck(inbox: 'me' | 'other'): Promise<void> {
  console.log(`\n=== Spot-checking ${inbox.toUpperCase()} inbox ===\n`);

  let gmail: gmail_v1.Gmail;
  try {
    gmail = await getGmail(inbox);
  } catch (error: any) {
    console.error(`❌ Failed to get Gmail client: ${error.message}`);
    return;
  }

  // Get labels map
  let labelsRes;
  try {
    labelsRes = await gmail.users.labels.list({ userId: 'me' });
  } catch (error: any) {
    console.error(`❌ Failed to list labels: ${error.message}`);
    return;
  }

  const labelsMap = new Map<string, string>();
  if (labelsRes.data.labels) {
    for (const label of labelsRes.data.labels) {
      if (label.id && label.name) {
        labelsMap.set(label.id, label.name);
      }
    }
  }

  // Get query from env (same as ingest job uses)
  const query = process.env.GMAIL_QUERY || 'is:unread';
  
  // List messages from last 60 minutes
  // Gmail query doesn't support time-based filtering directly, so we'll fetch recent and filter
  let listRes;
  try {
    listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 10,
    });
  } catch (error: any) {
    console.error(`❌ Failed to list messages: ${error.message}`);
    return;
  }

  const messageIds = (listRes.data.messages || []).map(m => m.id!).filter(Boolean);
  console.log(`Found ${messageIds.length} messages matching query: ${query}`);

  if (messageIds.length === 0) {
    console.log('No messages to check.\n');
    return;
  }

  // Get message details
  const now = Date.now();
  const sixtyMinutesAgo = now - 60 * 60 * 1000;
  let checked = 0;
  let recentCount = 0;

  for (const messageId of messageIds) {
    try {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['Subject', 'Date'],
      });

      const msg = msgRes.data;
      const internalDate = msg.internalDate ? parseInt(msg.internalDate) : 0;
      
      // Only check messages from last 60 minutes
      if (internalDate < sixtyMinutesAgo) {
        continue;
      }

      recentCount++;
      checked++;

      const subjectHeader = msg.payload?.headers?.find(h => h.name === 'Subject');
      const subject = subjectHeader?.value || '(no subject)';
      const labelIds = msg.labelIds || [];
      const labelNames = labelIds.map(id => labelsMap.get(id) || id).filter(Boolean);

      console.log(`\nMessage ${checked}:`);
      console.log(`  ID: ${messageId}`);
      console.log(`  Subject: ${subject}`);
      console.log(`  Labels: ${labelNames.join(', ') || '(none)'}`);
      console.log(`  Label IDs: ${labelIds.join(', ')}`);

      // Check for processed label
      const processedLabel = process.env.GMAIL_PROCESSED_LABEL || 'processed';
      const hasProcessedLabel = labelNames.some(name => 
        name.toLowerCase().includes(processedLabel.toLowerCase())
      ) || labelIds.some(id => labelsMap.get(id)?.toLowerCase().includes(processedLabel.toLowerCase()));

      // Check for read state (UNREAD label absence)
      const isRead = !labelIds.includes('UNREAD');

      console.log(`  Has processed label: ${hasProcessedLabel ? '✅ YES' : '❌ NO'}`);
      console.log(`  Is read: ${isRead ? '✅ YES' : '❌ NO'}`);

      if (checked >= 10) break;
    } catch (error: any) {
      console.error(`  ⚠️  Failed to get message ${messageId}: ${error.message}`);
    }
  }

  if (recentCount === 0) {
    console.log('\n⚠️  No messages found in the last 60 minutes.');
    console.log('   Note: Gmail query may not return recent messages immediately.');
  }

  console.log(`\nChecked ${recentCount} recent message(s) out of ${messageIds.length} total.\n`);
}

async function main(): Promise<void> {
  const inboxes: Array<'me' | 'other'> = ['me', 'other'];

  for (const inbox of inboxes) {
    await spotCheck(inbox);
  }

  console.log('\n=== Summary ===');
  console.log('Expected behavior:');
  console.log('  - Messages should have the "processed" label (or label matching GMAIL_PROCESSED_LABEL)');
  console.log('  - Messages should be marked as read (UNREAD label removed)');
  console.log('\nNote: Marked-as-read messages are removed from Inbox view.');
  console.log('      Check "All Mail" or search by label: label:<processed_label_name>');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

