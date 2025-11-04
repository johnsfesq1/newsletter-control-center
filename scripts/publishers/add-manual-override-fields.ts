/**
 * Add manual override fields to publishers table
 * This allows manual adjustment of quality scores
 */

import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const TABLE_ID = 'publishers';

async function addManualOverrideFields() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  const dataset = bigquery.dataset(DATASET_ID);
  const table = dataset.table(TABLE_ID);

  console.log('Adding manual override fields to publishers table...\n');

  try {
    // Check if fields already exist
    const [metadata] = await table.getMetadata();
    const existingFields = metadata.schema?.fields?.map(f => f.name) || [];
    
    const fieldsToAdd = [
      {
        name: 'manual_quality_score_override',
        type: 'FLOAT64',
        mode: 'NULLABLE',
        description: 'Manual quality score override (0-100). If set, overrides calculated quality_score.'
      },
      {
        name: 'manual_override_reason',
        type: 'STRING',
        mode: 'NULLABLE',
        description: 'Reason for manual override (e.g., "Expert knowledge", "High-value source")'
      },
      {
        name: 'manual_override_updated_at',
        type: 'TIMESTAMP',
        mode: 'NULLABLE',
        description: 'When manual override was last updated'
      },
      {
        name: 'manual_override_updated_by',
        type: 'STRING',
        mode: 'NULLABLE',
        description: 'Who updated the manual override (e.g., user email or identifier)'
      },
      {
        name: 'manual_individual_signal_overrides',
        type: 'JSON',
        mode: 'NULLABLE',
        description: 'JSON object with manual overrides for individual signals: {citation_signal: 0.8, subscriber_signal: 0.9, ...}'
      }
    ];

    const fieldsToAddFiltered = fieldsToAdd.filter(f => !existingFields.includes(f.name));

    if (fieldsToAddFiltered.length === 0) {
      console.log('✅ All manual override fields already exist.\n');
      return;
    }

    console.log(`Adding ${fieldsToAddFiltered.length} new fields...\n`);

    // Add fields one by one using ALTER TABLE
    for (const field of fieldsToAddFiltered) {
      try {
        const alterQuery = `
          ALTER TABLE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
          ADD COLUMN IF NOT EXISTS ${field.name} ${field.type}
          ${field.mode === 'REQUIRED' ? 'NOT NULL' : ''}
        `;

        await bigquery.query(alterQuery);
        console.log(`   ✅ Added field: ${field.name} (${field.type})`);
      } catch (error: any) {
        // Check if field already exists (might have been added between check and add)
        if (error.message?.includes('already exists') || error.message?.includes('Duplicate column')) {
          console.log(`   ⚠️  Field ${field.name} already exists, skipping`);
        } else {
          throw error;
        }
      }
    }

    console.log('\n✅ Manual override fields added successfully!\n');
    console.log('Fields added:');
    fieldsToAddFiltered.forEach(f => {
      console.log(`   - ${f.name}: ${f.description}`);
    });

  } catch (error: any) {
    console.error('❌ Error adding manual override fields:', error.message);
    throw error;
  }
}

addManualOverrideFields()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

