// src/engine/vlab/kernel/PhysicalSystemCompiler.test.ts
import { describe, it, expect } from 'vitest';
import { PhysicalSystemCompiler } from './PhysicalSystemCompiler';
import { PhysicalNetwork } from './types';

describe('PhysicalSystemCompiler', () => {
  const compiler = new PhysicalSystemCompiler();

  it('should compile RLC network into PhysicalSystemIR with states and parameters', () => {
    const network: PhysicalNetwork = {
      id: 'PhysicalNetwork_01',
      domains: ['electrical'],
      componentIds: ['r1', 'l1', 'c1', 'vs', 'gnd'],
      portIds: [],
      nodeIds: ['n1', 'n2', 'n3', 'n_gnd'],
      referenceNodeIds: ['n_gnd'],
      connections: [],
      solverConfigurationId: 'sc1',
      topologyHash: 'rlc_hash'
    };

    const nodes = [
      { id: 'vs', data: { type: 'dc_voltage_source', params: { voltage: 10 } } },
      { id: 'r1', data: { type: 'resistor', params: { resistance: 100 } } },
      { id: 'l1', data: { type: 'inductor', params: { inductance: 0.1 } } },
      { id: 'c1', data: { type: 'capacitor', params: { capacitance: 10e-6 } } },
      { id: 'gnd', data: { type: 'electrical_reference' } }
    ];

    const ir = compiler.compile(network, nodes as any);
    expect(ir.id).toBe('PhysicalNetwork_01');
    expect(ir.states.length).toBe(2); // V_C, I_L
    expect(ir.states.map(s => s.name)).toContain('V_c1');
    expect(ir.states.map(s => s.name)).toContain('I_l1');
    expect(ir.metadata.isDAE).toBe(true);
  });
});
