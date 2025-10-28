// scripts/get-gmail-token.js
// One-time helper to mint a Gmail OAuth refresh token (read-only scope).

const { google } = require('googleapis');
const readline = require('readline');

async function main() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('ERROR: Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET env vars first.');
    process.exit(1);
  }

  // Use loopback redirect (supported). We won't actually listen locally;
  // you'll copy the ?code= value from the browser address bar after it "fails" to load.
  const REDIRECT_URI = 'http://localhost';

  const oAuth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    REDIRECT_URI
  );

  const scopes = ['https://www.googleapis.com/auth/gmail.readonly'];

  // Generate the auth URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    redirect_uri: REDIRECT_URI,
  });

  console.log('\n1) Open this URL in your browser and approve access:\n');
  console.log(authUrl, '\n');

  console.log('2) After approving, your browser will try to open http://localhost and show a connection error.');
  console.log('   That is expected. COPY the value after "code=" from the address bar, up to but not including any "&".\n');

  // Prompt for the code
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Paste the code here and press Enter: ', async (code) => {
    rl.close();
    try {
      const { tokens } = await oAuth2Client.getToken(code.trim());
      console.log('\nSUCCESS. Tokens:\n', JSON.stringify(tokens, null, 2));
      if (!tokens.refresh_token) {
        console.error('\nNOTE: No refresh_token returned. Make sure you:\n' +
          ' - Added your email as a Test User on the OAuth consent screen\n' +
          ' - Used prompt=consent (this script does)\n' +
          ' - Selected the account and clicked Allow\n' +
          'Then try again.');
      }
    } catch (e) {
      console.error('\nToken exchange failed:\n', e.response?.data || e.message);
      process.exit(1);
    }
  });
}

main();
