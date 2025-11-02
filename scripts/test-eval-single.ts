import * as dotenv from 'dotenv';
import { runRAGQuery } from './evaluate-rag';

dotenv.config();

// Test just one question
const question = "What are newsletters saying about climate change?";

async function testSingle() {
  console.log('🧪 Testing single RAG query...\n');
  
  try {
    const result = await runRAGQuery(question);
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 RESULTS');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`Query: "${question}"\n`);
    console.log(`Answer:\n${result.answer}\n`);
    console.log(`───────────────────────────────────────────────────────────\n`);
    if (result.citations.length > 0) {
      console.log('📚 Citations:');
      result.citations.forEach((citation, idx) => {
        console.log(`   ${idx + 1}. ${citation}`);
      });
      console.log('');
    }
    console.log(`Statistics:`);
    console.log(`- Chunks retrieved: ${result.chunks_used}`);
    console.log(`- Facts extracted: ${result.facts.length}`);
    console.log(`- Citations: ${result.citations.length}`);
    console.log(`- Latency: ${result.latency_ms}ms`);
    console.log(`- Tokens in: ~${result.tokens_in}`);
    console.log(`- Tokens out: ~${result.tokens_out}`);
    console.log('═══════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error);
  }
}

testSingle();

