import { ILLMProvider, ProviderCapabilities, StructuredGenerationRequest, RawGenerationResult } from './providerInterface';

export class LocalOllamaProvider implements ILLMProvider {
  public readonly providerId = 'ollama';
  public readonly modelId: string;
  public readonly baseUrl: string;
  public readonly capabilities: ProviderCapabilities = {
    maxContextTokens: 32768,
    supportsGrammarConstraint: true,
    supportsNativeToolCalling: false,
    isLocalOffline: true,
    streamingSupport: true
  };

  constructor(config: { baseUrl?: string; modelId?: string }) {
    this.baseUrl = config.baseUrl || 'http://127.0.0.1:11434';
    this.modelId = config.modelId || 'deepseek-r1:8b';
  }

  async generateRaw(request: StructuredGenerationRequest, signal?: AbortSignal): Promise<RawGenerationResult> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelId,
        system: request.systemPrompt,
        prompt: request.userPrompt,
        format: 'json',
        stream: false,
        options: { temperature: request.temperature ?? 0.1 }
      }),
      signal
    });

    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
    const res = await response.json();
    return {
      rawText: res.response || '',
      usage: { promptTokens: res.prompt_eval_count || 0, completionTokens: res.eval_count || 0, totalTokens: (res.prompt_eval_count || 0) + (res.eval_count || 0) }
    };
  }
}
