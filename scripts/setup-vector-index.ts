import 'dotenv/config';
import { getBigQuery } from '../src/bq/client';

async function main() {
  const bq = getBigQuery();
  const projectId = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const datasetId = process.env.BQ_DATASET || 'ncc_production';
  const tableName = 'chunk_embeddings';
  const indexName = 'chunk_embedding_index';

  console.log(`\n🚀 Starting Vector Index Setup for ${projectId}.${datasetId}.${tableName}`);

  // 1. Check if index exists
  const checkQuery = `
    SELECT index_name, coverage_percentage, last_refresh_time
    FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.VECTOR_INDEXES\`
    WHERE table_name = '${tableName}' AND index_name = '${indexName}'
  `;

  const [rows] = await bq.query(checkQuery);
  
  if (rows.length > 0) {
    const index = rows[0];
    console.log(`\n✅ Index '${indexName}' already exists.`);
    console.log(`   Coverage: ${index.coverage_percentage}%`);
    console.log(`   Last Refresh: ${index.last_refresh_time ? index.last_refresh_time.value : 'Never'}`);
    
    if (index.coverage_percentage < 100) {
      console.log('\n⏳ Index is building/backfilling. Monitoring progress...');
      await monitorIndex(bq, projectId, datasetId, tableName, indexName);
    } else {
      console.log('\n✨ Index is ready for queries!');
    }
    return;
  }

  // 2. Create Index
  console.log('\n🛠️  Creating Vector Index (this triggers a background build)...');
  const createDDL = `
    CREATE VECTOR INDEX \`${indexName}\`
    ON \`${projectId}.${datasetId}.${tableName}\`(embedding)
    OPTIONS(
      distance_type = 'COSINE',
      index_type = 'IVF'
    )
  `;

  try {
    await bq.query(createDDL);
    console.log('✅ CREATE VECTOR INDEX command submitted successfully.');
  } catch (error: any) {
    console.error('❌ Error creating index:', error.message);
    process.exit(1);
  }

  // 3. Monitor Build
  console.log('\n⏳ Monitoring build progress (this typically takes 20-30 minutes)...');
  await monitorIndex(bq, projectId, datasetId, tableName, indexName);
}

async function monitorIndex(bq: any, projectId: string, datasetId: string, tableName: string, indexName: string) {
  const query = `
    SELECT coverage_percentage, last_refresh_time
    FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.VECTOR_INDEXES\`
    WHERE table_name = '${tableName}' AND index_name = '${indexName}'
  `;

  let lastCoverage = -1;
  const startTime = Date.now();

  while (true) {
    const [rows] = await bq.query(query);
    if (rows.length === 0) {
      console.log('   Waiting for index metadata to appear...');
    } else {
      const coverage = rows[0].coverage_percentage;
      
      if (coverage !== lastCoverage) {
        const elapsed = Math.round((Date.now() - startTime) / 1000 / 60);
        console.log(`   [${elapsed}m] Coverage: ${coverage}%`);
        lastCoverage = coverage;
      }

      if (coverage >= 100) {
        console.log('\n🎉 Index build complete! (100% coverage)');
        break;
      }
    }

    // Wait 30 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}

main().catch(console.error);

