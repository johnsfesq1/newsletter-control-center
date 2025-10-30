import * as dotenv from 'dotenv';
import { getGmail } from '../src/lib/gmail';
import { generateDedupeKey, keyToString, isDuplicate } from '../src/lib/deduplication';

dotenv.config();

async function testDeduplication() {
  console.log('🧪 Testing deduplication logic...\n');
  
  try {
    const gmail = getGmail('clean');
    
    // Fetch a few messages
    console.log('📥 Fetching messages from clean inbox...');
    const listRes = await gmail.users.messages.list({ 
      userId: 'me',
      maxResults: 3
    });
    
    if (!listRes.data.messages || listRes.data.messages.length === 0) {
      console.log('⚠️  No messages found in clean inbox');
      return;
    }
    
    console.log(`✅ Found ${listRes.data.messages.length} messages\n`);
    
    // Get full message details
    for (const msg of listRes.data.messages.slice(0, 2)) {
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full'
      });
      
      const key = generateDedupeKey(fullMsg.data);
      const keyStr = keyToString(key);
      
      console.log(`Message ${msg.id}:`);
      console.log(`  From: ${key.sender}`);
      console.log(`  Subject: ${key.subject}`);
      console.log(`  Message-ID: ${key.messageId.substring(0, 40)}...`);
      console.log(`  List-Id: ${key.listId || '(none)'}`);
      console.log(`  Key string: ${keyStr.substring(0, 80)}...`);
      console.log('');
    }
    
    console.log('✅ Deduplication logic working!\n');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

testDeduplication();
