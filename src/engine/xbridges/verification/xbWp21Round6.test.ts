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

// XBV-307 rework (E6 verifier): the hit test must not misfire at large times. A tolerance proportional to |t| reaches one
// solver step (1e-3 s) at t = 1e6 s, so hits fired one tick early (and several per tick from 1e7 s). Simulink decides hits
// on integer tick counts. Oracle: from start T0 (a multiple of Ts), the integrator of 1 has y(k) - y(0) = Ts * floor(k h / Ts).
describe('XBV-307: sample hits stay on the grid at large start times', () => {
  for (const T0 of [1e5, 1e6, 1e7]) {
    for (const Ts of [0.01, 0.002]) {
      it(`start ${T0} s, solver step 0.001, Ts ${Ts}: every sample on the integer grid`, () => {
        const h = 0.001;
        const r = runModel(buildModel({
          blocks: [{ id: 'c', type: 'Constant', params: { value: 1 } }, { id: 'i', type: 'INTEGRATOR_DISCRETE', params: { sample_time: Ts } }],
          wires: ['c.out -> i.u'],
        }), { solver: 'discrete', dt: h, startTime: T0, stopTime: T0 + 0.05, probes: ['i.y'] });
        expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        const ys = r.signals['i.y'].map(Number);
        const bad: string[] = [];
        for (let k = 0; k < ys.length && bad.length < 3; k++) {
          const want = Ts * Math.floor((k * h) / Ts + 1e-6);
          if (Math.abs(ys[k] - ys[0] - want) > 1e-9) bad.push(`k=${k}: ${ys[k] - ys[0]} vs ${want}`);
        }
        expect(bad).toEqual([]);
      });
    }
  }
});

// XBV-312: Scope sampleTime decimation stays on the grid at large start times (Simulink logs at n*Ts). From start 1e8 s,
// solver step 0.01, Scope Ts 0.1, 2 s: the same number of samples as from start 0, every gap 0.1 s.
import { Solvers } from '../Solvers';
describe('XBV-312: Scope sample-time logging at large start times', () => {
  const log = (T0: number) => {
    const e = new XbridgesEngine(buildModel({
      blocks: [{ id: 'c', type: 'Constant', params: { value: 1 } }, { id: 's', type: 'Scope', params: { sampleTime: 0.1, limitDataPoints: false } }],
      wires: ['c.out -> s.in1'],
    }));
    Solvers.runFixedStep(e, { solver: 'rk4', startTime: T0, stopTime: T0 + 2, fixedStep: 0.01 } as never);
    expect(e.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    return (e as unknown as { blockMap: Map<string, { state: { history: Array<{ t: number }> } }> }).blockMap.get('s')!.state.history;
  };
  it('start 1e8 s logs as many samples as start 0 (at least 20), every gap 0.1 s', () => {
    const ref = log(0).length;
    expect(ref).toBeGreaterThanOrEqual(20);
    const hist = log(1e8);
    expect(hist.length).toBe(ref);
    for (let n = 1; n < hist.length; n++) expect(Math.abs(hist[n].t - hist[n - 1].t - 0.1), `gap ${n}`).toBeLessThan(1e-6);
  });
});

// XBV-311: the first hit at an on-grid start is never skipped, even at 1e11+ ticks. Ts 1e-4, h 1e-4, starts n*Ts with n near
// 1.8e11: the discrete integrator of 1 reads Ts after the first step (its first hit is at the start).
describe('XBV-311: first sample hit at large on-grid start times', () => {
  it('200 starts near 1.8e11 ticks (Ts 1e-4): y(start + h) - y(start) = Ts for every one', () => {
    const Ts = 1e-4;
    const bad: number[] = [];
    for (let i = 0; i < 200; i++) {
      const T0 = (1.8e11 + i * 7919) * Ts;
      const r = runModel(buildModel({
        blocks: [{ id: 'c', type: 'Constant', params: { value: 1 } }, { id: 'i', type: 'INTEGRATOR_DISCRETE', params: { sample_time: Ts } }],
        wires: ['c.out -> i.u'],
      }), { solver: 'discrete', dt: Ts, startTime: T0, stopTime: T0 + 2 * Ts, probes: ['i.y'] });
      const ys = r.signals['i.y'].map(Number);
      if (Math.abs(ys[1] - ys[0] - Ts) > 1e-9) bad.push(T0);
    }
    expect(bad).toEqual([]);
  });
});

// XBV-313: the PWM carrier phase is a function of absolute time (Simulink PWM Generator carrier = f(t)), not an accumulated
// sum. Start 1e8 s is a whole number of carrier periods (f = 1000 Hz), so the gate sequence over 2 periods equals the one
// from start 0, sample for sample, including the duty-equals-carrier tie (duty 0.3 meets the triangle at phase 0.15).
describe('XBV-313: PWM gate pattern does not depend on an integer-period start time', () => {
  for (const duty of [0.3, 0.33]) {
    it(`duty ${duty}: gates from start 1e8 s equal gates from start 0`, () => {
      const gates = (T0: number) => runModel(buildModel({
        blocks: [{ id: 'c', type: 'Constant', params: { value: duty } }, { id: 'p', type: 'PWM_GENERATOR', params: { frequency: 1000, carrierType: 'triangle' } }],
        wires: ['c.out -> p.duty'],
      }), { solver: 'discrete', dt: 1e-5, startTime: T0, stopTime: T0 + 0.002, probes: ['p.pwm'] }).signals['p.pwm'].map(Number);
      expect(gates(1e8)).toEqual(gates(0));
    });
  }
});

// XBV-313 rework (E7 verifier): the carrier phase must be exact to well below one step for small steps at large times.
// From a start that is a whole number of carrier periods, the gate sequence equals the one from start 0 for non-tie duties.
describe('XBV-313: PWM gates at start 1e8 s with small steps', () => {
  for (const [f, h] of [[20000, 1e-6], [2500, 2e-6], [20000, 1 / 30000], [1000, 1e-6]] as const) {
    it(`f ${f} Hz, step ${h.toPrecision(4)}, duty 0.37: gates from start 1e8 s equal gates from start 0`, () => {
      const gates = (T0: number) => runModel(buildModel({
        blocks: [{ id: 'c', type: 'Constant', params: { value: 0.37 } }, { id: 'p', type: 'PWM_GENERATOR', params: { frequency: f, carrierType: 'triangle' } }],
        wires: ['c.out -> p.duty'],
      }), { solver: 'discrete', dt: h, startTime: T0, stopTime: T0 + 3000 * h, probes: ['p.pwm'] }).signals['p.pwm'].map(Number);
      const a = gates(0), b = gates(1e8);
      const diff = a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
      expect(diff).toBe(0);
    }, 60_000);
  }
});
