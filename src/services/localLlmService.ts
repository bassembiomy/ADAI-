import {
  LlmProvider,
  OllamaLlmProvider,
  LocalLlmConfig,
  isLoopbackUrl
} from '../agent/llmProvider';

const OLLAMA_URL_STORAGE_KEY = 'adia_ollama_base_url';
const OLLAMA_MODEL_STORAGE_KEY = 'adia_ollama_selected_model';

function getStoredSetting(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Ignore storage access errors
  }
  return null;
}

function setStoredSetting(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage access errors
  }
}

export interface LocalLlmStatus {
  available: boolean;
  models: string[];
  currentModel: string;
  isModelSelected?: boolean;
  latencyMs?: number;
  error?: string;
}

export class LocalLlmService {
  private config: LocalLlmConfig;
  private provider: LlmProvider;

  constructor(config?: Partial<LocalLlmConfig>) {
    const savedUrl = getStoredSetting(OLLAMA_URL_STORAGE_KEY);
    const savedModel = getStoredSetting(OLLAMA_MODEL_STORAGE_KEY);

    const initialConfig: LocalLlmConfig = {
      baseUrl: config?.baseUrl ?? savedUrl ?? 'http://127.0.0.1:11434',
      modelName: config?.modelName ?? savedModel ?? '',
      timeoutMs: config?.timeoutMs ?? 30000
    };

    if (!isLoopbackUrl(initialConfig.baseUrl)) {
      throw new Error(
        `Security violation: only local loopback URLs are permitted (received: ${initialConfig.baseUrl})`
      );
    }

    this.config = initialConfig;
    this.provider = new OllamaLlmProvider(this.config);
  }

  public getConfig(): Readonly<LocalLlmConfig> {
    return { ...this.config };
  }

  public setSelectedModel(modelName: string): void {
    setStoredSetting(OLLAMA_MODEL_STORAGE_KEY, modelName);
    this.updateConfig({ modelName });
  }

  public setBaseUrl(baseUrl: string): void {
    if (!isLoopbackUrl(baseUrl)) {
      throw new Error(
        `Security violation: only local loopback URLs are permitted (received: ${baseUrl})`
      );
    }
    setStoredSetting(OLLAMA_URL_STORAGE_KEY, baseUrl);
    this.updateConfig({ baseUrl });
  }

  public updateConfig(newConfig: Partial<LocalLlmConfig>): void {
    const candidateBaseUrl = newConfig.baseUrl ?? this.config.baseUrl;
    if (!isLoopbackUrl(candidateBaseUrl)) {
      throw new Error(
        `Security violation: only local loopback URLs are permitted (received: ${candidateBaseUrl})`
      );
    }

    this.config = {
      ...this.config,
      ...newConfig,
      baseUrl: candidateBaseUrl
    };
    this.provider = new OllamaLlmProvider(this.config);
  }

  public getProvider(): LlmProvider {
    return this.provider;
  }

  public async testConnection(): Promise<LocalLlmStatus> {
    return this.checkStatus();
  }

  public async checkStatus(): Promise<LocalLlmStatus> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const start = Date.now();

    try {
      const res = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      });

      if (!res.ok) {
        return {
          available: false,
          models: [],
          currentModel: this.config.modelName,
          isModelSelected: false,
          error: `HTTP ${res.status}: ${res.statusText}`
        };
      }

      const data = await res.json();
      const latencyMs = Date.now() - start;
      const models = Array.isArray(data.models)
        ? data.models.map((m: { name?: string }) => m.name || '')
        : [];

      const isModelSelected = Boolean(
        this.config.modelName && models.includes(this.config.modelName)
      );

      return {
        available: true,
        models,
        currentModel: this.config.modelName,
        isModelSelected,
        latencyMs
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        available: false,
        models: [],
        currentModel: this.config.modelName,
        isModelSelected: false,
        error: `Local LLM unreachable at ${this.config.baseUrl}: ${msg}`
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const localLlmService = new LocalLlmService();
