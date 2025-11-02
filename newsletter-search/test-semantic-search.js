// Quick test script for semantic search API
// Run: node test-semantic-search.js

const query = process.argv[2] || "What are the latest developments in AI regulation?";

async function testSemanticSearch() {
  try {
    console.log(`🔍 Testing semantic search with query: "${query}"\n`);
    
    const response = await fetch('http://localhost:3000/api/intelligence/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const data = await response.json();
    
    console.log('✅ SUCCESS!\n');
    console.log('📊 Results:');
    console.log(`   Query: ${data.query}`);
    console.log(`   Answer length: ${data.answer?.length || 0} characters`);
    console.log(`   Citations: ${data.citations?.length || 0}`);
    console.log(`   Chunks used: ${data.chunks_used || 0}`);
    console.log(`   Cost: $${data.cost_usd?.toFixed(4) || '0.0000'}`);
    console.log(`   Tokens: ${data.tokens_in || 0} in, ${data.tokens_out || 0} out\n`);
    
    if (data.answer) {
      console.log('💬 Answer:');
      console.log(data.answer.substring(0, 500) + (data.answer.length > 500 ? '...' : ''));
      console.log('');
    }
    
    if (data.citations && data.citations.length > 0) {
      console.log('📚 Citations:');
      data.citations.forEach((cit, i) => {
        console.log(`   ${i + 1}. ${cit.citation || cit.publisher}`);
      });
    }
    
    return data;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Make sure the Next.js dev server is running:');
      console.error('   cd newsletter-search && npm run dev');
    }
    process.exit(1);
  }
}

testSemanticSearch();
