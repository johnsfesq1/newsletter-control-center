import 'dotenv/config';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ServiceAccountKey {
  client_email?: string;
}

async function main(): Promise<void> {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'secrets/gcp/ncc-local-dev.json';
  const resolvedPath = path.resolve(keyPath);

  let clientEmail = 'not found';

  try {
    const content = await fs.readFile(resolvedPath, 'utf8');
    const key = JSON.parse(content) as ServiceAccountKey;
    if (key.client_email) {
      clientEmail = key.client_email;
    }
  } catch (error: any) {
    // File not found or parse error - keep "not found"
  }

  console.log('---');
  console.log('SERVICE ACCOUNT FROM KEY');
  console.log(`client_email: ${clientEmail}`);
  console.log(`key_file: ${resolvedPath}`);
  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

