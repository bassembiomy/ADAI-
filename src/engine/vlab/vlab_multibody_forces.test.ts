import { describe, it, expect } from 'vitest';
import { Node, Edge } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { VLabPhysicsEngine } from './vlabPhysics';
import { blockEquations } from './vlabEquations';

const physBlock = (id: string) =>
  VLAB_LIBRARY.find(d => d.type === 'Physical')?.blocks.find(b => b.id === id);

const runToScope = (nodes: Node[], edges: Edge[], steps = 1) => {
  const engine = new VLabPhysicsEngine();
  let state: any = null;
  for (let i = 0; i < steps; i++) state = engine.simulateStep(nodes, edges, state, 0.01);
  const out = state.scopeOutputs['scope1'];
  // Single-channel scopes report a bare number in test mode.
  return (typeof out === 'number' ? [out] : out) as number[];
};

const scopeNode = (n: number) =>
  ({ id: 'scope1', type: 'default', position: { x: 300, y: 0 }, data: { type: 'scope', params: { numSignals: { value: n } } } } as any);

const eqArgs = (overrides: Record<string, any>) => ({
  across: [], dAcross: [], branch: [], dBranch: [], state: [], dState: [],
  ctx: {} as any, params: {}, ports: [], nodeId: 'n1',
  ...overrides,
});

describe('Multibody force elements (grav_field, spring_damper_force, external_force)', () => {
  it('declares Frame B/F ports and Physical measurement/input ports', () => {
    for (const id of ['grav_field', 'spring_damper_force', 'external_force']) {
      const block = physBlock(id);
      expect(block?.ports.find(p => p.id === 'b')?.domain).toBe('Frame');
      expect(block?.ports.find(p => p.id === 'f')?.domain).toBe('Frame');
      expect(block?.ports.find(p => p.id === 'fm')?.domain).toBe('Physical');
    }
    const ext = physBlock('external_force');
    for (const id of ['in_fx', 'in_fy', 'in_fz', 'in_tx', 'in_ty', 'in_tz', 'tm']) {
      expect(ext?.ports.find(p => p.id === id)?.domain).toBe('Physical');
    }
  });

  it('grav_field computes F = m*g along the direction and accepts g = 0', () => {
    const grav = (params: any) => ({ id: 'g1', type: 'default', position: { x: 0, y: 0 }, data: { type: 'grav_field', params } } as any);
    const edges: Edge[] = [{ id: 'e1', source: 'g1', target: 'scope1', sourceHandle: 'fm', targetHandle: 'in1' }];

    expect(runToScope([grav({ g: { value: 0 } }), scopeNode(1)], edges)[0]).toBeCloseTo(0, 6);
    expect(runToScope([grav({ g: { value: 9.81 }, mass: { value: 2 } }), scopeNode(1)], edges)[0]).toBeCloseTo(19.62, 4);

    // residual = branch - expected, so with branch = 0 the expected value is -residual
    const res = blockEquations.grav_field(eqArgs({
      branch: new Array(7).fill(0),
      params: { g: 10, mass: 3, direction: '[0 -2 0]' },
      ports: ['b', 'f', 'fm'],
    }));
    expect(-res[0]).toBeCloseTo(0);
    expect(-res[1]).toBeCloseTo(-30);
    expect(-res[2]).toBeCloseTo(0);
    expect(-res[6]).toBeCloseTo(30);
  });

  it('external_force applies scaled force and torque input vectors', () => {
    const nodes: Node[] = [
      { id: 'cf', type: 'default', position: { x: 0, y: 0 }, data: { type: 'ps_constant', params: { value: { value: 10 } } } } as any,
      { id: 'ct', type: 'default', position: { x: 0, y: 50 }, data: { type: 'ps_constant', params: { value: { value: 1 } } } } as any,
      {
        id: 'x1', type: 'default', position: { x: 100, y: 0 },
        data: { type: 'external_force', params: { force_scale: { value: 2 }, torque_scale: { value: 99 } } }
      } as any,
      scopeNode(2),
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'cf', target: 'x1', sourceHandle: 'y', targetHandle: 'in_fx' },
      { id: 'e2', source: 'ct', target: 'x1', sourceHandle: 'y', targetHandle: 'in_tz' },
      { id: 'e3', source: 'x1', target: 'scope1', sourceHandle: 'fm', targetHandle: 'in1' },
      { id: 'e4', source: 'x1', target: 'scope1', sourceHandle: 'tm', targetHandle: 'in2' },
    ];
    const out = runToScope(nodes, edges);
    expect(out[0]).toBeCloseTo(20, 4);
    expect(out[1]).toBeCloseTo(99, 4);
  });

  it('Probe reads the real force measurement output', () => {
    const nodes: Node[] = [
      { id: 'g1', type: 'default', position: { x: 0, y: 0 }, data: { type: 'grav_field', params: { g: { value: 9.81 }, mass: { value: 2 } } } } as any,
      { id: 'p1', type: 'default', position: { x: 100, y: 0 }, data: { type: 'vlab_probe' } } as any,
      scopeNode(1),
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'g1', target: 'p1', sourceHandle: 'fm', targetHandle: 'in' },
      { id: 'e2', source: 'p1', target: 'scope1', sourceHandle: 'out', targetHandle: 'in1' },
    ];
    expect(runToScope(nodes, edges)[0]).toBeCloseTo(19.62, 4);
  });

  it('external_force applies no hidden force when inputs are unconnected', () => {
    const nodes: Node[] = [
      { id: 'x1', type: 'default', position: { x: 0, y: 0 }, data: { type: 'external_force', params: { force_scale: { value: 2 } } } } as any,
      scopeNode(1),
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'x1', target: 'scope1', sourceHandle: 'fm', targetHandle: 'in1' }];
    expect(runToScope(nodes, edges)[0]).toBeCloseTo(0, 6);
  });

  it('spring_damper_force includes the damping term b*(v1 - v2)', () => {
    const args = (dF: number[]) => eqArgs({
      across: [[0, 0, 0, 0, 0, 0], [0.5, 0, 0, 0, 0, 0]],
      dAcross: [[0, 0, 0, 0, 0, 0], dF],
      branch: new Array(9).fill(0),
      params: { k: 100, b: 10, x0: 0.2 },
      ports: ['b', 'f', 'x', 'v', 'fm'],
    });
    const still = blockEquations.spring_damper_force(args([0, 0, 0, 0, 0, 0]));
    expect(-still[6]).toBeCloseTo(0.5);   // x
    expect(-still[8]).toBeCloseTo(30);    // k(x - x0) = 100 * 0.3
    expect(-still[0]).toBeCloseTo(-30);   // tension pulls F back toward B

    const moving = blockEquations.spring_damper_force(args([2, 0, 0, 0, 0, 0]));
    expect(-moving[7]).toBeCloseTo(2);    // v
    expect(-moving[8]).toBeCloseTo(50);   // 30 + b*v = 30 + 10*2
  });

  it('spring_damper_force measures stretch between world and an offset frame', () => {
    const nodes: Node[] = [
      { id: 'w', type: 'default', position: { x: 0, y: 0 }, data: { type: 'world_frame' } } as any,
      { id: 't1', type: 'default', position: { x: 100, y: 0 }, data: { type: 'rigid_transform', params: { offset: { value: '[3 4 0]' } } } } as any,
      {
        id: 's1', type: 'default', position: { x: 200, y: 0 },
        data: { type: 'spring_damper_force', params: { k: { value: 100 }, b: { value: 10 }, x0: { value: 1 } } }
      } as any,
      scopeNode(2),
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'w', target: 't1', sourceHandle: 'w', targetHandle: 'b' },
      { id: 'e2', source: 'w', target: 's1', sourceHandle: 'w', targetHandle: 'b' },
      { id: 'e3', source: 't1', target: 's1', sourceHandle: 'f', targetHandle: 'f' },
      { id: 'e4', source: 's1', target: 'scope1', sourceHandle: 'x', targetHandle: 'in1' },
      { id: 'e5', source: 's1', target: 'scope1', sourceHandle: 'fm', targetHandle: 'in2' },
    ];
    const out = runToScope(nodes, edges, 3);
    expect(out[0]).toBeCloseTo(5, 3);
    expect(out[1]).toBeCloseTo(400, 1);   // 100 * (5 - 1)
  });
});
