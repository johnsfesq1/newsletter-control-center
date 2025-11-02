import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const TABLE_ID = 'messages';

async function migrateIsPaidColumn() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  
  try {
    console.log('🔄 Adding is_paid column to messages table...\n');
    
    // Check if column already exists
    console.log('📋 Checking current schema...');
    const [metadata] = await bigquery
      .dataset(DATASET_ID)
      .table(TABLE_ID)
      .getMetadata();
    
    const schema = metadata.schema?.fields || [];
    const hasIsPaid = schema.some(field => field.name === 'is_paid');
    
    if (hasIsPaid) {
      console.log('✅ is_paid column already exists\n');
      
      // Check if any rows need updating
      const [countResult] = await bigquery.query(`
        SELECT COUNT(*) as total, COUNT(is_paid) as with_is_paid
        FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      `);
      const row = countResult[0];
      
      if (row.with_is_paid < row.total && row.total > 0) {
        console.log(`📝 Found ${row.total - row.with_is_paid} rows with NULL is_paid`);
        console.log('   These will be updated during next ingestion run\n');
        return;
      } else {
        console.log('✅ All rows already have is_paid set\n');
        return;
      }
    }
    
    console.log('📝 Adding is_paid column...');
    
    // Add the new column
    const query = `
      ALTER TABLE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
      ADD COLUMN IF NOT EXISTS is_paid BOOLEAN OPTIONS(description="True if newsletter is a paid subscription");
    `;
    
    await bigquery.query(query);
    console.log('✅ Column added\n');
    console.log('📝 Note: Existing rows will be set to NULL (can be updated later if needed)\n');
    
    console.log('🎉 Schema migration complete!\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

migrateIsPaidColumn();

