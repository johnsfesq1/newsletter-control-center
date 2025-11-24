#!/usr/bin/env ts-node
/**
 * End-to-End RAG Test Script
 * 
 * Verifies Phase 2 implementation:
 * 1. Retrieval (Phase 1)
 * 2. Answer Generation (Phase 2)
 * 3. Citation formatting
 * 4. Cost tracking
 * 5. Error handling (Crypto query)
 */

import dotenv from 'dotenv';
dotenv.config();

import { executeRAGWithAnswer } from '../../src/core/rag-application';

const TEST_CASES = [
  {
    name: "Golden Query: China Semiconductors",
    query: "China semiconductor export controls",
    expectAnswer: true,
    expectConfidence: "high"
  },
  {
    name: "Golden Query: Climate Asia",
    query: "climate change renewable energy Asia",
    expectAnswer: true,
    expectConfidence: "medium"
  },
  {
    name: "Crypto Rejection Query",
    query: "cryptocurrency blockchain Web3 DeFi",
    expectAnswer: false,
    expectConfidence: "none"
  }
];

async function runTests() {
  console.log('🚀 Starting RAG End-to-End Tests...\n');
  
  for (const test of TEST_CASES) {
    console.log('='.repeat(60));
    console.log(`🧪 Test: ${test.name}`);
    console.log(`❓ Query: "${test.query}"`);
    console.log('='.repeat(60));
    
    try {
      const start = Date.now();
      const result = await executeRAGWithAnswer(test.query);
      const duration = Date.now() - start;
      
      console.log(`\n⏱️  Total Duration: ${duration}ms`);
      console.log(`   - Retrieval: ${result.timing.retrieval_ms}ms`);
      console.log(`   - Generation: ${result.timing.generation_ms}ms`);
      
      console.log(`\n📊 Result:`);
      console.log(`   - Confidence: ${result.confidence.toUpperCase()}`);
      console.log(`   - Answer Length: ${result.answer.length} chars`);
      console.log(`   - Citations: ${result.citations.length}`);
      
      if (result.usage) {
        console.log(`\n💰 Cost Estimate:`);
        console.log(`   - Input Tokens: ${result.usage.inputTokens}`);
        console.log(`   - Output Tokens: ${result.usage.outputTokens}`);
        console.log(`   - Cost: $${result.usage.estimatedCostUSD.toFixed(6)}`);
      }
      
      console.log(`\n📝 Answer Preview:\n${result.answer.substring(0, 300)}${result.answer.length > 300 ? '...' : ''}\n`);
      
      if (result.citations.length > 0) {
        console.log(`🔗 First Citation:`);
        const citation = result.citations[0];
        console.log(`   [${citation.citation_index}] ${citation.metadata.publisher} (${citation.metadata.date})`);
        console.log(`   "${citation.preview.substring(0, 100)}..."`);
      }

      // Verification
      const passedConfidence = result.confidence === test.expectConfidence || 
        (test.expectConfidence === 'medium' && result.confidence === 'high'); // Better confidence is fine
        
      const passedAnswer = test.expectAnswer ? 
        result.answer.length > 100 && !result.answer.includes("I don't have enough relevant information") :
        result.answer.includes("I don't have enough relevant information") || result.answer.length < 200;

      if (passedConfidence && passedAnswer) {
        console.log(`\n✅ TEST PASSED`);
      } else {
        console.log(`\n❌ TEST FAILED`);
        console.log(`   Expected Answer: ${test.expectAnswer}, Got length: ${result.answer.length}`);
        console.log(`   Expected Confidence: ${test.expectConfidence}, Got: ${result.confidence}`);
      }
      
    } catch (error) {
      console.error(`\n❌ ERROR:`, error);
    }
    console.log('\n');
  }
}

runTests().catch(console.error);

