import { describe, expect, it } from 'vitest';
import { Edge, Node } from '@xyflow/react';
import { SparseLinearSolver } from './SparseLinearSolver';
import { blockEquations } from './vlabEquations';
import { VLabPhysicsEngine } from './vlabPhysics';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

/**
 * Fast release gate for the V-Lab numerical core.
 *
 * The checks intentionally use independently calculated values rather than
 * reusing the engine equations as their expected results.
 */
describe('V-Lab validation gate', () => {
  it('has an equation implementation for every library block', () => {
    const missing = VLAB_LIBRARY.flatMap(domain => domain.blocks)
      .filter(block => !blockEquations[block.id])
      .map(block => block.id);

    expect(missing).toEqual([]);
  });

  it('evaluates representative governing equations exactly', () => {
    // Ohm's law: V - I R = 0, with 12 V and 100 ohms.
    expect(blockEquations.resistor({
      across: [12, 0], dAcross: [], branch: [0.12], dBranch: [], state: [], dState: [],
      ctx: {} as any, params: { R: 100 }, ports: ['p', 'n'], nodeId: 'r',
    })).toEqual([0]);

    // Capacitor: I - C dV/dt = 0, with C=2 mF and dV/dt=3 V/s.
    expect(blockEquations.capacitor({
      across: [0, 0], dAcross: [3, 0], branch: [0.006], dBranch: [], state: [], dState: [],
      ctx: {} as any, params: { C: 0.002 }, ports: ['p', 'n'], nodeId: 'c',
    })[0]).toBeCloseTo(0, 12);

    // Fourier conduction: Q = k (Ta - Tb).
    expect(blockEquations.conductive_heat({
      across: [350, 300], dAcross: [], branch: [125], dBranch: [], state: [], dState: [],
      ctx: {} as any, params: { k: 2.5 }, ports: ['a', 'b'], nodeId: 'thermal',
    })).toEqual([0]);

    // Newton's second law: F = m dv/dt + b v.
    expect(blockEquations.mass({
      across: [4], dAcross: [3], branch: [10], dBranch: [], state: [], dState: [],
      ctx: {} as any, params: { m: 2, b: 1 }, ports: ['p'], nodeId: 'mass',
    })).toEqual([0]);
  });

  it('solves a pivoted linear system without mutating its inputs', () => {
    const matrix = [[0, 2], [1, 3]];
    const rhs = [4, 5];
    expect(SparseLinearSolver.solve(matrix, rhs)).toEqual([-1, 2]);
    expect(matrix).toEqual([[0, 2], [1, 3]]);
    expect(rhs).toEqual([4, 5]);
  });

  it('produces the analytical RC response and a finite DAE state', () => {
    const engine = new VLabPhysicsEngine();
    const nodes: Node[] = [
      { id: 'gnd', data: { type: 'ground' } } as any,
      { id: 'src', data: { type: 'dc_voltage', params: { V: 10 } } } as any,
      { id: 'res', data: { type: 'resistor', params: { R: 1000 } } } as any,
      { id: 'cap', data: { type: 'capacitor', params: { C: 1e-3 } } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'res', target: 'cap', sourceHandle: 'n_s', targetHandle: 'p_t' },
      { id: 'e3', source: 'cap', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e4', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
    ];

    let state: any = null;
    for (let step = 0; step < 1000; step++) state = engine.simulateStep(nodes, edges, state, 0.001);

    const system = (engine as any).currentSystem;
    const capNode = system.components.find((component: any) => component.blockId === 'cap').portNodeMap.get('p');
    const capacitorVoltageIndex = system.variableNames.findIndex((name: string) => name.includes(capNode));
    expect(state.x.every(Number.isFinite)).toBe(true);
    // Vc(1 s) = 10 * (1 - exp(-1)) = 6.3212 V; implicit BDF has a small expected discretization error.
    expect(state.x[capacitorVoltageIndex]).toBeCloseTo(6.32, 2);
  });
});
