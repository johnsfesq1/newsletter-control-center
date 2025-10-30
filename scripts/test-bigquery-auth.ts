import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const TABLE_ID = 'messages';

async function testBigQueryAuth() {
  try {
    console.log('Initializing BigQuery client...');
    
    // Use service account key if available, otherwise fall back to default
    const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const bigquery = keyFilename 
      ? new BigQuery({ projectId: PROJECT_ID, keyFilename })
      : new BigQuery({ projectId: PROJECT_ID });
    
    if (keyFilename) {
      console.log(`Using service account key: ${keyFilename}`);
    } else {
      console.log('Using default credentials (no service account key found)');
    }
    
    console.log('Running test query...');
    const query = `SELECT COUNT(*) as count FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\``;
    const [rows] = await bigquery.query(query);
    
    console.log('Query result:', rows[0]);
    console.log('✅ BigQuery authentication successful!');
  } catch (error) {
    console.error('❌ BigQuery authentication failed:', error);
  }
}

testBigQueryAuth();

