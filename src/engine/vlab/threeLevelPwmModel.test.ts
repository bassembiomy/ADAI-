import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';
import { blockEquations } from './vlabEquations';

// WP-12b: vabc is the width-3 reference vector m_abc in [-1, 1] (unit Vdc/2); the equation reads every port by id.
describe('threeLevelPwmModel', () => {
  const PARAMS = { f_sw: 2000, neutral_balance_gain: 0.1 };
  const evaluate = (time: number, vabc: number[] = [0.8, -0.4, 0.1], vdc = 100, vneut = 0, params: Record<string, number> = PARAMS) => blockEquations.pwm_3ph_3level({
    across: [vabc, vdc, vneut], dAcross: [[0, 0, 0], 0, 0], branch: [0, 0, 0, 0, 0, 0], dBranch: [], state: [], dState: [], params,
    ctx: { time, dt: 1e-5, parameters: {}, prevStates: [], states: [], stateDerivatives: [] },
    ports: ['vabc', 'vdc', 'vneut', 'ga', 'gb', 'gc', 'ma', 'mb', 'mc'], nodeId: 'pwm'
  });

  it('allocates one branch for each three-level output', () => {
    const node: Node = { id: 'pwm', type: 'pwm_3ph_3level', position: { x: 0, y: 0 }, data: { blockId: 'pwm_3ph_3level' } };
    const names = new DAEAssembler().assemble([node], []).variableNames;
    expect(names.filter(name => name.startsWith('pwm_branch_'))).toEqual([
      'pwm_branch_ga', 'pwm_branch_gb', 'pwm_branch_gc',
      'pwm_branch_ma', 'pwm_branch_mb', 'pwm_branch_mc'
    ]);
  });

  it('keeps a zero reference vector as zero modulation', () => {
    const r = evaluate(0, [0, 0, 0]);
    expect(r[3]).toBeCloseTo(0);
    expect(r[4]).toBeCloseTo(0);
    expect(r[5]).toBeCloseTo(0);
  });

  it('returns six residuals with three-level gates and modulation values', () => {
    const r = evaluate(0.0001);
    expect(r).toHaveLength(6);
    const gates = r.slice(0, 3).map(value => -value);
    expect(gates.every(value => [-1, 0, 1].includes(value))).toBe(true);
    expect(r.slice(3).map(v => -v)).toEqual([0.8, -0.4, 0.1]); // ma, mb, mc echo the (clamped) references
  });

  it('uses f_sw and neutral inputs', () => {
    expect(evaluate(0.00013, [0.8, -0.4, 0.1], 100, 0, { f_sw: 1000, neutral_balance_gain: 0.1 }))
      .not.toEqual(evaluate(0.00013, [0.8, -0.4, 0.1], 100, 0, { f_sw: 4000, neutral_balance_gain: 0.1 }));
    // carrier c_u = 0.3 at t = 0.15 / f_sw: the neutral offset +-0.1 moves the reference across it (0.4 >= c_u > 0.2)
    expect(evaluate(0.15 / 2000, [0.3, 0.3, 0.3], 100, 100)).not.toEqual(evaluate(0.15 / 2000, [0.3, 0.3, 0.3], 100, -100));
  });

  it('phase-disposition PWM: the carrier average of the level g equals the reference for every |m| <= 1 (P(c_u <= r) = r)', () => {
    const N = 4000, fSw = 2000;
    for (const m of [0, 0.25, 0.5, 0.8, 1, -0.3, -0.9, -1]) {
      let sum = 0;
      for (let k = 0; k < N; k++) sum += -evaluate((k + 0.5) / (N * fSw), [m, m, m], 100, 0, { f_sw: fSw, neutral_balance_gain: 0 })[0];
      expect(Math.abs(sum / N - m), `m = ${m}`).toBeLessThan(2e-3);
    }
  });

  it('references beyond +-1 saturate (the level stays +-1), never extrapolate', () => {
    for (let k = 0; k < 20; k++) {
      const g = evaluate(k * 1e-5 * 2.3, [1.7, -2, 0], 100, 0, { f_sw: 2000, neutral_balance_gain: 0 }).slice(0, 3).map(v => -v);
      expect(g[0]).toBe(1);
      expect(g[1]).toBe(-1);
    }
  });
});
