import { google, gmail_v1 } from 'googleapis';

import { authenticate } from '@google-cloud/local-auth';

import * as fs from 'fs/promises';

import * as path from 'path';

import { getOAuthCredentials } from './token-provider';



const TOKEN_DIR = path.resolve('.tokens');

const TOKEN_PATH = (inbox: 'me' | 'other') => path.join(TOKEN_DIR, `token.${inbox}.json`);

const CREDENTIALS_PATH = path.resolve('credentials.json');



async function ensureTokenDir() {

  try { await fs.mkdir(TOKEN_DIR, { recursive: true }); } catch {}

}



async function loadSavedCredentials(inbox: 'me' | 'other') {

  try {

    const content = await fs.readFile(TOKEN_PATH(inbox), 'utf8');

    const creds = JSON.parse(content);

    return google.auth.fromJSON(creds) as any; // authorized_user payload

  } catch {

    return null;

  }

}



async function saveCredentials(auth: any, inbox: 'me' | 'other') {

  const raw = await fs.readFile(CREDENTIALS_PATH, 'utf8');

  const content = JSON.parse(raw);

  const keys = content.installed || content.web;

  const payload = {

    type: 'authorized_user',

    client_id: keys.client_id,

    client_secret: keys.client_secret,

    refresh_token: auth.credentials.refresh_token,

  };

  await ensureTokenDir();

  await fs.writeFile(TOKEN_PATH(inbox), JSON.stringify(payload, null, 2));

}



export async function deleteToken(inbox: 'me' | 'other'): Promise<void> {
  try { await fs.unlink(TOKEN_PATH(inbox)); } catch {}
}



export async function getGmail(inbox: 'me' | 'other', opts?: { reauth?: boolean }): Promise<gmail_v1.Gmail> {

  if (opts?.reauth) await deleteToken(inbox);



  const isReadonly = process.env.GMAIL_READONLY !== 'false'; // default true

  const scope = isReadonly

    ? ['https://www.googleapis.com/auth/gmail.readonly']

    : ['https://www.googleapis.com/auth/gmail.modify'];



  // Try token provider first (cloud path: env vars, or local path: files)
  const credentials = await getOAuthCredentials(inbox);

  if (credentials) {

    // Construct OAuth2Client directly from credentials (headless path)
    const oAuth2Client = new google.auth.OAuth2(

      credentials.client_id,

      credentials.client_secret,

      'urn:ietf:wg:oauth:2.0:oob' // unused with refresh token but required

    );

    oAuth2Client.setCredentials({ refresh_token: credentials.refresh_token });



    try {

      const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

      await gmail.users.labels.list({ userId: 'me' });

      console.log(`Gmail: authorized ${inbox} (headless)`);

      return gmail;

    } catch (error: any) {

      const errorMsg = error.message || JSON.stringify(error);

      if (errorMsg.includes('invalid_rapt') || errorMsg.includes('invalid_grant')) {

        throw new Error('Auth requires re-consent. Refresh token may be revoked. Re-run with --reauth (and ensure Desktop credentials).');

      }

      throw new Error(`Gmail auth failed: ${error.message || 'unknown error'}`);

    }

  }



  // Fall back to local file-based token loading (existing behavior)
  let saved;

  try {

    saved = await loadSavedCredentials(inbox);

  } catch {

    saved = null;

  }



  if (saved) {

    try {

      const gmail = google.gmail({ version: 'v1', auth: saved });

      await gmail.users.labels.list({ userId: 'me' });

      console.log(`Gmail: authorized ${inbox}`);

      return gmail;

    } catch (error: any) {

      const errorMsg = error.message || JSON.stringify(error);

      if (errorMsg.includes('invalid_rapt') || errorMsg.includes('invalid_grant')) {

        throw new Error('Auth requires re-consent. Re-run with --reauth (and ensure Desktop credentials).');

      }

      throw new Error(`Gmail auth failed: ${error.message || 'unknown error'}`);

    }

  }



  // Last resort: interactive OAuth flow (local development only)
  let client;

  try {

    client = await authenticate({

      scopes: scope,

      keyfilePath: CREDENTIALS_PATH,

    });

  } catch (error: any) {

    const errorMsg = error.message || JSON.stringify(error);

    if (errorMsg.includes('invalid_rapt') || errorMsg.includes('invalid_grant')) {

      throw new Error('Auth requires re-consent. Re-run with --reauth (and ensure Desktop credentials).');

    }

    throw new Error(`Gmail authenticate failed: ${error.message || 'unknown error'}`);

  }



  await saveCredentials(client, inbox);

  const gmail = google.gmail({ version: 'v1', auth: client });

  console.log(`Gmail: authorized ${inbox}`);

  return gmail;

}
