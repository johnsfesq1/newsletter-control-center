import * as dotenv from 'dotenv';
import { google } from 'googleapis';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import * as path from 'path';

dotenv.config();

const ADC_PATH = path.join(homedir(), '.config', 'gcloud', 'application_default_credentials.json');

async function refreshAuth() {
  try {
    console.log('🔄 Refreshing Google Cloud authentication...\n');
    
    const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
    
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
      throw new Error('Missing Gmail credentials in .env file');
    }

    console.log('Step 1: Getting new access token...');
    const oauth2Client = new google.auth.OAuth2(
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
    
    // Force refresh
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    console.log('✅ Successfully obtained new credentials\n');
    
    console.log('Step 2: Writing credentials to ADC file...');
    
    // Create directory if it doesn't exist
    const { mkdirSync } = require('fs');
    mkdirSync(path.dirname(ADC_PATH), { recursive: true });
    
    // Write ADC file
    const adcData = {
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      type: 'authorized_user',
      quota_project_id: 'newsletter-control-center'
    };
    
    writeFileSync(ADC_PATH, JSON.stringify(adcData, null, 2));
    
    console.log(`✅ Credentials written to: ${ADC_PATH}\n`);
    console.log('🎉 Authentication refresh complete!');
    console.log('\n⚠️  Note: These credentials will expire in ~7 days.');
    console.log('   For long-term authentication, you need to either:');
    console.log('   1. Create a service account key (if org policy allows)');
    console.log('   2. Set up Workload Identity Federation');
    console.log('   3. Run the processing job in Cloud Run/Cloud Build\n');
    
  } catch (error: any) {
    console.error('❌ Failed to refresh authentication:', error.message);
    if (error.message.includes('invalid_grant')) {
      console.log('\n⚠️  Your refresh token has expired or been revoked.');
      console.log('   You need to get a new refresh token using the Gmail OAuth flow.');
      console.log('   Run: npm run get-gmail-token\n');
    }
    process.exit(1);
  }
}

refreshAuth();
