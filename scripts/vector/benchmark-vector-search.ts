#!/usr/bin/env ts-node
/**
 * Vector Search Performance Benchmark
 * 
 * Comprehensive performance audit of vector search implementation.
 * Tests multiple approaches and measures actual performance.
 */

import { getBigQuery } from '../../src/bq/client';
import { embedBatch } from '../../src/embeddings/vertex';

const PROJECT_ID = 'newsletter-control-center';
const DATASET = 'ncc_production';

interface BenchmarkResult {
  approach: string;
  queryTime: number;
  totalTime: number;
  embeddingTime?: number;
  results: any[];
}

interface TestQuery {
  text: string;
  description: string;
}

const TEST_QUERIES: TestQuery[] = [
  { text: "China semiconductor policy", description: "Tech policy" },
  { text: "climate change renewable energy", description: "Environment" },
  { text: "Middle East conflicts", description: "Geopolitics" },
  { text: "artificial intelligence regulation", description: "AI policy" },
  { text: "European Union politics", description: "EU affairs" }
];

async function benchmarkManualCosine(embedding: number[], limit: number = 10): Promise<BenchmarkResult> {
  const bq = getBigQuery();
  const startTime = Date.now();
  
  const query = `
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
      -- Manual cosine distance calculation
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
  `;

  const [rows] = await bq.query({ query, location: 'US' });
  const totalTime = Date.now() - startTime;

  return {
    approach: 'Manual Cosine Distance',
    queryTime: totalTime,
    totalTime,
    results: rows
  };
}

async function benchmarkNativeVectorSearch(embedding: number[], limit: number = 10): Promise<BenchmarkResult> {
  const bq = getBigQuery();
  const startTime = Date.now();
  
  // Try BigQuery's native VECTOR_SEARCH function
  // This should leverage the vector index directly
  const query = `
    SELECT 
      base.chunk_id,
      base.distance,
      c.chunk_text,
      re.subject,
      re.from_name,
      re.from_email,
      DATE(re.sent_date) as sent_date,
      p.display_name as publisher_name
    FROM VECTOR_SEARCH(
      TABLE \`${PROJECT_ID}.${DATASET}.chunk_embeddings\`,
      'embedding',
      (SELECT ${JSON.stringify(embedding)} AS embedding),
      distance_type => 'COSINE',
      top_k => ${limit}
    ) AS base
    JOIN \`${PROJECT_ID}.${DATASET}.chunks\` c
      ON base.chunk_id = c.chunk_id
    JOIN \`${PROJECT_ID}.${DATASET}.raw_emails\` re
      ON c.gmail_message_id = re.gmail_message_id
    LEFT JOIN \`${PROJECT_ID}.${DATASET}.publishers\` p
      ON c.publisher_id = p.publisher_id
    WHERE c.is_junk = FALSE
    ORDER BY base.distance ASC
  `;

  try {
    const [rows] = await bq.query({ query, location: 'US' });
    const totalTime = Date.now() - startTime;

    return {
      approach: 'Native VECTOR_SEARCH()',
      queryTime: totalTime,
      totalTime,
      results: rows
    };
  } catch (error: any) {
    console.log(`   ⚠️  Native VECTOR_SEARCH failed: ${error.message.substring(0, 100)}`);
    return {
      approach: 'Native VECTOR_SEARCH()',
      queryTime: -1,
      totalTime: -1,
      results: []
    };
  }
}

async function benchmarkVectorSearchNoJoins(embedding: number[], limit: number = 10): Promise<BenchmarkResult> {
  const bq = getBigQuery();
  const startTime = Date.now();
  
  // Vector search without metadata joins (to measure pure search speed)
  const query = `
    WITH query_embedding AS (
      SELECT ${JSON.stringify(embedding)} AS embedding
    )
    SELECT 
      ce.chunk_id,
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
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  const [rows] = await bq.query({ query, location: 'US' });
  const totalTime = Date.now() - startTime;

  return {
    approach: 'Manual Cosine (No Joins)',
    queryTime: totalTime,
    totalTime,
    results: rows
  };
}

async function runBenchmark(queryText: string, runs: number = 3): Promise<{
  query: string;
  embeddingTime: number;
  results: BenchmarkResult[];
}> {
  console.log(`\n🔬 Benchmarking query: "${queryText}"`);
  
  // Generate embedding once
  const embStart = Date.now();
  const embedding = await embedBatch([queryText]);
  const embeddingTime = Date.now() - embStart;
  
  console.log(`   ⏱️  Embedding generation: ${embeddingTime}ms`);
  
  const results: BenchmarkResult[] = [];
  
  // Test each approach multiple times
  for (let run = 1; run <= runs; run++) {
    console.log(`\n   Run ${run}/${runs}:`);
    
    // Manual cosine
    console.log(`      Testing: Manual Cosine Distance...`);
    const manual = await benchmarkManualCosine(embedding[0], 10);
    console.log(`      ✓ ${manual.totalTime}ms`);
    
    // Native vector search
    console.log(`      Testing: Native VECTOR_SEARCH()...`);
    const native = await benchmarkNativeVectorSearch(embedding[0], 10);
    if (native.queryTime > 0) {
      console.log(`      ✓ ${native.totalTime}ms`);
    }
    
    // No joins (measure pure search)
    console.log(`      Testing: Manual Cosine (No Joins)...`);
    const noJoins = await benchmarkVectorSearchNoJoins(embedding[0], 10);
    console.log(`      ✓ ${noJoins.totalTime}ms`);
    
    if (run === 1) {
      results.push(manual);
      if (native.queryTime > 0) results.push(native);
      results.push(noJoins);
    } else {
      // Average with previous runs
      results[0].totalTime = (results[0].totalTime + manual.totalTime) / 2;
      if (native.queryTime > 0 && results.length > 1) {
        const nativeIdx = results.findIndex(r => r.approach === 'Native VECTOR_SEARCH()');
        if (nativeIdx >= 0) {
          results[nativeIdx].totalTime = (results[nativeIdx].totalTime + native.totalTime) / 2;
        }
      }
      const noJoinIdx = results.findIndex(r => r.approach === 'Manual Cosine (No Joins)');
      results[noJoinIdx].totalTime = (results[noJoinIdx].totalTime + noJoins.totalTime) / 2;
    }
  }
  
  return {
    query: queryText,
    embeddingTime,
    results
  };
}

function assessRelevance(queryText: string, results: any[]): { score: number; notes: string[] } {
  const notes: string[] = [];
  let relevantCount = 0;
  
  // Check top 5 results
  for (let i = 0; i < Math.min(5, results.length); i++) {
    const result = results[i];
    const text = result.chunk_text?.toLowerCase() || '';
    const subject = result.subject?.toLowerCase() || '';
    
    // Simple heuristic: check if query keywords appear in result
    const queryWords = queryText.toLowerCase().split(' ');
    const matchCount = queryWords.filter(word => 
      text.includes(word) || subject.includes(word)
    ).length;
    
    if (matchCount >= queryWords.length * 0.5) {
      relevantCount++;
      notes.push(`✓ Result ${i + 1}: Relevant (matched ${matchCount}/${queryWords.length} keywords)`);
    } else {
      notes.push(`✗ Result ${i + 1}: Weak match (matched ${matchCount}/${queryWords.length} keywords)`);
    }
  }
  
  const score = (relevantCount / Math.min(5, results.length)) * 100;
  return { score, notes };
}

async function main() {
  console.log('🚀 Vector Search Performance Audit');
  console.log('='.repeat(80));
  
  const allBenchmarks: any[] = [];
  
  // Run benchmarks for each test query
  for (const testQuery of TEST_QUERIES) {
    const benchmark = await runBenchmark(testQuery.text, 3);
    
    // Assess relevance of results
    const manualResults = benchmark.results.find(r => r.approach === 'Manual Cosine Distance');
    if (manualResults) {
      const relevance = assessRelevance(testQuery.text, manualResults.results);
      console.log(`\n   📊 Relevance Score: ${relevance.score.toFixed(0)}%`);
    }
    
    allBenchmarks.push({
      query: testQuery.text,
      description: testQuery.description,
      embedding_time: benchmark.embeddingTime,
      results: benchmark.results
    });
    
    // Small delay between queries
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Print summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 BENCHMARK SUMMARY');
  console.log('='.repeat(80));
  
  console.log('\nAverage Times (across all queries):');
  
  const approaches = allBenchmarks[0].results.map((r: any) => r.approach);
  
  for (const approach of approaches) {
    const times = allBenchmarks.map((b: any) => 
      b.results.find((r: any) => r.approach === approach)?.totalTime || 0
    ).filter((t: number) => t > 0);
    
    if (times.length > 0) {
      const avg = times.reduce((a: number, b: number) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      
      console.log(`\n${approach}:`);
      console.log(`   Average: ${avg.toFixed(0)}ms`);
      console.log(`   Min: ${min}ms`);
      console.log(`   Max: ${max}ms`);
    }
  }
  
  const avgEmbedding = allBenchmarks.reduce((sum, b) => sum + b.embedding_time, 0) / allBenchmarks.length;
  console.log(`\nEmbedding Generation:`);
  console.log(`   Average: ${avgEmbedding.toFixed(0)}ms`);
  
  // Save detailed results
  const reportPath = `reports/vector-search-benchmark-${new Date().toISOString().split('T')[0]}.json`;
  const fs = require('fs');
  const path = require('path');
  
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    benchmarks: allBenchmarks
  }, null, 2));
  
  console.log(`\n✅ Detailed results saved to: ${reportPath}`);
  
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

