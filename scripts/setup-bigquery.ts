import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

async function main() {
  const projectId = process.env.BQ_PROJECT_ID!;
  const datasetId = process.env.BQ_DATASET || 'ncc_production';
  const location = process.env.BQ_LOCATION || 'US';

  if (!projectId) throw new Error('BQ_PROJECT_ID is required');

  const bq = new BigQuery({ projectId });
  await bq.dataset(datasetId, { location }).get({ autoCreate: true });

  const ddls: string[] = [
    // control tables
    `CREATE TABLE IF NOT EXISTS \`${projectId}.${datasetId}.ingest_state\` (
      inbox STRING,
      last_history_id STRING,
      last_success_at TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS \`${projectId}.${datasetId}.processing_status\` (
      gmail_message_id STRING,
      stage STRING,
      error STRING,
      updated_at TIMESTAMP
    );`,

    // core tables
    `CREATE TABLE IF NOT EXISTS \`${projectId}.${datasetId}.raw_emails\` (
      gmail_message_id STRING,
      inbox STRING,
      history_id STRING,
      message_id_header STRING,
      subject STRING,
      from_email STRING,
      from_name STRING,
      reply_to STRING,
      list_id STRING,
      sent_date TIMESTAMP,
      body_html STRING,
      body_text STRING,
      content_hash STRING,
      is_paid BOOL,
      ingested_at TIMESTAMP
    )
    PARTITION BY DATE(ingested_at)
    CLUSTER BY inbox, gmail_message_id;`,

    `CREATE TABLE IF NOT EXISTS \`${projectId}.${datasetId}.email_labels\` (
      gmail_message_id STRING,
      label_id STRING,
      label_name STRING
    );`,

    `CREATE TABLE IF NOT EXISTS \`${projectId}.${datasetId}.publishers\` (
      publisher_id STRING,
      service STRING,
      site_id STRING,
      domain_root STRING,
      display_name STRING,
      first_seen_at TIMESTAMP,
      last_seen_at TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS \`${projectId}.${datasetId}.publisher_aliases\` (
      alias_service STRING,
      alias_site_id STRING,
      publisher_id STRING
    );`,

    `CREATE TABLE IF NOT EXISTS \`${projectId}.${datasetId}.chunks\` (
      chunk_id STRING,
      gmail_message_id STRING,
      publisher_id STRING,
      source_part STRING,
      char_start INT64,
      char_end INT64,
      chunk_index INT64,
      chunk_text STRING,
      created_at TIMESTAMP
    )
    PARTITION BY DATE(created_at)
    CLUSTER BY publisher_id, gmail_message_id;`,

    `CREATE TABLE IF NOT EXISTS \`${projectId}.${datasetId}.chunk_embeddings\` (
      chunk_id STRING,
      model STRING,
      dim INT64,
      embedding ARRAY<FLOAT64>,
      created_at TIMESTAMP
    )
    CLUSTER BY chunk_id;`,
  ];

  for (const sql of ddls) {
    console.log('Ensuring:', sql.split('\n')[0]);
    await bq.query({ query: sql, location });
  }

  console.log('Setup complete.', { dataset: `${projectId}.${datasetId}`, tablesEnsured: ddls.length });
}

main().catch(err => {
  console.error('setup-bigquery failed:', err);
  process.exit(1);
});

