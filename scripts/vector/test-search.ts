#!/usr/bin/env ts-node
/**
 * Test Vector Search
 * 
 * Demonstrates vector similarity search using the BigQuery vector index.
 * 
 * Examples:
 *   npm run vector:test                    # Random chunk similarity search
 *   npm run vector:test -- --query "AI"    # Search for chunks similar to "AI"
 *   npm run vector:test -- --limit 5       # Return top 5 results
 */

import { getBigQuery } from '../../src/bq/client';
import { embedBatch } from '../../src/embeddings/vertex';

const PROJECT_ID = 'newsletter-control-center';
const DATASET = 'ncc_production';

interface SearchOptions {
  query?: string;
  chunkId?: string;
  limit?: number;
}

async function getRandomChunk() {
  const bq = getBigQuery();
  
  const [rows] = await bq.query({
    query: `
      SELECT 
        ce.chunk_id,
        c.chunk_text,
        c.gmail_message_id,
        re.subject,
        re.from_name,
        DATE(re.sent_date) as sent_date
      FROM \`${PROJECT_ID}.${DATASET}.chunk_embeddings\` ce
      JOIN \`${PROJECT_ID}.${DATASET}.chunks\` c
        ON ce.chunk_id = c.chunk_id
      JOIN \`${PROJECT_ID}.${DATASET}.raw_emails\` re
        ON c.gmail_message_id = re.gmail_message_id
      WHERE c.is_junk = FALSE
      ORDER BY RAND()
      LIMIT 1
    `,
    location: 'US'
  });

  return rows[0];
}

async function generateQueryEmbedding(text: string): Promise<number[]> {
  const embeddings = await embedBatch([text]);
  return embeddings[0];
}

async function searchByEmbedding(embedding: number[], limit: number = 10) {
  const bq = getBigQuery();
  
  console.log(`🔍 Searching for ${limit} most similar chunks...\n`);
  
  const startTime = Date.now();
  
  // BigQuery vector search using VECTOR_SEARCH function
  // Note: VECTOR_SEARCH returns just the distance, we need to use it in a different way
  const [rows] = await bq.query({
    query: `
      WITH query_embedding AS (
        SELECT ${JSON.stringify(embedding)} AS embedding
      )
      SELECT 
        ce.chunk_id,
        c.chunk_text,
        re.subject,
        re.from_name,
        re.from_email,
        DATE(re.sent_date) as sent_date,
        p.display_name as publisher_name,
        -- Calculate cosine distance
        (1 - (
          (SELECT SUM(a * b) FROM UNNEST(ce.embedding) AS a WITH OFFSET pos1
           JOIN UNNEST(query_embedding.embedding) AS b WITH OFFSET pos2
           ON pos1 = pos2)
          /
          (SQRT((SELECT SUM(a * a) FROM UNNEST(ce.embedding) AS a)) *
           SQRT((SELECT SUM(b * b) FROM UNNEST(query_embedding.embedding) AS b)))
        )) AS distance
      FROM \`${PROJECT_ID}.${DATASET}.chunk_embeddings\` ce
      CROSS JOIN query_embedding
      JOIN \`${PROJECT_ID}.${DATASET}.chunks\` c
        ON ce.chunk_id = c.chunk_id
      JOIN \`${PROJECT_ID}.${DATASET}.raw_emails\` re
        ON c.gmail_message_id = re.gmail_message_id
      LEFT JOIN \`${PROJECT_ID}.${DATASET}.publishers\` p
        ON c.publisher_id = p.publisher_id
      WHERE c.is_junk = FALSE
      ORDER BY distance ASC
      LIMIT ${limit}
    `,
    location: 'US'
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log(`✅ Query completed in ${duration}s\n`);
  console.log('='.repeat(80));
  
  return rows;
}

async function searchByChunkId(chunkId: string, limit: number = 10) {
  const bq = getBigQuery();
  
  console.log(`📄 Finding similar chunks to: ${chunkId}\n`);
  
  // First, get the source chunk details
  const [sourceRows] = await bq.query({
    query: `
      SELECT 
        c.chunk_text,
        re.subject,
        re.from_name,
        DATE(re.sent_date) as sent_date
      FROM \`${PROJECT_ID}.${DATASET}.chunks\` c
      JOIN \`${PROJECT_ID}.${DATASET}.raw_emails\` re
        ON c.gmail_message_id = re.gmail_message_id
      WHERE c.chunk_id = '${chunkId}'
    `,
    location: 'US'
  });

  if (sourceRows.length === 0) {
    throw new Error(`Chunk ${chunkId} not found`);
  }

  const source = sourceRows[0];
  console.log('Source Chunk:');
  console.log(`  From: ${source.from_name}`);
  console.log(`  Subject: ${source.subject}`);
  console.log(`  Date: ${source.sent_date}`);
  console.log(`  Text: ${source.chunk_text.substring(0, 150)}...`);
  console.log();

  const startTime = Date.now();
  
  // Use vector search with the chunk's embedding
  const [rows] = await bq.query({
    query: `
      WITH query_embedding AS (
        SELECT embedding 
        FROM \`${PROJECT_ID}.${DATASET}.chunk_embeddings\`
        WHERE chunk_id = '${chunkId}'
      )
      SELECT 
        ce.chunk_id,
        c.chunk_text,
        re.subject,
        re.from_name,
        re.from_email,
        DATE(re.sent_date) as sent_date,
        p.display_name as publisher_name,
        -- Calculate cosine distance
        (1 - (
          (SELECT SUM(a * b) FROM UNNEST(ce.embedding) AS a WITH OFFSET pos1
           JOIN UNNEST(query_embedding.embedding) AS b WITH OFFSET pos2
           ON pos1 = pos2)
          /
          (SQRT((SELECT SUM(a * a) FROM UNNEST(ce.embedding) AS a)) *
           SQRT((SELECT SUM(b * b) FROM UNNEST(query_embedding.embedding) AS b)))
        )) AS distance
      FROM \`${PROJECT_ID}.${DATASET}.chunk_embeddings\` ce
      CROSS JOIN query_embedding
      JOIN \`${PROJECT_ID}.${DATASET}.chunks\` c
        ON ce.chunk_id = c.chunk_id
      JOIN \`${PROJECT_ID}.${DATASET}.raw_emails\` re
        ON c.gmail_message_id = re.gmail_message_id
      LEFT JOIN \`${PROJECT_ID}.${DATASET}.publishers\` p
        ON c.publisher_id = p.publisher_id
      WHERE c.is_junk = FALSE
        AND ce.chunk_id != '${chunkId}'
      ORDER BY distance ASC
      LIMIT ${limit}
    `,
    location: 'US'
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log(`✅ Query completed in ${duration}s\n`);
  console.log('='.repeat(80));
  
  return rows;
}

function displayResults(rows: any[]) {
  rows.forEach((row, idx) => {
    console.log(`\n[${idx + 1}] Similarity: ${(1 - row.distance).toFixed(4)} (distance: ${row.distance.toFixed(4)})`);
    console.log(`    Chunk ID: ${row.chunk_id}`);
    console.log(`    From: ${row.from_name} <${row.from_email}>`);
    if (row.publisher_name) {
      console.log(`    Publisher: ${row.publisher_name}`);
    }
    console.log(`    Subject: ${row.subject}`);
    console.log(`    Date: ${row.sent_date}`);
    console.log(`    Text: ${row.chunk_text.substring(0, 200)}...`);
  });
  
  console.log('\n' + '='.repeat(80));
}

async function main() {
  const args = process.argv.slice(2);
  const options: SearchOptions = {
    limit: 10
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--query' && args[i + 1]) {
      options.query = args[i + 1];
      i++;
    } else if (args[i] === '--chunk-id' && args[i + 1]) {
      options.chunkId = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    }
  }

  try {
    console.log('🚀 Vector Search Test\n');
    
    let results: any[];
    
    if (options.query) {
      // Search by query text
      console.log(`Query: "${options.query}"\n`);
      console.log('⏳ Generating query embedding...');
      const embedding = await generateQueryEmbedding(options.query);
      console.log(`✅ Generated ${embedding.length}-dimensional embedding\n`);
      
      results = await searchByEmbedding(embedding, options.limit);
      
    } else if (options.chunkId) {
      // Search by chunk ID
      results = await searchByChunkId(options.chunkId, options.limit);
      
    } else {
      // Random chunk similarity search
      console.log('📍 No query specified, selecting a random chunk...\n');
      const randomChunk = await getRandomChunk();
      
      console.log('Random Chunk Selected:');
      console.log(`  Chunk ID: ${randomChunk.chunk_id}`);
      console.log(`  From: ${randomChunk.from_name}`);
      console.log(`  Subject: ${randomChunk.subject}`);
      console.log(`  Date: ${randomChunk.sent_date}`);
      console.log(`  Text: ${randomChunk.chunk_text.substring(0, 150)}...`);
      console.log();
      
      results = await searchByChunkId(randomChunk.chunk_id, options.limit);
    }
    
    console.log(`\n📊 Found ${results.length} similar chunks:\n`);
    displayResults(results);
    
    console.log('\n💡 Usage Examples:');
    console.log('  npm run vector:test                              # Random chunk');
    console.log('  npm run vector:test -- --query "artificial intelligence"');
    console.log('  npm run vector:test -- --chunk-id abc123 --limit 5');
    
    process.exit(0);
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.message?.includes('VECTOR_SEARCH')) {
      console.error('\n💡 Hint: The vector index may not be built yet.');
      console.error('   Run: npm run vector:status');
    }
    process.exit(1);
  }
}

main();

