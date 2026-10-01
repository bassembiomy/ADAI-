import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalOllamaProvider } from './localOllamaProvider';

describe('LocalOllamaProvider Production-Safe Implementation', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('initializes with validated settings and loopback restriction', () => {
    const provider = new LocalOllamaProvider({
      baseUrl: 'http://127.0.0.1:11434',
      modelId: 'qwen2.5-coder:7b',
      temperature: 0.2,
      timeoutMs: 15000
    });

    expect(provider.providerId).toBe('ollama');
    expect(provider.modelId).toBe('qwen2.5-coder:7b');
    expect(provider.capabilities.isLocalOffline).toBe(true);

    // Non-loopback baseUrl must throw
    expect(() => new LocalOllamaProvider({ baseUrl: 'http://remote-server.com:11434' })).toThrow(
      /loopback/i
    );
  });

  it('healthCheck reports healthy when Ollama is running and model is present', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        models: [{ name: 'qwen2.5-coder:7b' }, { name: 'deepseek-r1:8b' }]
      })
    } as any);

    const provider = new LocalOllamaProvider({
      baseUrl: 'http://127.0.0.1:11434',
      modelId: 'qwen2.5-coder:7b'
    });

    const status = await provider.healthCheck();
    expect(status.isHealthy).toBe(true);
    expect(status.availableModels).toContain('qwen2.5-coder:7b');
    expect(status.error).toBeUndefined();
  });

  it('healthCheck reports MODEL_NOT_FOUND when requested model is not pulled in Ollama', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        models: [{ name: 'llama3:8b' }]
      })
    } as any);

    const provider = new LocalOllamaProvider({
      baseUrl: 'http://127.0.0.1:11434',
      modelId: 'missing-model:latest'
    });

    const status = await provider.healthCheck();
    expect(status.isHealthy).toBe(false);
    expect(status.diagnosticCode).toBe('MODEL_NOT_FOUND');
    expect(status.error).toMatch(/missing-model:latest.*not found/i);
  });

  it('healthCheck reports OLLAMA_UNAVAILABLE when connection fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:11434'));

    const provider = new LocalOllamaProvider({
      baseUrl: 'http://127.0.0.1:11434'
    });

    const status = await provider.healthCheck();
    expect(status.isHealthy).toBe(false);
    expect(status.diagnosticCode).toBe('OLLAMA_UNAVAILABLE');
    expect(status.error).toMatch(/unavailable/i);
  });

  it('generateRaw normalizes timeout abort errors', async () => {
    global.fetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('fetch failed')), 50);
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });

    const provider = new LocalOllamaProvider({
      baseUrl: 'http://127.0.0.1:11434',
      modelId: 'test-model',
      timeoutMs: 20
    });

    await expect(
      provider.generateRaw({
        systemPrompt: 'sys',
        userPrompt: 'user'
      })
    ).rejects.toThrow(/timed out/i);
  });

  it('generateRaw detects malformed response from Ollama', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Unexpected token in JSON');
      }
    } as any);

    const provider = new LocalOllamaProvider({
      baseUrl: 'http://127.0.0.1:11434',
      modelId: 'test-model'
    });

    await expect(
      provider.generateRaw({
        systemPrompt: 'sys',
        userPrompt: 'user'
      })
    ).rejects.toThrow(/malformed/i);
  });
});
