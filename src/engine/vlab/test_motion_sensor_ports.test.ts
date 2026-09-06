import { describe, expect, it } from 'vitest';
import { Edge, Node } from '@xyflow/react';
import { VLabPhysicsEngine } from './vlabPhysics';

/**
 * Focused diagnostic: every output port of the motion sensor blocks must
 * deliver a finite, physically correct signal to a connected scope.
 */
interface ScopeSignal {
  name: string;
  value: number;
}

const runSim = (nodes: Node[], edges: Edge[], steps: number, dt: number) => {
  const engine = new VLabPhysicsEngine();
  let state: any = null;
  for (let i = 0; i < steps; i++) state = engine.simulateStep(nodes, edges, state, dt);
  return { engine, state };
};

const readScope = (engine: VLabPhysicsEngine, state: any, scopeId: string): ScopeSignal[] => {
  const system = (engine as any).currentSystem;
  const indices: number[] = system?.scopeOutputs?.get(scopeId) || [];
  return indices.map((idx: number) => ({ name: system.variableNames[idx], value: state.x[idx] }));
};

describe('Motion sensor output ports', () => {
  it('rot_motion_sensor: W and A ports both deliver finite signals', () => {
    const nodes: Node[] = [
      { id: 'src', data: { type: 'torque_source', params: { T: 5 } } } as any,
      { id: 'load', data: { type: 'inertia', params: { J: 0.01 } } } as any,
      { id: 'sensor', data: { type: 'rot_motion_sensor', params: {} } } as any,
      { id: 'scope1', data: { type: 'scope', params: { numSignals: { value: 2 } } } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'src', target: 'load', sourceHandle: 'r_s', targetHandle: 'r_t' },
      { id: 'e2', source: 'src', target: 'sensor', sourceHandle: 'r_s', targetHandle: 'r_t' },
      { id: 'e3', source: 'sensor', target: 'scope1', sourceHandle: 'w_s', targetHandle: 'in1_t' },
      { id: 'e4', source: 'sensor', target: 'scope1', sourceHandle: 'a_s', targetHandle: 'in2_t' },
    ];

    const steps = 1000, dt = 0.001;
    const { engine, state } = runSim(nodes, edges, steps, dt);
    expect(state.x.every(Number.isFinite)).toBe(true);

    const signals = readScope(engine, state, 'scope1');
    expect(signals.length).toBe(2);

    // omega = T/J * t = 5/0.01 * 1 s = 500 rad/s
    const omega = signals.find((s: ScopeSignal) => /signal_w/.test(s.name));
    const theta = signals.find((s: ScopeSignal) => /signal_a/.test(s.name));
    expect(omega, `W port signal (${signals.map((s: ScopeSignal) => s.name).join(', ')})`).toBeDefined();
    expect(theta, `A port signal (${signals.map((s: ScopeSignal) => s.name).join(', ')})`).toBeDefined();
    expect(omega!.value, 'W port value finite').toEqual(expect.any(Number));
    expect(Math.abs(omega!.value)).toBeGreaterThan(400);
    expect(Math.abs(omega!.value)).toBeLessThan(550);
    expect(Number.isFinite(theta!.value), 'A port value finite').toBe(true);
    expect(Math.abs(theta!.value)).toBeGreaterThan(200);
    expect(Math.abs(theta!.value)).toBeLessThan(300);
  });

  it('trans_motion_sensor: V and P ports both deliver finite signals', () => {
    const nodes: Node[] = [
      { id: 'src', data: { type: 'force_source', params: { F: 10 } } } as any,
      { id: 'load', data: { type: 'mass', params: { m: 2 } } } as any,
      { id: 'sensor', data: { type: 'trans_motion_sensor', params: {} } } as any,
      { id: 'scope1', data: { type: 'scope', params: { numSignals: { value: 2 } } } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'src', target: 'load', sourceHandle: 'a_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'src', target: 'sensor', sourceHandle: 'a_s', targetHandle: 'r_t' },
      { id: 'e3', source: 'sensor', target: 'scope1', sourceHandle: 'v_s', targetHandle: 'in1_t' },
      { id: 'e4', source: 'sensor', target: 'scope1', sourceHandle: 'p_s', targetHandle: 'in2_t' },
    ];

    const steps = 1000, dt = 0.001;
    const { engine, state } = runSim(nodes, edges, steps, dt);
    expect(state.x.every(Number.isFinite)).toBe(true);

    const signals = readScope(engine, state, 'scope1');
    expect(signals.length).toBe(2);

    // v ≈ F/m * t = 10/2 * 1 s = 5 m/s ; p ≈ 0.5*(F/m)*t^2 = 2.5 m
    const v = signals.find((s: ScopeSignal) => /signal_v/.test(s.name));
    const p = signals.find((s: ScopeSignal) => /signal_p/.test(s.name));
    expect(v, `V port signal (${signals.map((s: ScopeSignal) => s.name).join(', ')})`).toBeDefined();
    expect(p, `P port signal (${signals.map((s: ScopeSignal) => s.name).join(', ')})`).toBeDefined();
    expect(Number.isFinite(v!.value), 'V port value finite').toBe(true);
    expect(Math.abs(v!.value)).toBeCloseTo(5, 0);
    expect(Number.isFinite(p!.value), 'P port value finite').toBe(true);
    expect(Math.abs(p!.value)).toBeCloseTo(2.5, 0);
  });
});
