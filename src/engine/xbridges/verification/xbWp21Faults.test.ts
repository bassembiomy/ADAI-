/**
 * WP-21 batch E3 acceptance addition (controller, after the verifier found an endless rollback loop): a fault that is
 * genuinely reached must still stop a variable-step run, also when the remaining step to the output time is between
 * hMin and 2 hMin (the retry cannot make the step smaller). Integrator of 2 crosses 1 at t = 0.5; the test-only block
 * faults for u > 1.
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { buildModel, runModel } from '../testkit';

const lib = BLOCK_LIBRARY as Record<string, (id: string, p?: Record<string, unknown>) => unknown>;
const withFaultBlock = <T>(fn: () => T): T => {
  lib.__TEST_FAULT_ABOVE_1__ = (id: string) => ({
    id, type: '__TEST_FAULT_ABOVE_1__', params: {}, state: null, directFeedthrough: true,
    inputs: [{ id: 'u', label: 'u', type: 'input' }], outputs: [{ id: 'y', label: 'y', type: 'output' }],
    execute: (ins: unknown[]) => (Number(ins[0]) > 1 ? { outputs: [NaN], error: 'test-only fault: u > 1' } : { outputs: [Number(ins[0])] }),
  });
  try { return fn(); } finally { delete lib.__TEST_FAULT_ABOVE_1__; }
};

describe('XBV-165 follow-up: a genuine fault still stops a variable-step run and never loops', () => {
  for (const solver of ['ode45', 'ode23', 'ode23tb'] as const) {
    for (const dt of [0.01, 0.1]) {
      it(`${solver}, output step ${dt}: the run stops with BLOCK_RUNTIME_FAULT at t <= 0.5 + ${dt} and terminates`, () => {
        const r = withFaultBlock(() => runModel(buildModel({
          blocks: [{ id: 'k', type: 'Constant', params: { value: 2 } }, { id: 'i', type: 'Integrator' }, { id: 'f', type: '__TEST_FAULT_ABOVE_1__' }],
          wires: ['k.out -> i.in', 'i.out -> f.u'],
        }), { solver, dt, stopTime: 2, probes: ['i.out'] }));
        expect(r.diagnostics.some((d) => d.severity === 'error' && d.code === 'BLOCK_RUNTIME_FAULT')).toBe(true);
        expect(r.t.at(-1)!).toBeLessThanOrEqual(0.5 + dt + 1e-9);
      }, 20_000);
    }
  }
});

// XBV-175 / XBV-176 (WP-21): a non-finite derivative is never integrated as 0. 0/0 into an Integrator gives a NaN
// derivative; every solver must stop the run with an error (stiff: STIFF_SOLVER_NONFINITE; explicit and adaptive: an
// error diagnostic) or propagate NaN to the state and report it - never continue with a 0 state.
describe('XBV-175 / XBV-176: a NaN derivative is not integrated as 0', () => {
  for (const solver of ['euler', 'rk4', 'ode45', 'ode14x', 'ode23tb'] as const) {
    it(`${solver}: 0/0 into an Integrator stops with an error or yields NaN, never a finite 0 state`, () => {
      const r = runModel(buildModel({
        blocks: [{ id: 'z', type: 'Constant', params: { value: 0 } }, { id: 'd', type: 'VectorDiv' }, { id: 'i', type: 'Integrator' }],
        wires: ['z.out -> d.in1', 'z.out -> d.in2', 'd.out -> i.in'],
      }), { solver, dt: 0.01, stopTime: 0.1, probes: ['i.out'] });
      const stopped = r.diagnostics.some((d) => d.severity === 'error');
      const last = r.signals['i.out'].at(-1);
      const lastNum = Array.isArray(last) ? Number((last as unknown[])[0]) : Number(last);
      expect(stopped || Number.isNaN(lastNum), `${solver}: run continued with i.out = ${lastNum}`).toBe(true);
    }, 20_000);
  }
});

