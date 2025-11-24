<!-- c1e5a809-3bf5-42c1-b1f0-2eaf64ff26bd bbd0dae5-08e7-42bc-a5da-157e1de142df -->
# Phase 2: RAG API & LLM Integration Plan

## 1. LLM Provider Abstraction

Create a flexible interface to support multiple LLM providers (Gemini, Claude, OpenAI) with easy switching.

- **File**: `src/lib/llm/types.ts`
- Define `LLMRequest`, `LLMResponse`, and `LLMProvider` interfaces.
- **File**: `src/lib/llm/factory.ts`
- Implement factory to instantiate providers based on env config.

## 2. Gemini Implementation

Implement the Gemini provider using the existing authentication pattern.

- **File**: `src/lib/llm/providers/gemini.ts`
- Implement `LLMProvider`.
- Use `google-auth-library` for authentication.
- Implement `generateAnswer` using Gemini 1.5 Flash/Pro.
- Include token usage and cost estimation logic.

## 3. Enhanced RAG Core

Connect Phase 1 (retrieval) with Phase 2 (generation).

- **File**: `src/core/rag-application.ts`
- Import `executeRAGQuery` from `src/core/rag.ts`.
- Implement `executeRAGWithAnswer(query: string)`.
- Logic:

1. Run Phase 1 retrieval.
2. If `shouldAnswer` is false, return specific "no_relevant_data" error with diagnostics.
3. Format context from chunks.
4. Call LLM provider.
5. Construct rich citations (with previews).
6. Return unified `RAGResponse`.

## 4. Production API Endpoint

Create the secured Express API endpoint.

- **File**: `src/api/intelligence.ts`
- Set up Express app with JSON parsing.
- Implement Bearer token authentication middleware (aligned with `jobs-runner.ts`).
- **Route**: `POST /query`
- Accepts `{ query: string }`.
- Calls `executeRAGWithAnswer`.
- Returns successful JSON or structured error response.

## 5. Testing & Verification

Verify end-to-end functionality.

- **File**: `scripts/rag/test-end-to-end.ts`
- Test 1: Golden Query (China semiconductors) -> Expect answer + citations.
- Test 2: Crypto Query -> Expect "no_relevant_data" error (no LLM call).
- Test 3: Check citation format and cost tracking.

### To-dos

- [ ] Define LLM interfaces in src/lib/llm/types.ts
- [ ] Implement Gemini provider in src/lib/llm/providers/gemini.ts
- [ ] Create provider factory in src/lib/llm/factory.ts
- [ ] Implement enhanced RAG logic in src/core/rag-application.ts
- [ ] Build API endpoint in src/api/intelligence.ts
- [ ] Create and run end-to-end test script