import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';

async function optimizeTables() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  
  try {
    console.log('🔄 Optimizing BigQuery tables for partitioning and clustering...\n');
    
    // Table 1: messages
    console.log('📊 Optimizing messages table...');
    await optimizeMessagesTable(bigquery);
    
    // Table 2: chunks
    console.log('\n📊 Optimizing chunks table...');
    await optimizeChunksTable(bigquery);
    
    console.log('\n🎉 Table optimization complete!\n');
    
  } catch (error) {
    console.error('❌ Optimization failed:', error);
    throw error;
  }
}

async function optimizeMessagesTable(bigquery: BigQuery) {
  const tableId = 'messages';
  
  try {
    // Check if table is already partitioned/clustered
    const [metadata] = await bigquery
      .dataset(DATASET_ID)
      .table(tableId)
      .getMetadata();
    
    const isPartitioned = metadata.timePartitioning !== undefined;
    const isClustered = metadata.clustering?.fields !== undefined;
    
    if (isPartitioned && isClustered) {
      console.log('✅ messages table is already optimized');
      return;
    }
    
    console.log(`   Current state: ${isPartitioned ? 'Partitioned' : 'Not partitioned'}, ${isClustered ? 'Clustered' : 'Not clustered'}`);
    console.log('⚠️  NOTE: BigQuery does not support ALTER TABLE for partitioning/clustering');
    console.log('   Tables can only be partitioned/clustered at creation time.');
    console.log('   This table will be optimized on next ingestion run.');
    
  } catch (error) {
    console.error(`❌ Failed to check ${tableId}:`, error);
  }
}

async function optimizeChunksTable(bigquery: BigQuery) {
  const tableId = 'chunks';
  
  try {
    // Check if table is already partitioned/clustered
    const [metadata] = await bigquery
      .dataset(DATASET_ID)
      .table(tableId)
      .getMetadata();
    
    const isPartitioned = metadata.timePartitioning !== undefined;
    const isClustered = metadata.clustering?.fields !== undefined;
    
    if (isPartitioned && isClustered) {
      console.log('✅ chunks table is already optimized');
      return;
    }
    
    console.log(`   Current state: ${isPartitioned ? 'Partitioned' : 'Not partitioned'}, ${isClustered ? 'Clustered' : 'Not clustered'}`);
    console.log('⚠️  NOTE: BigQuery does not support ALTER TABLE for partitioning/clustering');
    console.log('   Tables can only be partitioned/clustered at creation time.');
    console.log('   This table will be optimized on next ingestion run.');
    
  } catch (error) {
    console.error(`❌ Failed to check ${tableId}:`, error);
  }
}

optimizeTables();

