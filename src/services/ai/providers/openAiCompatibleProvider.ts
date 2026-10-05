import { ILLMProvider, ProviderCapabilities, StructuredGenerationRequest, RawGenerationResult } from './providerInterface';

export class OpenAiCompatibleProvider implements ILLMProvider {
  public readonly providerId = 'openai-compatible';
  public readonly modelId: string;
  public readonly baseUrl: string;
  public readonly apiKey: string;
  public readonly capabilities: ProviderCapabilities;

  constructor(config: { baseUrl?: string; modelId?: string; apiKey?: string; isLocal?: boolean }) {
    this.baseUrl = (config.baseUrl || 'http://127.0.0.1:1234/v1').replace(/\/+$/, '');
    this.modelId = config.modelId || 'qwen2.5-coder-7b';
    this.apiKey = config.apiKey || 'local-no-key';
    const isLocal = config.isLocal ?? (this.baseUrl.includes('127.0.0.1') || this.baseUrl.includes('localhost'));
    this.capabilities = {
      maxContextTokens: 32768,
      supportsGrammarConstraint: false,
      supportsNativeToolCalling: true,
      isLocalOffline: isLocal,
      streamingSupport: true
    };
  }

  async generateRaw(request: StructuredGenerationRequest, signal?: AbortSignal): Promise<RawGenerationResult> {
    const messages = [
      { role: 'system', content: `${request.systemPrompt}\nRespond ONLY with valid JSON.` },
      ...(request.conversationHistory || []),
      { role: 'user', content: request.userPrompt }
    ];

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.modelId,
        messages,
        temperature: request.temperature ?? 0.1,
        response_format: { type: 'json_object' }
      }),
      signal
    });

    if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
    const jsonRes = await response.json();
    return {
      rawText: jsonRes.choices?.[0]?.message?.content || '',
      usage: {
        promptTokens: jsonRes.usage?.prompt_tokens ?? 0,
        completionTokens: jsonRes.usage?.completion_tokens ?? 0,
        totalTokens: jsonRes.usage?.total_tokens ?? 0
      }
    };
  }

  async healthCheck(signal?: AbortSignal): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal
      });
      if (!res.ok) {
        return { isHealthy: false, availableModels: [], error: `HTTP ${res.status}` };
      }
      const data = await res.json();
      const models = Array.isArray(data.data) ? data.data.map((m: any) => m.id) : [];
      return { isHealthy: true, availableModels: models };
    } catch (err: any) {
      return { isHealthy: false, availableModels: [], error: err.message || String(err) };
    }
  }
}

