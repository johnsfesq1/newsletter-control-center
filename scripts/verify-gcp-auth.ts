import 'dotenv/config';

import fs from 'fs';

import { BigQuery } from '@google-cloud/bigquery';

async function main() {
  const projectId = process.env.BQ_PROJECT_ID || '';
  const location = process.env.BQ_LOCATION || 'US';
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';

  if (!projectId) {
    throw new Error('BQ_PROJECT_ID is required in .env');
  }
  if (keyPath && !fs.existsSync(keyPath)) {
    throw new Error(`GOOGLE_APPLICATION_CREDENTIALS points to a missing file: ${keyPath}`);
  }

  const bq = new BigQuery({ projectId });
  const [rows] = await bq.query({ query: 'SELECT 1 AS ok', location });
  const ok = rows && rows[0] && rows[0].ok === 1;

  console.log('GCP auth OK', { projectId, location, ok });
}

main().catch((err) => {
  console.error('GCP auth failed:', err?.message || err);
  process.exit(1);
});

