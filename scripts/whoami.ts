import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { getGmail } from '../src/lib/gmail';

const envPath = path.resolve(process.cwd(), '.env');
const hasEnv = fs.existsSync(envPath);
console.log('whoami.ts starting…');
console.log('cwd:', process.cwd());
console.log('.env present:', hasEnv);

dotenv.config();

const hasId = !!process.env.GMAIL_CLIENT_ID;
const hasSecret = !!process.env.GMAIL_CLIENT_SECRET;
const hasRefresh = !!process.env.GMAIL_REFRESH_TOKEN;
console.log('env present -> client_id:', hasId, ' client_secret:', hasSecret, ' refresh_token:', hasRefresh);

(async () => {
  try {
    console.log('creating gmail client…');
    const gmail = getGmail();
    console.log('calling users.getProfile…');
    const res = await gmail.users.getProfile({ userId: 'me' });
    console.log('✅ Authenticated as:', res.data.emailAddress);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error getting Gmail profile:', error);
    process.exit(1);
  }
})();