import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { StructuredGenerationCoordinator } from './structuredGenerationCoordinator';
import { ProviderFactory } from './providerFactory';

describe('StructuredGenerationCoordinator with Shared Repair Loop', () => {
  const targetSchema = z.object({
    nominalVoltage: z.number().min(363),
    unit: z.literal('V')
  }).strict();

  it('should automatically repair invalid output by passing previous raw JSON and Zod errors', async () => {
    const mockProvider = {
      providerId: 'mock',
      modelId: 'test-model',
      capabilities: { maxContextTokens: 4096, supportsGrammarConstraint: false, supportsNativeToolCalling: false, isLocalOffline: true, streamingSupport: false },
      generateRaw: vi.fn()
        .mockResolvedValueOnce({ rawText: JSON.stringify({ nominalVoltage: 300, unit: 'V' }) }) // Fails min 363
        .mockResolvedValueOnce({ rawText: JSON.stringify({ nominalVoltage: 380, unit: 'V' }) }) // Repaired
    };

    const coordinator = new StructuredGenerationCoordinator(mockProvider as any);
    const result = await coordinator.generateAndRepair({
      systemPrompt: 'System',
      userPrompt: 'Design DC bus'
    }, targetSchema);

    expect(result.success).toBe(true);
    expect(result.data?.nominalVoltage).toBe(380);
    expect(mockProvider.generateRaw).toHaveBeenCalledTimes(2);

    const secondCallPrompt = mockProvider.generateRaw.mock.calls[1][0].userPrompt;
    expect(secondCallPrompt).toContain('nominalVoltage:');
    expect(secondCallPrompt).toContain('363');
    expect(secondCallPrompt).toContain('"nominalVoltage":300');
  });

  it('should enforce exact loopback hostnames for local providers', () => {
    expect(() => ProviderFactory.createProvider({
      type: 'ollama',
      baseUrl: 'https://attacker-loopback.example.com',
      modelId: 'm1'
    })).toThrowError(/Local provider must use exact loopback/);
  });

  it('should fail closed with PROVIDER_TIMEOUT when the LLM times out', async () => {
    const mockProvider = {
      providerId: 'mock',
      modelId: 'test-model',
      capabilities: { maxContextTokens: 4096, supportsGrammarConstraint: false, supportsNativeToolCalling: false, isLocalOffline: true, streamingSupport: false },
      generateRaw: vi.fn().mockImplementation(() => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      })
    };

    const coordinator = new StructuredGenerationCoordinator(mockProvider as any);
    const result = await coordinator.generateAndRepair({
      systemPrompt: 'System',
      userPrompt: 'Design DC bus',
      timeoutMs: 100
    }, targetSchema);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PROVIDER_TIMEOUT' })
      ])
    );
  });

  it('should fail closed with MALFORMED_JSON when the LLM returns non-JSON repeatedly', async () => {
    const mockProvider = {
      providerId: 'mock',
      modelId: 'test-model',
      capabilities: { maxContextTokens: 4096, supportsGrammarConstraint: false, supportsNativeToolCalling: false, isLocalOffline: true, streamingSupport: false },
      generateRaw: vi.fn().mockResolvedValue({ rawText: 'This is not JSON at all' })
    };

    const coordinator = new StructuredGenerationCoordinator(mockProvider as any);
    const result = await coordinator.generateAndRepair({
      systemPrompt: 'System',
      userPrompt: 'Design DC bus'
    }, targetSchema);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MALFORMED_JSON' })
      ])
    );
  });

  it('should fail closed with PROVIDER_OFFLINE when network or local LLM connection is refused', async () => {
    const mockProvider = {
      providerId: 'mock',
      modelId: 'test-model',
      capabilities: { maxContextTokens: 4096, supportsGrammarConstraint: false, supportsNativeToolCalling: false, isLocalOffline: true, streamingSupport: false },
      generateRaw: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434'))
    };

    const coordinator = new StructuredGenerationCoordinator(mockProvider as any);
    const result = await coordinator.generateAndRepair({
      systemPrompt: 'System',
      userPrompt: 'Design DC bus'
    }, targetSchema);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PROVIDER_OFFLINE' })
      ])
    );
  });
});
