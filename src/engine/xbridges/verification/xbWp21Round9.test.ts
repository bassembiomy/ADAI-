/**
 * WP-21 round 9 acceptance (controller), batch E9 rework 2, from the verifier's findings on rework 1:
 * 1. Events of different blocks closer than hMin are valid: two carriers at 1000 and 1001 Hz, or a duty step 0.4 us after a
 *    carrier edge, must run without errors and integrate exactly. Only a single block's own events closer than hMin may fail.
 * 2. A stop time that falls exactly on an edge keeps the whole last pulse.
 * 3. Crossing an event bracket integrates the other states: x' = 1 alongside a 20 kHz PWM gives exactly t, also near t = 1e4 s.
 * Sawtooth oracle (carrier = phase, high while frac(c) < d): S(d, c) = n d + min(x, d), c = f t.
 */
import { describe, expect, it } from 'vitest';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { liveStep } from '../liveStep';
import { buildModel, type ModelSpec } from '../testkit';

const TOL = 2e-6;
const SOLVERS = ['ode23', 'ode45', 'ode23tb'];
const S = (d: number, c: number) => { const n = Math.floor(c), x = c - n; return n * d + Math.min(x, d); };
const stateOf = (e: XbridgesEngine, id: string) => Number((e as unknown as { executionOrder: Array<{ id: string; state: unknown }> }).executionOrder.find((b) => b.id === id)!.state);
const run = (spec: ModelSpec, solver: string, T0: number, T: number, mode: 'batch' | 'live') => {
  const e = new XbridgesEngine(buildModel(spec));
  if (mode === 'batch') Solvers.runFixedStep(e, { solver, startTime: T0, stopTime: T } as never);
  else {
    (e as unknown as { options: unknown }).options = { solver, fixedStep: 0.01, startTime: T0, stopTime: T };
    e.compile(T0);
    const n = Math.round((T - T0) / 0.01);
    for (let k = 0; k < n; k++) { const tk = T0 + k * 0.01; if (!liveStep(e, solver, tk, k === n - 1 ? T - tk : 0.01)) break; }
  }
  expect(e.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual([]);
  return e;
};
const saw = (id: string, dutyId: string, f: number, out: string) => ({
  blocks: [{ id, type: 'PWM_GENERATOR', params: { frequency: f, carrierType: 'sawtooth' } }, { id: out, type: 'Integrator' }],
  wires: [`${dutyId}.out -> ${id}.duty`, `${id}.pwm -> ${out}.in`],
});

describe('near-coincident events of different blocks', () => {
  for (const s of SOLVERS) for (const m of ['batch', 'live'] as const) {
    it(`sawtooth 1000 Hz + 1001 Hz, duty 0.3, ${s} ${m}: 0.3 each over 1 s`, () => {
      const a = saw('p1', 'c', 1000, 'x'), b = saw('p2', 'c', 1001, 'y');
      const e = run({ blocks: [{ id: 'c', type: 'Constant', params: { value: 0.3 } }, ...a.blocks, ...b.blocks], wires: [...a.wires, ...b.wires] }, s, 0, 1, m);
      expect(Math.abs(stateOf(e, 'x') - 0.3)).toBeLessThanOrEqual(TOL);
      expect(Math.abs(stateOf(e, 'y') - 0.3)).toBeLessThanOrEqual(TOL);
    }, 120_000);
    it(`duty steps 0.3 -> 0.7 at 0.5000004 s, 0.4 us after a 1 kHz sawtooth edge, ${s} ${m}`, () => {
      const ts = 0.5000004, f = 1000, a = saw('p', 'st', f, 'x');
      const e = run({ blocks: [{ id: 'st', type: 'Step', params: { stepTime: ts, initialValue: 0.3, finalValue: 0.7 } }, ...a.blocks], wires: a.wires }, s, 0, 1, m);
      expect(Math.abs(stateOf(e, 'x') - (S(0.3, f * ts) + S(0.7, f) - S(0.7, f * ts)) / f)).toBeLessThanOrEqual(TOL);
    }, 120_000);
  }
});

describe('stop time exactly on a sawtooth duty edge keeps the whole last pulse', () => {
  for (const [d, T] of [[0.3, 1.0003], [0.3, 0.5003], [0.5, 1.0005]] as const) for (const s of SOLVERS) for (const m of ['batch', 'live'] as const) {
    it(`duty ${d}, T ${T}, ${s} ${m}`, () => {
      const a = saw('p', 'c', 1000, 'x');
      const e = run({ blocks: [{ id: 'c', type: 'Constant', params: { value: d } }, ...a.blocks], wires: a.wires }, s, 0, T, m);
      expect(Math.abs(stateOf(e, 'x') - S(d, 1000 * T) / 1000)).toBeLessThanOrEqual(TOL);
    }, 120_000);
  }
});

describe('crossing an event bracket integrates every state', () => {
  const spec = (f: number): ModelSpec => {
    const a = saw('p', 'c', f, 'x');
    return { blocks: [{ id: 'c', type: 'Constant', params: { value: 0.3 } }, { id: 'k', type: 'Constant', params: { value: 1 } }, { id: 'y', type: 'Integrator' }, ...a.blocks], wires: ['k.out -> y.in', ...a.wires] };
  };
  for (const s of SOLVERS) {
    it(`x' = 1 alongside a 20 kHz PWM over 1 s, ${s} batch: |y - 1| <= 1e-10`, () => {
      const e = run(spec(20_000), s, 0, 1, 'batch');
      expect(Math.abs(stateOf(e, 'y') - 1)).toBeLessThanOrEqual(1e-10);
      expect(Math.abs(stateOf(e, 'x') - 0.3)).toBeLessThanOrEqual(TOL);
    }, 120_000);
    it(`start 1e4 s, 1 kHz PWM over 0.2 s, ${s} batch: y = 0.2 within 1e-8, PWM integral 0.06 within 2e-6`, () => {
      const e = run(spec(1000), s, 1e4, 1e4 + 0.2, 'batch');
      expect(Math.abs(stateOf(e, 'y') - 0.2)).toBeLessThanOrEqual(1e-8);
      expect(Math.abs(stateOf(e, 'x') - 0.06)).toBeLessThanOrEqual(TOL);
    }, 120_000);
  }
});

describe('a single block whose own events are closer than hMin still reports', () => {
  it('sawtooth PWM at 2 MHz with minStep 1e-6, ode45 batch: STIFF_SOLVER_STEP_TOO_SMALL', () => {
    const a = saw('p', 'c', 2e6, 'x');
    const e = new XbridgesEngine(buildModel({ blocks: [{ id: 'c', type: 'Constant', params: { value: 0.3 } }, ...a.blocks], wires: a.wires }));
    Solvers.runFixedStep(e, { solver: 'ode45', startTime: 0, stopTime: 1e-3, minStep: 1e-6 } as never);
    expect(e.diagnostics.map((d) => d.code)).toContain('STIFF_SOLVER_STEP_TOO_SMALL');
  }, 120_000);
});
