import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import { createHash } from 'crypto';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const TABLE_ID = 'messages';

/**
 * Generate stable doc_id from message metadata
 */
function generateDocId(sender: string, subject: string, sentDate: string | null): string {
  const data = `${sender}|${subject}|${sentDate || ''}`;
  return createHash('sha256').update(data).digest('hex').substring(0, 32);
}

async function addDocIdsAndProvenance() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  
  try {
    console.log('🔄 Adding document IDs and provenance fields to messages table...\n');
    
    // Check current schema
    console.log('📋 Checking current schema...');
    const [metadata] = await bigquery
      .dataset(DATASET_ID)
      .table(TABLE_ID)
      .getMetadata();
    
    const schema = metadata.schema?.fields || [];
    const fieldNames = schema.map(f => f.name);
    
    // Columns to add
    const fieldsToAdd: any[] = [];
    
    if (!fieldNames.includes('doc_id')) {
      fieldsToAdd.push({
        name: 'doc_id',
        type: 'STRING',
        mode: 'NULLABLE',
        description: 'Stable canonical ID (hash of sender + subject + sent_date)'
      });
    }
    
    if (!fieldNames.includes('doc_version')) {
      fieldsToAdd.push({
        name: 'doc_version',
        type: 'INTEGER',
        mode: 'NULLABLE',
        description: 'Document version (incremented on reprocessing)'
      });
    }
    
    if (!fieldNames.includes('list_id')) {
      fieldsToAdd.push({
        name: 'list_id',
        type: 'STRING',
        mode: 'NULLABLE',
        description: 'List-Id header (newsletter identifier)'
      });
    }
    
    if (!fieldNames.includes('from_domain')) {
      fieldsToAdd.push({
        name: 'from_domain',
        type: 'STRING',
        mode: 'NULLABLE',
        description: 'Domain from sender email'
      });
    }
    
    if (!fieldNames.includes('was_forwarded')) {
      fieldsToAdd.push({
        name: 'was_forwarded',
        type: 'BOOLEAN',
        mode: 'NULLABLE',
        description: 'True if email was forwarded'
      });
    }
    
    if (fieldsToAdd.length === 0) {
      console.log('✅ All fields already exist!\n');
    } else {
      // Add columns via ALTER TABLE
      console.log(`📝 Adding ${fieldsToAdd.length} new fields...`);
      for (const field of fieldsToAdd) {
        let query: string;
        if (field.mode === 'NULLABLE') {
          query = `
            ALTER TABLE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
            ADD COLUMN IF NOT EXISTS ${field.name} ${field.type} OPTIONS(description="${field.description}")
          `;
        } else {
          query = `
            ALTER TABLE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
            ADD COLUMN IF NOT EXISTS ${field.name} ${field.type}
          `;
        }
        await bigquery.query(query);
        console.log(`   ✅ Added ${field.name}`);
      }
      console.log('');
    }
    
    // Backfill doc_id and other fields for existing rows
    console.log('📊 Checking if backfill needed...');
    const [countResult] = await bigquery.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(doc_id) as with_doc_id,
        COUNT(from_domain) as with_from_domain,
        COUNT(list_id) as with_list_id
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
    `);
    const row = countResult[0];
    
    if (row.with_doc_id < row.total) {
      console.log(`📝 Backfilling ${row.total - row.with_doc_id} rows with doc_id and provenance...`);
      console.log('   This may take a few minutes...\n');
      
      // Process in batches to avoid memory issues
      const BATCH_SIZE = 1000;
      let processed = 0;
      
      while (processed < row.total) {
        // Fetch batch
        const [batchRows] = await bigquery.query(`
          SELECT 
            id,
            sender,
            subject,
            sent_date
          FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
          WHERE doc_id IS NULL
          LIMIT ${BATCH_SIZE}
        `);
        
        if (batchRows.length === 0) {
          console.log('✅ No more rows to process');
          break;
        }
        
        // Generate doc_ids and updates
        const updates = batchRows.map((msg: any) => {
          const docId = generateDocId(msg.sender, msg.subject, msg.sent_date);
          const fromDomain = msg.sender?.split('@')[1] || null;
          
          return {
            id: msg.id,
            doc_id: docId,
            doc_version: 1,
            from_domain: fromDomain
          };
        });
        
        // Update batch using temporary table + MERGE
        // Create temp table
        const tempTable = `\`${PROJECT_ID}.${DATASET_ID}.temp_backfill_${Date.now()}\``;
        await bigquery.query(`
          CREATE TABLE ${tempTable} AS
          SELECT * FROM UNNEST([
            ${updates.map(u => 
              `STRUCT('${u.id}' AS id, '${u.doc_id}' AS doc_id, ${u.doc_version} AS doc_version, ${u.from_domain ? `'${u.from_domain}'` : 'NULL'} AS from_domain)`
            ).join(',\n            ')}
          ])
        `);
        
        // MERGE
        await bigquery.query(`
          UPDATE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\` m
          SET 
            doc_id = t.doc_id,
            doc_version = t.doc_version,
            from_domain = t.from_domain
          FROM ${tempTable} t
          WHERE m.id = t.id
        `);
        
        // Drop temp table
        await bigquery.query(`DROP TABLE ${tempTable}`);
        
        processed += batchRows.length;
        console.log(`   ✅ Processed ${processed}/${row.total} rows`);
      }
      
      console.log('');
    } else {
      console.log('✅ All rows already have doc_id\n');
    }
    
    console.log('🎉 Schema migration complete!\n');
    console.log('📋 Summary:');
    console.log(`   - doc_id: Stable canonical ID`);
    console.log(`   - doc_version: Version tracking`);
    console.log(`   - from_domain: Sender domain`);
    console.log(`   - list_id: Newsletter identifier (will be populated during future ingestion)`);
    console.log(`   - was_forwarded: Forward detection (will be populated during future ingestion)`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

addDocIdsAndProvenance();

