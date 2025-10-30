import * as dotenv from 'dotenv';
import { getGmail, extractEmailAddress } from '../src/lib/gmail';
import vipConfig from '../config/vip.json';

dotenv.config();

interface MessageData {
  id: string;
  from: string;
  fromEmail: string;
  subject: string;
  dateISO: string;
}

function isVip(fromEmail: string): boolean {
  // Check if email exactly matches any VIP sender
  if (vipConfig.senders.includes(fromEmail)) {
    return true;
  }
  
  // Check if domain matches any VIP domain
  const domain = fromEmail.split('@')[1]?.toLowerCase();
  if (domain && vipConfig.domains.includes(domain)) {
    return true;
  }
  
  return false;
}

(async () => {
  try {
    const gmail = getGmail();
    
    // Get recent messages
    const listRes = await gmail.users.messages.list({ 
      userId: 'me', 
      q: 'newer_than:1d', 
      maxResults: 100 
    });
    
    const messageIds = listRes.data.messages || [];
    console.log(`Processing ${messageIds.length} messages...`);
    
    const vip: MessageData[] = [];
    const nonVip: MessageData[] = [];
    
    // Process each message
    for (const msg of messageIds) {
      const metaRes = await gmail.users.messages.get({ 
        userId: 'me', 
        id: msg.id!, 
        format: 'metadata', 
        metadataHeaders: ['From', 'Subject', 'Date'] 
      });
      
      const headers = metaRes.data.payload?.headers || [];
      const fromHeader = headers.find(h => h.name === 'From')?.value || '';
      const subjectHeader = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const dateHeader = headers.find(h => h.name === 'Date')?.value || '';
      
      const fromEmail = extractEmailAddress(fromHeader);
      let dateISO = '';
      try {
        dateISO = new Date(dateHeader).toISOString();
      } catch {
        dateISO = '';
      }
      
      const messageData: MessageData = {
        id: msg.id!,
        from: fromHeader,
        fromEmail,
        subject: subjectHeader,
        dateISO
      };
      
      if (isVip(fromEmail)) {
        vip.push(messageData);
      } else {
        nonVip.push(messageData);
      }
    }
    
    // Log summary
    console.log(`VIP: ${vip.length}  Non-VIP: ${nonVip.length}  Total: ${vip.length + nonVip.length}`);
    
    // Show VIP messages (up to 5)
    console.log('\nVIP messages:');
    vip.slice(0, 5).forEach(msg => {
      console.log(`VIP  | ${msg.fromEmail} | ${msg.subject}`);
    });
    
    // Show non-VIP messages (up to 5)
    console.log('\nNon-VIP messages:');
    nonVip.slice(0, 5).forEach(msg => {
      console.log(`REST | ${msg.fromEmail} | ${msg.subject}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error classifying recent messages:', error);
    process.exit(1);
  }
})();
