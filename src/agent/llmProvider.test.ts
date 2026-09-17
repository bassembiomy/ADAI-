import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LlmProvider,
  LlmRequest,
  OllamaLlmProvider,
  LocalLlmConfig,
  isLoopbackUrl
} from './llmProvider';
import {
  intentExtractionPrompt,
  questionGenerationPrompt,
  specificationDraftPrompt,
  proposalExplanationPrompt
} from './promptTemplates';

describe('Local LLM Provider & Security Boundaries', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('verifies that only loopback URLs are allowed', () => {
    expect(isLoopbackUrl('http://127.0.0.1:11434')).toBe(true);
    expect(isLoopbackUrl('http://localhost:11434')).toBe(true);
    expect(isLoopbackUrl('http://127.0.0.1:8080/v1')).toBe(true);
    expect(isLoopbackUrl('http://[::1]:11434')).toBe(true);

    expect(isLoopbackUrl('http://192.168.1.50:11434')).toBe(false);
    expect(isLoopbackUrl('https://api.openai.com/v1')).toBe(false);
    expect(isLoopbackUrl('http://remote-server.org')).toBe(false);
  });

  it('rejects provider initialization with a non-loopback URL', () => {
    const config: LocalLlmConfig = {
      baseUrl: 'https://cloud-api.example.com',
      modelName: 'qwen2.5:7b'
    };
    expect(() => new OllamaLlmProvider(config)).toThrow(
      /Security violation: only local loopback URLs are permitted/
    );
  });

  it('successfully generates structured typed JSON when LLM returns valid JSON', async () => {
    const mockResponse = {
      response: JSON.stringify({
        intent: 'CREATE_MODEL',
        targetSystem: 'air-fryer',
        confidence: 0.95
      })
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse
    });

    const provider = new OllamaLlmProvider({
      baseUrl: 'http://127.0.0.1:11434',
      modelName: 'llama3.1:8b-instruct-q4_K_M',
      timeoutMs: 5000
    });

    interface ExpectedOutput {
      intent: string;
      targetSystem: string;
      confidence: number;
    }

    const schema = {
      type: 'object',
      required: ['intent', 'targetSystem', 'confidence']
    };

    const request: LlmRequest = {
      prompt: 'User says: build an air fryer model',
      systemPrompt: 'You extract intent in JSON format.'
    };

    const result = await provider.generate<ExpectedOutput>(request, schema);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent).toBe('CREATE_MODEL');
      expect(result.data.targetSystem).toBe('air-fryer');
      expect(result.data.confidence).toBe(0.95);
    }
  });

  it('returns a typed failure when LLM returns malformed or non-JSON output', async () => {
    const mockResponse = {
      response: 'I am not returning valid JSON: { broken json ...'
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse
    });

    const provider = new OllamaLlmProvider({
      baseUrl: 'http://127.0.0.1:11434',
      modelName: 'custom-7b'
    });

    const result = await provider.generate<{ ok: boolean }>(
      { prompt: 'test' },
      { type: 'object' }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Failed to parse model output as JSON/);
      expect(result.rawOutput).toContain('I am not returning valid JSON');
    }
  });

  it('returns a typed failure when output does not satisfy the schema', async () => {
    const mockResponse = {
      response: JSON.stringify({
        otherField: 123
      })
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse
    });

    const provider = new OllamaLlmProvider({
      baseUrl: 'http://127.0.0.1:11434',
      modelName: 'custom-7b'
    });

    const result = await provider.generate<{ intent: string }>(
      { prompt: 'test' },
      { type: 'object', required: ['intent'] }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Schema validation failed: missing required property 'intent'/);
    }
  });

  it('strictly validates nested properties, enums, and types', async () => {
    const mockResponse = {
      response: JSON.stringify({
        intent: 'INVALID_ENUM_VALUE',
        targetSystem: 'air-fryer',
        subConfig: {
          sampleRate: 'not-a-number' // schema expects number
        }
      })
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse
    });

    const provider = new OllamaLlmProvider({
      baseUrl: 'http://127.0.0.1:11434',
      modelName: 'custom-7b'
    });

    const schema = {
      type: 'object',
      required: ['intent', 'targetSystem'],
      properties: {
        intent: { type: 'string', enum: ['CREATE_MODEL', 'CLARIFY', 'VALIDATE'] },
        targetSystem: { type: 'string' },
        subConfig: {
          type: 'object',
          properties: {
            sampleRate: { type: 'number', minimum: 1 }
          }
        }
      }
    };

    const result = await provider.generate({ prompt: 'test' }, schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/not in allowed enum/);
    }
  });

  it('rejects generation when no model name is configured', async () => {
    const provider = new OllamaLlmProvider({
      baseUrl: 'http://127.0.0.1:11434',
      modelName: ''
    });

    const result = await provider.generate({ prompt: 'test' }, { type: 'object' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/No Ollama model selected/);
    }
  });

  it('returns a typed failure when connection is refused', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));

    const provider = new OllamaLlmProvider({
      baseUrl: 'http://127.0.0.1:11434',
      modelName: 'custom-7b'
    });

    const result = await provider.generate({ prompt: 'test' }, { type: 'object' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Connection failed/);
    }
  });

  it('returns a typed failure on timeout', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    globalThis.fetch = vi.fn().mockRejectedValue(abortError);

    const provider = new OllamaLlmProvider({
      baseUrl: 'http://127.0.0.1:11434',
      modelName: 'custom-7b',
      timeoutMs: 100
    });

    const result = await provider.generate({ prompt: 'test' }, { type: 'object' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Request timeout/);
    }
  });

  it('checks health accurately when local server is up and responsive', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        models: [{ name: 'llama3.1:8b-instruct-q4_K_M' }]
      })
    });

    const provider = new OllamaLlmProvider({
      baseUrl: 'http://127.0.0.1:11434',
      modelName: 'llama3.1:8b-instruct-q4_K_M'
    });

    const health = await provider.health();
    expect(health.available).toBe(true);
    expect(health.model).toBe('llama3.1:8b-instruct-q4_K_M');
    expect(typeof health.latencyMs).toBe('number');
  });

  it('reports health as unavailable when local server is not running', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const provider = new OllamaLlmProvider({
      baseUrl: 'http://127.0.0.1:11434',
      modelName: 'llama3.1:8b-instruct-q4_K_M'
    });

    const health = await provider.health();
    expect(health.available).toBe(false);
    expect(health.error).toBeDefined();
  });
});

describe('Prompt Templates', () => {
  it('generates prompt templates containing strict JSON schema instructions', () => {
    const intentP = intentExtractionPrompt('I want to model an air fryer');
    expect(intentP.prompt).toContain('I want to model an air fryer');
    expect(intentP.systemPrompt).toContain('JSON');

    const questionP = questionGenerationPrompt('air-fryer', ['missing target temperature']);
    expect(questionP.prompt).toContain('missing target temperature');
    expect(questionP.systemPrompt).toContain('ONE focused question');

    const specP = specificationDraftPrompt('air-fryer', { targetTemp: '200C' }, []);
    expect(specP.prompt).toContain('targetTemp');
    expect(specP.systemPrompt).toContain('JSON');

    const proposalP = proposalExplanationPrompt('PT100', 'RTD sensor for high accuracy');
    expect(proposalP.prompt).toContain('PT100');
    expect(proposalP.systemPrompt).toContain('JSON');
  });
});
