import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

async function main(): Promise<void> {
  const BQ_PROJECT_ID = process.env.BQ_PROJECT_ID || '(unset)';
  const BQ_LOCATION = process.env.BQ_LOCATION || '(unset)';
  
  // Compute RUN_REGION using same mapping as discovery
  const BQ_LOC = process.env.BQ_LOCATION || 'US';
  const RUN_REGION = process.env.NCC_REGION || (BQ_LOC.toUpperCase() === 'US' ? 'us-central1' : BQ_LOC);
  
  const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'secrets/gcp/ncc-local-dev.json';
  const resolvedKeyPath = path.resolve(GOOGLE_APPLICATION_CREDENTIALS);
  const keyExists = fs.existsSync(resolvedKeyPath) ? 'exists' : 'does-not-exist';
  
  const NCC_IMPERSONATE_SA = process.env.NCC_IMPERSONATE_SA || '(unset)';

  console.log('---');
  console.log('ENV DOCTOR');
  console.log(`BQ_PROJECT_ID: ${BQ_PROJECT_ID}`);
  console.log(`BQ_LOCATION: ${BQ_LOCATION}`);
  console.log(`NCC_REGION (Cloud Run): ${RUN_REGION}`);
  console.log(`GOOGLE_APPLICATION_CREDENTIALS: ${resolvedKeyPath} (${keyExists})`);
  console.log(`NCC_IMPERSONATE_SA: ${NCC_IMPERSONATE_SA}`);
  console.log('---');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

export default main;

