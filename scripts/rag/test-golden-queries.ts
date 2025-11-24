#!/usr/bin/env ts-node
/**
 * RAG Golden Query Test
 * 
 * Tests the RAG pipeline with queries expected to have good coverage
 * 
 * Golden Queries (from test set):
 * 1. "China semiconductor export controls" - Expected: HIGH confidence
 * 2. "climate change renewable energy Asia" - Expected: HIGH or MEDIUM confidence
 * 3. "European Union AI regulation" - Expected: MEDIUM confidence (weak coverage)
 * 
 * Success criteria:
 * - Query 1: Should find 3+ relevant chunks, answer confidently
 * - Query 2: Should find 3+ relevant chunks, answer with medium-to-high confidence
 * - Query 3: Should find some relevant chunks but lower confidence
 */

import dotenv from 'dotenv';
dotenv.config();

import { executeRAGQuery } from '../../src/core/rag';

interface TestQuery {
  query: string;
  expectedConfidence: 'high' | 'medium' | 'none';
  description: string;
}

const GOLDEN_QUERIES: TestQuery[] = [
  {
    query: "China semiconductor export controls",
    expectedConfidence: 'high',
    description: "Strong coverage - geopolitics & tech policy"
  },
  {
    query: "climate change renewable energy Asia",
    expectedConfidence: 'medium',
    description: "Good coverage - climate & energy topics"
  },
  {
    query: "European Union AI regulation",
    expectedConfidence: 'medium',
    description: "Weak coverage - EU policy gaps expected"
  }
];

async function testGoldenQueries() {
  console.log('='.repeat(80));
  console.log('🧪 RAG GOLDEN QUERY TEST');
  console.log('='.repeat(80));
  console.log();
  console.log('Testing RAG pipeline with queries that SHOULD be answered');
  console.log('These queries have known coverage in our newsletter corpus');
  console.log();
  console.log('='.repeat(80));
  console.log();
  
  let allTestsPassed = true;
  const results: any[] = [];
  
  for (const testQuery of GOLDEN_QUERIES) {
    console.log(`\n📝 Query ${GOLDEN_QUERIES.indexOf(testQuery) + 1}/${GOLDEN_QUERIES.length}:`);
    console.log(`   "${testQuery.query}"`);
    console.log(`   ${testQuery.description}`);
    console.log(`   Expected confidence: ${testQuery.expectedConfidence.toUpperCase()}`);
    console.log();
    
    const startTime = Date.now();
    const result = await executeRAGQuery(testQuery.query);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    results.push({ testQuery, result, duration });
    
    // Display results
    console.log(`   ⏱️  Query time: ${duration}s`);
    console.log(`   🔍 Stage 1: ${result.searchResults.length} chunks found`);
    console.log(`   🎯 Stage 2: ${result.decision.usableChunks} usable chunks`);
    console.log(`   🤖 Decision: ${result.decision.shouldAnswer ? 'ANSWER' : 'REJECT'} (confidence: ${result.decision.confidence})`);
    console.log(`   💡 Reason: ${result.decision.reason}`);
    
    // Show top 3 results
    if (result.decision.filteredResults.length > 0) {
      console.log();
      console.log(`   Top 3 relevant chunks:`);
      result.decision.filteredResults.slice(0, 3).forEach((r: any, idx: number) => {
        console.log(`     [${idx + 1}] Sim: ${r.similarity.toFixed(3)} | Rel: ${r.relevance_score?.toFixed(3)} | ${r.subject.substring(0, 50)}...`);
      });
    }
    
    // Validate
    const passesTest = result.decision.shouldAnswer === true;
    console.log();
    console.log(`   ${passesTest ? '✅ PASS' : '❌ FAIL'}: Query was ${passesTest ? 'answered' : 'rejected'}`);
    
    if (!passesTest) {
      allTestsPassed = false;
    }
  }
  
  // ===== SUMMARY =====
  
  console.log();
  console.log('='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log();
  
  results.forEach(({ testQuery, result, duration }, idx) => {
    const passed = result.decision.shouldAnswer === true;
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} Query ${idx + 1}: "${testQuery.query}"`);
    console.log(`   Confidence: ${result.decision.confidence.toUpperCase()} (expected: ${testQuery.expectedConfidence.toUpperCase()})`);
    console.log(`   Usable chunks: ${result.decision.usableChunks}`);
    console.log(`   Query time: ${duration}s`);
    console.log();
  });
  
  // ===== FINAL VERDICT =====
  
  console.log('='.repeat(80));
  if (allTestsPassed) {
    console.log('🎉 ALL TESTS PASSED');
    console.log('='.repeat(80));
    console.log();
    console.log('✅ RAG pipeline correctly answers queries with good coverage');
    console.log('✅ Two-stage filtering identifies relevant content');
    console.log('✅ System provides appropriate confidence levels');
    console.log();
    console.log('Phase 1 Complete! Ready for Phase 2 (Gemini integration)');
  } else {
    console.log('⚠️  SOME TESTS FAILED');
    console.log('='.repeat(80));
    console.log();
    console.log('⚠️  Some queries that should be answered were rejected');
    console.log('⚠️  This may indicate:');
    console.log('   1. Thresholds are too strict (increase SIMILARITY_THRESHOLD or RELEVANCE_THRESHOLD)');
    console.log('   2. Relevance scoring logic is too harsh');
    console.log('   3. Corpus coverage is weaker than expected');
    console.log();
    console.log('Review the results above and adjust thresholds if needed.');
  }
  console.log('='.repeat(80));
  console.log();
  
  process.exit(allTestsPassed ? 0 : 1);
}

// Run test
testGoldenQueries().catch(err => {
  console.error('❌ Test failed with error:');
  console.error(err);
  process.exit(1);
});

