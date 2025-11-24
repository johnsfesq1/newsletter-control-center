import { getGmail } from '../../src/gmail/client';

async function checkIdentity(inbox: 'me' | 'other') {
  try {
    const gmail = await getGmail(inbox);
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log(`Inbox '${inbox}':`);
    console.log(`  Email: ${profile.data.emailAddress}`);
    console.log(`  Messages: ${profile.data.messagesTotal}`);
    console.log(`  HistoryId: ${profile.data.historyId}`);
  } catch (err: any) {
    console.error(`Inbox '${inbox}' error:`, err.message);
  }
  console.log('---');
}

async function main() {
  await checkIdentity('me');
  await checkIdentity('other');
}

main().catch(console.error);

