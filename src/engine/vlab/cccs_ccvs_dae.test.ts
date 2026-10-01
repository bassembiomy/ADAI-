import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';
import { VLabPhysicsEngine } from './vlabPhysics';

describe('CCCS and CCVS DAE Branch and Simulation Validation', () => {
  it('allocates two branch variables for CCCS: output branch (p/n) and control branch (cp/cn)', () => {
    const assembler = new DAEAssembler();
    const nodes: Node[] = [
      {
        id: 'cccs_1',
        type: 'cccs',
        position: { x: 0, y: 0 },
        data: {
          id: 'cccs_1',
          blockId: 'cccs',
          params: { gain: { value: 2 } },
          ports: [
            { id: 'p', pos: 'top' },
            { id: 'n', pos: 'bottom' },
            { id: 'cp', pos: 'left' },
            { id: 'cn', pos: 'left' }
          ]
        }
      }
    ];

    const system = assembler.assemble(nodes, []);
    const cccsBranchVars = system.variableNames.filter(v => v.includes('cccs_1_branch_'));
    
    expect(cccsBranchVars.length).toBe(2);
    expect(cccsBranchVars.some(v => v.includes('current_out') || v.includes('current'))).toBe(true);
    expect(cccsBranchVars.some(v => v.includes('current_ctrl'))).toBe(true);
  });

  it('allocates two branch variables for CCVS: output branch (p/n) and control branch (cp/cn)', () => {
    const assembler = new DAEAssembler();
    const nodes: Node[] = [
      {
        id: 'ccvs_1',
        type: 'ccvs',
        position: { x: 0, y: 0 },
        data: {
          id: 'ccvs_1',
          blockId: 'ccvs',
          params: { gain: { value: 10 } },
          ports: [
            { id: 'p', pos: 'top' },
            { id: 'n', pos: 'bottom' },
            { id: 'cp', pos: 'left' },
            { id: 'cn', pos: 'left' }
          ]
        }
      }
    ];

    const system = assembler.assemble(nodes, []);
    const ccvsBranchVars = system.variableNames.filter(v => v.includes('ccvs_1_branch_'));
    
    expect(ccvsBranchVars.length).toBe(2);
    expect(ccvsBranchVars.some(v => v.includes('current_out') || v.includes('current'))).toBe(true);
    expect(ccvsBranchVars.some(v => v.includes('current_ctrl'))).toBe(true);
  });

  it('simulates CCCS circuit correctly enforcing I_out = gain * I_in', () => {
    // Input loop: dc_voltage (10V) -> R_in (100 Ohm) -> CCCS control port (cp -> cn) -> ground
    // Expected I_in = 10V / 100 Ohm = 0.1 A
    // CCCS gain = 3 -> Expected I_out = 0.3 A
    // Output loop: CCCS output port (p -> n) -> R_load (50 Ohm) -> ground
    // Expected V_load = 0.3 A * 50 Ohm = 15 V
    const nodes: Node[] = [
      { id: 'src', type: 'dc_voltage', position: { x: 0, y: 0 }, data: { blockId: 'dc_voltage', params: { V: { value: 10 } } } },
      { id: 'rin', type: 'resistor', position: { x: 50, y: 0 }, data: { blockId: 'resistor', params: { R: { value: 100 } } } },
      { id: 'cccs_1', type: 'cccs', position: { x: 100, y: 0 }, data: { blockId: 'cccs', params: { gain: { value: 3 } } } },
      { id: 'rload', type: 'resistor', position: { x: 150, y: 0 }, data: { blockId: 'resistor', params: { R: { value: 50 } } } },
      { id: 'gnd', type: 'ground', position: { x: 100, y: 100 }, data: { blockId: 'ground' } },
    ];

    const edges: Edge[] = [
      // Input loop: src(+) -> rin(p), rin(n) -> cccs(cp), cccs(cn) -> gnd, src(-) -> gnd
      { id: 'e1', source: 'src', sourceHandle: 'p', target: 'rin', targetHandle: 'p' },
      { id: 'e2', source: 'rin', sourceHandle: 'n', target: 'cccs_1', targetHandle: 'cp' },
      { id: 'e3', source: 'cccs_1', sourceHandle: 'cn', target: 'gnd', targetHandle: 'p' },
      { id: 'e4', source: 'src', sourceHandle: 'n', target: 'gnd', targetHandle: 'p' },

      // Output loop: cccs(p) -> rload(p), rload(n) -> gnd, cccs(n) -> gnd
      { id: 'e5', source: 'cccs_1', sourceHandle: 'p', target: 'rload', targetHandle: 'p' },
      { id: 'e6', source: 'rload', sourceHandle: 'n', target: 'gnd', targetHandle: 'p' },
      { id: 'e7', source: 'cccs_1', sourceHandle: 'n', target: 'gnd', targetHandle: 'p' },
    ];

    const engine = new VLabPhysicsEngine();
    let simState: any = null;
    const dt = 0.001;
    for (let i = 0; i < 5; i++) {
      simState = engine.simulateStep(nodes, edges, simState, dt);
    }

    expect(simState).toBeDefined();
    expect(simState.x).toBeDefined();

    const system = engine['currentSystem']!;
    const outIdx = system.variableNames.findIndex(v => v.includes('cccs_1_branch_current_out') || v.includes('cccs_1_branch_current'));
    const ctrlIdx = system.variableNames.findIndex(v => v.includes('cccs_1_branch_current_ctrl'));

    expect(ctrlIdx).not.toBe(-1);
    expect(outIdx).not.toBe(-1);
    expect(simState.x[ctrlIdx]).toBeCloseTo(0.1, 2);
    expect(simState.x[outIdx]).toBeCloseTo(0.3, 2);
  });

  it('simulates CCVS circuit correctly enforcing V_out = gain * I_in', () => {
    // Input loop: dc_voltage (12V) -> R_in (60 Ohm) -> CCVS control port (cp -> cn) -> ground
    // Expected I_in = 12V / 60 Ohm = 0.2 A
    // CCVS gain (transresistance) = 25 Ohm -> Expected V_out = 25 * 0.2 = 5 V
    // Output loop: CCVS output port (p -> n) -> R_load (10 Ohm) -> ground
    // Expected I_load = 5 V / 10 Ohm = 0.5 A
    const nodes: Node[] = [
      { id: 'src', type: 'dc_voltage', position: { x: 0, y: 0 }, data: { blockId: 'dc_voltage', params: { V: { value: 12 } } } },
      { id: 'rin', type: 'resistor', position: { x: 50, y: 0 }, data: { blockId: 'resistor', params: { R: { value: 60 } } } },
      { id: 'ccvs_1', type: 'ccvs', position: { x: 100, y: 0 }, data: { blockId: 'ccvs', params: { gain: { value: 25 } } } },
      { id: 'rload', type: 'resistor', position: { x: 150, y: 0 }, data: { blockId: 'resistor', params: { R: { value: 10 } } } },
      { id: 'gnd', type: 'ground', position: { x: 100, y: 100 }, data: { blockId: 'ground' } },
    ];

    const edges: Edge[] = [
      // Input loop: src(+) -> rin(p), rin(n) -> ccvs(cp), ccvs(cn) -> gnd, src(-) -> gnd
      { id: 'e1', source: 'src', sourceHandle: 'p', target: 'rin', targetHandle: 'p' },
      { id: 'e2', source: 'rin', sourceHandle: 'n', target: 'ccvs_1', targetHandle: 'cp' },
      { id: 'e3', source: 'ccvs_1', sourceHandle: 'cn', target: 'gnd', targetHandle: 'p' },
      { id: 'e4', source: 'src', sourceHandle: 'n', target: 'gnd', targetHandle: 'p' },

      // Output loop: ccvs(p) -> rload(p), rload(n) -> gnd, ccvs(n) -> gnd
      { id: 'e5', source: 'ccvs_1', sourceHandle: 'p', target: 'rload', targetHandle: 'p' },
      { id: 'e6', source: 'rload', sourceHandle: 'n', target: 'gnd', targetHandle: 'p' },
      { id: 'e7', source: 'ccvs_1', sourceHandle: 'n', target: 'gnd', targetHandle: 'p' },
    ];

    const engine = new VLabPhysicsEngine();
    let simState: any = null;
    const dt = 0.001;
    for (let i = 0; i < 5; i++) {
      simState = engine.simulateStep(nodes, edges, simState, dt);
    }

    expect(simState).toBeDefined();
    expect(simState.x).toBeDefined();

    const system = engine['currentSystem']!;
    const outIdx = system.variableNames.findIndex(v => v.includes('ccvs_1_branch_current_out') || v.includes('ccvs_1_branch_current'));
    const ctrlIdx = system.variableNames.findIndex(v => v.includes('ccvs_1_branch_current_ctrl'));

    expect(ctrlIdx).not.toBe(-1);
    expect(outIdx).not.toBe(-1);
    expect(simState.x[ctrlIdx]).toBeCloseTo(0.2, 2);
    // In DAE formulation for voltage sources, branch[0] is defined flowing p -> n, so current delivered to load is -0.5A
    expect(Math.abs(simState.x[outIdx])).toBeCloseTo(0.5, 2);
  });
});
