import { describe, it, expect } from 'vitest';
import { ModelValidator } from './modelValidation';
import { EngineeringModelAdapter } from '../adapters/engineeringModelAdapter';

describe('ModelValidator Post-Build Diagnostics Aggregator', () => {
  it('passes on an inverter circuit with source, modulator, and connected DC rails', async () => {
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

    // Connect DC rails and gates
    await adapter.connectPorts({ id: 'c_p', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'vdc_p', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_n', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'vdc_n', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_ga', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'ga', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_gb', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'gb', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_gc', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'gc', domain: 'xbridges' });

    const result = ModelValidator.validate(adapter);
    expect(result.passed).toBe(true);
    expect(result.summary.errorCount).toBe(0);
  });

  it('fails with categorized errors on missing source, floating critical ports, and negative resistance', async () => {
    const adapter = new EngineeringModelAdapter('xbridges');

    // Inverter with negative resistance and NO source connected
    await adapter.addBlock({
      id: 'inv',
      blockDefinitionId: 'THREE_PHASE_INVERTER',
      domain: 'xbridges',
      name: 'Inverter',
      parameters: [{ blockId: 'inv', parameterName: 'Ron', value: -5 }]
    });

    const result = ModelValidator.validate(adapter);
    expect(result.passed).toBe(false);
    expect(result.summary.errorCount).toBeGreaterThan(0);

    // Should detect negative parameter
    expect(result.diagnostics.some(d => d.code === 'NEGATIVE_PHYSICAL_PARAMETER')).toBe(true);
    // Should detect missing power source
    expect(result.diagnostics.some(d => d.code === 'MISSING_POWER_SOURCE')).toBe(true);
    // Should detect floating ports
    expect(result.diagnostics.some(d => d.code === 'FLOATING_CRITICAL_PORT')).toBe(true);
  });

  it('aggregates compiler and simulation solver failures into diagnostics', () => {
    const adapter = new EngineeringModelAdapter('xbridges');

    const result = ModelValidator.validate(adapter, {
      compileResult: { success: false, errors: ['Syntax error in generated ODE block'] },
      simulationResult: { success: false, errors: ['Solver step size underflow at t=0.002s'] }
    });

    expect(result.passed).toBe(false);
    expect(result.summary.categories.COMPILE).toBe(1);
    expect(result.summary.categories.SIMULATION).toBe(1);
  });
});
