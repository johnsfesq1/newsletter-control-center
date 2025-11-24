import 'dotenv/config';
import { google } from 'googleapis';
import * as readline from 'readline';
import { execSync } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const PROJECT = process.env.BQ_PROJECT_ID || 'newsletter-control-center';

interface Args {
  inbox: 'me' | 'other';
  code?: string;
}

function shell(cmd: string, allowFail = false): { success: boolean; output: string } {
  try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
    return { success: true, output: output.trim() };
  } catch (error: any) {
    if (allowFail) {
      return { success: false, output: error.stderr?.toString() || error.message || String(error) };
    }
    throw new Error(`Command failed: ${cmd}\n${error.stderr?.toString() || error.message}`);
  }
}

async function getSecretValue(secretName: string): Promise<string | null> {
  const cmd = `gcloud secrets versions access latest --secret=${secretName} --project=${PROJECT}`;
  const result = shell(cmd, true);
  return result.success ? result.output.trim() : null;
}

async function getClientCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  // Try Secret Manager first
  const clientId = await getSecretValue('GMAIL_CLIENT_ID');
  const clientSecret = await getSecretValue('GMAIL_CLIENT_SECRET');
  
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }
  
  // Fall back to .env
  const envClientId = process.env.GMAIL_CLIENT_ID;
  const envClientSecret = process.env.GMAIL_CLIENT_SECRET;
  
  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }
  
  throw new Error(
    'Missing Gmail OAuth credentials. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in:\n' +
    '  - Secret Manager (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET), or\n' +
    '  - .env file (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET)'
  );
}

async function promptForCode(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question('\nPaste the code here and press Enter: ', (code) => {
      rl.close();
      resolve(code.trim());
    });
  });
}

async function verifyToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const oAuth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  
  const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  
  if (!profile.data.emailAddress) {
    throw new Error('Token verification failed: no email address in profile');
  }
  
  return profile.data.emailAddress;
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('inbox', {
      type: 'string',
      choices: ['me', 'other'],
      demandOption: true,
      describe: 'Inbox type (me or other)',
    })
    .option('code', {
      type: 'string',
      describe: 'OAuth code (if not provided, will prompt)',
    })
    .parseAsync() as Args;
  
  const inboxLabel = argv.inbox.toUpperCase();
  
  console.log(`\n=== Minting Gmail Refresh Token (${inboxLabel}) ===\n`);
  
  // Get client credentials
  const { clientId, clientSecret } = await getClientCredentials();
  console.log('✓ Retrieved OAuth credentials\n');
  
  // Set up OAuth2 client
  const REDIRECT_URI = 'http://localhost';
  const oAuth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    REDIRECT_URI
  );
  
  // Request modify scope (includes labels)
  const scopes = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
  ];
  
  // Generate auth URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    redirect_uri: REDIRECT_URI,
  });
  
  // Get code from argument or prompt
  let code = argv.code;
  if (!code) {
    console.log('1) Open this URL in your browser and approve access:\n');
    console.log(authUrl);
    console.log('\n2) After approving, your browser will try to open http://localhost and show a connection error.');
    console.log('   That is expected. COPY the value after "code=" from the address bar,');
    console.log('   up to but not including any "&".\n');
    code = await promptForCode();
  }
  
  if (!code) {
    console.error('\n❌ No code provided. Exiting.');
    process.exit(1);
  }
  
  console.log('\nExchanging code for tokens...');
  
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      console.error('\n❌ No refresh_token returned. Make sure you:');
      console.error('   - Added your email as a Test User on the OAuth consent screen');
      console.error('   - Used prompt=consent (this script does)');
      console.error('   - Selected the account and clicked Allow');
      console.error('\nThen try again.');
      process.exit(1);
    }
    
    // Verify token works
    console.log('Verifying token...');
    const emailAddress = await verifyToken(clientId, clientSecret, tokens.refresh_token);
    console.log(`✓ Token verified for: ${emailAddress}\n`);
    
    // Print ONLY the refresh token with clear label
    console.log('---');
    console.log(`${inboxLabel} REFRESH TOKEN:`);
    console.log('---');
    console.log(tokens.refresh_token);
    console.log('---');
    console.log('\n✓ Copy the token above and use it with:');
    console.log(`  npm run gmail:secret:${argv.inbox} -- --token="<paste_token_here>"`);
    console.log('');
    
  } catch (error: any) {
    console.error('\n❌ Token exchange failed:');
    console.error(error.response?.data || error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

