import { describe, it, expect } from 'vitest';
import { RequestCollaborator } from './requestCollaborator';
import { LlmProvider } from '../llmProvider';

class MockLlm implements LlmProvider {
  async generate<T>(): Promise<any> {
    return { success: false, error: 'Offline mock' };
  }
  async health() {
    return { available: true, model: 'mock', latencyMs: 0 };
  }
}

describe('RequestCollaborator Domain Boundary Guard', () => {
  it('intercepts physical circuit requests and explains V-Lab boundary while offering X-Bridges transfer function', async () => {
    const collaborator = new RequestCollaborator(new MockLlm());
    const classified = await collaborator.classifyRequest('create rlc circuit');

    expect(classified.isSupported).toBe(true);
    expect(classified.targetSystem).toBe('xbridges_second_order_dynamic');
    expect(classified.domainGuidance).toBeDefined();
    expect(classified.domainGuidance).toContain('V-Lab');
    expect(classified.domainGuidance).toContain('transfer function');
  });

  it('handles series RLC / resonant queries with physical component mentions', async () => {
    const collaborator = new RequestCollaborator(new MockLlm());
    const classified = await collaborator.classifyRequest('simulate series rlc circuit with resistor and capacitor');

    expect(classified.isSupported).toBe(true);
    expect(classified.targetSystem).toBe('xbridges_second_order_dynamic');
    expect(classified.domainGuidance).toContain('V-Lab');
  });

  it('gracefully rejects non-engineering requests with clear capability explanation', async () => {
    const collaborator = new RequestCollaborator(new MockLlm());
    const classified = await collaborator.classifyRequest('write me a poem about summer');

    expect(classified.isSupported).toBe(false);
    expect(classified.unsupportedReason).toContain('engineering');
    expect(classified.unsupportedReason).toContain('X-Bridges');
  });

  it('explains boundary for 3D FEA / CFD modeling', async () => {
    const collaborator = new RequestCollaborator(new MockLlm());
    const classified = await collaborator.classifyRequest('simulate 3d aerodynamic airflow over wing with cfd');

    expect(classified.isSupported).toBe(false);
    expect(classified.unsupportedReason).toContain('1D lumped-parameter');
    expect(classified.unsupportedReason).toContain('CFD');
  });

  it('preserves existing supported templates like three phase inverter and air fryer', async () => {
    const collaborator = new RequestCollaborator(new MockLlm());
    const inv = await collaborator.classifyRequest('create three phase inverter');
    expect(inv.isSupported).toBe(true);
    expect(inv.targetSystem).toBe('three_phase_inverter');

    const fryer = await collaborator.classifyRequest('design air fryer temperature control');
    expect(fryer.isSupported).toBe(true);
    expect(fryer.targetSystem).toBe('air-fryer');
  });
});
