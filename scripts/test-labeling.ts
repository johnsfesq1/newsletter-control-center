import * as dotenv from 'dotenv';
import { getGmail, markAsIngested } from '../src/lib/gmail';

dotenv.config();

async function testLabeling() {
  console.log('🧪 Testing Gmail labeling functionality...\n');
  
  try {
    const gmail = getGmail('clean');
    
    // Get profile to confirm access
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log(`✅ Connected to: ${profile.data.emailAddress}\n`);
    
    // Get a test message
    console.log('📥 Fetching a test message...');
    const listRes = await gmail.users.messages.list({ 
      userId: 'me',
      maxResults: 1
    });
    
    if (!listRes.data.messages || listRes.data.messages.length === 0) {
      console.log('⚠️  No messages found in inbox');
      return;
    }
    
    const testMessageId = listRes.data.messages[0].id!;
    console.log(`✅ Found message: ${testMessageId}\n`);
    
    // Try to apply label
    console.log('🏷️  Attempting to apply "Ingested" label...');
    await markAsIngested(gmail, testMessageId);
    console.log('\n✅ Labeling test complete!\n');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('insufficient')) {
      console.log('\n⚠️  Your OAuth token needs "gmail.modify" scope.');
      console.log('   Current token only has "gmail.readonly".');
      console.log('   You\'ll need to regenerate the clean inbox token when implementing dual inbox.');
    }
  }
}

testLabeling();
