
import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';

dotenv.config();

const PROJECT_ID = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = process.env.BQ_DATASET || 'ncc_production';

async function main() {
  const bq = new BigQuery({ projectId: PROJECT_ID });

  console.log('--- Deleting Junk Embeddings ---');
  
  // 1. Delete embeddings
  const deleteQuery = `
    DELETE FROM \`${PROJECT_ID}.${DATASET_ID}.chunk_embeddings\`
    WHERE chunk_id IN (
      SELECT chunk_id 
      FROM \`${PROJECT_ID}.${DATASET_ID}.chunks\` 
      WHERE is_junk = TRUE
    )
  `;

  console.log('Running DELETE query...');
  const [job] = await bq.createQueryJob({ query: deleteQuery, location: 'US' });
  console.log(`Job ${job.id} started.`);
  
  // Wait for the query to finish
  const [result] = await job.getQueryResults();
  
  // Check how many rows were affected (BigQuery DML returns this in metadata, 
  // but the simple query result might not show it directly in the rows array.
  // We can check job metadata).
  const [metadata] = await job.getMetadata();
  const numDmlAffectedRows = metadata.statistics?.query?.numDmlAffectedRows;
  
  console.log(`Deletion complete. Rows deleted: ${numDmlAffectedRows}`);

  // 2. Verify new row count
  console.log('\n--- Verifying Row Count ---');
  const countQuery = `
    SELECT COUNT(*) as count 
    FROM \`${PROJECT_ID}.${DATASET_ID}.chunk_embeddings\`
  `;
  const [countRows] = await bq.query({ query: countQuery, location: 'US' });
  const count = countRows[0].count;
  console.log(`Current rows in chunk_embeddings: ${count}`);

  // 3. Check for vector index
  console.log('\n--- Checking Vector Index ---');
  const indexQuery = `
    SELECT table_name, index_name, index_status, coverage_percentage
    FROM \`${PROJECT_ID}.${DATASET_ID}.INFORMATION_SCHEMA.VECTOR_INDEXES\`
    WHERE table_name = 'chunk_embeddings'
  `;
  
  try {
    const [indexRows] = await bq.query({ query: indexQuery, location: 'US' });
    if (indexRows.length === 0) {
      console.log('No vector index found on chunk_embeddings.');
    } else {
      console.log('Vector index found:');
      indexRows.forEach(r => {
        console.log(`  Index: ${r.index_name}, Status: ${r.index_status}, Coverage: ${r.coverage_percentage}%`);
      });
    }
  } catch (err: any) {
    if (err.message.includes('Not found') || err.message.includes('VECTOR_INDEXES')) {
      console.log('Vector search not enabled or INFORMATION_SCHEMA.VECTOR_INDEXES not found.');
    } else {
      console.error('Error checking vector index:', err.message);
    }
  }
}

main().catch(console.error);

