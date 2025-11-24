import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { LLMProvider, LLMRequest, LLMResponse } from '../types';

// Pricing constants (approximate as of late 2024)
// https://ai.google.dev/pricing
const PRICING = {
  'gemini-1.5-flash-001': {
    input: 0.075 / 1_000_000,  // $0.075 per 1M input tokens
    output: 0.30 / 1_000_000,  // $0.30 per 1M output tokens
  },
  'gemini-1.5-pro-001': {
    input: 1.25 / 1_000_000,   // $1.25 per 1M input tokens
    output: 5.00 / 1_000_000,  // $5.00 per 1M output tokens
  },
  'gemini-2.5-flash-lite': {
    input: 0.075 / 1_000_000,  // Assuming similar to 1.5 Flash
    output: 0.30 / 1_000_000,
  }
};

export class GeminiProvider implements LLMProvider {
  name = 'Gemini';
  modelName: string;
  private projectId: string;
  private location: string;
  private vertexAI: VertexAI;
  private model: GenerativeModel;

  constructor(modelName: string = 'gemini-2.5-flash-lite') {
    this.modelName = modelName;
    this.projectId = process.env.BQ_PROJECT_ID || '';
    
    // Map common BigQuery locations to Vertex AI regions
    const bqLocation = process.env.BQ_LOCATION || 'US';
    const locationMap: Record<string, string> = {
      'US': 'us-central1',
      'EU': 'europe-west1',
      'asia-northeast1': 'asia-northeast1',
    };
    this.location = process.env.EMB_LOCATION || locationMap[bqLocation] || 'us-central1';

    if (!this.projectId) {
      throw new Error('BQ_PROJECT_ID environment variable is required');
    }

    this.vertexAI = new VertexAI({
      project: this.projectId,
      location: this.location,
    });

    this.model = this.vertexAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.3,
        topP: 0.95,
        topK: 40,
      }
    });
  }

  async generateAnswer(request: LLMRequest): Promise<LLMResponse> {
    const prompt = `${request.systemPrompt || 'You are a helpful assistant.'}

Query: "${request.query}"

Context:
${request.context}

Instructions:
1. Answer the query using ONLY the provided context.
2. Cite your sources using inline identifiers like [1], [2], etc.
3. If the context does not contain the information needed to answer the query, state that you do not have enough information. Do not make up an answer.
4. Be concise and professional.`;

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: request.maxOutputTokens ?? 4096,
          temperature: request.temperature ?? 0.3,
        }
      });

      const response = await result.response;
      
      if (!response.candidates || response.candidates.length === 0) {
        throw new Error('No candidates returned from Gemini API');
      }

      const candidate = response.candidates[0];
      const content = candidate.content.parts[0].text || '';
      
      // Get token usage
      const usageMetadata = response.usageMetadata || {};
      const inputTokens = usageMetadata.promptTokenCount || 0;
      const outputTokens = usageMetadata.candidatesTokenCount || 0;
      const totalTokens = usageMetadata.totalTokenCount || (inputTokens + outputTokens);

      // Calculate cost
      const pricing = PRICING[this.modelName as keyof typeof PRICING] || PRICING['gemini-2.5-flash-lite'];
      const estimatedCostUSD = (inputTokens * pricing.input) + (outputTokens * pricing.output);

      return {
        content,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCostUSD
        },
        modelUsed: this.modelName,
        provider: this.name
      };
    } catch (error: any) {
      console.error('Gemini API Error:', error);
      throw new Error(`Gemini API failed: ${error.message}`);
    }
  }
}
