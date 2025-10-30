import * as dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const code = process.argv[2];

if (!code) {
  console.error('Usage: npx tsx scripts/exchange-code-for-token.ts <AUTHORIZATION_CODE>');
  process.exit(1);
}

async function exchangeCode() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET } = process.env;
  
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    console.error('❌ Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  try {
    console.log('🔄 Exchanging code for tokens...\n');
    
    const { tokens } = await oauth2Client.getToken(code.trim());
    
    if (!tokens.refresh_token) {
      console.error('❌ No refresh token returned. The code may have been used already.');
      console.log('Available tokens:', Object.keys(tokens));
      process.exit(1);
    }
    
    console.log('✅ SUCCESS! New refresh token obtained:\n');
    console.log('='.repeat(70));
    console.log(tokens.refresh_token);
    console.log('='.repeat(70));
    console.log('\n📝 Add this to your .env file as GMAIL_REFRESH_TOKEN');
    console.log('\nThen run:');
    console.log('   npx tsx scripts/refresh-auth.ts');
    console.log('   npx tsx scripts/test-bigquery-auth-simple.ts\n');
    
  } catch (error: any) {
    console.error('❌ Error exchanging code:', error.message);
    if (error.message.includes('invalid_grant')) {
      console.log('\nThis usually means the code has already been used or expired.');
      console.log('Run the OAuth flow again to get a fresh code.');
    }
    process.exit(1);
  }
}

exchangeCode();
