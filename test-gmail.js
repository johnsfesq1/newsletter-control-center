const { google } = require('googleapis');
require('dotenv').config();

(async () => {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;

  const auth = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

  const gmail = google.gmail({ version: 'v1', auth });

  const { data } = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['INBOX'],
    maxResults: 5,
  });

  if (!data.messages || data.messages.length === 0) {
    console.log('✅ Connected, but no recent emails found.');
    return;
  }

  console.log(`✅ Connected. Showing ${data.messages.length} latest message IDs:`);
  for (const msg of data.messages) {
    console.log('-', msg.id);
  }
})();