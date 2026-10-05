import {
  ILLMProvider,
  ProviderCapabilities,
  StructuredGenerationRequest,
  RawGenerationResult,
  ProviderHealthStatus,
  ValidatedProviderSettings
} from './providerInterface';

export interface LocalOllamaConfig {
  baseUrl?: string;
  modelId?: string;
  temperature?: number;
  timeoutMs?: number;
  contextTokens?: number;
}

function isStrictLoopback(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

export class LocalOllamaProvider implements ILLMProvider {
  public readonly providerId = 'ollama';
  public readonly modelId?: string;
  public readonly baseUrl: string;
  public readonly defaultTemperature: number;
  public readonly defaultTimeoutMs: number;
  public readonly capabilities: ProviderCapabilities;

  constructor(config: LocalOllamaConfig = {}) {
    this.baseUrl = config.baseUrl || 'http://127.0.0.1:11434';
    if (!isStrictLoopback(this.baseUrl)) {
      throw new Error(
        `Security violation: only local loopback URLs (127.0.0.1, localhost, ::1) are permitted for Ollama provider (received: ${this.baseUrl})`
      );
    }

    this.modelId = config.modelId?.trim() || undefined;
    this.defaultTemperature = config.temperature ?? 0.1;
    this.defaultTimeoutMs = config.timeoutMs ?? 30000;

    this.capabilities = {
      maxContextTokens: config.contextTokens ?? 32768,
      supportsGrammarConstraint: true,
      supportsNativeToolCalling: false,
      isLocalOffline: true,
      streamingSupport: true
    };
  }

  public getSettings(): ValidatedProviderSettings {
    return {
      provider: this.providerId,
      baseUrl: this.baseUrl,
      modelId: this.modelId,
      temperature: this.defaultTemperature,
      contextTokens: this.capabilities.maxContextTokens,
      timeoutMs: this.defaultTimeoutMs
    };
  }

  public async healthCheck(signal?: AbortSignal): Promise<ProviderHealthStatus> {
    const startTime = Date.now();
    try {
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), 5000);

      const mergedSignal = signal
        ? this.combineSignals(signal, timeoutController.signal)
        : timeoutController.signal;

      const res = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: mergedSignal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return {
          isHealthy: false,
          availableModels: [],
          error: `Ollama returned HTTP status ${res.status}`,
          diagnosticCode: 'OLLAMA_UNAVAILABLE'
        };
      }

      const data = await res.json();
      const models: string[] = Array.isArray(data.models)
        ? data.models.map((m: any) => m.name || m.model || String(m))
        : [];

      const latencyMs = Date.now() - startTime;

      if (this.modelId) {
        const found = models.some(
          m =>
            m.toLowerCase() === this.modelId!.toLowerCase() ||
            m.toLowerCase().startsWith(this.modelId!.toLowerCase())
        );
        if (!found) {
          return {
            isHealthy: false,
            availableModels: models,
            latencyMs,
            error: `Model '${this.modelId}' was not found in local Ollama instance. Available: [${models.join(', ')}]. Run 'ollama pull ${this.modelId}'.`,
            diagnosticCode: 'MODEL_NOT_FOUND'
          };
        }
      }

      return {
        isHealthy: true,
        availableModels: models,
        latencyMs
      };
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      return {
        isHealthy: false,
        availableModels: [],
        error: isTimeout
          ? 'Health check timed out connecting to local Ollama.'
          : `Ollama is unavailable or not running on localhost: ${err?.message || String(err)}`,
        diagnosticCode: isTimeout ? 'TIMEOUT' : 'OLLAMA_UNAVAILABLE'
      };
    }
  }

  public async generateRaw(
    request: StructuredGenerationRequest,
    signal?: AbortSignal
  ): Promise<RawGenerationResult> {
    const modelToUse = this.modelId;
    if (!modelToUse) {
      throw new Error(
        'Cannot generate raw response: No modelId was configured for LocalOllamaProvider.'
      );
    }

    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const timeoutController = new AbortController();
    let didTimeout = false;

    const timeoutId = setTimeout(() => {
      didTimeout = true;
      timeoutController.abort();
    }, timeoutMs);

    const mergedSignal = signal
      ? this.combineSignals(signal, timeoutController.signal)
      : timeoutController.signal;

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelToUse,
          system: request.systemPrompt,
          prompt: request.userPrompt,
          format: 'json',
          stream: false,
          options: {
            temperature: request.temperature ?? this.defaultTemperature,
            num_ctx: request.maxOutputTokens ?? this.capabilities.maxContextTokens
          }
        }),
        signal: mergedSignal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Model not found: '${modelToUse}' (HTTP 404)`);
        }
        throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
      }

      let res: any;
      try {
        res = await response.json();
      } catch (jsonErr: any) {
        throw new Error(`Malformed response from Ollama: ${jsonErr.message}`);
      }

      return {
        rawText: res.response || '',
        usage: {
          promptTokens: res.prompt_eval_count || 0,
          completionTokens: res.eval_count || 0,
          totalTokens: (res.prompt_eval_count || 0) + (res.eval_count || 0)
        }
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (didTimeout || (err?.name === 'AbortError' && didTimeout)) {
        throw new Error(`Request timed out after ${timeoutMs} ms`);
      }
      throw err;
    }
  }

  private combineSignals(s1: AbortSignal, s2: AbortSignal): AbortSignal {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (s1.aborted || s2.aborted) {
      controller.abort();
      return controller.signal;
    }
    s1.addEventListener('abort', onAbort, { once: true });
    s2.addEventListener('abort', onAbort, { once: true });
    return controller.signal;
  }
}
