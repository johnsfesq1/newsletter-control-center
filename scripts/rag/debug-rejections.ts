#!/usr/bin/env ts-node
/**
 * Debug RAG Rejections
 * 
 * Investigates why specific queries are rejected by analyzing Stage 1 and Stage 2 results.
 */

import dotenv from 'dotenv';
dotenv.config();

import { executeRAGQuery, checkRelevance } from '../../src/core/rag';

const DEBUG_QUERIES = [
  "What predictions have been made about Taiwan's semiconductor industry?",
  "How do newsletters describe India's economic growth and potential?",
  "Compare how different analysts view China's economic challenges."
];

async function runDebug() {
  console.log('🔍 STARTING RAG REJECTION DEBUG\n');
  console.log('Timestamp:', new Date().toISOString());
  console.log('='.repeat(60));

  for (const query of DEBUG_QUERIES) {
    console.log(`\n🧐 ANALYZING QUERY: "${query}"`);
    console.log('-'.repeat(60));

    try {
      // Run only the retrieval part (no LLM generation needed for debugging filtering)
      const result = await executeRAGQuery(query);
      
      // --- STAGE 1 ANALYSIS ---
      console.log(`\n📊 STAGE 1: Vector Search Results`);
      console.log(`   Found ${result.searchResults.length} chunks (limit 10)`);
      
      if (result.searchResults.length > 0) {
        console.log(`\n   Top 5 Chunks by Similarity:`);
        result.searchResults.slice(0, 5).forEach((chunk, i) => {
          console.log(`   [${i+1}] Score: ${chunk.similarity.toFixed(4)} | ID: ${chunk.chunk_id.substring(0, 8)}...`);
          console.log(`       Subject: "${chunk.subject}"`);
          console.log(`       Preview: "${chunk.chunk_text.substring(0, 100).replace(/\n/g, ' ')}..."`);
        });
      } else {
        console.log(`   ⚠️ NO CHUNKS FOUND IN VECTOR SEARCH`);
      }

      // --- STAGE 2 ANALYSIS ---
      console.log(`\n🛡️ STAGE 2: Relevance Filtering`);
      
      const filteredIds = new Set(result.decision.filteredResults.map(r => r.chunk_id));
      const rejectedInStage2 = result.searchResults.filter(r => !filteredIds.has(r.chunk_id));
      
      console.log(`   Passed Stage 2: ${result.decision.filteredResults.length}`);
      console.log(`   Rejected in Stage 2: ${rejectedInStage2.length}`);
      
      if (rejectedInStage2.length > 0) {
        console.log(`\n   ⚠️ Rejected Chunk Analysis (Why did they fail?):`);
        rejectedInStage2.forEach((chunk, i) => {
          // Recalculate score to show why
          const relevance = checkRelevance(query, chunk);
          console.log(`   [Rejected #${i+1}] Sim: ${chunk.similarity.toFixed(4)} | Rel: ${relevance.toFixed(4)} (Threshold: 0.5)`);
          console.log(`       Subject: "${chunk.subject}"`);
          console.log(`       Text: "${chunk.chunk_text.substring(0, 150).replace(/\n/g, ' ')}..."`);
          
          // Detailed reason guess
          const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);
          const textLower = chunk.chunk_text.toLowerCase();
          const matches = queryTerms.filter(t => textLower.includes(t));
          console.log(`       Matches found: [${matches.join(', ')}]`);
        });
      }

      // --- FINAL DECISION ---
      console.log(`\n🏁 FINAL DECISION`);
      console.log(`   Confidence: ${result.decision.confidence}`);
      console.log(`   Should Answer: ${result.decision.shouldAnswer}`);
      console.log(`   Reason: ${result.decision.reason}`);
      
      // Hypothesis
      console.log(`\n🤔 HYPOTHESIS:`);
      if (result.searchResults.length === 0) {
        console.log(`   Coverage Gap: No similar vectors found.`);
      } else if (result.decision.filteredResults.length === 0) {
         console.log(`   Filtering Issue: Vectors found but failed relevance check.`);
         if (result.searchResults[0].similarity < 0.75) {
            console.log(`   -> Similarity scores too low (<0.75). Top score: ${result.searchResults[0].similarity.toFixed(4)}`);
         } else {
            console.log(`   -> Relevance scores too low (<0.5).`);
         }
      } else {
        console.log(`   Success: Found ${result.decision.filteredResults.length} relevant chunks.`);
      }

    } catch (error) {
      console.error('Error debugging query:', error);
    }
    console.log('\n' + '='.repeat(60));
  }
}

runDebug().catch(console.error);

