import * as fs from 'fs/promises';
import * as path from 'path';

export interface OAuthCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

const TOKEN_DIR = path.resolve('.tokens');
const TOKEN_PATH = (inbox: 'me' | 'other') => path.join(TOKEN_DIR, `token.${inbox}.json`);
const CREDENTIALS_PATH = path.resolve('credentials.json');

/**
 * Get OAuth credentials for the specified inbox.
 * 
 * Cloud path (preferred): Reads from environment variables:
 *   - GMAIL_CLIENT_ID
 *   - GMAIL_CLIENT_SECRET
 *   - GMAIL_REFRESH_TOKEN_ME (for 'me' inbox)
 *   - GMAIL_REFRESH_TOKEN_OTHER (for 'other' inbox)
 * 
 * Local path (fallback): Reads from local files:
 *   - credentials.json (for client_id/client_secret)
 *   - .tokens/token.{me|other}.json (for refresh_token)
 * 
 * @param inbox - 'me' or 'other'
 * @returns OAuth credentials or null if not found
 */
export async function getOAuthCredentials(inbox: 'me' | 'other'): Promise<OAuthCredentials | null> {
  // Cloud path: prefer environment variables
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshTokenEnv = inbox === 'me' 
    ? process.env.GMAIL_REFRESH_TOKEN_ME 
    : process.env.GMAIL_REFRESH_TOKEN_OTHER;

  if (clientId && clientSecret && refreshTokenEnv) {
    return {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenEnv,
    };
  }

  // Local path: fall back to file-based tokens
  try {
    // Read credentials.json for client_id/client_secret
    const credentialsContent = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    const credentials = JSON.parse(credentialsContent);
    const keys = credentials.installed || credentials.web;
    
    if (!keys?.client_id || !keys?.client_secret) {
      return null;
    }

    // Read token file for refresh_token
    const tokenContent = await fs.readFile(TOKEN_PATH(inbox), 'utf8');
    const tokenData = JSON.parse(tokenContent);
    
    // Token file format: { type: 'authorized_user', client_id, client_secret, refresh_token }
    if (tokenData.refresh_token) {
      return {
        client_id: keys.client_id,
        client_secret: keys.client_secret,
        refresh_token: tokenData.refresh_token,
      };
    }
  } catch (error) {
    // File not found or parse error - return null
    return null;
  }

  return null;
}

