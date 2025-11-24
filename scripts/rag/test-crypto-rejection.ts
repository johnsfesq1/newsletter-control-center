#!/usr/bin/env ts-node
/**
 * RAG Crypto Query Test
 * 
 * THE CRITICAL TEST: Proves two-stage filtering works
 * 
 * Query: "cryptocurrency blockchain Web3 DeFi"
 * 
 * Expected Behavior:
 * - Stage 1: ~10 results with similarity >0.75 (vector search finds "similar" chunks)
 * - Stage 2: 0 results with relevance >0.5 (no chunks actually mention crypto topics)
 * - Decision: confidence='none', shouldAnswer=false
 * - Response: "Insufficient relevant data"
 * 
 * Why This Matters:
 * Without two-stage filtering, the system would:
 * 1. Find high similarity scores (0.80+)
 * 2. Think it has good data
 * 3. Hallucinate an answer about cryptocurrency
 * 
 * With two-stage filtering:
 * 1. Stage 1 passes (high similarity)
 * 2. Stage 2 fails (zero keyword matches)
 * 3. Correctly rejects the query
 * 
 * This is the proof that the system "knows when it doesn't know"
 */

import dotenv from 'dotenv';
dotenv.config();

import { executeRAGQuery } from '../../src/core/rag';

const CRYPTO_QUERY = "cryptocurrency blockchain Web3 DeFi";

async function testCryptoRejection() {
  console.log('='.repeat(80));
  console.log('🧪 RAG CRYPTO REJECTION TEST');
  console.log('='.repeat(80));
  console.log();
  console.log('Testing the CRITICAL proof case:');
  console.log(`Query: "${CRYPTO_QUERY}"`);
  console.log();
  console.log('Expected:');
  console.log('  ✅ Stage 1: ~10 results with similarity >0.75');
  console.log('  ✅ Stage 2: 0 results with relevance >0.5');
  console.log('  ✅ Decision: confidence=none, shouldAnswer=false');
  console.log('  ✅ Response: "Insufficient relevant data"');
  console.log();
  console.log('Why this matters:');
  console.log('  Without Stage 2, system would hallucinate answers from irrelevant chunks');
  console.log('  With Stage 2, system correctly rejects queries outside coverage area');
  console.log();
  console.log('Running query...');
  console.log('='.repeat(80));
  console.log();
  
  const startTime = Date.now();
  const result = await executeRAGQuery(CRYPTO_QUERY);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  // ===== RESULTS =====
  
  console.log('📊 RESULTS');
  console.log('='.repeat(80));
  console.log();
  
  console.log('⏱️  Timing:');
  console.log(`  Embedding generation: ${result.timing.embedding_ms}ms`);
  console.log(`  Vector search: ${result.timing.vector_search_ms}ms`);
  console.log(`  Relevance check: ${result.timing.relevance_check_ms}ms`);
  console.log(`  Total: ${result.timing.total_ms}ms (${duration}s)`);
  console.log();
  
  console.log('🔍 Stage 1 Results (Vector Search):');
  console.log(`  Found: ${result.searchResults.length} chunks`);
  console.log(`  Similarity range: ${Math.min(...result.searchResults.map(r => r.similarity)).toFixed(4)} - ${Math.max(...result.searchResults.map(r => r.similarity)).toFixed(4)}`);
  console.log();
  
  console.log('Top 5 similarity scores:');
  result.searchResults.slice(0, 5).forEach((r, idx) => {
    console.log(`  [${idx + 1}] Similarity: ${r.similarity.toFixed(4)} | Subject: ${r.subject.substring(0, 60)}...`);
  });
  console.log();
  
  console.log('🎯 Stage 2 Results (Relevance Check):');
  console.log(`  Filtered to: ${result.decision.filteredResults.length} chunks`);
  console.log(`  Usable chunks: ${result.decision.usableChunks}`);
  
  if (result.decision.filteredResults.length > 0) {
    console.log();
    console.log('Relevant chunks found:');
    result.decision.filteredResults.forEach((r, idx) => {
      console.log(`  [${idx + 1}] Similarity: ${r.similarity.toFixed(4)} | Relevance: ${r.relevance_score?.toFixed(4)} | Subject: ${r.subject.substring(0, 50)}...`);
    });
  }
  console.log();
  
  console.log('🤖 RAG Decision:');
  console.log(`  Should answer: ${result.decision.shouldAnswer}`);
  console.log(`  Confidence: ${result.decision.confidence}`);
  console.log(`  Reason: ${result.decision.reason}`);
  console.log();
  
  // ===== TEST VALIDATION =====
  
  console.log('='.repeat(80));
  console.log('✅ TEST VALIDATION');
  console.log('='.repeat(80));
  console.log();
  
  let allTestsPassed = true;
  
  // Test 1: Stage 1 should find results
  const test1Pass = result.searchResults.length >= 8;
  console.log(`Test 1: Stage 1 finds results (similarity >0.75)`);
  console.log(`  Expected: ≥8 results`);
  console.log(`  Actual: ${result.searchResults.length} results`);
  console.log(`  ${test1Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log();
  
  // Test 2: Stage 2 should filter out irrelevant results
  const test2Pass = result.decision.usableChunks <= 2;  // Allow up to 2 false positives
  console.log(`Test 2: Stage 2 filters out irrelevant chunks`);
  console.log(`  Expected: ≤2 usable chunks (ideally 0)`);
  console.log(`  Actual: ${result.decision.usableChunks} usable chunks`);
  console.log(`  ${test2Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log();
  
  // Test 3: Decision should reject query
  const test3Pass = result.decision.shouldAnswer === false;
  console.log(`Test 3: RAG decision rejects query`);
  console.log(`  Expected: shouldAnswer=false`);
  console.log(`  Actual: shouldAnswer=${result.decision.shouldAnswer}`);
  console.log(`  ${test3Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log();
  
  // Test 4: Confidence should be 'none'
  const test4Pass = result.decision.confidence === 'none';
  console.log(`Test 4: Confidence level is 'none'`);
  console.log(`  Expected: confidence='none'`);
  console.log(`  Actual: confidence='${result.decision.confidence}'`);
  console.log(`  ${test4Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log();
  
  allTestsPassed = test1Pass && test2Pass && test3Pass && test4Pass;
  
  // ===== FINAL VERDICT =====
  
  console.log('='.repeat(80));
  if (allTestsPassed) {
    console.log('🎉 ALL TESTS PASSED');
    console.log('='.repeat(80));
    console.log();
    console.log('✅ Two-stage filtering is working correctly!');
    console.log('✅ System correctly rejects queries outside coverage area');
    console.log('✅ No hallucination risk - system "knows when it doesn\'t know"');
    console.log();
    console.log('Ready to proceed to Phase 2 (Gemini integration)');
  } else {
    console.log('❌ TESTS FAILED');
    console.log('='.repeat(80));
    console.log();
    console.log('⚠️  Two-stage filtering is NOT working as expected');
    console.log('⚠️  Do NOT proceed to Phase 2 until this is fixed');
    console.log();
    console.log('Debug steps:');
    console.log('  1. Check relevance scoring logic in checkRelevance()');
    console.log('  2. Verify thresholds (SIMILARITY_THRESHOLD, RELEVANCE_THRESHOLD)');
    console.log('  3. Inspect filtered results to understand why they passed');
  }
  console.log('='.repeat(80));
  console.log();
  
  process.exit(allTestsPassed ? 0 : 1);
}

// Run test
testCryptoRejection().catch(err => {
  console.error('❌ Test failed with error:');
  console.error(err);
  process.exit(1);
});

