import * as dotenv from 'dotenv';
import { getGmail } from '../src/lib/gmail';

dotenv.config();

(async () => {
  try {
    const gmail = getGmail();
    
    const res = await gmail.users.messages.list({ 
      userId: 'me', 
      q: 'newer_than:1d', 
      maxResults: 50 
    });
    
    const messages = res.data.messages || [];
    console.log(`found: ${messages.length} messages (showing up to 50 ids)`);
    
    messages.forEach(msg => {
      console.log(msg.id);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error listing recent messages:', error);
    process.exit(1);
  }
})();
