/**
 * WP-21 round 6 acceptance (controller).
 * XBV-307 (S1): discrete sample hits are scheduled on integer ticks (Simulink: hit n at t = n*Ts exactly, no accumulated
 * nextTime += Ts). Accumulating 0.1 drifts past the 1e-9 tolerance after 23042 additions, so a discrete integrator of
 * u = 1 with Ts = 0.1 misses a hit from then on. Oracle: forward-Euler discrete integrator y(n) = y(n-1) + Ts*u(n-1),
 * so after N hits y = N * Ts, and every sample k has y(t_k) = k * Ts at t_k = k * Ts (h = Ts) or the latest hit (h < Ts).
 */
import { describe, expect, it } from 'vitest';
import { buildModel, runModel } from '../testkit';

describe('XBV-307: discrete sample hits do not drift on long runs', () => {
  for (const [h, stop] of [[0.1, 3000], [0.05, 2400], [0.01, 5100]] as const) {
    it(`INTEGRATOR_DISCRETE Ts 0.1 driven by 1, solver step ${h}, ${stop} s: y(t) = 0.1 * floor(t / 0.1 + 1e-9) at every sample`, () => {
      const r = runModel(buildModel({
        blocks: [{ id: 'c', type: 'Constant', params: { value: 1 } }, { id: 'i', type: 'INTEGRATOR_DISCRETE', params: { sample_time: 0.1 } }],
        wires: ['c.out -> i.u'],
      }), { solver: 'discrete', dt: h, stopTime: stop, probes: ['i.y'] });
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const ys = r.signals['i.y'].map(Number);
      const y0 = ys[0];
      let bad = -1;
      for (let k = 0; k < ys.length; k++) {
        const hits = Math.floor((k * h) / 0.1 + 1e-9);
        if (Math.abs(ys[k] - y0 - 0.1 * hits) > 1e-6 * Math.max(1, hits * 0.1)) { bad = k; break; }
      }
      expect(bad, bad >= 0 ? `first wrong sample k = ${bad}, t = ${bad * h}: y = ${ys[bad]}` : '').toBe(-1);
    }, 120_000);
  }
});

// XBV-197: RATE_LIMITER legacy aliases risingLimit / fallingLimit set to '' are refused by the embedded validator (an empty
// rate, like XBV-196), instead of validating as 0 and running at the default rate 1.
import { runEmbedded } from '../testkit';
describe('XBV-197: empty legacy slew-rate aliases are refused', () => {
  for (const params of [{ risingLimit: '' }, { fallingLimit: '' }]) {
    it(`RATE_LIMITER ${JSON.stringify(params)}: an error diagnostic whose message says empty`, () => {
      const r = runEmbedded({
        blocks: [{ id: 'c', type: 'Constant', params: { value: 10 } }, { id: 'r', type: 'RATE_LIMITER', params: { ...params, sampleTime: 0.1 } }],
        wires: ['c.out -> r.u'],
      }, { solver: 'discrete', dt: 0.1, steps: 2, probes: ['r.y'] });
      expect(r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message).join(' | ')).toMatch(/empty/i);
    });
  }
});

// XBV-310 (FUZZY_DEFUZZIFY, found by the WP-03b verifier): an unknown or wrong-case defuzzification method is refused at
// compile (PARAMETER_OPTION_INVALID) instead of silently using the centroid.
import { XbridgesEngine } from '../XbridgesEngine';
describe('XBV-310: FUZZY_DEFUZZIFY.method is validated', () => {
  for (const method of ['zz_unknown', 'MOM']) {
    it(`method '${method}' gives a compile error naming the block`, () => {
      const ds = new XbridgesEngine(buildModel({ blocks: [{ id: 'd', type: 'FUZZY_DEFUZZIFY', params: { method } }], wires: [] })).compile(0);
      expect(ds.some((d) => d.severity === 'error' && (d.blockIds ?? []).includes('d'))).toBe(true);
    });
  }
});

// XBV-300 (U2 rework): Fuzzy Logic Toolbox gaussmf / sigmf are element-wise: gaussmf(x; sigma 1, c 0) = exp(-x^2/2) at
// x = [0 1 2] is [1 0.606531 0.135335]; sigmf(x; a 2, c 0) = 1/(1+e^(-2x)) at x = 1 is 0.880797. CLARKE_TRANSFORM refuses a
// vector on every phase input, including ic in power_invariant mode (a dimension diagnostic, never NaN without one).
import { BLOCK_LIBRARY as BL_U2 } from '../BlockDefinitions';
describe('XBV-300: membership functions are element-wise; Clarke guards every input', () => {
  const ex = (type: string, params: Record<string, unknown>, ins: unknown[]) => {
    const b = BL_U2[type]('b', params);
    return b.execute(ins as never, b.params, b.state, 0) as { outputs: unknown[]; error?: string };
  };
  it('FUZZY_MF_GAUSSMF on [0 1 2] gives [1 0.606531 0.135335]', () => {
    const r = ex('FUZZY_MF_GAUSSMF', { sigma: 1, c: 0 }, [[0, 1, 2]]);
    expect(r.error).toBeUndefined();
    (r.outputs[0] as number[]).forEach((v, i) => expect(v).toBeCloseTo([1, Math.exp(-0.5), Math.exp(-2)][i], 12));
  });
  it('FUZZY_MF_SIGMF on [[1 0] [-1 1]] gives 1/(1+e^(-2x)) element-wise', () => {
    const r = ex('FUZZY_MF_SIGMF', { a: 2, c: 0 }, [[[1, 0], [-1, 1]]]);
    expect(r.error).toBeUndefined();
    const s = (x: number) => 1 / (1 + Math.exp(-2 * x));
    expect(r.outputs[0]).toEqual([[s(1), s(0)], [s(-1), s(1)]]);
  });
  for (const mode of ['amplitude_invariant', 'power_invariant']) {
    it(`CLARKE_TRANSFORM (${mode}) with a vector on ic: a block error naming ic`, () => {
      const r = runModel(buildModel({
        blocks: [{ id: 'v', type: 'Constant', params: { value: [1, 2, 3] } }, { id: 's', type: 'Constant', params: { value: 1 } }, { id: 'c', type: 'CLARKE_TRANSFORM', params: { mode } }],
        wires: ['s.out -> c.ia', 's.out -> c.ib', 'v.out -> c.ic'],
      }), { solver: 'discrete', dt: 0.01, stopTime: 0.01, probes: [] });
      expect(r.diagnostics.some((d) => d.severity === 'error' && /ic/.test(d.message))).toBe(true);
    });
  }
});
