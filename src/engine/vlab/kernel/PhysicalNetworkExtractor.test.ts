// src/engine/vlab/kernel/PhysicalNetworkExtractor.test.ts
import { describe, it, expect } from 'vitest';
import { PhysicalNetworkExtractor } from './PhysicalNetworkExtractor';

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
});
