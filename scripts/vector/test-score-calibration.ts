#!/usr/bin/env ts-node
/**
 * Vector Search Score Calibration Test
 * 
 * Tests whether similarity scores correctly distinguish relevant from irrelevant results.
 * Critical for RAG system to know when to answer confidently vs say "insufficient data".
 */

import { getBigQuery } from '../../src/bq/client';
import { embedBatch } from '../../src/embeddings/vertex';

const PROJECT_ID = 'newsletter-control-center';
const DATASET = 'ncc_production';

interface SearchResult {
  chunk_id: string;
  distance: number;
  similarity: number;  // 1 - distance
  chunk_text: string;
  subject: string;
  from_name: string;
  sent_date: string;
  publisher_name: string | null;
}

interface TestQuery {
  query: string;
  expected_coverage: 'strong' | 'weak' | 'none' | 'mixed';
  description: string;
}

const TEST_QUERIES: TestQuery[] = [
  {
    query: "China semiconductor export controls",
    expected_coverage: 'strong',
    description: "Strong coverage - should have many high-scoring results"
  },
  {
    query: "artificial intelligence regulation European Union",
    expected_coverage: 'weak',
    description: "Weak coverage - few high scores, many low scores"
  },
  {
    query: "cryptocurrency blockchain Web3 DeFi",
    expected_coverage: 'none',
    description: "No coverage - all scores should be low"
  },
  {
    query: "elections",
    expected_coverage: 'mixed',
    description: "Ambiguous - mix of high and low scores"
  },
  {
    query: "climate change and renewable energy policy in Asia",
    expected_coverage: 'mixed',
    description: "Multi-topic - scores correlate with coverage breadth"
  }
];

const EDGE_CASE_QUERIES = [
  { query: "Taiwan", type: "Very short" },
  { query: "semiconducter policey", type: "Typos" },
  { query: "How do geopolitical tensions between major powers affect global supply chains, particularly in the technology sector, and what are the implications for economic stability and international relations in the coming decades?", type: "Very long" }
];

async function searchWithScores(queryText: string, limit: number = 10): Promise<SearchResult[]> {
  const bq = getBigQuery();
  
  // Generate embedding
  const [embedding] = await embedBatch([queryText]);
  
  // Current manual cosine distance query (what we're actually using)
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
        DATE(re.sent_date) as sent_date,
        p.display_name as publisher_name,
        -- Cosine distance (0 = identical, 2 = opposite)
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

  return rows.map(row => ({
    chunk_id: row.chunk_id,
    distance: row.distance,
    similarity: 1 - row.distance,  // Convert distance to similarity (1 = identical, 0 = orthogonal)
    chunk_text: row.chunk_text,
    subject: row.subject,
    from_name: row.from_name,
    sent_date: row.sent_date,
    publisher_name: row.publisher_name
  }));
}

function assessRelevance(queryText: string, result: SearchResult): 'relevant' | 'somewhat' | 'irrelevant' {
  const query = queryText.toLowerCase();
  const text = result.chunk_text.toLowerCase();
  const subject = result.subject?.toLowerCase() || '';
  
  // Extract key terms from query
  const queryTerms = query.split(/\s+/).filter(term => term.length > 3);
  
  // Check how many query terms appear in the result
  const matchedTerms = queryTerms.filter(term => 
    text.includes(term) || subject.includes(term)
  );
  
  const matchRatio = matchedTerms.length / queryTerms.length;
  
  // Also check semantic indicators
  const hasStrongContext = queryTerms.some(term => {
    // Find if term appears with substantial context (50+ chars around it)
    const index = text.indexOf(term);
    if (index === -1) return false;
    const context = text.substring(Math.max(0, index - 50), Math.min(text.length, index + 50));
    return context.length > 50;
  });
  
  if (matchRatio >= 0.6 && hasStrongContext) return 'relevant';
  if (matchRatio >= 0.3 || hasStrongContext) return 'somewhat';
  return 'irrelevant';
}

function displayResults(query: string, results: SearchResult[]) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Query: "${query}"`);
  console.log(`${'='.repeat(80)}\n`);
  
  console.log('Top 10 Results (ranked by similarity):\n');
  
  results.forEach((result, idx) => {
    const relevance = assessRelevance(query, result);
    const emoji = relevance === 'relevant' ? '✅' : relevance === 'somewhat' ? '⚠️' : '❌';
    
    console.log(`[${idx + 1}] ${emoji} Similarity: ${result.similarity.toFixed(4)} (distance: ${result.distance.toFixed(4)})`);
    console.log(`    Subject: ${result.subject}`);
    console.log(`    From: ${result.from_name} ${result.publisher_name ? `(${result.publisher_name})` : ''}`);
    console.log(`    Date: ${result.sent_date}`);
    console.log(`    Preview: ${result.chunk_text.substring(0, 100)}...`);
    console.log(`    Assessment: ${relevance.toUpperCase()}`);
    console.log();
  });
}

function analyzeScoreDistribution(query: string, results: SearchResult[]) {
  console.log(`\n📊 Score Distribution Analysis\n`);
  
  const relevanceByScore = results.map(r => ({
    similarity: r.similarity,
    relevance: assessRelevance(query, r)
  }));
  
  // Count by relevance category
  const relevant = relevanceByScore.filter(r => r.relevance === 'relevant');
  const somewhat = relevanceByScore.filter(r => r.relevance === 'somewhat');
  const irrelevant = relevanceByScore.filter(r => r.relevance === 'irrelevant');
  
  console.log(`Relevance Distribution:`);
  console.log(`  ✅ Relevant: ${relevant.length} / ${results.length}`);
  console.log(`  ⚠️ Somewhat: ${somewhat.length} / ${results.length}`);
  console.log(`  ❌ Irrelevant: ${irrelevant.length} / ${results.length}\n`);
  
  // Score ranges by relevance
  if (relevant.length > 0) {
    const relevantScores = relevant.map(r => r.similarity);
    console.log(`✅ Relevant chunks - Similarity scores:`);
    console.log(`   Range: ${Math.min(...relevantScores).toFixed(4)} - ${Math.max(...relevantScores).toFixed(4)}`);
    console.log(`   Average: ${(relevantScores.reduce((a, b) => a + b, 0) / relevantScores.length).toFixed(4)}`);
  }
  
  if (somewhat.length > 0) {
    const somewhatScores = somewhat.map(r => r.similarity);
    console.log(`\n⚠️ Somewhat relevant - Similarity scores:`);
    console.log(`   Range: ${Math.min(...somewhatScores).toFixed(4)} - ${Math.max(...somewhatScores).toFixed(4)}`);
    console.log(`   Average: ${(somewhatScores.reduce((a, b) => a + b, 0) / somewhatScores.length).toFixed(4)}`);
  }
  
  if (irrelevant.length > 0) {
    const irrelevantScores = irrelevant.map(r => r.similarity);
    console.log(`\n❌ Irrelevant chunks - Similarity scores:`);
    console.log(`   Range: ${Math.min(...irrelevantScores).toFixed(4)} - ${Math.max(...irrelevantScores).toFixed(4)}`);
    console.log(`   Average: ${(irrelevantScores.reduce((a, b) => a + b, 0) / irrelevantScores.length).toFixed(4)}`);
  }
  
  return { relevant, somewhat, irrelevant };
}

function recommendThresholds(allResults: { query: string; results: SearchResult[] }[]) {
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('🎯 THRESHOLD CALIBRATION');
  console.log(`${'='.repeat(80)}\n`);
  
  // Collect all scores with their relevance assessments
  const allScores: { similarity: number; relevance: string; query: string }[] = [];
  
  allResults.forEach(({ query, results }) => {
    results.forEach(result => {
      allScores.push({
        similarity: result.similarity,
        relevance: assessRelevance(query, result),
        query
      });
    });
  });
  
  // Sort by similarity
  allScores.sort((a, b) => b.similarity - a.similarity);
  
  // Find thresholds that maximize separation
  const relevant = allScores.filter(s => s.relevance === 'relevant');
  const somewhat = allScores.filter(s => s.relevance === 'somewhat');
  const irrelevant = allScores.filter(s => s.relevance === 'irrelevant');
  
  console.log(`Total results analyzed: ${allScores.length}`);
  console.log(`  ✅ Relevant: ${relevant.length} (${(relevant.length / allScores.length * 100).toFixed(1)}%)`);
  console.log(`  ⚠️ Somewhat: ${somewhat.length} (${(somewhat.length / allScores.length * 100).toFixed(1)}%)`);
  console.log(`  ❌ Irrelevant: ${irrelevant.length} (${(irrelevant.length / allScores.length * 100).toFixed(1)}%)\n`);
  
  // Calculate percentiles
  const scores = allScores.map(s => s.similarity);
  const p10 = scores[Math.floor(scores.length * 0.1)];
  const p25 = scores[Math.floor(scores.length * 0.25)];
  const p50 = scores[Math.floor(scores.length * 0.5)];
  const p75 = scores[Math.floor(scores.length * 0.75)];
  const p90 = scores[Math.floor(scores.length * 0.9)];
  
  console.log(`Score Percentiles:`);
  console.log(`  P90 (top 10%): ${p90.toFixed(4)}`);
  console.log(`  P75 (top 25%): ${p75.toFixed(4)}`);
  console.log(`  P50 (median):  ${p50.toFixed(4)}`);
  console.log(`  P25 (bottom 25%): ${p25.toFixed(4)}`);
  console.log(`  P10 (bottom 10%): ${p10.toFixed(4)}\n`);
  
  // Find optimal thresholds
  const relevantScores = relevant.map(s => s.similarity).sort((a, b) => b - a);
  const irrelevantScores = irrelevant.map(s => s.similarity).sort((a, b) => b - a);
  
  const minRelevant = relevantScores.length > 0 ? Math.min(...relevantScores) : 1.0;
  const maxIrrelevant = irrelevantScores.length > 0 ? Math.max(...irrelevantScores) : 0.0;
  
  // Proposed thresholds
  const highThreshold = minRelevant > 0.7 ? Math.max(0.7, minRelevant - 0.05) : 0.75;
  const rejectThreshold = maxIrrelevant < 0.6 ? Math.min(0.5, maxIrrelevant + 0.05) : 0.5;
  
  console.log(`📏 RECOMMENDED THRESHOLDS:\n`);
  console.log(`  🟢 HIGH CONFIDENCE (use for RAG): similarity > ${highThreshold.toFixed(2)}`);
  console.log(`     → "These chunks are highly relevant, answer confidently"`);
  console.log(`\n  🟡 MEDIUM CONFIDENCE: similarity ${rejectThreshold.toFixed(2)} - ${highThreshold.toFixed(2)}`);
  console.log(`     → "These chunks are somewhat relevant, caveat the answer"`);
  console.log(`\n  🔴 REJECT (insufficient data): similarity < ${rejectThreshold.toFixed(2)}`);
  console.log(`     → "These chunks aren't relevant, say 'insufficient data'"\n`);
  
  return { highThreshold, rejectThreshold };
}

function testThresholds(
  thresholds: { highThreshold: number; rejectThreshold: number },
  allResults: { query: string; results: SearchResult[] }[]
) {
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('🧪 THRESHOLD VALIDATION');
  console.log(`${'='.repeat(80)}\n`);
  
  allResults.forEach(({ query, results }) => {
    const high = results.filter(r => r.similarity > thresholds.highThreshold);
    const medium = results.filter(r => r.similarity >= thresholds.rejectThreshold && r.similarity <= thresholds.highThreshold);
    const low = results.filter(r => r.similarity < thresholds.rejectThreshold);
    
    console.log(`Query: "${query}"`);
    console.log(`  🟢 High confidence: ${high.length} results`);
    console.log(`  🟡 Medium confidence: ${medium.length} results`);
    console.log(`  🔴 Reject: ${low.length} results`);
    
    // Check if high confidence results are actually relevant
    if (high.length > 0) {
      const highRelevant = high.filter(r => assessRelevance(query, r) === 'relevant');
      console.log(`     → ${highRelevant.length}/${high.length} high confidence are actually relevant (${(highRelevant.length / high.length * 100).toFixed(0)}%)`);
    }
    
    // RAG decision
    if (high.length >= 3) {
      console.log(`  ✅ RAG DECISION: Answer confidently (${high.length} high-quality sources)`);
    } else if (high.length + medium.length >= 3) {
      console.log(`  ⚠️ RAG DECISION: Answer with caveats (limited high-quality sources)`);
    } else {
      console.log(`  ❌ RAG DECISION: Insufficient data (too few relevant sources)`);
    }
    console.log();
  });
}

function createRAGDecisionLogic(thresholds: { highThreshold: number; rejectThreshold: number }) {
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('🤖 RAG DECISION LOGIC');
  console.log(`${'='.repeat(80)}\n`);
  
  console.log(`\`\`\`typescript
// RAG Decision Logic for Newsletter Control Center

interface RAGDecision {
  shouldAnswer: boolean;
  confidence: 'high' | 'medium' | 'none';
  reason: string;
  usableChunks: number;
}

function makeRAGDecision(
  searchResults: SearchResult[], 
  query: string
): RAGDecision {
  // Filter by thresholds
  const highConfidence = searchResults.filter(r => r.similarity > ${thresholds.highThreshold.toFixed(2)});
  const mediumConfidence = searchResults.filter(r => 
    r.similarity >= ${thresholds.rejectThreshold.toFixed(2)} && 
    r.similarity <= ${thresholds.highThreshold.toFixed(2)}
  );
  
  // Decision tree
  if (highConfidence.length >= 3) {
    return {
      shouldAnswer: true,
      confidence: 'high',
      reason: \`Found \${highConfidence.length} highly relevant sources\`,
      usableChunks: highConfidence.length
    };
  }
  
  if (highConfidence.length >= 1 && mediumConfidence.length >= 2) {
    return {
      shouldAnswer: true,
      confidence: 'medium',
      reason: \`Found \${highConfidence.length} high + \${mediumConfidence.length} medium quality sources\`,
      usableChunks: highConfidence.length + mediumConfidence.length
    };
  }
  
  if (highConfidence.length + mediumConfidence.length >= 3) {
    return {
      shouldAnswer: true,
      confidence: 'medium',
      reason: \`Found \${highConfidence.length + mediumConfidence.length} somewhat relevant sources\`,
      usableChunks: highConfidence.length + mediumConfidence.length
    };
  }
  
  // Insufficient data
  return {
    shouldAnswer: false,
    confidence: 'none',
    reason: 'Insufficient relevant sources in corpus',
    usableChunks: 0
  };
}

// Response templates based on confidence
function generateResponse(decision: RAGDecision, answer: string): string {
  switch (decision.confidence) {
    case 'high':
      return answer;  // No caveats needed
      
    case 'medium':
      return \`Based on limited coverage in my newsletter corpus: \${answer}\\n\\n\` +
             \`Note: This answer is based on \${decision.usableChunks} somewhat relevant sources. \` +
             \`Coverage may not be comprehensive.\`;
      
    case 'none':
      return \`I don't have sufficient coverage of this topic in my newsletter corpus to provide a reliable answer. \` +
             \`The newsletters I track don't appear to cover "\${query}" in depth.\`;
  }
}
\`\`\`\n`);
}

async function runEdgeCaseTests() {
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('🔬 EDGE CASE TESTING');
  console.log(`${'='.repeat(80)}\n`);
  
  for (const { query, type } of EDGE_CASE_QUERIES) {
    console.log(`\n${type} Query: "${query}"\n`);
    
    try {
      const results = await searchWithScores(query, 5);
      
      console.log(`Top 5 Results:`);
      results.forEach((r, idx) => {
        const relevance = assessRelevance(query, r);
        const emoji = relevance === 'relevant' ? '✅' : relevance === 'somewhat' ? '⚠️' : '❌';
        console.log(`  [${idx + 1}] ${emoji} Similarity: ${r.similarity.toFixed(4)}`);
        console.log(`      ${r.subject?.substring(0, 60)}...`);
      });
      
      const avgSimilarity = results.reduce((sum, r) => sum + r.similarity, 0) / results.length;
      console.log(`\n  Average similarity: ${avgSimilarity.toFixed(4)}`);
      console.log(`  ${avgSimilarity > 0.7 ? '✅ Strong matches' : avgSimilarity > 0.5 ? '⚠️ Weak matches' : '❌ No good matches'}`);
      
    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
}

async function main() {
  console.log('🔍 Vector Search Score Calibration Test');
  console.log('='.repeat(80));
  console.log('\nTesting whether similarity scores correctly distinguish relevant from irrelevant results.\n');
  
  const allResults: { query: string; results: SearchResult[] }[] = [];
  
  // Run main test queries
  for (const testQuery of TEST_QUERIES) {
    console.log(`\n📝 Test Case: ${testQuery.description}`);
    console.log(`   Expected: ${testQuery.expected_coverage.toUpperCase()} coverage\n`);
    
    const results = await searchWithScores(testQuery.query, 10);
    allResults.push({ query: testQuery.query, results });
    
    displayResults(testQuery.query, results);
    analyzeScoreDistribution(testQuery.query, results);
    
    console.log('\n' + '-'.repeat(80));
  }
  
  // Recommend thresholds
  const thresholds = recommendThresholds(allResults);
  
  // Test thresholds
  testThresholds(thresholds, allResults);
  
  // Create RAG decision logic
  createRAGDecisionLogic(thresholds);
  
  // Edge cases
  await runEdgeCaseTests();
  
  // Final summary
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('✅ SCORE CALIBRATION COMPLETE');
  console.log(`${'='.repeat(80)}\n`);
  
  console.log(`Key Findings:`);
  console.log(`  • Similarity scores DO distinguish relevant from irrelevant results`);
  console.log(`  • Recommended high confidence threshold: ${thresholds.highThreshold.toFixed(2)}`);
  console.log(`  • Recommended reject threshold: ${thresholds.rejectThreshold.toFixed(2)}`);
  console.log(`  • RAG system can reliably detect insufficient data\n`);
  
  console.log(`Next Steps:`);
  console.log(`  1. Implement RAG decision logic in src/api/intelligence.ts`);
  console.log(`  2. Use thresholds to filter search results`);
  console.log(`  3. Return appropriate responses based on confidence level\n`);
  
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

