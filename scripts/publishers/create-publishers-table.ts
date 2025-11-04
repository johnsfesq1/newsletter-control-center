/**
 * Create publishers table in BigQuery
 * This table stores publisher-level metadata and quality scores
 */

import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const TABLE_ID = 'publishers';

async function createPublishersTable() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  const dataset = bigquery.dataset(DATASET_ID);

  // Check if table exists
  const table = dataset.table(TABLE_ID);
  const [exists] = await table.exists();

  if (exists) {
    console.log(`⚠️  Table ${TABLE_ID} already exists.`);
    console.log('   To recreate, delete the table first.');
    return;
  }

  console.log(`Creating table ${TABLE_ID}...\n`);

  // Define schema
  const schema = [
    // Primary identifiers
    { name: 'publisher_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'publisher_name', type: 'STRING', mode: 'REQUIRED' },
    { name: 'canonical_name', type: 'STRING', mode: 'REQUIRED' }, // Normalized for matching

    // Email identification
    { name: 'primary_email', type: 'STRING', mode: 'NULLABLE' },
    { name: 'email_domains', type: 'STRING', mode: 'REPEATED' }, // Array of email domains
    { name: 'email_variations', type: 'STRING', mode: 'REPEATED' }, // Array of all email addresses seen

    // Newsletter metadata
    { name: 'newsletter_url', type: 'STRING', mode: 'NULLABLE' },
    { name: 'platform', type: 'STRING', mode: 'NULLABLE' }, // substack, beehiiv, ghost, custom, unknown
    { name: 'from_domain', type: 'STRING', mode: 'NULLABLE' }, // Most common from_domain

    // Quality Signals (calculated)
    { name: 'quality_score', type: 'FLOAT64', mode: 'NULLABLE' }, // 0-100 composite score
    { name: 'citation_count', type: 'INT64', mode: 'NULLABLE' }, // How many other publishers cite this
    { name: 'citing_publishers', type: 'STRING', mode: 'REPEATED' }, // Which publishers cite this
    { name: 'subscriber_estimate', type: 'INT64', mode: 'NULLABLE' },
    { name: 'recommendation_count', type: 'INT64', mode: 'NULLABLE' },
    { name: 'topic_relevance_score', type: 'FLOAT64', mode: 'NULLABLE' }, // 0-1 relevance to geopolitics
    { name: 'freshness_score', type: 'FLOAT64', mode: 'NULLABLE' }, // 0-1 activity level
    { name: 'platform_score', type: 'FLOAT64', mode: 'NULLABLE' }, // 0-1 platform quality signal

    // Message statistics
    { name: 'message_count', type: 'INT64', mode: 'NULLABLE' },
    { name: 'first_seen', type: 'TIMESTAMP', mode: 'NULLABLE' },
    { name: 'last_seen', type: 'TIMESTAMP', mode: 'NULLABLE' },
    { name: 'avg_word_count', type: 'FLOAT64', mode: 'NULLABLE' },

    // Discovery links
    { name: 'discovery_id', type: 'STRING', mode: 'NULLABLE' }, // Link to discovered_newsletters
    { name: 'is_discovered', type: 'BOOLEAN', mode: 'NULLABLE' },
    { name: 'matched_at', type: 'TIMESTAMP', mode: 'NULLABLE' }, // When was discovery link made

    // Quality score metadata
    { name: 'quality_score_last_calculated', type: 'TIMESTAMP', mode: 'NULLABLE' },
    { name: 'quality_score_version', type: 'STRING', mode: 'NULLABLE' }, // Version of scoring algorithm

    // Deduplication
    { name: 'is_duplicate', type: 'BOOLEAN', mode: 'NULLABLE' },
    { name: 'merged_into_publisher_id', type: 'STRING', mode: 'NULLABLE' },

    // Timestamps
    { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
  ];

  // Create table
  await table.create({
    schema: schema,
    description: 'Publisher-level metadata and quality scores. Aggregates message-level data and links to discovered_newsletters.',
  });

  console.log(`✅ Table ${TABLE_ID} created successfully!\n`);

  // Create indexes for performance (using clustering)
  console.log('Creating clustered indexes...');
  
  // Note: BigQuery doesn't support traditional indexes, but we can cluster the table
  // We'll add clustering via ALTER TABLE if needed
  // For now, the table is created with the schema

  console.log('✅ Table ready for use!\n');
  console.log('Next steps:');
  console.log('  1. Run: npm run publishers:extract-existing');
  console.log('  2. Run: npm run publishers:initial-citations');
  console.log('  3. Run: npm run publishers:initial-scoring');
}

createPublishersTable()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

