#!/usr/bin/env ts-node
/**
 * Comprehensive 10-Question RAG System Test
 * 
 * Tests a diverse range of topics to verify RAG performance, coverage, and rejection logic.
 */

import dotenv from 'dotenv';
dotenv.config();

import { executeRAGWithAnswer } from '../../src/core/rag-application';

const TEST_QUESTIONS = [
  "What are analysts saying about European energy security?",
  "How do newsletters describe India's economic growth and potential?",
  "What predictions have been made about Taiwan's semiconductor industry?",
  "Which African countries are receiving the most attention in geopolitical analysis?",
  "What is the consensus view on how US elections affect foreign policy?",
  "Are there concerns about food security or agricultural issues in Southeast Asia?",
  "What's the best cryptocurrency investment strategy for 2025?",
  "How can I improve my productivity and time management skills?",
  "What major events happened in the Middle East last month?",
  "Compare how different analysts view China's economic challenges."
];

async function runComprehensiveTest() {
  console.log('🚀 Starting Comprehensive 10-Question RAG Test\n');
  
  const results = [];
  let totalTime = 0;
  let totalCost = 0;
  let answeredCount = 0;
  let rejectedCount = 0;

  for (let i = 0; i < TEST_QUESTIONS.length; i++) {
    const query = TEST_QUESTIONS[i];
    console.log(`\n📝 Question ${i + 1}: "${query}"`);
    
    try {
      const start = Date.now();
      const result = await executeRAGWithAnswer(query);
      const duration = Date.now() - start;
      totalTime += duration;

      const wasAnswered = result.confidence !== 'none';
      if (wasAnswered) answeredCount++; else rejectedCount++;

      const cost = result.usage?.estimatedCostUSD || 0;
      totalCost += cost;

      // Store result for summary
      results.push({
        query,
        confidence: result.confidence,
        citations: result.citations.length,
        duration,
        cost,
        wasAnswered
      });

      // Report details
      console.log(`   Confidence: ${result.confidence.toUpperCase()}`);
      console.log(`   Citations: ${result.citations.length}`);
      console.log(`   Time: ${duration}ms`);
      console.log(`   LLM Called: ${wasAnswered ? 'YES' : 'NO (Rejected)'}`);
      console.log(`   Cost: $${cost.toFixed(6)}`);
      console.log(`   Answer: "${result.answer.substring(0, 200).replace(/\n/g, ' ')}..."`);
      
    } catch (error) {
      console.error(`   ❌ Error processing question:`, error);
      results.push({
        query,
        error: true,
        duration: 0,
        wasAnswered: false
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  console.log(`\nTotal Questions: ${TEST_QUESTIONS.length}`);
  console.log(`Answered: ${answeredCount} (High/Medium Confidence)`);
  console.log(`Rejected: ${rejectedCount} (Low/None Confidence)`);
  console.log(`Total Time: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`Total Cost: $${totalCost.toFixed(6)}`);
  
  console.log('\n🏆 Best Performing Questions (High Confidence):');
  results.filter(r => r.confidence === 'high').forEach(r => {
    console.log(`  - "${r.query}" (${r.citations} citations)`);
  });
  
  console.log('\n⚠️ Rejected Questions (Correctly filtered?):');
  results.filter(r => r.confidence === 'none').forEach(r => {
    console.log(`  - "${r.query}"`);
  });

  console.log('\nDetailed Breakdown:');
  console.table(results.map(r => ({
    Question: r.query.substring(0, 30) + '...',
    Conf: r.confidence,
    Cites: r.citations,
    Time: r.duration + 'ms',
    Cost: '$' + (r.cost || 0).toFixed(5)
  })));
}

runComprehensiveTest().catch(console.error);

