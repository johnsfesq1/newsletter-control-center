/**
 * Enhanced RAG Application Logic
 * 
 * Coordinates Phase 1 (Retrieval) and Phase 2 (Generation).
 */

import { executeRAGQuery, SearchResult, RAGQueryResult } from './rag';
import { getLLMProvider } from '../lib/llm/factory';
import { LLMUsage } from '../lib/llm/types';

export interface Citation {
  chunk_id: string;
  citation_index: number; // [1], [2] etc.
  preview: string;
  metadata: {
    subject: string;
    from: string;
    date: string;
    publisher: string | null;
  };
  confidence_score: number;
}

export interface RAGResponse {
  query: string;
  answer: string;
  citations: Citation[];
  confidence: 'high' | 'medium' | 'none';
  usage?: LLMUsage;
  timing: {
    retrieval_ms: number;
    generation_ms: number;
    total_ms: number;
  };
  diagnostics?: {
    rag_decision: RAGQueryResult['decision'];
    chunks_found: number;
  };
}

/**
 * Format chunks into a context string for the LLM
 */
function formatContext(chunks: SearchResult[]): string {
  return chunks.map((chunk, index) => `
[${index + 1}] Source:
Subject: ${chunk.subject}
From: ${chunk.from_name} (${chunk.from_email})
Date: ${chunk.sent_date}
Publisher: ${chunk.publisher_name || 'Unknown'}
Content: ${chunk.chunk_text}
`).join('\n---\n');
}

/**
 * Create rich citations from the chunks used
 */
function createCitations(chunks: SearchResult[]): Citation[] {
  return chunks.map((chunk, index) => ({
    chunk_id: chunk.chunk_id,
    citation_index: index + 1,
    preview: chunk.chunk_text.substring(0, 200) + '...',
    metadata: {
      subject: chunk.subject,
      from: chunk.from_name,
      date: chunk.sent_date,
      publisher: chunk.publisher_name
    },
    confidence_score: chunk.similarity
  }));
}

/**
 * Execute RAG pipeline with answer generation
 */
export async function executeRAGWithAnswer(query: string): Promise<RAGResponse> {
  const startTotal = Date.now();
  
  // Phase 1: Retrieval
  const retrievalResult = await executeRAGQuery(query);
  const retrievalTime = Date.now() - startTotal;
  
  // If decision is not to answer, return early with diagnostics
  if (!retrievalResult.decision.shouldAnswer) {
    return {
      query,
      answer: "I don't have enough relevant information in the newsletter archive to answer this query confidently.",
      citations: [],
      confidence: 'none',
      timing: {
        retrieval_ms: retrievalTime,
        generation_ms: 0,
        total_ms: Date.now() - startTotal
      },
      diagnostics: {
        rag_decision: retrievalResult.decision,
        chunks_found: retrievalResult.searchResults.length
      }
    };
  }

  // Phase 2: Generation
  const startGen = Date.now();
  const provider = getLLMProvider();
  
  // Use filtered results from Phase 1
  const relevantChunks = retrievalResult.decision.filteredResults;
  const context = formatContext(relevantChunks);
  
  const llmResponse = await provider.generateAnswer({
    query,
    context,
    systemPrompt: `You are an intelligent assistant for the Newsletter Control Center. 
Your goal is to answer the user's question based ONLY on the provided newsletter chunks.
- Be concise and direct.
- Cite your sources using the [1], [2] format provided in the context.
- If the context has conflicting information, mention it.
- If the context is insufficient to answer a specific part of the question, admit it.`
  });
  
  const generationTime = Date.now() - startGen;
  
  return {
    query,
    answer: llmResponse.content,
    citations: createCitations(relevantChunks),
    confidence: retrievalResult.decision.confidence,
    usage: llmResponse.usage,
    timing: {
      retrieval_ms: retrievalTime,
      generation_ms: generationTime,
      total_ms: Date.now() - startTotal
    },
    diagnostics: {
      rag_decision: retrievalResult.decision,
      chunks_found: retrievalResult.searchResults.length
    }
  };
}

