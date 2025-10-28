const { google } = require('googleapis');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

(async () => {
  const sm = new SecretManagerServiceClient();
  const project = process.env.GOOGLE_CLOUD_PROJECT;

  async function getSecret(name) {
    const [v] = await sm.accessSecretVersion({
      name: `projects/${project}/secrets/${name}/versions/latest`,
    });
    return v.payload.data.toString();
  }

  const [clientId, clientSecret, refreshToken] = await Promise.all([
    getSecret('GMAIL_OAUTH_CLIENT_ID'),
    getSecret('GMAIL_OAUTH_CLIENT_SECRET'),
    getSecret('GMAIL_OAUTH_REFRESH_TOKEN'),
  ]);

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: 'v1', auth });

  // Fetch the 5 most recent inbox messages
  const { data } = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['INBOX'],
    maxResults: 5,
  });

  const messages = data.messages || [];
  if (messages.length === 0) {
    console.log('✅ Connected, but no recent emails found.');
    return;
  }

  console.log(`✅ Connected. Showing ${messages.length} latest emails:\n`);

  for (const m of messages) {
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: m.id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'Date'],
    });
    const headers = Object.fromEntries(
      (msg.data.payload.headers || []).map((h) => [h.name, h.value])
    );
    console.log(`📧 ${headers.Subject || '(no subject)'}`);
    console.log(`   From: ${headers.From}`);
    console.log(`   Date: ${headers.Date}\n`);
  }
})();
