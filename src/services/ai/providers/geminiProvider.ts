import { ILLMProvider, ProviderCapabilities, StructuredGenerationRequest, RawGenerationResult } from './providerInterface';

export class GeminiProvider implements ILLMProvider {
  public readonly providerId = 'gemini';
  public readonly modelId: string;
  private readonly apiKey: string;
  public readonly capabilities: ProviderCapabilities = {
    maxContextTokens: 1048576,
    supportsGrammarConstraint: true,
    supportsNativeToolCalling: true,
    isLocalOffline: false,
    streamingSupport: true
  };

  constructor(config: { apiKey: string; modelId?: string }) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId || 'gemini-2.0-flash';
  }

  async generateRaw(request: StructuredGenerationRequest, signal?: AbortSignal): Promise<RawGenerationResult> {
    const contents: any[] = [];
    if (request.conversationHistory) {
      for (const msg of request.conversationHistory) {
        contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] });
      }
    }
    contents.push({ role: 'user', parts: [{ text: request.userPrompt }] });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.systemPrompt }] },
        contents,
        generationConfig: { responseMimeType: 'application/json', temperature: request.temperature ?? 0.1 }
      }),
      signal
    });

    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${await response.text()}`);
    const jsonRes = await response.json();
    return {
      rawText: jsonRes.candidates?.[0]?.content?.parts?.[0]?.text || '',
      usage: {
        promptTokens: jsonRes.usageMetadata?.promptTokenCount || 0,
        completionTokens: jsonRes.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: jsonRes.usageMetadata?.totalTokenCount || 0
      }
    };
  }
}
