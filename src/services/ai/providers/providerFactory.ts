import { ILLMProvider } from './providerInterface';
import { LocalOllamaProvider } from './localOllamaProvider';
import { OpenAiCompatibleProvider } from './openAiCompatibleProvider';
import { GeminiProvider } from './geminiProvider';

export interface ProviderConfig {
  type: 'ollama' | 'lmstudio' | 'gemini' | 'openai';
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  temperature?: number;
  timeoutMs?: number;
  contextTokens?: number;
}

export class ProviderFactory {
  public static createProvider(config: ProviderConfig): ILLMProvider {
    const isStrictLoopback = (urlString?: string): boolean => {
      if (!urlString) return true;
      try {
        const parsed = new URL(urlString);
        const host = parsed.hostname.toLowerCase();
        return host === 'localhost' || host === '127.0.0.1' || host === '::1';
      } catch {
        return false;
      }
    };

    switch (config.type) {
      case 'ollama':
        if (config.baseUrl && !isStrictLoopback(config.baseUrl)) {
          throw new Error('Local provider must use exact loopback (127.0.0.1, localhost, ::1) hostname for air-gapped security.');
        }
        return new LocalOllamaProvider({
          baseUrl: config.baseUrl,
          modelId: config.modelId,
          temperature: config.temperature,
          timeoutMs: config.timeoutMs,
          contextTokens: config.contextTokens
        });


      case 'lmstudio':
        if (config.baseUrl && !isStrictLoopback(config.baseUrl)) {
          throw new Error('Local provider must use exact loopback (127.0.0.1, localhost, ::1) hostname for air-gapped security.');
        }
        return new OpenAiCompatibleProvider({ baseUrl: config.baseUrl || 'http://127.0.0.1:1234/v1', modelId: config.modelId, isLocal: true });

      case 'openai':
        if (!config.apiKey) throw new Error('OpenAI API key is required for cloud endpoints');
        return new OpenAiCompatibleProvider({ baseUrl: config.baseUrl || 'https://api.openai.com/v1', modelId: config.modelId, apiKey: config.apiKey, isLocal: false });

      case 'gemini':
        if (!config.apiKey) throw new Error('Gemini API key is required');
        return new GeminiProvider({ apiKey: config.apiKey, modelId: config.modelId });

      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }
  }
}
