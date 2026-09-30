import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';
import { blockEquations } from './vlabEquations';

describe('viennaPwmModel', () => {
  it('allocates one branch for each Vienna Rectifier output', () => {
    const node: Node = { id: 'pwm', type: 'pwm_vienna', position: { x: 0, y: 0 }, data: { blockId: 'pwm_vienna' } };
    const names = new DAEAssembler().assemble([node], []).variableNames;
    expect(names.filter(name => name.startsWith('pwm_branch_'))).toEqual([
      'pwm_branch_ga', 'pwm_branch_gb', 'pwm_branch_gc',
      'pwm_branch_ma', 'pwm_branch_mb', 'pwm_branch_mc'
    ]);
  });
});

describe('viennaPwmModel equations', () => {
  const evaluate = (
    time: number,
    across = [230, -115, -115, 10, -5, -5, 800, 0],
    params = { f_sw: 10000, vdc_ref: 800, kp_v: 0.1, neutral_balance_gain: 0.1 }
  ) => blockEquations.pwm_vienna({
    across, dAcross: [], branch: [0, 0, 0, 0, 0, 0], dBranch: [], state: [], dState: [], params,
    ctx: { time, dt: 1e-5, parameters: {}, prevStates: [], states: [], stateDerivatives: [] },
    ports: ['va', 'vb', 'vc', 'ia', 'ib', 'ic', 'vdc', 'vneut', 'ga', 'gb', 'gc', 'ma', 'mb', 'mc'], nodeId: 'pwm'
  });

  it('returns six residuals with binary gates in {0, 1} and modulation values in [-1, 1]', () => {
    const r = evaluate(0.00005);
    expect(r).toHaveLength(6);
    const gates = r.slice(0, 3).map(value => -value);
    expect(gates.every(value => value === 0 || value === 1)).toBe(true);
    const mods = r.slice(3, 6).map(value => -value);
    expect(mods.every(value => value >= -1 && value <= 1)).toBe(true);
  });

  it('keeps zero AC inputs with zero modulation index and binary gate outputs', () => {
    const r = evaluate(0.000025, [0, 0, 0, 0, 0, 0, 800, 0]);
    expect(r[3]).toBeCloseTo(0);
    expect(r[4]).toBeCloseTo(0);
    expect(r[5]).toBeCloseTo(0);
    const gates = r.slice(0, 3).map(value => -value);
    expect(gates.every(g => g === 0 || g === 1)).toBe(true);
  });

  it('produces distinct phase-shifted modulation values for balanced 3-phase voltages', () => {
    const r = evaluate(0.0001, [325, -162.5, -162.5, 10, -5, -5, 800, 0]);
    expect(r[3]).not.toEqual(r[4]);
    expect(r[3]).not.toEqual(r[5]);
  });

  it('alters switching pulse transitions when f_sw changes', () => {
    const t = 0.00004;
    // With across=[320, -160, -160, 0, 0, 0, 800, 0], ma = 2*320/800 = 0.8, duty = 1 - 0.8 = 0.2
    // At t = 0.00004:
    // f_sw = 10000 -> phase 0.4 -> carrier 2*|0.4 - 0.5| = 0.2 -> carrier < duty is false -> g = 0
    // f_sw = 15000 -> phase 0.6 -> carrier 2*|0.6 - 0.5| = 0.2 -> carrier < duty is false -> g = 0
    // f_sw = 25000 -> phase (1.0) = 0 -> carrier 1.0 -> g = 0
    // f_sw = 12500 -> phase 0.5 -> carrier 2*|0.5 - 0.5| = 0.0 -> carrier (0.0) < duty (0.2) -> g = 1
    const rCarrierLow = evaluate(t, [320, -160, -160, 0, 0, 0, 800, 0], { f_sw: 12500, vdc_ref: 800, kp_v: 0.1, neutral_balance_gain: 0.1 });
    const rCarrierHigh = evaluate(t, [320, -160, -160, 0, 0, 0, 800, 0], { f_sw: 10000, vdc_ref: 800, kp_v: 0.1, neutral_balance_gain: 0.1 });
    expect(rCarrierLow[0]).not.toEqual(rCarrierHigh[0]);
  });

  it('responds to neutral-point unbalance vneut', () => {
    const rPosNeut = evaluate(0.0001, [230, -115, -115, 10, -5, -5, 800, 50]);
    const rNegNeut = evaluate(0.0001, [230, -115, -115, 10, -5, -5, 800, -50]);
    expect(rPosNeut[3]).not.toEqual(rNegNeut[3]);
  });

  it('responds to DC voltage regulation error', () => {
    const rLowVdc = evaluate(0.0001, [230, -115, -115, 10, -5, -5, 600, 0], { f_sw: 10000, vdc_ref: 800, kp_v: 0.5, neutral_balance_gain: 0.1 });
    const rHighVdc = evaluate(0.0001, [230, -115, -115, 10, -5, -5, 900, 0], { f_sw: 10000, vdc_ref: 800, kp_v: 0.5, neutral_balance_gain: 0.1 });
    expect(rLowVdc[3]).not.toEqual(rHighVdc[3]);
  });
});
