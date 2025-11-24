import 'dotenv/config';
import { getBigQuery } from '../../src/bq/client';

async function main() {
  const bq = getBigQuery();
  const projectId = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const datasetId = process.env.BQ_DATASET || 'ncc_production';

  console.log(`Checking for vector indexes on ${projectId}.${datasetId}.chunk_embeddings...`);

  const query = `
    SELECT
      table_name,
      index_name,
      index_status,
      creation_time,
      ddl
    FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.VECTOR_INDEXES\`
    WHERE table_name = 'chunk_embeddings'
  `;

  try {
    const [rows] = await bq.query(query);

    if (rows.length === 0) {
      console.log('\n✅ No index exists - safe to build');
    } else {
      console.log('\n⚠️ Index already exists - here are the details:');
      rows.forEach((row: any) => {
        console.log('----------------------------------------');
        console.log(`Index Name:    ${row.index_name}`);
        console.log(`Status:        ${row.index_status}`);
        console.log(`Created At:    ${row.creation_time.value}`);
        console.log(`DDL:           ${row.ddl}`);
      });
      console.log('----------------------------------------');
    }
  } catch (error: any) {
    console.error('\n❌ Error checking indexes:', error.message);
    // If the error mentions VECTOR_INDEXES not found, it might mean feature not available or permission issue, but usually it means no indexes created yet in some contexts, though INFORMATION_SCHEMA should exist.
  }
}

main().catch(console.error);

