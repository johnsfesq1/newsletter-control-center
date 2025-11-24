/**
 * RAG Core Pipeline
 * 
 * Implements two-stage filtering for newsletter query answering:
 * - Stage 1: Vector similarity search (similarity > 0.75)
 * - Stage 2: Relevance check (keyword matching + context validation)
 * 
 * This prevents hallucination by rejecting queries when we lack relevant data.
 * Critical test case: "cryptocurrency" query should be rejected (no coverage).
 */

import { getBigQuery } from '../bq/client';
import { embedBatch } from '../embeddings/vertex';

const PROJECT_ID = 'newsletter-control-center';
const DATASET = 'ncc_production';

// ===== TYPES =====

export interface SearchResult {
  chunk_id: string;
  distance: number;
  similarity: number;  // 1 - distance
  chunk_text: string;
  subject: string;
  from_name: string;
  from_email: string;
  sent_date: string;
  publisher_name: string | null;
  gmail_message_id: string;
  relevance_score?: number;  // Added by Stage 2
}

export interface RAGDecision {
  shouldAnswer: boolean;
  confidence: 'high' | 'medium' | 'none';
  reason: string;
  usableChunks: number;
  filteredResults: SearchResult[];
}

export interface RAGQueryResult {
  query: string;
  decision: RAGDecision;
  searchResults: SearchResult[];
  timing: {
    embedding_ms: number;
    vector_search_ms: number;
    relevance_check_ms: number;
    total_ms: number;
  };
}

// ===== THRESHOLDS (from score calibration testing) =====

const SIMILARITY_THRESHOLD = 0.75;  // Stage 1: Minimum similarity score
const RELEVANCE_THRESHOLD = 0.5;    // Stage 2: Minimum relevance score
const MIN_HIGH_CONFIDENCE_CHUNKS = 3;  // Need 3+ high-quality chunks to answer confidently

// ===== STAGE 1: VECTOR SEARCH =====

/**
 * Generate embedding for query text using Vertex AI
 */
async function generateQueryEmbedding(queryText: string): Promise<number[]> {
  const [embedding] = await embedBatch([queryText]);
  return embedding;
}

/**
 * Search for similar chunks using BigQuery vector search
 * Returns top N results ranked by cosine similarity
 */
async function vectorSearch(embedding: number[], limit: number = 10): Promise<SearchResult[]> {
  const bq = getBigQuery();
  
  const [rows] = await bq.query({
    query: `
      WITH query_embedding AS (
        SELECT ${JSON.stringify(embedding)} AS embedding
      )
      SELECT 
        ce.chunk_id,
        c.chunk_text,
        c.gmail_message_id,
        re.subject,
        re.from_name,
        re.from_email,
        CAST(DATE(re.sent_date) AS STRING) as sent_date,
        p.display_name as publisher_name,
        -- Calculate cosine distance (0 = identical, 2 = opposite)
        (1 - (
          (SELECT SUM(a * b) FROM UNNEST(ce.embedding) AS a WITH OFFSET pos1
           JOIN UNNEST(query_embedding.embedding) AS b WITH OFFSET pos2
           ON pos1 = pos2)
          /
          (SQRT((SELECT SUM(a * a) FROM UNNEST(ce.embedding) AS a)) *
           SQRT((SELECT SUM(b * b) FROM UNNEST(query_embedding.embedding) AS b)))
        )) AS distance
      FROM \`${PROJECT_ID}.${DATASET}.chunk_embeddings\` ce
      CROSS JOIN query_embedding
      JOIN \`${PROJECT_ID}.${DATASET}.chunks\` c
        ON ce.chunk_id = c.chunk_id
      JOIN \`${PROJECT_ID}.${DATASET}.raw_emails\` re
        ON c.gmail_message_id = re.gmail_message_id
      LEFT JOIN \`${PROJECT_ID}.${DATASET}.publishers\` p
        ON c.publisher_id = p.publisher_id
      WHERE c.is_junk = FALSE
      ORDER BY distance ASC
      LIMIT ${limit}
    `,
    location: 'US'
  });

  return rows.map(row => ({
    chunk_id: row.chunk_id,
    distance: row.distance,
    similarity: 1 - row.distance,  // Convert distance to similarity (1 = identical, 0 = orthogonal)
    chunk_text: row.chunk_text,
    gmail_message_id: row.gmail_message_id,
    subject: row.subject,
    from_name: row.from_name,
    from_email: row.from_email,
    sent_date: row.sent_date,
    publisher_name: row.publisher_name
  }));
}

// ===== STAGE 2: RELEVANCE CHECK =====

/**
 * Check if a search result is actually relevant to the query
 * Returns relevance score 0.0-1.0 based on:
 * - Keyword matching (query terms in chunk text)
 * - Context validation (terms appear with substantial context, not just mentions)
 * 
 * This is CRITICAL for preventing hallucination.
 * Example: "cryptocurrency" query may have high similarity scores (0.80+)
 * but zero relevance (no matching keywords) → correctly rejected
 */
export function checkRelevance(queryText: string, result: SearchResult): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[''’]/g, "'");
  const query = normalize(queryText);
  const text = normalize(result.chunk_text);
  const subject = normalize(result.subject || '');
  
  // Extract key terms from query (filter out common words)
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can']);
  
  // Helper to strip possessives and non-word characters
  const cleanTerm = (t: string) => t.replace(/'s$/, '').replace(/[^\w']$/, '');

  const queryTerms = query
    .split(/\s+/)
    .map(cleanTerm)
    .filter(term => term.length > 3 && !stopWords.has(term));
  
  if (queryTerms.length === 0) {
    // Very short query, fallback to similarity score
    return result.similarity;
  }
  
  // Count how many query terms appear in the result
  const matchedTerms = queryTerms.filter(term => 
    text.includes(term) || subject.includes(term)
  );
  
  const matchRatio = matchedTerms.length / queryTerms.length;
  
  // Check if terms appear with substantial context (50+ chars around them)
  // This distinguishes "cryptocurrency mentioned once" from "article about cryptocurrency"
  const hasStrongContext = queryTerms.some(term => {
    const index = text.indexOf(term);
    if (index === -1) return false;
    
    const contextStart = Math.max(0, index - 50);
    const contextEnd = Math.min(text.length, index + 50);
    const context = text.substring(contextStart, contextEnd);
    
    return context.length > 70;  // Must have substantial context
  });
  
  // Calculate relevance score
  let relevanceScore = 0.0;
  
  // Base score from keyword matching
  relevanceScore += matchRatio * 0.6;  // Up to 0.6 for perfect keyword match
  
  // Bonus for strong context
  if (hasStrongContext) {
    relevanceScore += 0.3;
  }
  
  // Small bonus for subject line match (signals topical relevance)
  const subjectMatches = queryTerms.filter(term => subject.includes(term)).length;
  if (subjectMatches > 0) {
    relevanceScore += 0.1;
  }
  
  // Cap at 1.0
  return Math.min(1.0, relevanceScore);
}

/**
 * Apply two-stage filtering to search results:
 * 1. Filter by similarity threshold (>0.75)
 * 2. Calculate relevance scores for remaining results
 * 3. Filter by relevance threshold (>0.5)
 */
function applyTwoStageFilter(queryText: string, results: SearchResult[]): SearchResult[] {
  // Stage 1: Similarity filter
  const stage1Results = results.filter(r => r.similarity > SIMILARITY_THRESHOLD);
  
  // Stage 2: Relevance check
  const stage2Results = stage1Results.map(result => ({
    ...result,
    relevance_score: checkRelevance(queryText, result)
  })).filter(r => r.relevance_score! > RELEVANCE_THRESHOLD);
  
  return stage2Results;
}

// ===== RAG DECISION LOGIC =====

/**
 * Decide whether to answer the query based on filtered results
 * 
 * Logic:
 * - HIGH confidence: 3+ results with similarity >0.80 AND relevance >0.5
 * - MEDIUM confidence: 3+ results with similarity >0.75 AND relevance >0.5
 * - REJECT: Fewer than 3 relevant results
 */
function makeRAGDecision(queryText: string, searchResults: SearchResult[]): RAGDecision {
  // Apply two-stage filtering
  const filteredResults = applyTwoStageFilter(queryText, searchResults);
  
  // Count high-confidence chunks (very high similarity + relevant)
  const highConfidenceChunks = filteredResults.filter(r => r.similarity > 0.80);
  
  // Decision tree
  if (highConfidenceChunks.length >= MIN_HIGH_CONFIDENCE_CHUNKS) {
    return {
      shouldAnswer: true,
      confidence: 'high',
      reason: `Found ${highConfidenceChunks.length} highly relevant sources`,
      usableChunks: filteredResults.length,
      filteredResults
    };
  } else if (filteredResults.length >= MIN_HIGH_CONFIDENCE_CHUNKS) {
    return {
      shouldAnswer: true,
      confidence: 'medium',
      reason: `Found ${filteredResults.length} relevant sources, but confidence is limited`,
      usableChunks: filteredResults.length,
      filteredResults
    };
  } else {
    return {
      shouldAnswer: false,
      confidence: 'none',
      reason: `Insufficient relevant data (only ${filteredResults.length} relevant chunks found)`,
      usableChunks: filteredResults.length,
      filteredResults
    };
  }
}

// ===== PUBLIC API =====

/**
 * Execute a RAG query pipeline
 * 
 * Steps:
 * 1. Generate query embedding (Vertex AI)
 * 2. Vector search (BigQuery, top 10 by similarity)
 * 3. Two-stage filtering (similarity + relevance)
 * 4. Make RAG decision (answer or reject)
 * 
 * @param queryText - Natural language question
 * @returns RAGQueryResult with decision, filtered results, and timing
 */
export async function executeRAGQuery(queryText: string): Promise<RAGQueryResult> {
  const overallStart = Date.now();
  
  // Step 1: Generate embedding
  const embeddingStart = Date.now();
  const embedding = await generateQueryEmbedding(queryText);
  const embeddingTime = Date.now() - embeddingStart;
  
  // Step 2: Vector search
  const searchStart = Date.now();
  const searchResults = await vectorSearch(embedding, 10);
  const searchTime = Date.now() - searchStart;
  
  // Step 3 & 4: Two-stage filtering + RAG decision
  const relevanceStart = Date.now();
  const decision = makeRAGDecision(queryText, searchResults);
  const relevanceTime = Date.now() - relevanceStart;
  
  const totalTime = Date.now() - overallStart;
  
  return {
    query: queryText,
    decision,
    searchResults,
    timing: {
      embedding_ms: embeddingTime,
      vector_search_ms: searchTime,
      relevance_check_ms: relevanceTime,
      total_ms: totalTime
    }
  };
}

