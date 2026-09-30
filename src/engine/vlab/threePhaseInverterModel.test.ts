import { describe, it, expect } from 'vitest';
import { Node } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';
import { blockEquations } from './vlabEquations';

describe('threePhaseInverterModel', () => {
  it('allocates DC-link and phase-current branches', () => {
    const node: Node = { id: 'inv', type: 'pwm_3ph_2level', position: { x: 0, y: 0 }, data: { blockId: 'pwm_3ph_2level' } };
    const names = new DAEAssembler().assemble([node], []).variableNames;
    expect(names.filter(name => name.startsWith('inv_branch_'))).toEqual([
      'inv_branch_dc_link', 'inv_branch_current_a', 'inv_branch_current_b', 'inv_branch_current_c'
    ]);
  });

  const residuals = (time: number, params: Record<string, unknown>, scalar = 0.4, dcLink = 160) => blockEquations.pwm_3ph_2level({
    across: [scalar, 0.7, 0.5, 0.3, dcLink, 0, 0, 0, 0], dAcross: Array(9).fill(0),
    branch: [0, 2, -1, -1], dBranch: [0, 0, 0, 0], state: [], dState: [], params,
    ctx: { time, dt: 1e-5, parameters: {}, prevStates: [], states: [], stateDerivatives: [] },
    ports: ['vabc', 'ma', 'mb', 'mc', 'p', 'n', 'a', 'b', 'c'], nodeId: 'inv'
  });

  it('does not mutate shared grid frequency state', () => {
    const parameters: Record<string, number> = {};
    blockEquations.pwm_3ph_2level({
      across: [0.8, 0, 0, 0, 100, 0, 0, 0, 0], dAcross: Array(9).fill(0),
      branch: [0, 0, 0, 0], dBranch: [0, 0, 0, 0], state: [], dState: [],
      params: { model_mode: 'averaged', control_mode: 'sinusoidal_modulation', output_frequency_hz: 60 },
      ctx: { time: 0, dt: 1e-5, parameters, prevStates: [], states: [], stateDerivatives: [] },
      ports: ['vabc', 'ma', 'mb', 'mc', 'p', 'n', 'a', 'b', 'c'], nodeId: 'inv'
    });
    expect(parameters.grid_freq).toBeUndefined();
  });

  it('uses explicit three-phase modulation and conserves DC-link power', () => {
    const r = residuals(0, { model_mode: 'averaged', control_mode: 'three_phase_modulation', output_resistance_ohm: 0.001 });
    expect(r).toHaveLength(4);
    expect(r[0]).toBeCloseTo(2 * 0.7 + -1 * 0.5 + -1 * 0.3);
    expect(r.slice(1)).toEqual([-112.002, -79.999, -47.999]);
  });

  it('repeats its legacy sinusoidal reference after five 50 Hz cycles in 0.1 seconds', () => {
    const p = { model_mode: 'averaged', control_mode: 'sinusoidal_modulation', output_frequency_hz: 50, output_resistance_ohm: 0.001 };
    expect(residuals(0, p).slice(1)).toEqual(residuals(0.1, p).slice(1));
  });

  it('produces the expected 50 Hz, 120 degree, 18-82 V waveform', () => {
    const params = { model_mode: 'averaged', control_mode: 'sinusoidal_modulation', output_frequency_hz: 50, output_resistance_ohm: 0 };
    const phaseVoltage = (time: number, index: number) => -residuals(time, params, 0.8, 100)[index + 1];
    const samples = Array.from({ length: 1001 }, (_, index) => phaseVoltage(index * 0.0001, 0));
    expect(Math.min(...samples)).toBeCloseTo(18, 0);
    expect(Math.max(...samples)).toBeCloseTo(82, 0);
    expect(samples.reduce((sum, value) => sum + value, 0) / samples.length).toBeCloseTo(50, 1);
    expect(phaseVoltage(0.005, 0)).toBeCloseTo(82, 5);
    expect(phaseVoltage(0.005, 1)).toBeCloseTo(34, 5);
    expect(phaseVoltage(0.005, 2)).toBeCloseTo(34, 5);
  });

  it('uses f_sw only in switching mode', () => {
    const common = { control_mode: 'three_phase_modulation', output_resistance_ohm: 0.001 };
    expect(residuals(0.00017, { ...common, model_mode: 'averaged', f_sw: 1000 }))
      .toEqual(residuals(0.00017, { ...common, model_mode: 'averaged', f_sw: 20000 }));
    expect(residuals(0.00017, { ...common, model_mode: 'switching', f_sw: 1000 }))
      .not.toEqual(residuals(0.00017, { ...common, model_mode: 'switching', f_sw: 20000 }));
  });
});
