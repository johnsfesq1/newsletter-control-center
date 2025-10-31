import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import { GoogleAuth } from 'google-auth-library';
import goldSet from '../config/gold-set.json';

dotenv.config();

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'newsletter-control-center';
const DATASET_ID = 'ncc_newsletters';
const CHUNKS_TABLE = 'chunks';
const EVAL_RESULTS_TABLE = 'eval_results';
const LOCATION = 'us-central1';

interface EvaluationResult {
  question_id: string;
  question: string;
  answer: string;
  facts_extracted: number;
  citations_count: number;
  chunks_retrieved: number;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  error?: string;
  timestamp: string;
}

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
 * Vector search using cosine similarity
 */
async function vectorSearch(bigquery: BigQuery, queryEmbedding: number[], topK: number = 10): Promise<any[]> {
  const embeddingStr = JSON.stringify(queryEmbedding);
  
  const query = `
    SELECT 
      chunk_id,
      newsletter_id,
      chunk_index,
      chunk_text,
      subject,
      publisher_name,
      sent_date,
      is_paid,
      1 - (
        COSINE_DISTANCE(chunk_embedding, [${queryEmbedding.join(', ')}])
      ) AS distance
    FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
    WHERE chunk_embedding IS NOT NULL
    ORDER BY distance ASC
    LIMIT ${topK}
  `;

  const [rows] = await bigquery.query(query);
  return rows;
}

/**
 * Keyword search with SQL LIKE
 */
async function keywordSearch(bigquery: BigQuery, userQuery: string, topK: number = 10): Promise<any[]> {
  const escapedQuery = userQuery.replace(/'/g, "''");
  const keywords = escapedQuery.split(/\s+/).filter(k => k.length > 2);
  
  if (keywords.length === 0) return [];
  
  try {
    const conditions = keywords.map(kw => `chunk_text LIKE '%${kw}%'`).join(' AND ');
    const query = `
      SELECT 
        chunk_id,
        newsletter_id,
        chunk_index,
        chunk_text,
        subject,
        publisher_name,
        sent_date,
        is_paid,
        (LENGTH(chunk_text) - LENGTH(REPLACE(chunk_text, '${keywords[0]}', ''))) / LENGTH('${keywords[0]}') AS relevance
      FROM \`${PROJECT_ID}.${DATASET_ID}.${CHUNKS_TABLE}\`
      WHERE ${conditions}
      ORDER BY relevance DESC
      LIMIT ${topK}
    `;

    const [rows] = await bigquery.query(query);
    return rows.map((r: any) => ({ ...r, relevance: Math.min(r.relevance / 10, 1) }));
  } catch (error) {
    console.warn('Keyword search failed:', error);
    return [];
  }
}

/**
 * Hybrid search combining vector and keyword results
 */
async function hybridSearch(bigquery: BigQuery, userQuery: string, queryEmbedding: number[], topK: number = 10): Promise<any[]> {
  const [vectorResults, keywordResults] = await Promise.all([
    vectorSearch(bigquery, queryEmbedding, topK * 2),
    keywordSearch(bigquery, userQuery, topK * 2)
  ]);

  const combined = new Map();

  // Add vector results (weight: 0.7)
  vectorResults.forEach((result) => {
    const score = result.distance || 0;
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
 * Format citation
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
 * Extract facts from chunks
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
    return Array.isArray(facts) ? facts : [];
  } catch (error) {
    console.warn('Failed to parse facts as JSON:', text);
    return [];
  }
}

/**
 * Synthesize answer from facts
 */
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
 * Run RAG query
 */
async function runRAGQuery(userQuery: string): Promise<{
  answer: string;
  facts: any[];
  citations: any[];
  chunks_used: number;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
}> {
  const startTime = Date.now();
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  // Step 1: Generate query embedding
  const queryEmbedding = await generateEmbedding(userQuery);

  // Step 2: Perform hybrid search
  const chunks = await hybridSearch(bigquery, userQuery, queryEmbedding, 10);

  if (chunks.length === 0) {
    const latency = Date.now() - startTime;
    return {
      answer: 'No information found in the newsletter archive that answers this query.',
      facts: [],
      citations: [],
      chunks_used: 0,
      latency_ms: latency,
      tokens_in: 0,
      tokens_out: 0
    };
  }

  // Step 3: Fetch full chunks
  const chunkIds = chunks.map(c => c.chunk_id);
  const fullChunks = await getFullChunks(bigquery, chunkIds);

  // Step 4: Extract facts
  const facts = await extractFacts(fullChunks, userQuery);

  // Step 5: Synthesize answer
  const answer = await synthesizeAnswer(facts, userQuery, fullChunks);
  
  // Format citations
  const citations = Array.from(new Set(
    facts.map(f => {
      const chunk = fullChunks.find(c => c.chunk_id === f.chunk_id);
      return chunk ? formatCitation(chunk) : null;
    }).filter(Boolean)
  )).slice(0, 5);

  const latency = Date.now() - startTime;
  
  // Estimate tokens (rough: ~4 chars per token)
  const tokens_in = Math.floor((userQuery.length + fullChunks.reduce((sum, c) => sum + c.chunk_text.length, 0)) / 4);
  const tokens_out = Math.floor(answer.length / 4);

  return {
    answer,
    facts,
    citations,
    chunks_used: chunks.length,
    latency_ms: latency,
    tokens_in,
    tokens_out
  };
}

/**
 * Calculate cost (rough estimate)
 */
function calculateCost(tokensIn: number, tokensOut: number): number {
  // Gemini 2.5 Pro pricing (approximate)
  const INPUT_COST_PER_1M = 1.25;  // $1.25 per 1M tokens
  const OUTPUT_COST_PER_1M = 5.00;  // $5.00 per 1M tokens
  
  return (tokensIn / 1_000_000) * INPUT_COST_PER_1M + (tokensOut / 1_000_000) * OUTPUT_COST_PER_1M;
}

/**
 * Evaluate single question
 */
async function evaluateQuestion(question: any, bigquery: BigQuery): Promise<EvaluationResult> {
  console.log(`\n📋 Testing: "${question.question}"`);
  
  try {
    const result = await runRAGQuery(question.question);
    
    const evalResult: EvaluationResult = {
      question_id: question.id,
      question: question.question,
      answer: result.answer,
      facts_extracted: result.facts.length,
      citations_count: result.citations.length,
      chunks_retrieved: result.chunks_used,
      latency_ms: result.latency_ms,
      tokens_in: result.tokens_in,
      tokens_out: result.tokens_out,
      cost_usd: calculateCost(result.tokens_in, result.tokens_out),
      timestamp: new Date().toISOString()
    };

    console.log(`   ✅ Extracted ${result.facts.length} facts, ${result.citations.length} citations`);
    console.log(`   ⏱️  Latency: ${result.latency_ms}ms`);
    console.log(`   💰 Cost: $${calculateCost(result.tokens_in, result.tokens_out).toFixed(4)}`);
    
    return evalResult;
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
    return {
      question_id: question.id,
      question: question.question,
      answer: '',
      facts_extracted: 0,
      citations_count: 0,
      chunks_retrieved: 0,
      latency_ms: 0,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Main evaluation function
 */
async function runEvaluation() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 RAG EVALUATION HARNESS');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`📊 Testing ${goldSet.questions.length} questions\n`);
  
  const results: EvaluationResult[] = [];
  
  // Run evaluation for each question
  for (const question of goldSet.questions) {
    const result = await evaluateQuestion(question, bigquery);
    results.push(result);
  }
  
  // Calculate summary stats
  const totalCost = results.reduce((sum, r) => sum + r.cost_usd, 0);
  const avgLatency = results.reduce((sum, r) => sum + r.latency_ms, 0) / results.length;
  const avgFacts = results.reduce((sum, r) => sum + r.facts_extracted, 0) / results.length;
  const avgCitations = results.reduce((sum, r) => sum + r.citations_count, 0) / results.length;
  const errors = results.filter(r => r.error).length;
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 EVALUATION RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Total Questions: ${results.length}`);
  console.log(`Errors: ${errors}`);
  console.log(`Avg Facts Extracted: ${avgFacts.toFixed(1)}`);
  console.log(`Avg Citations: ${avgCitations.toFixed(1)}`);
  console.log(`Avg Latency: ${avgLatency.toFixed(0)}ms`);
  console.log(`Total Cost: $${totalCost.toFixed(4)}`);
  console.log('');
  
  // Store results in BigQuery
  try {
    const dataset = bigquery.dataset(DATASET_ID);
    const table = dataset.table(EVAL_RESULTS_TABLE);
    
    // Check if table exists
    try {
      await table.getMetadata();
    } catch {
      console.log('📝 Creating eval_results table...');
      await dataset.createTable(EVAL_RESULTS_TABLE, {
        schema: [
          { name: 'question_id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'question', type: 'STRING', mode: 'REQUIRED' },
          { name: 'answer', type: 'STRING', mode: 'NULLABLE' },
          { name: 'facts_extracted', type: 'INTEGER', mode: 'NULLABLE' },
          { name: 'citations_count', type: 'INTEGER', mode: 'NULLABLE' },
          { name: 'chunks_retrieved', type: 'INTEGER', mode: 'NULLABLE' },
          { name: 'latency_ms', type: 'INTEGER', mode: 'NULLABLE' },
          { name: 'tokens_in', type: 'INTEGER', mode: 'NULLABLE' },
          { name: 'tokens_out', type: 'INTEGER', mode: 'NULLABLE' },
          { name: 'cost_usd', type: 'FLOAT', mode: 'NULLABLE' },
          { name: 'error', type: 'STRING', mode: 'NULLABLE' },
          { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' }
        ]
      });
    }
    
    await table.insert(results);
    console.log('✅ Results saved to BigQuery\n');
  } catch (error) {
    console.error('⚠️  Failed to save results:', error);
  }
  
  console.log('═══════════════════════════════════════════════════════════\n');
}

runEvaluation().catch(console.error);

