import 'dotenv/config';
import { getBigQuery } from '../src/bq/client';

async function main() {
  const bq = getBigQuery();
  const projectId = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const datasetId = process.env.BQ_DATASET || 'ncc_production';

  console.log('🎲 Picking a random chunk to test search...');

  // 1. Get a random chunk ID and its text for context
  const randomChunkQuery = `
    SELECT c.chunk_id, c.chunk_text
    FROM \`${projectId}.${datasetId}.chunks\` c
    JOIN \`${projectId}.${datasetId}.chunk_embeddings\` e USING(chunk_id)
    WHERE c.is_junk = FALSE
    ORDER BY RAND()
    LIMIT 1
  `;

  const [randomRows] = await bq.query(randomChunkQuery);
  if (randomRows.length === 0) {
    console.error('❌ No chunks found!');
    return;
  }
  const target = randomRows[0];
  console.log(`\n🎯 Target Chunk (${target.chunk_id}):`);
  console.log(`"${target.chunk_text.substring(0, 100)}..."`);

  // 2. Run Vector Search
  console.log('\n🔍 Running VECTOR_SEARCH...');
  const start = Date.now();

  // Note: VECTOR_SEARCH returns 'distance' which is 1 - cosine_similarity for COSINE distance type
  const searchQuery = `
    SELECT *
    FROM
      VECTOR_SEARCH(
        TABLE \`${projectId}.${datasetId}.chunk_embeddings\`,
        'embedding',
        (SELECT embedding FROM \`${projectId}.${datasetId}.chunk_embeddings\` WHERE chunk_id = '${target.chunk_id}'),
        top_k => 10
      )
  `;

  try {
    const [results] = await bq.query(searchQuery);
    const duration = Date.now() - start;

    console.log(`\n✅ Found ${results.length} matches in ${duration}ms.`);
    
    if (results.length > 0) {
        console.log('First result keys:', Object.keys(results[0]));
    }
    
    // Fetch text for results
    const chunkIds = results.map((r: any) => r.base.chunk_id).filter((id: any) => id);
    
    if (chunkIds.length > 0) {
        const textQuery = `
            SELECT chunk_id, chunk_text 
            FROM \`${projectId}.${datasetId}.chunks\` 
            WHERE chunk_id IN (${chunkIds.map((id: string) => `'${id}'`).join(',')})
        `;
        const [textRows] = await bq.query(textQuery);
        const textMap = new Map(textRows.map((r: any) => [r.chunk_id, r.chunk_text]));

        results.forEach((row: any, i: number) => {
            const text = textMap.get(row.base.chunk_id) || 'Text not found';
            console.log(`\n${i + 1}. [Dist: ${row.distance.toFixed(4)}] ${row.base.chunk_id}`);
            console.log(`   "${text.substring(0, 150).replace(/\n/g, ' ')}..."`);
        });
    }

  } catch (error: any) {
    console.error('❌ Search failed:', error.message);
    if (error.message.includes('Vector index not found') || error.message.includes('is not indexed')) {
      console.log('💡 Hint: The vector index might not be built yet. Run "npm run index:setup" and wait for completion.');
    }
  }
}

main().catch(console.error);

