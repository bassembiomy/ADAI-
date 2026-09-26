import { describe, it, expect } from 'vitest';
import { SimulationTools } from './simulationTools';
import { EngineeringModelAdapter } from '../adapters/engineeringModelAdapter';

describe('SimulationTools Capability and Normalization Boundary', () => {
  it('reports capabilities correctly per domain and rejects unsupported domains fail-closed', async () => {
    const sysmlCaps = SimulationTools.getCapabilities('sysml');
    expect(sysmlCaps.supportsSimulation).toBe(false);
    expect(sysmlCaps.supportsCompilation).toBe(false);

    const xbCaps = SimulationTools.getCapabilities('xbridges');
    expect(xbCaps.supportsSimulation).toBe(true);
    expect(xbCaps.supportedSolvers.length).toBeGreaterThan(0);

    const adapter = new EngineeringModelAdapter('sysml');
    const result = await SimulationTools.simulateModel(adapter, { domain: 'sysml' });
    expect(result.isSupported).toBe(false);
    expect(result.status).toBe('UNSUPPORTED');
    expect(result.error).toContain('does not advertise');
    expect(result.diagnostics.some(d => d.code === 'UNSUPPORTED_SIMULATION_DOMAIN')).toBe(true);
  });

  it('separates validation failure from simulation execution', async () => {
    const adapter = new EngineeringModelAdapter('xbridges');
    // An empty or broken model fails validation first
    const result = await SimulationTools.simulateModel(adapter, { domain: 'xbridges' });
    expect(result.isSupported).toBe(true);
    expect(result.validationPassed).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('runs simulation successfully when model is valid', async () => {
    const adapter = new EngineeringModelAdapter('xbridges');
    await adapter.addBlock({
      id: 'dc_src',
      blockDefinitionId: 'Constant',
      domain: 'xbridges',
      name: 'DC Source',
      parameters: [{ blockId: 'dc_src', parameterName: 'value', value: 400 }]
    });
    await adapter.addBlock({
      id: 'inv',
      blockDefinitionId: 'THREE_PHASE_INVERTER',
      domain: 'xbridges',
      name: 'Inverter',
      parameters: [{ blockId: 'inv', parameterName: 'Ron', value: 0.01 }]
    });
    await adapter.connectPorts({ id: 'c_p', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'vdc_p', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_n', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'vdc_n', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_ga', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'ga', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_gb', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'gb', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_gc', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'gc', domain: 'xbridges' });

    const result = await SimulationTools.simulateModel(adapter, { domain: 'xbridges' });
    expect(result.isSupported).toBe(true);
    expect(result.validationPassed).toBe(true);
    expect(result.status).toBe('COMPLETED');
    expect(result.engineRunId).toBeDefined();
    expect(result.signals).toBeDefined();
    expect(result.metrics?.thd).toBeUndefined();
    expect(result.metrics?.vRms).toBeDefined();
  });

  it('fails cleanly without stubbed traces when catalog/schema pass but compile fails', async () => {
    const adapter = new EngineeringModelAdapter('xbridges');
    // FUZZY_SURFACE_VIEWER is a registered catalog block, but lacks mandatory fisConfig parameter
    await adapter.addBlock({
      id: 'fuzz_view',
      blockDefinitionId: 'FUZZY_SURFACE_VIEWER',
      domain: 'xbridges',
      name: 'Fuzzy Viewer',
      parameters: []
    });

    const result = await SimulationTools.simulateModel(adapter, { domain: 'xbridges' });
    expect(result.status).toBe('FAILED');
    // Crucial requirement: A stubbed numerical trace must not satisfy this test
    expect(result.signals).toBeUndefined();
    expect(result.timeVector).toBeUndefined();
    expect(result.diagnostics.some(d => d.category === 'COMPILE' || d.code === 'MISSING_FIS_CONFIG')).toBe(true);
  });

  it('fails cleanly without stubbed traces when simulation solver throws', async () => {
    const adapter = new EngineeringModelAdapter('xbridges');
    await adapter.addBlock({
      id: 'dc_src',
      blockDefinitionId: 'Constant',
      domain: 'xbridges',
      name: 'DC Source',
      parameters: [{ blockId: 'dc_src', parameterName: 'value', value: 400 }]
    });

    const result = await SimulationTools.simulateModel(adapter, {
      domain: 'xbridges',
      customSimulator: async () => {
        throw new Error('Singular Jacobian matrix at t=0.005s');
      }
    });

    expect(result.status).toBe('FAILED');
    expect(result.signals).toBeUndefined();
    expect(result.timeVector).toBeUndefined();
    expect(result.diagnostics.some(d => d.category === 'SIMULATION' && d.code === 'SOLVER_RUNTIME_EXCEPTION')).toBe(true);
    expect(result.error).toContain('Singular Jacobian');
  });

  it('does not invent a run id or harmonic metric for a simulator result without them', async () => {
    const adapter = new EngineeringModelAdapter('xbridges');
    await adapter.addBlock({ id: 'source', blockDefinitionId: 'Constant', domain: 'xbridges', name: 'Source', parameters: [] });
    const result = await SimulationTools.simulateModel(adapter, {
      domain: 'xbridges',
      customSimulator: async () => ({ timeVector: [0, 0.001], signals: { out: [0, 0] }, metrics: {} })
    });
    expect(result.status).toBe('FAILED');
    expect(result.engineRunId).toBeUndefined();
  });

  it('normalizes cancellation and timeouts cleanly', async () => {
    const adapter = new EngineeringModelAdapter('xbridges');
    await adapter.addBlock({
      id: 'dc_src',
      blockDefinitionId: 'Constant',
      domain: 'xbridges',
      name: 'DC Source',
      parameters: []
    });
    await adapter.addBlock({
      id: 'inv',
      blockDefinitionId: 'THREE_PHASE_INVERTER',
      domain: 'xbridges',
      name: 'Inverter',
      parameters: []
    });
    await adapter.connectPorts({ id: 'c_p', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'vdc_p', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_n', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'vdc_n', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_ga', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'ga', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_gb', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'gb', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_gc', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'gc', domain: 'xbridges' });

    // Test early cancellation
    const abortController = new AbortController();
    abortController.abort();
    const cancelRes = await SimulationTools.simulateModel(adapter, {
      domain: 'xbridges',
      abortSignal: abortController.signal
    });
    expect(cancelRes.status).toBe('CANCELLED');

    // Test timeout normalization
    const timeoutRes = await SimulationTools.simulateModel(adapter, {
      domain: 'xbridges',
      timeoutMs: 10,
      customSimulator: () => new Promise(resolve => setTimeout(resolve, 200))
    });
    expect(timeoutRes.status).toBe('TIMEOUT');
    expect(timeoutRes.diagnostics.some(d => d.code === 'SOLVER_TIMEOUT')).toBe(true);
  });
});
