import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const TABLE_ID = 'messages';

async function migrateSchema() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  
  try {
    console.log('🔄 Migrating BigQuery schema for dual inbox support...\n');
    
    // Check if column already exists
    console.log('📋 Checking current schema...');
    const [metadata] = await bigquery
      .dataset(DATASET_ID)
      .table(TABLE_ID)
      .getMetadata();
    
    const schema = metadata.schema?.fields || [];
    const hasSourceInbox = schema.some(field => field.name === 'source_inbox');
    
    if (hasSourceInbox) {
      console.log('✅ source_inbox column already exists\n');
      
      // Check if any rows need updating
      const [countResult] = await bigquery.query(`
        SELECT COUNT(*) as total, COUNT(source_inbox) as with_source
        FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      `);
      const row = countResult[0];
      
      if (row.with_source === 0 && row.total > 0) {
        console.log(`📝 Found ${row.total} rows with NULL source_inbox, updating...`);
        // Continue to UPDATE section below
      } else {
        console.log('✅ All rows already have source_inbox set\n');
        return;
      }
    }
    
    console.log('⚠️  source_inbox column not found\n');
    console.log('📝 Adding source_inbox column...');
    
    // Add the new column
    const query = `
      ALTER TABLE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      ADD COLUMN IF NOT EXISTS source_inbox STRING OPTIONS(description="Source inbox: legacy or clean");
    `;
    
    await bigquery.query(query);
    console.log('✅ Column added\n');
    
    // Update existing rows to 'legacy'
    console.log('📝 Setting existing rows to "legacy"...');
    const updateQuery = `
      UPDATE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      SET source_inbox = 'legacy'
      WHERE source_inbox IS NULL;
    `;
    
    const [job] = await bigquery.query(updateQuery);
    console.log('✅ All existing rows set to "legacy"\n');
    
    console.log('🎉 Schema migration complete!\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

migrateSchema();
