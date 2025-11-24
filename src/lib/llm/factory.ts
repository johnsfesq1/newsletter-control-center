import { LLMProvider } from './types';
import { GeminiProvider } from './providers/gemini';

export type ProviderType = 'gemini';

export function getLLMProvider(type?: string, model?: string): LLMProvider {
  const providerType = type || process.env.LLM_PROVIDER || 'gemini';
  
  switch (providerType.toLowerCase()) {
    case 'gemini':
      return new GeminiProvider(model || process.env.LLM_MODEL || 'gemini-2.5-flash-lite');
    default:
      console.warn(`Unknown provider '${providerType}', falling back to Gemini`);
      return new GeminiProvider(model || 'gemini-2.5-flash-lite');
  }
}
