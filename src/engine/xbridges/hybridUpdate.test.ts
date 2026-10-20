// WP-09e acceptance tests: discrete update of hybrid blocks (Simulink mdlUpdate for blocks that also have continuous states).
//   XBlock.updateDiscrete(inputs, params, state, t) -> new state. The engine calls it once per major time step, in
//   updateDiscreteStates (the same phase as the discrete blocks), for blocks with evaluateDerivatives; never inside solver
//   stages. Continuous integration then starts from the updated state.
import { describe, it, expect } from 'vitest';
import { XbridgesEngine } from './XbridgesEngine';
import { Solvers } from './Solvers';

function hybrid(log: { xs: number[]; kSeen: number[] }) {
  return {
    id: 'h', type: 'TestHybrid', params: {}, isStateful: true,
    inputs: [], outputs: [{ id: 'k', name: 'k', type: 'auto', direction: 'output', value: 0 }, { id: 'x', name: 'x', type: 'auto', direction: 'output', value: 0 }],
    state: { x: 0, k: 0 },
    execute: (_i: any[], _p: any, s: any) => ({ outputs: [s.k, s.x] }),
    evaluateDerivatives: (_i: any[], _p: any, s: any) => { log.kSeen.push(s.k); return { x: 1, k: 0 }; },
    updateDiscrete: (_i: any[], _p: any, s: any) => { log.xs.push(s.x); return { ...s, k: s.k + 1 }; },
  };
}

describe('hybrid block discrete update', () => {
  for (const solver of ['ode4', 'ode1', 'ode45', 'ode23tb']) {
    it(`${solver}: once per major step, from the committed state, never in stages`, () => {
      const log = { xs: [] as number[], kSeen: [] as number[] };
      const e = new XbridgesEngine({ blocks: [hybrid(log)], connections: [] } as any);
      const opts: any = { solver, startTime: 0, stopTime: 1, fixedStep: 0.1, maxStep: 0.1, relTol: 1e-6, absTol: 1e-8 };
      Solvers.runFixedStep(e, opts);
      const st = e.getBlock('h')!.state;
      expect(Math.abs(st.x - 1)).toBeLessThan(1e-9);
      expect(st.k).toBe(log.xs.length);
      expect(log.xs.length).toBeGreaterThanOrEqual(10);
      // each update sees a committed major-step state: x strictly increasing, starting at 0
      expect(log.xs[0]).toBe(0);
      for (let i = 1; i < log.xs.length; i++) expect(log.xs[i]).toBeGreaterThan(log.xs[i - 1]);
      // stages see the already-updated discrete part: k never decreases and is >= 1 once integration starts
      expect(log.kSeen.every(k => k >= 1)).toBe(true);
      for (let i = 1; i < log.kSeen.length; i++) expect(log.kSeen[i]).toBeGreaterThanOrEqual(log.kSeen[i - 1]);
    });
  }

  it('blocks without updateDiscrete keep their behaviour (state only from integration)', () => {
    const b: any = hybrid({ xs: [], kSeen: [] });
    delete b.updateDiscrete;
    const e = new XbridgesEngine({ blocks: [b], connections: [] } as any);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 1, fixedStep: 0.1 } as any);
    expect(e.getBlock('h')!.state.k).toBe(0);
  });
});
