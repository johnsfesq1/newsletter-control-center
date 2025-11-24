
import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';

dotenv.config();

const PROJECT_ID = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const DATASETS = ['ncc_newsletters', 'ncc_production'];

async function main() {
  const bq = new BigQuery({ projectId: PROJECT_ID });

  console.log(`Comparing datasets in project: ${PROJECT_ID}\n`);

  for (const datasetId of DATASETS) {
    console.log(`--- Dataset: ${datasetId} ---`);
    
    const dataset = bq.dataset(datasetId);
    const [tables] = await dataset.getTables();

    if (tables.length === 0) {
      console.log('  (No tables found)');
      continue;
    }

    for (const table of tables) {
      const tableId = table.id;
      if (!tableId) continue;

      // Get metadata for row count
      const [metadata] = await table.getMetadata();
      const rowCount = metadata.numRows || '0';
      const sizeBytes = metadata.numBytes || '0';
      
      console.log(`  Table: ${tableId}`);
      console.log(`    Rows: ${rowCount}`);
      console.log(`    Size: ${(parseInt(sizeBytes) / 1024 / 1024).toFixed(2)} MB`);

      // Get schema
      const schema = metadata.schema;
      if (schema && schema.fields) {
        const fieldNames = schema.fields.map((f: any) => f.name).join(', ');
        console.log(`    Schema: ${fieldNames}`);
      }
      console.log('');
    }
  }
}

main().catch(console.error);

