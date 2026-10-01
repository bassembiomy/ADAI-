import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';
import { blockEquations } from './vlabEquations';

describe('threeLevelPwmModel', () => {
  const evaluate = (time: number, across = [0.8, 100, 0], params = { f_sw: 2000, output_frequency_hz: 50, neutral_balance_gain: 0.1 }) => blockEquations.pwm_3ph_3level({
    across, dAcross: [0, 0, 0], branch: [0, 0, 0, 0, 0, 0], dBranch: [], state: [], dState: [], params,
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

  it('keeps zero vabc as zero modulation amplitude', () => {
    const r = evaluate(0, [0, 100, 0]);
    expect(r[3]).toBeCloseTo(0);
    expect(r[4]).toBeCloseTo(0);
    expect(r[5]).toBeCloseTo(0);
  });

  it('returns six residuals with three-level gates and modulation values', () => {
    const r = evaluate(0.0001);
    expect(r).toHaveLength(6);
    const gates = r.slice(0, 3).map(value => -value);
    expect(gates.every(value => [-1, 0, 1].includes(value))).toBe(true);
  });

  it('uses f_sw and neutral inputs', () => {
    expect(evaluate(0.00013, [0.8, 100, 0], { f_sw: 1000, output_frequency_hz: 50, neutral_balance_gain: 0.1 }))
      .not.toEqual(evaluate(0.00013, [0.8, 100, 0], { f_sw: 4000, output_frequency_hz: 50, neutral_balance_gain: 0.1 }));
    expect(evaluate(0.00013, [0.8, 100, 100])).not.toEqual(evaluate(0.00013, [0.8, 100, -100]));
  });
});
