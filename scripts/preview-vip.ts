import * as dotenv from 'dotenv';
import { getGmail, extractEmailAddress } from '../src/lib/gmail';
import { extractPlaintext, getHeader } from '../src/lib/parseMessage';
import vipConfig from '../config/vip.json';

dotenv.config();

interface VipMessage {
  fromEmail: string;
  subject: string;
  plaintext: string;
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
      maxResults: 50 
    });
    
    const messageIds = listRes.data.messages || [];
    console.log(`Processing ${messageIds.length} messages for VIP content...`);
    
    const vipMessages: VipMessage[] = [];
    
    // Process each message
    for (const msg of messageIds) {
      if (vipMessages.length >= 10) break; // Stop after finding 10 VIPs
      
      const fullMsg = await gmail.users.messages.get({ 
        userId: 'me', 
        id: msg.id!, 
        format: 'full' 
      });
      
      const from = getHeader(fullMsg.data, 'From');
      const subject = getHeader(fullMsg.data, 'Subject');
      const fromEmail = extractEmailAddress(from);
      
      if (isVip(fromEmail)) {
        const plaintext = extractPlaintext(fullMsg.data);
        
        vipMessages.push({
          fromEmail,
          subject,
          plaintext
        });
      }
    }
    
    console.log(`\nFound ${vipMessages.length} VIP messages in the past 24 h\n`);
    
    vipMessages.forEach(msg => {
      console.log(`${msg.fromEmail} | ${msg.subject}`);
      console.log(`${msg.plaintext.substring(0, 100)}…`);
      console.log('---');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error previewing VIP messages:', error);
    process.exit(1);
  }
})();
