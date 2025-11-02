import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import { GoogleAuth } from 'google-auth-library';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const CHUNKS_TABLE = 'chunks';
const LOCATION = 'us-central1';

/**
 * Generate embedding for a query using Vertex AI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/text-embedding-004:predict`;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [
        {
          content: text,
          task_type: 'RETRIEVAL_QUERY',
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API returned ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  
  if (data.predictions && data.predictions[0] && data.predictions[0].embeddings) {
    const embedding = data.predictions[0].embeddings.values || data.predictions[0].embeddings;
    if (Array.isArray(embedding)) {
      return embedding;
    }
  }
  
  throw new Error('No embedding returned from API');
}

/**
 * Vector search using cosine distance
 */
async function vectorSearch(
  bigquery: BigQuery, 
  queryEmbedding: number[], 
  topK: number = 20
): Promise<any[]> {
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  
  const query = `
    WITH query_embedding AS (
      SELECT ${embeddingStr} AS embedding
    ),
    chunk_distances AS (
      SELECT
        c.chunk_id,
        c.newsletter_id,
        c.chunk_index,
        c.chunk_text,
        c.subject,
        c.publisher_name,
        c.sent_date,
        1 - (
          SELECT SUM(a * b) / (SQRT(SUM(a * a)) * SQRT(SUM(b * b)))
          FROM 
            UNNEST(query_embedding.embedding) AS a WITH OFFSET i
            JOIN 
            UNNEST(c.chunk_embedding) AS b WITH OFFSET j
          WHERE i = j
        ) AS distance
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\` c, query_embedding
    )
    SELECT 
      chunk_id,
      newsletter_id,
      chunk_index,
      chunk_text,
      subject,
      publisher_name,
      sent_date,
      distance
    FROM chunk_distances
    ORDER BY distance ASC
    LIMIT ${topK}
  `;

  const [rows] = await bigquery.query(query);
  return rows;
}

/**
 * Keyword search (full-text search)
 */
async function keywordSearch(
  bigquery: BigQuery,
  query: string,
  topK: number = 20
): Promise<any[]> {
  const escapedQuery = query.replace(/'/g, "''");
  
  if (query.includes("'")) {
    return [];
  }
  
  const searchQuery = `
    SELECT
      chunk_id,
      newsletter_id,
      chunk_index,
      chunk_text,
      subject,
      publisher_name,
      sent_date,
      (
        (LENGTH(chunk_text) - LENGTH(REPLACE(LOWER(chunk_text), LOWER('${escapedQuery}'), ''))) 
        / LENGTH('${escapedQuery}')
      ) AS relevance
    FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
    WHERE LOWER(chunk_text) LIKE LOWER('%${escapedQuery}%')
      OR LOWER(subject) LIKE LOWER('%${escapedQuery}%')
    ORDER BY relevance DESC
    LIMIT ${topK}
  `;

  try {
    const [rows] = await bigquery.query(searchQuery);
    return rows;
  } catch (error) {
    console.warn('Keyword search failed, returning empty results:', error);
    return [];
  }
}

/**
 * Hybrid search: combine vector and keyword results
 */
async function hybridSearch(
  bigquery: BigQuery,
  query: string,
  queryEmbedding: number[],
  topK: number = 20
): Promise<any[]> {
  const [vectorResults, keywordResults] = await Promise.all([
    vectorSearch(bigquery, queryEmbedding, topK * 2),
    keywordSearch(bigquery, query, topK * 2)
  ]);

  const combined = new Map<string, any>();
  
  vectorResults.forEach((result, idx) => {
    const score = 1 - result.distance;
    combined.set(result.chunk_id, {
      ...result,
      vector_score: score,
      keyword_score: 0,
      combined_score: score * 0.7
    });
  });

  keywordResults.forEach((result) => {
    const existing = combined.get(result.chunk_id);
    if (existing) {
      existing.keyword_score = result.relevance;
      existing.combined_score = existing.vector_score * 0.7 + result.relevance * 0.3;
    } else {
      combined.set(result.chunk_id, {
        ...result,
        vector_score: 0,
        keyword_score: result.relevance,
        combined_score: result.relevance * 0.3
      });
    }
  });

  const sorted = Array.from(combined.values())
    .sort((a, b) => b.combined_score - a.combined_score)
    .slice(0, topK);

  return sorted;
}

/**
 * Fetch full chunk text from BigQuery
 */
async function getFullChunks(bigquery: BigQuery, chunkIds: string[]): Promise<any[]> {
  const ids = chunkIds.map(id => `'${id}'`).join(',');
  
  const query = `
    SELECT 
      chunk_id,
      newsletter_id,
      chunk_index,
      chunk_text,
      subject,
      publisher_name,
      sent_date
    FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
    WHERE chunk_id IN (${ids})
  `;

  const [rows] = await bigquery.query(query);
  return rows;
}

/**
 * Call Gemini 2.5 Pro to extract facts from chunks
 */
async function extractFacts(chunks: any[], userQuery: string): Promise<any[]> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  const context = chunks.map((chunk, idx) => `
Chunk ${idx + 1}:
Publisher: ${chunk.publisher_name}
Date: ${chunk.sent_date ? new Date(chunk.sent_date.value || chunk.sent_date).toLocaleDateString() : 'Unknown'}
Subject: ${chunk.subject}
Content: ${chunk.chunk_text}
`).join('\n---\n');

  const prompt = `Extract all facts, quotes, and data points from the following chunks that are relevant to the query: "${userQuery}"

Return your response as a JSON array where each item has:
- fact: The extracted fact or data point
- chunk_id: The ID of the chunk it came from

Only extract facts that directly answer the query. If no relevant facts exist, return an empty array.

Chunks:
${context}

Return ONLY valid JSON, no additional text:`;

  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.5-pro:generateContent`;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.1,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API returned ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  
  try {
    const facts = JSON.parse(text);
    console.log(`✅ Extracted ${facts.length} facts`);
    return Array.isArray(facts) ? facts : [];
  } catch (error) {
    console.warn('⚠️  Failed to parse JSON, attempting fixes...');
    
    // Try to fix common JSON issues
    try {
      // Sometimes Gemini wraps in ```json blocks or adds markdown
      let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      // Sometimes response is truncated - try to fix if we can find where it was cut
      if (!cleaned.endsWith(']') && cleaned.includes('\n  },')) {
        // Try to add closing brackets if response was truncated
        const lastCompleteFact = cleaned.lastIndexOf('}');
        if (lastCompleteFact > 0) {
          cleaned = cleaned.substring(0, lastCompleteFact + 1) + '\n]';
        }
      }
      
      const facts = JSON.parse(cleaned);
      console.log(`✅ Extracted ${facts.length} facts after cleanup`);
      return Array.isArray(facts) ? facts : [];
    } catch (retryError) {
      console.warn('❌ Could not parse facts');
      return [];
    }
  }
}

/**
 * Call Gemini 2.5 Pro to synthesize answer from facts
 */
function formatCitation(chunk: any): string {
  const publisher = chunk.publisher_name || 'Unknown Publisher';
  const date = chunk.sent_date 
    ? new Date(chunk.sent_date.value || chunk.sent_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Date unknown';
  const subject = chunk.subject || 'No subject';
  
  return `${publisher} · ${date} · ${subject}`;
}

async function synthesizeAnswer(facts: any[], userQuery: string, chunks: any[]): Promise<string> {
  if (facts.length === 0) {
    return 'No information found in the newsletter archive that answers this query.';
  }

  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  const factsList = facts.map(f => {
    const chunk = chunks.find(c => c.chunk_id === f.chunk_id);
    const citation = chunk ? formatCitation(chunk) : `[${f.chunk_id}]`;
    return `- ${citation}: ${f.fact}`;
  }).join('\n');

  const prompt = `You are an intelligence analyst answering questions based on newsletter content.

Query: "${userQuery}"

Facts extracted from newsletters:
${factsList}

CRITICAL RULES:
1. Answer the query using ONLY the provided facts
2. Include inline citations: (Publisher · Date · Subject) after each statement
3. If information isn't in the facts, don't make it up
4. Write naturally and concisely
5. If facts are contradictory, mention both perspectives

Provide your answer:`;

  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.5-pro:generateContent`;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4096
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API returned ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text.trim();
}

/**
 * Main test function
 */
async function testRAGQuery(userQuery: string) {
  try {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🧪 TESTING RAG QUERY ENGINE');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`📝 Query: "${userQuery}"\n`);

    const bigquery = new BigQuery({ projectId: PROJECT_ID });

    // Step 1: Generate query embedding
    console.log('Step 1: 📊 Generating query embedding...');
    const queryEmbedding = await generateEmbedding(userQuery);
    console.log(`✅ Generated ${queryEmbedding.length}-dimensional embedding\n`);

    // Step 2: Perform hybrid search
    console.log('Step 2: 🔎 Performing hybrid search...');
    const chunks = await hybridSearch(bigquery, userQuery, queryEmbedding, 10);
    console.log(`✅ Found ${chunks.length} relevant chunks\n`);

    if (chunks.length === 0) {
      console.log('⚠️  No chunks found. This might mean:');
      console.log('   - The query doesn\'t match any newsletter content');
      console.log('   - The chunks table is empty');
      console.log('   - There\'s a problem with the search');
      return;
    }

    // Show top chunks
    console.log('📋 Top 3 chunks found:');
    chunks.slice(0, 3).forEach((chunk, idx) => {
      console.log(`\n   Chunk ${idx + 1}:`);
      console.log(`   - Publisher: ${chunk.publisher_name || 'Unknown'}`);
      console.log(`   - Subject: ${chunk.subject || 'No subject'}`);
      console.log(`   - Score: ${(chunk.combined_score || (1 - chunk.distance)).toFixed(3)}`);
      console.log(`   - Preview: ${chunk.chunk_text.substring(0, 150)}...`);
    });
    console.log('\n');

    // Step 3: Fetch full chunks
    console.log('Step 3: 📝 Fetching full chunk text...');
    const chunkIds = chunks.map(c => c.chunk_id);
    const fullChunks = await getFullChunks(bigquery, chunkIds);
    console.log(`✅ Retrieved ${fullChunks.length} full chunks\n`);

    // Step 4: Extract facts
    console.log('Step 4: 🔍 Extracting facts from chunks...');
    const facts = await extractFacts(fullChunks, userQuery);
    console.log(`✅ Extracted ${facts.length} facts\n`);

    if (facts.length > 0) {
      console.log('📋 Sample facts extracted:');
      facts.slice(0, 3).forEach((fact, idx) => {
        console.log(`   ${idx + 1}. [${fact.chunk_id}] ${fact.fact.substring(0, 100)}...`);
      });
      console.log('\n');
    }

    // Step 5: Synthesize answer
    console.log('Step 5: 🤖 Synthesizing answer from facts...');
    const answer = await synthesizeAnswer(facts, userQuery, fullChunks);
    console.log(`✅ Generated answer\n`);
    
    // Format citations for display
    const citations = Array.from(new Set(
      facts.map(f => {
        const chunk = fullChunks.find(c => c.chunk_id === f.chunk_id);
        return chunk ? formatCitation(chunk) : null;
      }).filter(Boolean)
    )).slice(0, 5);

    // Display results
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 RESULTS');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`Query: "${userQuery}"\n`);
    console.log(`Answer:\n${answer}\n`);
    console.log(`───────────────────────────────────────────────────────────\n`);
    if (citations.length > 0) {
      console.log('📚 Citations:');
      citations.forEach((citation, idx) => {
        console.log(`   ${idx + 1}. ${citation}`);
      });
      console.log('');
    }
    console.log(`Statistics:`);
    console.log(`- Chunks searched: ${chunks.length}`);
    console.log(`- Facts extracted: ${facts.length}`);
    console.log(`- Citations: ${citations.length}`);
    console.log(`- Answer length: ${answer.length} characters\n`);
    console.log('═══════════════════════════════════════════════════════════\n');

    return {
      query: userQuery,
      answer,
      facts,
      chunks_used: chunks.length
    };

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    throw error;
  }
}

// Run test if called directly
if (require.main === module) {
  // Get query from command line or use default
  const query = process.argv[2] || "What are newsletters saying about climate change?";
  
  testRAGQuery(query)
    .then(() => {
      console.log('✅ Test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

export { testRAGQuery };

