// src/engine/vlab/kernel/PhysicalNetworkExtractor.test.ts
import { describe, it, expect } from 'vitest';
import { PhysicalNetworkExtractor, normalizeSolverConfiguration } from './PhysicalNetworkExtractor';

describe('PhysicalNetworkExtractor', () => {
  const extractor = new PhysicalNetworkExtractor();

  it('should extract single connected electrical network and associate solver_config', () => {
    const nodes = [
      { id: 'v_src', type: 'vlab_block', data: { type: 'dc_voltage_source', label: 'Vs' } },
      { id: 'r1', type: 'vlab_block', data: { type: 'resistor', label: 'R1' } },
      { id: 'gnd', type: 'vlab_block', data: { type: 'electrical_reference', label: 'Gnd' } },
      { id: 'sc', type: 'vlab_block', data: { type: 'solver_config', label: 'SolverConfig' } }
    ];
    const edges = [
      { id: 'e1', source: 'v_src', sourceHandle: 'p', target: 'r1', targetHandle: 'p' },
      { id: 'e2', source: 'r1', sourceHandle: 'n', target: 'gnd', targetHandle: 'p' },
      { id: 'e3', source: 'gnd', sourceHandle: 'p', target: 'v_src', targetHandle: 'n' }
    ];

    const { networks, diagnostics } = extractor.extract(nodes as any, edges as any);
    expect(networks.length).toBe(1);
    expect(networks[0].componentIds).toContain('r1');
    expect(networks[0].solverConfigurationId).toBe('sc');
    expect(diagnostics.filter(d => d.severity === 'ERROR').length).toBe(0);
  });

  it('should emit VL-REF-001 when electrical reference is missing', () => {
    const nodes = [
      { id: 'v_src', type: 'vlab_block', data: { type: 'dc_voltage_source' } },
      { id: 'r1', type: 'vlab_block', data: { type: 'resistor' } },
      { id: 'sc', type: 'vlab_block', data: { type: 'solver_config' } }
    ];
    const edges = [
      { id: 'e1', source: 'v_src', sourceHandle: 'p', target: 'r1', targetHandle: 'p' }
    ];

    const { diagnostics } = extractor.extract(nodes as any, edges as any);
    expect(diagnostics.some(d => d.id === 'VL-REF-001')).toBe(true);
  });

  it('should emit VL-SOLVER-001 when solver_config is missing', () => {
    const nodes = [
      { id: 'r1', type: 'vlab_block', data: { type: 'resistor' } },
      { id: 'gnd', type: 'vlab_block', data: { type: 'electrical_reference' } }
    ];
    const edges = [
      { id: 'e1', source: 'r1', sourceHandle: 'p', target: 'gnd', targetHandle: 'p' }
    ];

    const { diagnostics } = extractor.extract(nodes as any, edges as any);
    expect(diagnostics.some(d => d.id === 'VL-SOLVER-001')).toBe(true);
  });

  it('maps solver_config node parameters into a typed SolverConfiguration', () => {
    const config = normalizeSolverConfiguration({
      id: 'sc_custom',
      data: {
        type: 'solver_config',
        params: {
          solver: { value: 'bdf' },
          startTime: { value: 2 },
          stopTime: { value: '12.5' },
          initialStep: { value: 0.02 },
          minimumStep: { value: 1e-5 },
          maximumStep: { value: 0.2 },
          relativeTolerance: { value: 2e-4 },
          absoluteTolerance: { value: 3e-7 },
          nonlinearTolerance: { value: 4e-9 },
          maximumIterations: { value: '75' },
          enableDiagnostics: { value: 'off' },
          enableLogging: { value: 'on' }
        }
      }
    } as any);

    expect(config).toEqual({
      id: 'sc_custom',
      solver: 'bdf',
      startTime: 2,
      stopTime: 12.5,
      initialStep: 0.02,
      minimumStep: 1e-5,
      maximumStep: 0.2,
      relativeTolerance: 2e-4,
      absoluteTolerance: 3e-7,
      maximumIterations: 75,
      nonlinearTolerance: 4e-9,
      enableDiagnostics: false,
      enableLogging: true
    });
  });

  it('normalizes invalid solver_config values to explicit safe defaults', () => {
    const config = normalizeSolverConfiguration({
      id: 'sc_invalid',
      data: {
        type: 'solver_config',
        params: {
          solver: { value: 'not-a-solver' },
          startTime: { value: Number.NaN },
          stopTime: { value: Number.POSITIVE_INFINITY },
          initialStep: { value: -1 },
          minimumStep: { value: 'nope' },
          maximumStep: { value: 0 },
          relativeTolerance: { value: Number.NaN },
          absoluteTolerance: { value: -1 },
          nonlinearTolerance: { value: Number.POSITIVE_INFINITY },
          maximumIterations: { value: 0 },
          enableDiagnostics: { value: 'maybe' },
          enableLogging: { value: null }
        }
      }
    } as any);

    expect(config).toEqual({
      id: 'sc_invalid',
      solver: 'auto',
      startTime: 0,
      stopTime: 10,
      initialStep: 'auto',
      minimumStep: 1e-6,
      maximumStep: 'auto',
      relativeTolerance: 1e-3,
      absoluteTolerance: 1e-6,
      maximumIterations: 50,
      nonlinearTolerance: 1e-8,
      enableDiagnostics: true,
      enableLogging: true
    });
  });
});
