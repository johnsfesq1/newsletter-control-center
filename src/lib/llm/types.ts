/**
 * LLM Provider Types
 * 
 * Abstraction layer for different LLM providers (Gemini, Claude, OpenAI).
 * Allows easy switching between providers without changing core RAG logic.
 */

export interface LLMRequest {
  query: string;
  context: string;        // Formatted chunks with identifiers
  systemPrompt?: string;  // Instructions (persona, citation rules)
  temperature?: number;   // Default 0.3
  maxOutputTokens?: number; // Default 4096
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
}

export interface LLMResponse {
  content: string;        // The generated answer
  usage: LLMUsage;
  modelUsed: string;
  provider: string;
}

export interface LLMProvider {
  name: string;
  modelName: string;
  
  /**
   * Generate an answer based on the provided context and query
   */
  generateAnswer(request: LLMRequest): Promise<LLMResponse>;
}

