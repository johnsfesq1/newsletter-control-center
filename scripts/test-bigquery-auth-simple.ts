import * as dotenv from 'dotenv';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const TABLE_ID = 'messages';

async function testBigQueryAuth() {
  try {
    console.log('Testing BigQuery authentication...');
    
    const { BigQuery } = await import('@google-cloud/bigquery');
    
    // Try to use service account impersonation if configured
    const impersonateServiceAccount = process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT;
    
    if (impersonateServiceAccount) {
      console.log(`Using service account impersonation: ${impersonateServiceAccount}`);
      console.log('Note: This requires you to have granted Service Account Token Creator role');
    } else {
      console.log('Using default authentication (Application Default Credentials)');
    }
    
    const bigquery = new BigQuery({ projectId: PROJECT_ID });
    
    console.log('Running test query...');
    const query = `SELECT COUNT(*) as count FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\``;
    const [rows] = await bigquery.query(query);
    
    console.log('Query result:', rows[0]);
    console.log('✅ BigQuery authentication successful!');
  } catch (error) {
    console.error('❌ BigQuery authentication failed:', error);
    console.log('\nThis might be because:');
    console.log('1. Service account impersonation is not configured');
    console.log('2. You need to grant Service Account Token Creator role');
    console.log('3. The service account needs BigQuery permissions');
    process.exit(1);
  }
}

testBigQueryAuth();
