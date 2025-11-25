/**
 * Create/update the briefings table in BigQuery
 * 
 * Run with: npx ts-node scripts/create-briefings-table.ts
 * 
 * This can also be run as scripts/setup-briefings-table.ts (symlinked)
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'newsletter-control-center';
const DATASET_ID = 'ncc_production';
const BIGQUERY_LOCATION = 'US'; // CRITICAL: Must match existing dataset location

async function createBriefingsTable() {
  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    location: BIGQUERY_LOCATION,
  });

  const schema = [
    { name: 'briefing_id', type: 'STRING', mode: 'REQUIRED', description: 'UUID identifier' },
    { name: 'generated_at', type: 'TIMESTAMP', mode: 'REQUIRED', description: 'When the briefing was generated' },
    { name: 'time_window_start', type: 'TIMESTAMP', mode: 'REQUIRED', description: 'Start of the email time window' },
    { name: 'time_window_end', type: 'TIMESTAMP', mode: 'REQUIRED', description: 'End of the email time window' },
    { name: 'content_json', type: 'JSON', mode: 'REQUIRED', description: 'The full structured briefing output' },
    { name: 'email_count', type: 'INTEGER', mode: 'REQUIRED', description: 'Number of emails processed' },
    { name: 'model_version', type: 'STRING', mode: 'NULLABLE', description: 'Model version used for generation' },
  ];

  const tableId = 'briefings';
  const datasetRef = bigquery.dataset(DATASET_ID);
  const tableRef = datasetRef.table(tableId);

  try {
    // Check if table already exists
    const [exists] = await tableRef.exists();
    if (exists) {
      console.log(`✅ Table ${DATASET_ID}.${tableId} already exists.`);
      return;
    }

    // Create the table
    const [table] = await datasetRef.createTable(tableId, {
      schema,
      location: BIGQUERY_LOCATION,
    });

    console.log(`✅ Created table ${table.id}`);
    console.log(`   Project: ${PROJECT_ID}`);
    console.log(`   Dataset: ${DATASET_ID}`);
    console.log(`   Location: ${BIGQUERY_LOCATION}`);
  } catch (error) {
    console.error('❌ Error creating table:', error);
    throw error;
  }
}

createBriefingsTable()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Failed:', err.message);
    process.exit(1);
  });

