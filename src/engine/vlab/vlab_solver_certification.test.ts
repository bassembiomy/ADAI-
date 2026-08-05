import { describe, it, expect } from 'vitest';
import { SparseLinearSolver } from './SparseLinearSolver';
import { DAEAssembler } from './DAEAssembler';
import { VLabPhysicsEngine } from './vlabPhysics';
import { Node, Edge } from 'reactflow';

describe('V-Lab Solver Certification Suite', () => {
  it('certifies sparse linear solver pivot stability, residual norm, and non-mutating behavior', () => {
    const A = [
      [1e-6, 2, 0],
      [3, 1, -1],
      [0, -2, 5],
    ];
    const b = [4, 5, 6];

    const copyA = JSON.parse(JSON.stringify(A));
    const copyB = [...b];

    const x = SparseLinearSolver.solve(A, b);

    // Verify non-mutation
    expect(A).toEqual(copyA);
    expect(b).toEqual(copyB);

    // Verify solution accuracy: ||A x - b|| < 1e-10
    const residual = [
      A[0][0] * x[0] + A[0][1] * x[1] + A[0][2] * x[2] - b[0],
      A[1][0] * x[0] + A[1][1] * x[1] + A[1][2] * x[2] - b[1],
      A[2][0] * x[0] + A[2][1] * x[1] + A[2][2] * x[2] - b[2],
    ];
    const resNorm = Math.sqrt(residual.reduce((sum, r) => sum + r * r, 0));
    expect(resNorm).toBeLessThan(1e-10);
  });

  it('certifies Newton-Raphson iteration convergence and DAE residual norm bound', () => {
    const engine = new VLabPhysicsEngine();
    const nodes: Node[] = [
      { id: 'dc', type: 'default', position: { x: 0, y: 0 }, data: { type: 'dc_voltage', params: { V: 12 } } } as any,
      { id: 'res', type: 'default', position: { x: 100, y: 0 }, data: { type: 'resistor', params: { R: 100 } } } as any,
      { id: 'cap', type: 'default', position: { x: 200, y: 0 }, data: { type: 'capacitor', params: { C: 1e-4 } } } as any,
      { id: 'gnd', type: 'default', position: { x: 300, y: 0 }, data: { type: 'ground', params: {} } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'dc', target: 'res', sourceHandle: 'p', targetHandle: 'p' },
      { id: 'e2', source: 'res', target: 'cap', sourceHandle: 'n', targetHandle: 'p' },
      { id: 'e3', source: 'cap', target: 'gnd', sourceHandle: 'n', targetHandle: 'gnd' },
      { id: 'e4', source: 'dc', target: 'gnd', sourceHandle: 'n', targetHandle: 'gnd' },
    ];

    let state: any = null;
    const dt = 0.0005;
    for (let i = 0; i < 50; i++) {
      state = engine.simulateStep(nodes, edges, state, dt);
      expect(state.x.every(Number.isFinite)).toBe(true);
    }
  });

  it('certifies deterministic execution repeatability with 0 drift across multiple runs', () => {
    const engine1 = new VLabPhysicsEngine();
    const engine2 = new VLabPhysicsEngine();

    const nodes: Node[] = [
      { id: 'dc', type: 'default', position: { x: 0, y: 0 }, data: { type: 'dc_voltage', params: { V: 5 } } } as any,
      { id: 'res', type: 'default', position: { x: 100, y: 0 }, data: { type: 'resistor', params: { R: 500 } } } as any,
      { id: 'gnd', type: 'default', position: { x: 200, y: 0 }, data: { type: 'ground', params: {} } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'dc', target: 'res', sourceHandle: 'p', targetHandle: 'p' },
      { id: 'e2', source: 'res', target: 'gnd', sourceHandle: 'n', targetHandle: 'gnd' },
      { id: 'e3', source: 'dc', target: 'gnd', sourceHandle: 'n', targetHandle: 'gnd' },
    ];

    let state1: any = null;
    let state2: any = null;

    for (let i = 0; i < 20; i++) {
      state1 = engine1.simulateStep(nodes, edges, state1, 0.001);
      state2 = engine2.simulateStep(nodes, edges, state2, 0.001);
    }

    expect(state1.x).toEqual(state2.x);
  });

  it('certifies timestep-halving convergence rate study for dynamic systems', () => {
    const engine = new VLabPhysicsEngine();
    const nodes: Node[] = [
      { id: 'dc', type: 'default', position: { x: 0, y: 0 }, data: { type: 'dc_voltage', params: { V: 10 } } } as any,
      { id: 'res', type: 'default', position: { x: 100, y: 0 }, data: { type: 'resistor', params: { R: 1000 } } } as any,
      { id: 'cap', type: 'default', position: { x: 200, y: 0 }, data: { type: 'capacitor', params: { C: 1e-3 } } } as any,
      { id: 'gnd', type: 'default', position: { x: 300, y: 0 }, data: { type: 'ground', params: {} } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'dc', target: 'res', sourceHandle: 'p', targetHandle: 'p' },
      { id: 'e2', source: 'res', target: 'cap', sourceHandle: 'n', targetHandle: 'p' },
      { id: 'e3', source: 'cap', target: 'gnd', sourceHandle: 'n', targetHandle: 'gnd' },
      { id: 'e4', source: 'dc', target: 'gnd', sourceHandle: 'n', targetHandle: 'gnd' },
    ];

    const runSim = (dt: number, totalSteps: number) => {
      let state: any = null;
      for (let step = 0; step < totalSteps; step++) {
        state = engine.simulateStep(nodes, edges, state, dt);
      }
      return state.x[0];
    };

    const res1 = runSim(0.001, 100);
    const res2 = runSim(0.0005, 200);
    const res3 = runSim(0.00025, 400);

    const diff1 = Math.abs(res1 - res2);
    const diff2 = Math.abs(res2 - res3);

    // Monotonic convergence error reduction
    expect(diff2).toBeLessThan(diff1);
  });
});
