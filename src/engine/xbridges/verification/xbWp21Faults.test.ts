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

// XBV-177 / XBV-178 / XBV-179 (WP-21 batch I scan): powertrain blocks under the stiff solver. Defaults, unit inputs, 1 s.
// Oracle: rk4 at 0.001 (fixed step, converged for these smooth models) - ode23tb with tight tolerances must agree, and the
// run must finish in reasonable time; a block must not fault on its own defaults with unit inputs.
describe('XBV-177 / 178 / 179: powertrain blocks under ode23tb', () => {
  const unit = (type: string) => {
    const proto = BLOCK_LIBRARY[type]('b', {}) as { inputs: { id: string }[]; outputs: { id: string }[] };
    return {
      spec: { blocks: [{ id: 'b', type }, ...proto.inputs.map((p, i) => ({ id: `k${i}`, type: 'Constant', params: { value: 1 } }))], wires: proto.inputs.map((p, i) => `k${i}.out -> b.${p.id}`) },
      probes: proto.outputs.map((o) => `b.${o.id}`),
    };
  };
  const lastNums = (r: { signals: Record<string, unknown[]> }, probes: string[]) => probes.flatMap((p) => { const v = r.signals[p].at(-1); return (Array.isArray(v) ? (v as unknown[]).flat(4) : [v]).map(Number); });
  for (const type of ['PT_AUTOMATED_MANUAL_TRANSMISSION', 'PT_DUAL_CLUTCH_TRANSMISSION']) {
    it(`${type}: ode23tb (RelTol 1e-6, AbsTol 1e-9, output step 0.05) finishes 1 s within 30 s and agrees with rk4 0.001 within 1e-4 relative`, () => {
      const { spec, probes } = unit(type);
      const ref = runModel(buildModel(spec), { solver: 'rk4', dt: 0.001, stopTime: 1, probes });
      const t0 = Date.now();
      const r = runModel(buildModel(spec), { solver: 'ode23tb', dt: 0.05, stopTime: 1, probes, relTol: 1e-6, absTol: 1e-9 });
      expect(Date.now() - t0).toBeLessThan(30_000);
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const a = lastNums(ref, probes), b = lastNums(r, probes);
      a.forEach((x, i) => { if (Number.isFinite(x)) expect(Math.abs(b[i] - x) / Math.max(1, Math.abs(x)), `${probes} [${i}]`).toBeLessThanOrEqual(1e-4); });
    }, 60_000);
  }
  // XBV-179 oracle corrected (WP-21 E4 verifier): ode23tb (TR-BDF2) is second order and propagates the TR-BDF2 solution like
  // MATLAB, so its global error is a multiple of RelTol; the right check is convergence: tightening RelTol by 1000x must
  // cut the error versus rk4 0.001 by at least 30x (2/3-power scaling of a 2nd-order method predicts about 100x), and the
  // error at RelTol 1e-6 stays below 1e-3 relative.
  it('PT_ENGINE_DYNO: ode23tb converges to rk4 0.001 as RelTol tightens (1e-6 -> 1e-9 cuts the error >= 30x; error at 1e-6 <= 1e-3)', () => {
    const { spec, probes } = unit('PT_ENGINE_DYNO');
    const ref = lastNums(runModel(buildModel(spec), { solver: 'rk4', dt: 0.001, stopTime: 1, probes }), probes);
    const err = (relTol: number) => {
      const r = runModel(buildModel(spec), { solver: 'ode23tb', dt: 0.05, stopTime: 1, probes, relTol, absTol: relTol * 1e-3 });
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const b = lastNums(r, probes);
      return Math.max(...ref.map((x, i) => (Number.isFinite(x) ? Math.abs(b[i] - x) / Math.max(1, Math.abs(x)) : 0)));
    };
    const e6 = err(1e-6), e9 = err(1e-9);
    expect(e6).toBeLessThanOrEqual(1e-3);
    expect(e9 * 30).toBeLessThanOrEqual(Math.max(e6, 1e-12));
  }, 120_000);
  it('PT_TURBOCHARGER runs 1 s with its defaults and unit inputs under rk4 without a block fault (or refuses the inputs at compile with a parameter/range diagnostic that names the input)', () => {
    const { spec, probes } = unit('PT_TURBOCHARGER');
    const r = runModel(buildModel(spec), { solver: 'rk4', dt: 0.001, stopTime: 1, probes });
    expect(r.diagnostics.filter((d) => d.code === 'BLOCK_RUNTIME_FAULT').map((d) => d.message)).toEqual([]);
  }, 60_000);
});

// XBV-183 (WP-21 E4): ode23tb accepts tight tolerances on a smooth problem. x' = cos(10 t), x(0) = 0: x = sin(10 t)/10.
describe('XBV-183: ode23tb with RelTol 1e-9', () => {
  for (const dt of [0.01, 0.1]) {
    it(`RelTol 1e-9, AbsTol 1e-12, output step ${dt}: no error, |x(1) - sin(10)/10| <= 1e-8`, () => {
      const r = runModel(buildModel({
        blocks: [{ id: 'w', type: 'WaveformGen', params: { type: 'Sine', amp: 1, freq: 10 / (2 * Math.PI), phase: Math.PI / 2, offset: 0 } }, { id: 'i', type: 'Integrator' }],
        wires: ['w.out -> i.in'],
      }), { solver: 'ode23tb', dt, stopTime: 1, probes: ['i.out'], relTol: 1e-9, absTol: 1e-12 });
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const last = r.signals['i.out'].at(-1);
      expect(Math.abs((Array.isArray(last) ? Number((last as unknown[])[0]) : Number(last)) - Math.sin(10) / 10)).toBeLessThanOrEqual(1e-8);
    }, 60_000);
  }
});

// XBV-177 follow-up (WP-21 E4 verifier): event location under ode23tb keeps its accuracy. x' = -50 x + D(x), D = 100 for
// x < 1 and 60 for x >= 1 (Switch with zero crossing). Closed form: x = 2 (1 - e^-50t) until t1 = ln 2 / 50, then
// x = 1.2 - 0.2 e^-50 (t - t1). RelTol 1e-6: every logged sample within 5e-5 of the closed form (base: 8.3e-6).
describe('XBV-177: ode23tb accuracy across a located event', () => {
  const exact = (t: number) => { const t1 = Math.log(2) / 50; return t < t1 ? 2 * (1 - Math.exp(-50 * t)) : 1.2 - 0.2 * Math.exp(-50 * (t - t1)); };
  for (const dt of [0.01, 0.05]) {
    it(`output step ${dt}: max |x - exact| <= 5e-5 at RelTol 1e-6`, () => {
      const r = runModel(buildModel({
        blocks: [
          { id: 'i', type: 'Integrator' }, { id: 'g', type: 'GAIN', params: { gain: 50 } },
          { id: 'hi', type: 'Constant', params: { value: 60 } }, { id: 'lo', type: 'Constant', params: { value: 100 } },
          { id: 'sw', type: 'SWITCH', params: { threshold: 1, criteria: '>=' } }, { id: 's', type: 'Sum', params: { signs: '-+' } },
        ],
        wires: ['i.out -> g.u', 'i.out -> sw.ctrl', 'hi.out -> sw.u1', 'lo.out -> sw.u2', 'g.y -> s.in1', 'sw.y -> s.in2', 's.out -> i.in'],
      }), { solver: 'ode23tb', dt, stopTime: 0.2, probes: ['i.out'], relTol: 1e-6, absTol: 1e-9 });
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      r.t.forEach((t, k) => { const v = r.signals['i.out'][k]; expect(Math.abs((Array.isArray(v) ? Number((v as unknown[])[0]) : Number(v)) - exact(t)), `t = ${t}`).toBeLessThanOrEqual(5e-5); });
    }, 60_000);
  }
});

