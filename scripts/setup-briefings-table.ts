/**
 * Setup the briefings table in BigQuery
 * 
 * Run with: npx ts-node scripts/setup-briefings-table.ts
 * 
 * This script creates the briefings table if it doesn't exist,
 * or adds any missing columns if it does.
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'newsletter-control-center';
const DATASET_ID = 'ncc_production';
const BIGQUERY_LOCATION = 'US'; // CRITICAL: Must match existing dataset location

async function setupBriefingsTable() {
  const bigquery = new BigQuery({
    projectId: PROJECT_ID,
    location: BIGQUERY_LOCATION,
  });

  const tableId = 'briefings';
  const datasetRef = bigquery.dataset(DATASET_ID);
  const tableRef = datasetRef.table(tableId);

  try {
    // Check if table exists
    const [exists] = await tableRef.exists();
    
    if (exists) {
      console.log(`✅ Table ${DATASET_ID}.${tableId} already exists.`);
      
      // Try to add model_version column if it doesn't exist
      try {
        const addColumnQuery = `
          ALTER TABLE \`${PROJECT_ID}.${DATASET_ID}.${tableId}\`
          ADD COLUMN IF NOT EXISTS model_version STRING
        `;
        
        await bigquery.query({
          query: addColumnQuery,
          location: BIGQUERY_LOCATION,
        });
        
        console.log('✅ Ensured model_version column exists.');
      } catch (alterError: unknown) {
        // Column might already exist, which is fine
        const errorMessage = alterError instanceof Error ? alterError.message : String(alterError);
        if (!errorMessage.includes('already exists')) {
          console.warn('⚠️  Could not add model_version column:', errorMessage);
        }
      }
      
      return;
    }

    // Create the table with DDL (as specified in master prompt)
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS \`${PROJECT_ID}.${DATASET_ID}.${tableId}\` (
        briefing_id STRING,
        generated_at TIMESTAMP,
        time_window_start TIMESTAMP,
        time_window_end TIMESTAMP,
        content_json JSON,
        email_count INT64,
        model_version STRING
      )
    `;

    await bigquery.query({
      query: createTableQuery,
      location: BIGQUERY_LOCATION,
    });

    console.log(`✅ Created table ${tableId}`);
    console.log(`   Project: ${PROJECT_ID}`);
    console.log(`   Dataset: ${DATASET_ID}`);
    console.log(`   Location: ${BIGQUERY_LOCATION}`);
    
  } catch (error) {
    console.error('❌ Error setting up table:', error);
    throw error;
  }
}

setupBriefingsTable()
  .then(() => {
    console.log('\n🎉 Setup complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Setup failed:', err.message);
    process.exit(1);
  });

