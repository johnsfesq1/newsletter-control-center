import * as dotenv from 'dotenv';
import { google } from 'googleapis';
import * as readline from 'readline';

dotenv.config();

async function getBigQueryRefreshToken() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET } = process.env;
  
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    console.error('❌ Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET in .env file');
    process.exit(1);
  }

  console.log('🔐 Generating OAuth URL for BigQuery access...\n');
  
  const oauth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  // Request BigQuery and Cloud Platform scopes
  const scopes = [
    'https://www.googleapis.com/auth/bigquery',
    'https://www.googleapis.com/auth/cloud-platform'
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes
  });

  console.log('📋 INSTRUCTIONS:');
  console.log('='.repeat(60));
  console.log('1. Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n2. Sign in with your Google account');
  console.log('3. Click "Allow" to grant access');
  console.log('4. Your browser will show a "Connection Error" - this is expected!');
  console.log('5. Copy the ENTIRE URL from your browser address bar');
  console.log('6. Paste it below and press Enter');
  console.log('='.repeat(60));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('\nPaste the URL here: ', async (url) => {
    rl.close();

    try {
      // Extract code from URL
      const urlObj = new URL(url);
      const code = urlObj.searchParams.get('code');
      
      if (!code) {
        throw new Error('Could not find authorization code in URL');
      }

      console.log('\n🔄 Exchanging code for refresh token...\n');
      
      const { tokens } = await oauth2Client.getToken(code);
      
      console.log('✅ SUCCESS! Your new refresh token:\n');
      console.log('='.repeat(60));
      console.log(tokens.refresh_token);
      console.log('='.repeat(60));
      console.log('\n📝 Add this to your .env file as GMAIL_REFRESH_TOKEN');
      console.log('Then run the refresh script again:\n');
      console.log('   npx tsx scripts/refresh-auth.ts\n');
      
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });
}

getBigQueryRefreshToken();
