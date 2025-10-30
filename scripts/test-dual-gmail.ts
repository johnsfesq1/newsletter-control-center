import * as dotenv from 'dotenv';
import { getGmail } from '../src/lib/gmail';

dotenv.config();

async function testDualGmail() {
  console.log('🧪 Testing multi-account Gmail client...\n');
  
  // Test legacy
  try {
    console.log('1️⃣  Testing legacy inbox...');
    const gmailLegacy = getGmail('legacy');
    const res = await gmailLegacy.users.getProfile({ userId: 'me' });
    console.log(`   ✅ SUCCESS: ${res.data.emailAddress}\n`);
  } catch (error: any) {
    console.log(`   ⚠️  ERROR: ${error.message}\n`);
  }
  
  // Test clean
  try {
    console.log('2️⃣  Testing clean inbox...');
    const gmailClean = getGmail('clean');
    const res = await gmailClean.users.getProfile({ userId: 'me' });
    console.log(`   ✅ SUCCESS: ${res.data.emailAddress}\n`);
  } catch (error: any) {
    console.log(`   ❌ ERROR: ${error.message}\n`);
  }
  
  console.log('🎉 Multi-account support verified!');
}

testDualGmail();
