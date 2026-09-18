import { Diagnostic } from '../contracts/diagnostics';

export interface ProviderCapabilities {
  readonly maxContextTokens: number;
  readonly supportsGrammarConstraint: boolean;
  readonly supportsNativeToolCalling: boolean;
  readonly isLocalOffline: boolean;
  readonly streamingSupport: boolean;
}

export interface StructuredGenerationRequest {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
}

export interface RawGenerationResult {
  readonly rawText: string;
  readonly usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  readonly isTruncated?: boolean;
}

export interface StructuredGenerationResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly rawText: string;
  readonly usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  readonly diagnostics: Diagnostic[];
  readonly isTruncated: boolean;
  readonly durationMs: number;
}

export interface ProviderHealthStatus {
  readonly isHealthy: boolean;
  readonly availableModels: readonly string[];
  readonly latencyMs?: number;
  readonly error?: string;
  readonly diagnosticCode?:
    | 'OLLAMA_UNAVAILABLE'
    | 'MODEL_NOT_FOUND'
    | 'TIMEOUT'
    | 'MALFORMED_RESPONSE'
    | 'CONFIGURATION_ERROR';
}

export interface ValidatedProviderSettings {
  readonly provider: string;
  readonly baseUrl: string;
  readonly modelId?: string;
  readonly temperature?: number;
  readonly contextTokens?: number;
  readonly timeoutMs?: number;
}

export interface ILLMProvider {
  readonly providerId: string;
  readonly modelId?: string;
  readonly capabilities: ProviderCapabilities;

  generateRaw(request: StructuredGenerationRequest, signal?: AbortSignal): Promise<RawGenerationResult>;
  healthCheck(signal?: AbortSignal): Promise<ProviderHealthStatus>;
}

