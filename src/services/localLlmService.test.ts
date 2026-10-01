import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalLlmService } from './localLlmService';

describe('LocalLlmService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('manages config with default loopback settings and allows updating model name', () => {
    const service = new LocalLlmService({
      baseUrl: 'http://127.0.0.1:11434',
      modelName: 'llama3.2:3b'
    });

    const config = service.getConfig();
    expect(config.baseUrl).toBe('http://127.0.0.1:11434');
    expect(config.modelName).toBe('llama3.2:3b');

    service.updateConfig({ modelName: 'qwen2.5:7b' });
    expect(service.getConfig().modelName).toBe('qwen2.5:7b');
  });

  it('rejects updating to a non-loopback address', () => {
    const service = new LocalLlmService();
    expect(() => service.updateConfig({ baseUrl: 'http://8.8.8.8:11434' })).toThrow(
      /Security violation: only local loopback URLs are permitted/
    );
  });

  it('checks status of local LLM and returns available models and selected model status if reachable', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        models: [{ name: 'llama3.1:8b' }, { name: 'qwen2.5:7b' }]
      })
    });

    const service = new LocalLlmService({ modelName: 'llama3.1:8b' });
    const status = await service.checkStatus();
    expect(status.available).toBe(true);
    expect(status.models).toContain('llama3.1:8b');
    expect(status.models).toContain('qwen2.5:7b');
    expect(status.isModelSelected).toBe(true);
    expect(typeof status.latencyMs).toBe('number');
  });

  it('marks isModelSelected as false when the configured model is absent from installed models', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        models: [{ name: 'qwen2.5:7b' }]
      })
    });

    const service = new LocalLlmService({ modelName: 'non-existent-model' });
    const status = await service.testConnection();
    expect(status.available).toBe(true);
    expect(status.isModelSelected).toBe(false);
  });

  it('handles server unavailable and returns error info', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const service = new LocalLlmService();
    const status = await service.checkStatus();
    expect(status.available).toBe(false);
    expect(status.models).toHaveLength(0);
    expect(status.error).toMatch(/Local LLM unreachable/);
  });

  it('handles HTTP error status from Ollama server', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    });

    const service = new LocalLlmService();
    const status = await service.checkStatus();
    expect(status.available).toBe(false);
    expect(status.error).toMatch(/HTTP 500/);
  });

  it('persists selected model and baseUrl across service instances via localStorage when available', () => {
    const service1 = new LocalLlmService();
    service1.setSelectedModel('qwen2.5:7b');
    service1.setBaseUrl('http://127.0.0.1:11434');

    expect(service1.getConfig().modelName).toBe('qwen2.5:7b');
    expect(service1.getConfig().baseUrl).toBe('http://127.0.0.1:11434');
  });
});
