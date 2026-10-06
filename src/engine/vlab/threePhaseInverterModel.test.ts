import { describe, it, expect } from 'vitest';
import { Node } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';
import { blockEquations } from './vlabEquations';

// WP-12b: the AC side is the composite three-phase port `abc` and the reference vector `vabc` has width 3. The port order of the
// library is vabc, amp, ma, mb, mc, p, n, abc; an equation reads every port by id.
const PORTS = ['vabc', 'amp', 'ma', 'mb', 'mc', 'p', 'n', 'abc'];

describe('threePhaseInverterModel', () => {
  it('allocates DC-link and phase-current branches', () => {
    const node: Node = { id: 'inv', type: 'pwm_3ph_2level', position: { x: 0, y: 0 }, data: { blockId: 'pwm_3ph_2level' } };
    const names = new DAEAssembler().assemble([node], []).variableNames;
    expect(names.filter(name => name.startsWith('inv_branch_'))).toEqual([
      'inv_branch_dc_link', 'inv_branch_current_a', 'inv_branch_current_b', 'inv_branch_current_c'
    ]);
  });

  const residuals = (
    time: number, params: Record<string, unknown>,
    { amp = 0.4, vabc = [0.4, -0.2, 0.0], ma = 0.7, mb = 0.5, mc = 0.3, dcLink = 160, connectedPorts }: { amp?: number; vabc?: number[]; ma?: number; mb?: number; mc?: number; dcLink?: number; connectedPorts?: string[] } = {},
  ) => blockEquations.pwm_3ph_2level({
    across: [vabc, amp, ma, mb, mc, dcLink, 0, [0, 0, 0]], dAcross: [[0, 0, 0], 0, 0, 0, 0, 0, 0, [0, 0, 0]],
    branch: [0, 2, -1, -1], dBranch: [0, 0, 0, 0], state: [], dState: [], params,
    ctx: { time, dt: 1e-5, parameters: {}, prevStates: [], states: [], stateDerivatives: [] },
    ports: PORTS, nodeId: 'inv', connectedPorts
  });

  it('does not mutate shared grid frequency state', () => {
    const parameters: Record<string, number> = {};
    blockEquations.pwm_3ph_2level({
      across: [[0, 0, 0], 0.8, 0, 0, 0, 100, 0, [0, 0, 0]], dAcross: [[0, 0, 0], 0, 0, 0, 0, 0, 0, [0, 0, 0]],
      branch: [0, 0, 0, 0], dBranch: [0, 0, 0, 0], state: [], dState: [],
      params: { model_mode: 'averaged', control_mode: 'sinusoidal_modulation', output_frequency_hz: 60 },
      ctx: { time: 0, dt: 1e-5, parameters, prevStates: [], states: [], stateDerivatives: [] },
      ports: PORTS, nodeId: 'inv'
    });
    expect(parameters.grid_freq).toBeUndefined();
  });

  it('legacy scalar duties (vabc unwired): d_k enters the pole voltages and the DC-link current i_dc = -sum d_k i_k (power balance)', () => {
    const r = residuals(0, { model_mode: 'averaged', control_mode: 'three_phase_modulation', output_resistance_ohm: 0.001 },
      { connectedPorts: ['ma', 'mb', 'mc', 'p', 'n', 'abc'] });
    expect(r).toHaveLength(4);
    expect(r[0]).toBeCloseTo(2 * 0.7 + -1 * 0.5 + -1 * 0.3);
    expect(r.slice(1)).toEqual([-112.002, -79.999, -47.999]);
  });

  it('an unwired scalar duty is the zero-voltage state (lower switch on): pole voltage 0, not a hidden default', () => {
    const r = residuals(0, { model_mode: 'averaged', control_mode: 'three_phase_modulation', output_resistance_ohm: 0 }, { connectedPorts: ['p', 'n', 'abc'] });
    r.slice(1).forEach(v => expect(Math.abs(v)).toBe(0)); // (v_k - v_n) - 0 * Vdc - i_k * 0
    expect(Math.abs(r[0])).toBe(0);                       // i_dc + sum 0 * i_k, with i_dc = 0
  });

  it('the width-3 reference vabc = m_abc in [-1, 1] maps to the duty d_k = (1 + m_k)/2 (fundamental pole amplitude m Vdc/2)', () => {
    const r = residuals(0, { model_mode: 'averaged', control_mode: 'three_phase_modulation', output_resistance_ohm: 0 },
      { vabc: [1, 0, -1], dcLink: 100, connectedPorts: ['vabc', 'p', 'n', 'abc'] });
    // v_k - v_n = d_k Vdc  ->  residual -(d_k Vdc) with the terminals at 0 V: d = 1, 1/2, 0
    [100, 50, 0].forEach((expected, k) => expect(-r[k + 1]).toBeCloseTo(expected, 12));
    // i_dc + sum d_k i_k = 0 + 1*2 + 0.5*(-1) + 0*(-1)
    expect(r[0]).toBeCloseTo(1.5);
    // |m| > 1 saturates at the rails, it never extrapolates
    const over = residuals(0, { model_mode: 'averaged', control_mode: 'three_phase_modulation', output_resistance_ohm: 0 },
      { vabc: [3, -3, 0], dcLink: 100, connectedPorts: ['vabc', 'p', 'n', 'abc'] });
    [100, 0, 50].forEach((expected, k) => expect(-over[k + 1]).toBeCloseTo(expected, 12));
  });

  it('repeats its sinusoidal reference after five 50 Hz cycles in 0.1 seconds', () => {
    const p = { model_mode: 'averaged', control_mode: 'sinusoidal_modulation', output_frequency_hz: 50, output_resistance_ohm: 0.001 };
    expect(residuals(0, p).slice(1)).toEqual(residuals(0.1, p).slice(1));
  });

  it('produces the 50 Hz, 120 degree waveform d_k Vdc = Vdc (1 + M sin(w t - k 120 deg))/2 (M = 0.8, Vdc = 100: 10-90 V)', () => {
    const params = { model_mode: 'averaged', control_mode: 'sinusoidal_modulation', output_frequency_hz: 50, output_resistance_ohm: 0 };
    const phaseVoltage = (time: number, index: number) => -residuals(time, params, { amp: 0.8, dcLink: 100 })[index + 1];
    const samples = Array.from({ length: 1001 }, (_, index) => phaseVoltage(index * 0.0001, 0));
    expect(Math.min(...samples)).toBeCloseTo(10, 0);
    expect(Math.max(...samples)).toBeCloseTo(90, 0);
    expect(samples.reduce((sum, value) => sum + value, 0) / samples.length).toBeCloseTo(50, 1);
    expect(phaseVoltage(0.005, 0)).toBeCloseTo(90, 5);
    expect(phaseVoltage(0.005, 1)).toBeCloseTo(50 + 40 * Math.sin(Math.PI / 2 - 2 * Math.PI / 3), 5);
    expect(phaseVoltage(0.005, 2)).toBeCloseTo(50 + 40 * Math.sin(Math.PI / 2 + 2 * Math.PI / 3), 5);
  });

  it('amplitude M comes from the amp input when wired and from the modulation_index parameter otherwise (zero is valid)', () => {
    const params = { model_mode: 'averaged', control_mode: 'sinusoidal_modulation', output_frequency_hz: 50, output_resistance_ohm: 0, modulation_index: 0.5 };
    const wired = -residuals(0.005, params, { amp: 0.8, dcLink: 100, connectedPorts: ['amp', 'p', 'n', 'abc'] })[1];
    const unwired = -residuals(0.005, params, { amp: 0.8, dcLink: 100, connectedPorts: ['p', 'n', 'abc'] })[1];
    const zero = -residuals(0.005, params, { amp: 0, dcLink: 100, connectedPorts: ['amp', 'p', 'n', 'abc'] })[1];
    expect(wired).toBeCloseTo(90, 9);
    expect(unwired).toBeCloseTo(75, 9);
    expect(zero).toBeCloseTo(50, 9);
  });

  it('uses f_sw only in switching mode', () => {
    const common = { control_mode: 'three_phase_modulation', output_resistance_ohm: 0.001 };
    expect(residuals(0.00017, { ...common, model_mode: 'averaged', f_sw: 1000 }))
      .toEqual(residuals(0.00017, { ...common, model_mode: 'averaged', f_sw: 20000 }));
    expect(residuals(0.00017, { ...common, model_mode: 'switching', f_sw: 1000 }))
      .not.toEqual(residuals(0.00017, { ...common, model_mode: 'switching', f_sw: 20000 }));
  });
});
