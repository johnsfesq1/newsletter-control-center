import { NextRequest, NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const CHUNKS_TABLE = 'chunks';
const LOCATION = 'us-central1';

/**
 * Generate embedding for a query using Vertex AI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const { GoogleAuth } = require('google-auth-library');
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
 * Since we don't have VECTOR_SEARCH built-in yet, we'll use cosine similarity
 */
async function vectorSearch(
  bigquery: BigQuery, 
  queryEmbedding: number[], 
  topK: number = 20
): Promise<any[]> {
  // Convert embedding array to SQL array literal
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  
  // Use cosine distance: 1 - (dot product) / (||a|| * ||b||)
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
        -- Cosine similarity calculation
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
  // Escape single quotes for SQL
  const escapedQuery = query.replace(/'/g, "''");
  
  // Only perform keyword search if query doesn't have apostrophes
  // or if it's a simple keyword match
  if (query.includes("'")) {
    // Skip keyword search for queries with apostrophes to avoid SQL errors
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
      -- Simple relevance score based on keyword frequency
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
    // If keyword search fails, just return empty results
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
  // Get results from both searches
  const [vectorResults, keywordResults] = await Promise.all([
    vectorSearch(bigquery, queryEmbedding, topK * 2),
    keywordSearch(bigquery, query, topK * 2)
  ]);

  // Combine and deduplicate by chunk_id
  const combined = new Map<string, any>();
  
  // Add vector results (weight: 0.7)
  vectorResults.forEach((result, idx) => {
    const score = 1 - result.distance; // Convert distance to similarity
    combined.set(result.chunk_id, {
      ...result,
      vector_score: score,
      keyword_score: 0,
      combined_score: score * 0.7
    });
  });

  // Add keyword results (weight: 0.3)
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

  // Sort by combined score and return top K
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
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  // Build context from chunks with metadata for better citations
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
  
  // Try to parse as JSON, fallback to empty array
  try {
    const facts = JSON.parse(text);
    return Array.isArray(facts) ? facts : [];
  } catch (error) {
    console.warn('Failed to parse facts as JSON:', text);
    return [];
  }
}

/**
 * Format citation as "Publisher · Date · Subject"
 */
function formatCitation(chunk: any): string {
  const publisher = chunk.publisher_name || 'Unknown Publisher';
  const date = chunk.sent_date 
    ? new Date(chunk.sent_date.value || chunk.sent_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Date unknown';
  const subject = chunk.subject || 'No subject';
  
  return `${publisher} · ${date} · ${subject}`;
}

/**
 * Call Gemini 2.5 Pro to synthesize answer from facts
 */
async function synthesizeAnswer(facts: any[], userQuery: string, chunks: any[]): Promise<string> {
  if (facts.length === 0) {
    return 'No information found in the newsletter archive that answers this query.';
  }

  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  // Build facts list with citations (format: "Publisher · Date · Subject")
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

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Processing query: "${query}"`);

    const bigquery = new BigQuery({ projectId: PROJECT_ID });

    // Step 1: Generate query embedding
    console.log('📊 Generating query embedding...');
    const queryEmbedding = await generateEmbedding(query);

    // Step 2: Perform hybrid search (get top 10 most relevant)
    console.log('🔎 Performing hybrid search...');
    const chunks = await hybridSearch(bigquery, query, queryEmbedding, 10);
    console.log(`✅ Found ${chunks.length} relevant chunks`);

    // Fetch full chunk text for fact extraction
    console.log('📝 Fetching full chunk text...');
    const chunkIds = chunks.map(c => c.chunk_id);
    const fullChunks = await getFullChunks(bigquery, chunkIds);
    console.log(`✅ Retrieved ${fullChunks.length} full chunks`);

    // Step 3: Extract facts from chunks
    console.log('📝 Extracting facts from chunks...');
    const facts = await extractFacts(fullChunks, query);
    console.log(`✅ Extracted ${facts.length} facts`);

    // Step 4: Synthesize answer from facts
    console.log('🤖 Synthesizing answer...');
    const answer = await synthesizeAnswer(facts, query, fullChunks);
    console.log(`✅ Generated answer`);
    
    // Format citations for response
    const citations = Array.from(new Set(
      facts.map(f => {
        const chunk = fullChunks.find(c => c.chunk_id === f.chunk_id);
        return chunk ? {
          chunk_id: f.chunk_id,
          citation: formatCitation(chunk),
          publisher: chunk.publisher_name,
          date: chunk.sent_date,
          subject: chunk.subject
        } : null;
      }).filter(Boolean)
    )).slice(0, 5); // Max 5 citations

    return NextResponse.json({
      query,
      answer,
      citations,
      chunks_used: chunks.length,
      chunks: chunks.map(c => ({
        chunk_id: c.chunk_id,
        subject: c.subject,
        publisher: c.publisher_name,
        score: c.combined_score || (1 - c.distance)
      }))
    });

  } catch (error) {
    console.error('❌ Query failed:', error);
    return NextResponse.json(
      { 
        error: 'Query failed',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

