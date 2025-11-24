#!/usr/bin/env ts-node
/**
 * Specific vs Vague Question Test
 * 
 * Tests 5 specific questions to see if detailed prompting improves retrieval.
 */

import dotenv from 'dotenv';
dotenv.config();

import { executeRAGWithAnswer } from '../../src/core/rag-application';

const SPECIFIC_QUESTIONS = [
  "What did analysts predict about US semiconductor export controls affecting Asian countries?",
  "How are newsletters describing India's strategic relationship with the United States?",
  "What specific economic challenges is China facing according to geopolitical analysts?",
  "Which Middle Eastern conflicts or tensions are receiving the most coverage in recent analysis?",
  "What do intelligence newsletters say about Taiwan's role in the semiconductor supply chain?"
];

async function runSpecificTest() {
  console.log('🚀 Starting Specific 5-Question RAG Test\n');
  
  const results = [];
  let answeredCount = 0;

  for (let i = 0; i < SPECIFIC_QUESTIONS.length; i++) {
    const query = SPECIFIC_QUESTIONS[i];
    console.log(`\n📝 Question ${i + 1}: "${query}"`);
    
    try {
      const start = Date.now();
      const result = await executeRAGWithAnswer(query);
      const duration = Date.now() - start;

      const wasAnswered = result.confidence !== 'none';
      if (wasAnswered) answeredCount++;

      const cost = result.usage?.estimatedCostUSD || 0;

      results.push({
        query,
        confidence: result.confidence,
        citations: result.citations.length,
        duration,
        wasAnswered
      });

      console.log(`   Confidence: ${result.confidence.toUpperCase()}`);
      console.log(`   Citations: ${result.citations.length}`);
      console.log(`   Time: ${duration}ms`);
      if (wasAnswered) {
        console.log(`   Answer: "${result.answer.substring(0, 250).replace(/\n/g, ' ')}..."`);
      } else {
        console.log(`   Answer: REJECTED`);
      }
      console.log(`   Cost: $${cost.toFixed(6)}`);

    } catch (error) {
      console.error(`   ❌ Error:`, error);
    }
  }

  // Comparison Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 COMPARISON SUMMARY');
  console.log('='.repeat(60));
  
  console.log(`Specific Questions Answered: ${answeredCount}/5`);
  console.log(`Original Vague Questions Answered: 0/5 (from previous test)`); // Hardcoded based on previous context
  
  if (answeredCount > 0) {
    console.log(`\n✅ IMPROVEMENT: Being specific helped answer ${answeredCount} previously rejected topics.`);
  } else {
    console.log(`\n❌ NO IMPROVEMENT: Specificity didn't help. Likely a coverage gap.`);
  }

  console.log('\nDetailed Breakdown:');
  console.table(results.map(r => ({
    Question: r.query.substring(0, 40) + '...',
    Conf: r.confidence,
    Cites: r.citations,
    Answered: r.wasAnswered ? 'YES' : 'NO'
  })));
}

runSpecificTest().catch(console.error);

