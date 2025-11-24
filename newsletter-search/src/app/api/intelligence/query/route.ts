import { NextRequest, NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_production';
const CHUNKS_TABLE = 'chunks';
const BIGQUERY_LOCATION = 'US';  // BigQuery dataset is in US multi-region
const VERTEX_LOCATION = 'us-central1';  // Vertex AI models require a specific region

// Budget configuration
const DAILY_BUDGET_USD = 10.00; // Max spend per day
const INPUT_COST_PER_1M = 1.25;
const OUTPUT_COST_PER_1M = 5.00;

// Simple in-memory daily spend tracking (will reset on server restart)
// In production, this should be stored in BigQuery or Redis
let dailySpend = 0;
let dailySpendResetDate = new Date().toDateString();

/**
 * Check and update daily spend
 */
function checkDailyBudget(cost: number): boolean {
  const today = new Date().toDateString();
  
  // Reset daily spend if it's a new day
  if (today !== dailySpendResetDate) {
    dailySpend = 0;
    dailySpendResetDate = today;
  }
  
  // Check if adding this cost would exceed budget
  if (dailySpend + cost > DAILY_BUDGET_USD) {
    return false;
  }
  
  // Update daily spend
  dailySpend += cost;
  return true;
}

/**
 * Generate embedding for a query using Vertex AI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const { GoogleAuth } = require('google-auth-library');
  
  // Using Application Default Credentials (ADC) - run `gcloud auth application-default login` first
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  const endpoint = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/text-embedding-004:predict`;
  
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
 * Vector search using cosine distance across normalized tables
 * 
 * Database Schema Note:
 * - `chunk_embeddings` contains the 768-dimensional vectors (model: text-embedding-004)
 * - `chunks` contains the text content and metadata (gmail_message_id, chunk_index)
 * - `raw_emails` contains email metadata (subject, sent_date, from_email as publisher)
 * - Publisher info comes from raw_emails.from_email (publishers table is unpopulated)
 * 
 * Join Flow: chunk_embeddings -> chunks (chunk_id) -> raw_emails (gmail_message_id)
 * 
 * @param bigquery - BigQuery client instance
 * @param queryEmbedding - 768-dimensional query embedding from text-embedding-004
 * @param topK - Number of top results to return (default: 20)
 * @returns Array of chunks with text, metadata, and cosine distance scores
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
        ce.chunk_id,
        c.gmail_message_id,
        c.chunk_index,
        c.chunk_text,
        -- Cosine similarity calculation
        1 - (
          SELECT SUM(a * b) / (SQRT(SUM(a * a)) * SQRT(SUM(b * b)))
          FROM 
            UNNEST(query_embedding.embedding) AS a WITH OFFSET i
            JOIN 
            UNNEST(ce.embedding) AS b WITH OFFSET j
          WHERE i = j
        ) AS distance
      FROM \`${PROJECT_ID}.${DATASET_ID}.chunk_embeddings\` ce
      CROSS JOIN query_embedding
      JOIN \`${PROJECT_ID}.${DATASET_ID}.chunks\` c
        ON ce.chunk_id = c.chunk_id
      WHERE c.is_junk IS NOT TRUE  -- Filter out junk chunks
    )
    SELECT 
      cd.chunk_id,
      cd.gmail_message_id,
      cd.chunk_index,
      cd.chunk_text,
      re.subject,
      re.from_email AS publisher_name,
      re.sent_date,
      cd.distance
    FROM chunk_distances cd
    JOIN \`${PROJECT_ID}.${DATASET_ID}.raw_emails\` re
      ON cd.gmail_message_id = re.gmail_message_id
    ORDER BY cd.distance ASC
    LIMIT ${topK}
  `;

  const [rows] = await bigquery.query({
    query: query,
    location: BIGQUERY_LOCATION
  });
  return rows;
}

/**
 * Keyword search (full-text search) across normalized tables
 * 
 * Database Schema Note:
 * - Searches across both `chunk_text` in chunks and `subject` in raw_emails
 * - Filters out junk chunks (is_junk = TRUE)
 * - Returns relevance score based on keyword frequency
 * 
 * Join Flow: chunks -> raw_emails (gmail_message_id)
 * 
 * @param bigquery - BigQuery client instance
 * @param query - Search query string
 * @param topK - Number of top results to return (default: 20)
 * @returns Array of chunks with text, metadata, and relevance scores
 */
async function keywordSearch(
  bigquery: BigQuery,
  query: string,
  topK: number = 20
): Promise<any[]> {
  // Escape single quotes for SQL
  const escapedQuery = query.replace(/'/g, "''");
  
  // Only perform keyword search if query doesn't have apostrophes
  if (query.includes("'")) {
    // Skip keyword search for queries with apostrophes to avoid SQL errors
    return [];
  }
  
  const searchQuery = `
    SELECT
      c.chunk_id,
      c.gmail_message_id,
      c.chunk_index,
      c.chunk_text,
      re.subject,
      re.from_email AS publisher_name,
      re.sent_date,
      -- Simple relevance score based on keyword frequency
      (
        (LENGTH(c.chunk_text) - LENGTH(REPLACE(LOWER(c.chunk_text), LOWER('${escapedQuery}'), ''))) 
        / LENGTH('${escapedQuery}')
      ) AS relevance
    FROM \`${PROJECT_ID}.${DATASET_ID}.chunks\` c
    JOIN \`${PROJECT_ID}.${DATASET_ID}.raw_emails\` re
      ON c.gmail_message_id = re.gmail_message_id
    WHERE c.is_junk IS NOT TRUE
      AND (
        LOWER(c.chunk_text) LIKE LOWER('%${escapedQuery}%')
        OR LOWER(re.subject) LIKE LOWER('%${escapedQuery}%')
      )
    ORDER BY relevance DESC
    LIMIT ${topK}
  `;

  try {
    const [rows] = await bigquery.query({
      query: searchQuery,
      location: BIGQUERY_LOCATION
    });
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
  let sorted = Array.from(combined.values())
    .sort((a, b) => b.combined_score - a.combined_score)
    .slice(0, topK * 2); // Get more candidates for reranking

  // Apply freshness bias (boost recent newsletters)
  const now = Date.now();
  sorted = sorted.map(chunk => {
    let freshnessBonus = 0;
    if (chunk.sent_date) {
      let chunkDate: number;
      if (chunk.sent_date && typeof chunk.sent_date === 'object' && chunk.sent_date.value) {
        chunkDate = new Date(chunk.sent_date.value).getTime();
      } else if (typeof chunk.sent_date === 'string') {
        chunkDate = new Date(chunk.sent_date).getTime();
      } else {
        chunkDate = 0;
      }
      
      if (chunkDate > 0) {
        // Boost by 10% for items from last 30 days, 5% for last 90 days
        const daysAgo = (now - chunkDate) / (1000 * 60 * 60 * 24);
        if (daysAgo <= 30) {
          freshnessBonus = 0.1;
        } else if (daysAgo <= 90) {
          freshnessBonus = 0.05;
        }
      }
    }
    
    return {
      ...chunk,
      combined_score: Math.min(chunk.combined_score + freshnessBonus, 1.0) // Cap at 1.0
    };
  });

  // Rerank with freshness
  sorted.sort((a, b) => b.combined_score - a.combined_score);

  // Normalize scores relative to top result (top = 100%)
  const topScore = sorted[0]?.combined_score || 1;
  sorted = sorted.map(chunk => ({
    ...chunk,
    normalized_score: topScore > 0 ? chunk.combined_score / topScore : chunk.combined_score
  }));

  return sorted.slice(0, topK);
}

/**
 * Fetch full chunk text from BigQuery with JOINs
 * Joins: chunks -> raw_emails -> publishers
 */
async function getFullChunks(bigquery: BigQuery, chunkIds: string[]): Promise<any[]> {
  // Guard clause: return empty array if no chunk IDs provided
  if (!chunkIds || chunkIds.length === 0) {
    console.warn('⚠️  getFullChunks called with empty chunk ID array');
    return [];
  }
  
  const ids = chunkIds.map(id => `'${id}'`).join(',');
  
  const query = `
    SELECT 
      c.chunk_id,
      c.gmail_message_id,
      c.chunk_index,
      c.chunk_text,
      re.subject,
      re.from_email AS publisher_name,
      re.sent_date
    FROM \`${PROJECT_ID}.${DATASET_ID}.chunks\` c
    JOIN \`${PROJECT_ID}.${DATASET_ID}.raw_emails\` re
      ON c.gmail_message_id = re.gmail_message_id
    WHERE c.chunk_id IN (${ids})
  `;

  const [rows] = await bigquery.query({
    query: query,
    location: BIGQUERY_LOCATION
  });
  return rows;
}

/**
 * Call Gemini 2.5 Pro to extract facts from chunks
 */
async function extractFacts(chunks: any[], userQuery: string): Promise<{facts: any[], tokens_in: number, tokens_out: number}> {
  const { GoogleAuth } = require('google-auth-library');
  
  // Using Application Default Credentials (ADC) - run `gcloud auth application-default login` first
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

  const endpoint = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/gemini-2.5-pro:generateContent`;
  
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
        maxOutputTokens: 8192,  // Increased to maximum to prevent truncation
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
  
  // Get token usage
  const usageMetadata = data.usageMetadata || {};
  const tokensIn = usageMetadata.promptTokenCount || 0;
  const tokensOut = usageMetadata.candidatesTokenCount || 0;
  
  // Try to parse as JSON with truncation repair
  try {
    const facts = JSON.parse(text);
    return {
      facts: Array.isArray(facts) ? facts : [],
      tokens_in: tokensIn,
      tokens_out: tokensOut
    };
  } catch (error) {
    console.warn('⚠️  Initial JSON parse failed, attempting truncation repair...');
    
    // Attempt to repair truncated JSON by finding last valid closing
    try {
      const lastValidEnd = text.lastIndexOf('}]');
      if (lastValidEnd !== -1) {
        const repairedText = text.substring(0, lastValidEnd + 2);
        console.log('🔧 Attempting to parse repaired JSON (truncated at last }])');
        const facts = JSON.parse(repairedText);
        console.log(`✅ Successfully repaired and parsed ${facts.length} facts`);
        return {
          facts: Array.isArray(facts) ? facts : [],
          tokens_in: tokensIn,
          tokens_out: tokensOut
        };
      }
    } catch (repairError) {
      console.warn('❌ Truncation repair failed:', repairError);
    }
    
    // Final fallback: return empty array
    console.warn('⚠️  Returning empty facts array due to unparseable response');
    return {
      facts: [],
      tokens_in: tokensIn,
      tokens_out: tokensOut
    };
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
 * Calculate publisher relevance rankings based on chunk results
 */
function calculatePublisherRankings(chunks: any[]): Array<{
  publisher: string;
  relevance_score: number;
  chunk_count: number;
  avg_score: number;
  latest_date: any;
}> {
  const publisherMap = new Map<string, {
    chunks: any[];
    scores: number[];
    dates: any[];
  }>();

  chunks.forEach(chunk => {
    const publisher = chunk.publisher_name || 'Unknown';
    if (!publisherMap.has(publisher)) {
      publisherMap.set(publisher, { chunks: [], scores: [], dates: [] });
    }
    const data = publisherMap.get(publisher)!;
    data.chunks.push(chunk);
    data.scores.push(chunk.combined_score || (1 - chunk.distance) || 0);
    if (chunk.sent_date) {
      data.dates.push(chunk.sent_date);
    }
  });

  const rankings = Array.from(publisherMap.entries()).map(([publisher, data]) => {
    const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    const maxScore = Math.max(...data.scores);
    const chunkCount = data.chunks.length;
    
    // Latest date (for freshness calculation)
    let latestDate: any = null;
    if (data.dates.length > 0) {
      const dates = data.dates.map(d => {
        if (d && typeof d === 'object' && d.value) {
          return new Date(d.value).getTime();
        } else if (typeof d === 'string') {
          return new Date(d).getTime();
        }
        return 0;
      }).filter(t => t > 0);
      if (dates.length > 0) {
        latestDate = data.dates[dates.indexOf(Math.max(...dates))];
      }
    }

    // Relevance score combines:
    // - Average similarity (40%)
    // - Maximum similarity (30%) 
    // - Number of relevant chunks (20%)
    // - Freshness bonus (10%) - applied later if we have dates
    const relevanceScore = (avgScore * 0.4) + (maxScore * 0.3) + (Math.min(chunkCount / 5, 1) * 0.2);

    return {
      publisher,
      relevance_score: Math.min(relevanceScore, 1), // Normalize to 0-1
      chunk_count: chunkCount,
      avg_score: avgScore,
      latest_date: latestDate
    };
  });

  // Sort by relevance score descending
  return rankings.sort((a, b) => b.relevance_score - a.relevance_score);
}

/**
 * Call Gemini 2.5 Pro to synthesize answer from facts
 */
async function synthesizeAnswer(facts: any[], userQuery: string, chunks: any[]): Promise<{answer: string, tokens_in: number, tokens_out: number}> {
  if (facts.length === 0) {
    return {
      answer: 'No information found in the newsletter archive that answers this query.',
      tokens_in: 0,
      tokens_out: 0
    };
  }

  const { GoogleAuth } = require('google-auth-library');
  
  // Using Application Default Credentials (ADC) - run `gcloud auth application-default login` first
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

  const endpoint = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/gemini-2.5-pro:generateContent`;
  
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
        maxOutputTokens: 8192  // Increased to maximum to prevent truncation
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API returned ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const answer = data.candidates[0].content.parts[0].text.trim();
  
  // Get token usage
  const usageMetadata = data.usageMetadata || {};
  const tokensIn = usageMetadata.promptTokenCount || 0;
  const tokensOut = usageMetadata.candidatesTokenCount || 0;
  
  return {
    answer,
    tokens_in: tokensIn,
    tokens_out: tokensOut
  };
}

export async function POST(request: NextRequest) {
  // Using Application Default Credentials (ADC) - run `gcloud auth application-default login` first
  console.log(`🔑 Using Application Default Credentials (ADC)`);
  
  try {
    const { query } = await request.json();

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Processing query: "${query}"`);

    const bigquery = new BigQuery({ 
      projectId: PROJECT_ID,
      location: BIGQUERY_LOCATION  // Dataset location (multi-region)
    });
    
    // Note: We can't check budget before processing since we don't know the cost yet
    // Will check after calculating actual cost

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
    const extractResult = await extractFacts(fullChunks, query);
    console.log(`✅ Extracted ${extractResult.facts.length} facts`);

    // Step 4: Synthesize answer from facts
    console.log('🤖 Synthesizing answer...');
    const synthResult = await synthesizeAnswer(extractResult.facts, query, fullChunks);
    console.log(`✅ Generated answer`);
    
    // Format citations for response with gmail_message_id for linking
    const citations = Array.from(new Set(
      extractResult.facts.map(f => {
        const chunk = fullChunks.find(c => c.chunk_id === f.chunk_id);
        return chunk ? f.chunk_id : null;
      }).filter(Boolean)
    )).map(chunkId => {
      const chunk = fullChunks.find(c => c.chunk_id === chunkId);
      if (!chunk) return null;
      return {
        chunk_id: chunk.chunk_id,
        gmail_message_id: chunk.gmail_message_id, // Email identifier
        chunk_index: chunk.chunk_index, // For highlighting specific chunk
        citation: formatCitation(chunk),
        publisher: chunk.publisher_name,
        date: chunk.sent_date,
        subject: chunk.subject
      };
    }).filter(Boolean).slice(0, 5); // Max 5 citations

    // Calculate total costs
    const totalTokensIn = extractResult.tokens_in + synthResult.tokens_in;
    const totalTokensOut = extractResult.tokens_out + synthResult.tokens_out;
    const totalCost = (totalTokensIn / 1_000_000) * INPUT_COST_PER_1M + (totalTokensOut / 1_000_000) * OUTPUT_COST_PER_1M;

    // Check daily budget (after processing, so we've already incurred the cost)
    // But log it for monitoring
    const withinBudget = checkDailyBudget(totalCost);
    if (!withinBudget) {
      console.warn(`⚠️  Daily budget exceeded: ${dailySpend.toFixed(4)} / ${DAILY_BUDGET_USD}`);
    }

    return NextResponse.json({
      query,
      answer: synthResult.answer,
      citations,
      chunks_used: chunks.length,
      cost_usd: totalCost,
      tokens_in: totalTokensIn,
      tokens_out: totalTokensOut,
      chunks: chunks.map(c => ({
        chunk_id: c.chunk_id,
        gmail_message_id: c.gmail_message_id, // Email identifier
        subject: c.subject,
        publisher: c.publisher_name,
        score: (c.normalized_score || c.combined_score || (1 - c.distance)) * 100 // Convert to percentage
      })),
      // Add publisher rankings
      publisher_rankings: calculatePublisherRankings(chunks)
    });

  } catch (error) {
    console.error('❌ Query failed:', error);
    
    // Enhanced error details
    const errorDetails: any = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
    
    // Check for common auth errors
    if (errorDetails.message.includes('ENOENT') || errorDetails.message.includes('.json') || errorDetails.message.includes('credentials')) {
      errorDetails.hint = 'Missing Google Cloud credentials. Set GOOGLE_APPLICATION_CREDENTIALS environment variable in .env.local';
      errorDetails.docs = 'https://cloud.google.com/docs/authentication/application-default-credentials';
    }
    
    // Check for quota/budget errors
    if (errorDetails.message.includes('quota') || errorDetails.message.includes('budget')) {
      errorDetails.hint = 'Daily budget exceeded or API quota reached.';
    }
    
    return NextResponse.json(
      { 
        error: 'Query failed',
        ...errorDetails
      },
      { status: 500 }
    );
  }
}

