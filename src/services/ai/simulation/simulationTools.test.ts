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
    expect(result.signals).toBeDefined();
    expect(result.metrics?.thd).toBeDefined();
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
