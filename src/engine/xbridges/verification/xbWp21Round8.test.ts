/**
 * WP-21 round 8 acceptance (controller), batch E9 rework: every block with time-scheduled discontinuities is integrated
 * exactly by the variable-step solvers (ode23, ode45, ode23tb), live and batch: the solver lands on each edge. The integrand
 * is piecewise constant, so the integral is exact up to the event tolerance; |error| <= 2e-6 absolute.
 * Oracles (cycles c = f t): triangle carrier, duty d: high when frac(c) < d/2 or > 1 - d/2. Sawtooth / inverse sawtooth: a
 * fraction d of each period. Square carrier (0.25 / 0.75): d > 0.75 -> 1, d > 0.25 -> 0.5. WaveformGen Square (offset 1, amp 1):
 * 2 during the first half period, 0 in the second. SVPWM gate phase a with T1 = T2 = 0.3 Ts, T0 = 0.4 Ts in sector 1: on for 0.8 Ts.
 */
import { describe, expect, it } from 'vitest';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { liveStep } from '../liveStep';
import { buildModel, type ModelSpec } from '../testkit';

const TOL = 2e-6;
const SOLVERS = ['ode23', 'ode45', 'ode23tb'];
const G = (d: number, c: number) => { const n = Math.floor(c), x = c - n; return n * d + Math.min(x, d / 2) + Math.max(0, x - (1 - d / 2)); };
const xOf = (e: XbridgesEngine) => Number((e as unknown as { executionOrder: Array<{ id: string; state: unknown }> }).executionOrder.find((b) => b.id === 'x')!.state);
const run = (spec: ModelSpec, solver: string, T: number, mode: 'batch' | 'live') => {
  const e = new XbridgesEngine(buildModel(spec));
  if (mode === 'batch') Solvers.runFixedStep(e, { solver, startTime: 0, stopTime: T } as never);
  else {
    (e as unknown as { options: unknown }).options = { solver, fixedStep: 0.01, startTime: 0, stopTime: T };
    e.compile(0);
    const n = Math.round(T / 0.01);
    for (let k = 0; k < n; k++) { const tk = k * 0.01; if (!liveStep(e, solver, tk, k === n - 1 ? T - tk : 0.01)) break; }
  }
  expect(e.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual([]);
  return xOf(e);
};
const pwm = (duty: ModelSpec['blocks'][number], f: number, carrierType = 'triangle'): ModelSpec => ({
  blocks: [duty, { id: 'p', type: 'PWM_GENERATOR', params: { frequency: f, carrierType } }, { id: 'x', type: 'Integrator' }],
  wires: [`${duty.id}.out -> p.duty`, 'p.pwm -> x.in'],
});

describe('triangle PWM: partial periods and constant duty', () => {
  for (const [f, T, d] of [[1000, 1.0003, 0.3], [1000, 1.37, 0.3], [50, 1.3785, 0.3], [1000, 1, 0], [1000, 1, 1]] as const) {
    for (const s of SOLVERS) for (const m of ['batch', 'live'] as const) {
      it(`f ${f}, T ${T}, duty ${d}, ${s} ${m}`, () => {
        expect(Math.abs(run(pwm({ id: 'c', type: 'Constant', params: { value: d } }, f), s, T, m) - G(d, f * T) / f)).toBeLessThanOrEqual(TOL);
      }, 120_000);
    }
  }
});

describe('triangle PWM: duty steps from 0.3 to 0.7 at t = 0.5123 s', () => {
  for (const f of [50, 1000]) for (const s of SOLVERS) for (const m of ['batch', 'live'] as const) {
    it(`f ${f}, ${s} ${m}`, () => {
      const want = (G(0.3, f * 0.5123) + G(0.7, f) - G(0.7, f * 0.5123)) / f;
      expect(Math.abs(run(pwm({ id: 's', type: 'Step', params: { stepTime: 0.5123, initialValue: 0.3, finalValue: 0.7 } }, f), s, 1, m) - want)).toBeLessThanOrEqual(TOL);
    }, 120_000);
  }
});

describe('PWM carriers that jump: sawtooth, inverse sawtooth, square', () => {
  const frac: Record<string, number> = { sawtooth: 0.3, inv_sawtooth: 0.3, square: 0.5 };
  for (const ct of Object.keys(frac)) for (const s of SOLVERS) {
    it(`${ct}, 1 kHz, duty 0.3, ${s} batch 0..1 s`, () => {
      expect(Math.abs(run(pwm({ id: 'c', type: 'Constant', params: { value: 0.3 } }, 1000, ct), s, 1, 'batch') - frac[ct])).toBeLessThanOrEqual(TOL);
    }, 120_000);
  }
});

describe('SVPWM_GATE_GENERATOR: phase a on for 0.8 Ts', () => {
  for (const Ts of [1e-4, 1e-3, 0.02]) for (const s of SOLVERS) {
    it(`Ts ${Ts}, ${s} batch 0..1 s: integral 0.8`, () => {
      const spec: ModelSpec = {
        blocks: [{ id: 'sec', type: 'Constant', params: { value: 1 } }, { id: 't1', type: 'Constant', params: { value: 0.3 * Ts } }, { id: 't2', type: 'Constant', params: { value: 0.3 * Ts } },
          { id: 't0', type: 'Constant', params: { value: 0.4 * Ts } }, { id: 'g', type: 'SVPWM_GATE_GENERATOR', params: { Ts } }, { id: 'x', type: 'Integrator' }],
        wires: ['sec.out -> g.sector', 't1.out -> g.t1', 't2.out -> g.t2', 't0.out -> g.t0', 'g.ga -> x.in'],
      };
      expect(Math.abs(run(spec, s, 1, 'batch') - 0.8)).toBeLessThanOrEqual(TOL);
    }, 120_000);
  }
});

describe('WaveformGen Square (offset 1, amplitude 1) over 1.3785 s', () => {
  for (const f of [50, 1000]) for (const s of SOLVERS) for (const m of ['batch', 'live'] as const) {
    it(`f ${f}, ${s} ${m}`, () => {
      const c = f * 1.3785, n = Math.floor(c), fr = c - n;
      const want = (2 * (n * 0.5 + Math.min(fr, 0.5))) / f;
      expect(Math.abs(run({ blocks: [{ id: 'w', type: 'WaveformGen', params: { type: 'Square', amp: 1, freq: f, offset: 1, phase: 0 } }, { id: 'x', type: 'Integrator' }], wires: ['w.out -> x.in'] }, s, 1.3785, m) - want)).toBeLessThanOrEqual(TOL);
    }, 120_000);
  }
});
