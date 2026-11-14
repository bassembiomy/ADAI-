import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import {
  buildXBControlProgram,
  evaluateXBControlProgram,
  isXBControlKernelType,
  planXBControlProgramC,
  xbControlKernelTypes,
} from './xbControlKernels';

/*
 * The discrete control kernels are the reference semantics of the embedded inverter-control blocks.
 * They must reproduce the host engine's block implementations (BlockDefinitions.ts) step for step, so a
 * model simulated in the host and a model generated to C behave the same.
 */

type Scenario = {
  readonly type: string;
  readonly params: Record<string, unknown>;
  readonly dt: number;
  /** First call time as a multiple of dt (the host seeds lastTime with 0 or with the first call). */
  readonly firstStep: number;
  readonly steps: number;
  readonly inputs: (k: number) => number[];
};

const wave = (k: number, scale: number, phase = 0): number => scale * Math.sin((0.37 * k) + phase);

const SCENARIOS: readonly Scenario[] = [
  { type: 'SECTOR_SELECTOR', params: {}, dt: 1e-4, firstStep: 0, steps: 40, inputs: (k) => [wave(k, 7, 0.3)] },
  { type: 'SVPWM_CORE', params: { Ts: 0.0002, Vdc: 48 }, dt: 1e-4, firstStep: 0, steps: 60, inputs: (k) => [wave(k, 30), wave(k, 25, 1.1)] },
  { type: 'SWITCHING_TIME_CALCULATOR', params: {}, dt: 1e-4, firstStep: 0, steps: 40, inputs: (k) => [20 + wave(k, 5), 0.5 + 0.4 * Math.sin(0.2 * k), 48, 0.0002] },
  { type: 'SVPWM_GATE_GENERATOR', params: { Ts: 0.0004 }, dt: 5e-5, firstStep: 0, steps: 80, inputs: (k) => [1 + (k % 6), 0.00012, 0.00009, 0.00007] },
  { type: 'SVPWM_MODULATOR', params: { Ts: 0.0004, Vdc: 48 }, dt: 2.5e-5, firstStep: 0, steps: 120, inputs: (k) => [wave(k, 20), wave(k, 22, 2)] },
  { type: 'ZERO_SEQUENCE_INJECTION', params: {}, dt: 1e-4, firstStep: 0, steps: 30, inputs: (k) => [wave(k, 1), wave(k, 1, 2.1), wave(k, 1, 4.2)] },
  { type: 'PWM_GENERATOR', params: { frequency: 3700, carrierType: 'triangle' }, dt: 1e-4, firstStep: 0, steps: 60, inputs: (k) => [0.5 + 0.6 * Math.sin(0.11 * k)] },
  { type: 'PWM_GENERATOR', params: { frequency: 3700, carrierType: 'sawtooth' }, dt: 1e-4, firstStep: 0, steps: 40, inputs: (k) => [0.5 + 0.6 * Math.sin(0.11 * k)] },
  { type: 'PWM_GENERATOR', params: { frequency: 3700, carrierType: 'inv_sawtooth' }, dt: 1e-4, firstStep: 0, steps: 40, inputs: (k) => [0.5 + 0.6 * Math.sin(0.11 * k)] },
  { type: 'PWM_GENERATOR', params: { frequency: 3700, carrierType: 'sine' }, dt: 1e-4, firstStep: 0, steps: 40, inputs: (k) => [0.5 + 0.6 * Math.sin(0.11 * k)] },
  { type: 'PWM_GENERATOR', params: { frequency: 3700, carrierType: 'square' }, dt: 1e-4, firstStep: 0, steps: 40, inputs: (k) => [0.5 + 0.6 * Math.sin(0.11 * k)] },
  // dt * frequency is an integer: the host advances the carrier by the golden-ratio step. The step is a
  // power of two so that the host's `time - lastTime` is exact (with an inexact step the host's own
  // float error in that difference decides between the golden-ratio step and a ~zero advance).
  { type: 'PWM_GENERATOR', params: { frequency: 4096, carrierType: 'triangle' }, dt: 1 / 4096, firstStep: 0, steps: 40, inputs: (k) => [0.5 + 0.4 * Math.sin(0.3 * k)] },
  { type: 'THREE_PHASE_PWM', params: { frequency: 4100, method: 'SPWM' }, dt: 1e-4, firstStep: 0, steps: 60, inputs: (k) => [wave(k, 0.9), wave(k, 0.9, 2.1), wave(k, 0.9, 4.2)] },
  { type: 'THREE_PHASE_PWM', params: { frequency: 4100, method: 'SVPWM' }, dt: 1e-4, firstStep: 0, steps: 60, inputs: (k) => [wave(k, 0.9), wave(k, 0.9, 2.1), wave(k, 0.9, 4.2)] },
  { type: 'CURRENT_CONTROLLER_DQ', params: { Kp_d: 2, Ki_d: 300, Kp_q: 2.5, Ki_q: 350, iMax: 8 }, dt: 1e-4, firstStep: 1, steps: 80, inputs: (k) => [wave(k, 6), wave(k, 9, 1), wave(k, 2, 2), wave(k, 3, 3)] },
  { type: 'SPEED_CONTROLLER', params: { Kp: 0.8, Ki: 40, maxIq: 6 }, dt: 1e-3, firstStep: 1, steps: 80, inputs: (k) => [300 + wave(k, 60), 280 + wave(k, 20, 1)] },
  { type: 'FIELD_ORIENTED_CONTROL', params: { Kp: 3, Ki: 500 }, dt: 1e-4, firstStep: 1, steps: 80, inputs: (k) => [wave(k, 1), 4 + wave(k, 2, 1), wave(k, 5, 2), wave(k, 5, 4), 0.2 * k] },
  { type: 'FLUX_REFERENCE', params: { mode: 'constant', value: -2.5 }, dt: 1e-3, firstStep: 0, steps: 5, inputs: () => [] },
  { type: 'FIELD_WEAKENING', params: { v_max: 30, Kp: 0.2, Ki: 40, id_min: -6, id_max: 1 }, dt: 1e-3, firstStep: 1, steps: 120, inputs: (k) => [30 + (k < 40 ? 0 : 12) - (k > 90 ? 20 : 0) + wave(k, 2), 0] },
  { type: 'MTPA_CONTROLLER', params: { psi_m: 0.08 }, dt: 1e-3, firstStep: 0, steps: 20, inputs: (k) => [wave(k, 3)] },
  { type: 'VOLTAGE_REFERENCE_GENERATOR', params: { amplitude: 0.8 }, dt: 1e-4, firstStep: 0, steps: 50, inputs: (k) => [50 + k] },
  { type: 'ROTOR_POSITION_ESTIMATOR', params: { method: 'Hall_sensor', P: 2 }, dt: 1e-3, firstStep: 1, steps: 60, inputs: (k) => [0, 0, 0, wave(k, 10), wave(k, 10, 2.1), wave(k, 10, 4.2)] },
  { type: 'ROTOR_POSITION_ESTIMATOR', params: { method: 'Sensorless_SMO', Rs: 0.4, Ls: 0.006, P: 4 }, dt: 1e-3, firstStep: 1, steps: 80, inputs: (k) => [wave(k, 3), wave(k, 3, 2.1), wave(k, 3, 4.2), wave(k, 12, 1.4), wave(k, 12, 3.5), wave(k, 12, 5.6)] },
  { type: 'IM_SCALAR_CONTROL', params: { v_f_ratio: 3, boost: 6 }, dt: 1e-3, firstStep: 0, steps: 40, inputs: (k) => [Math.min(314, 10 * k) * (k > 30 ? -1 : 1)] },
  { type: 'VF_SLIP_COMP', params: { v_f_ratio: 3, rated_slip: 0.04, rated_iq: 8 }, dt: 1e-3, firstStep: 0, steps: 40, inputs: (k) => [Math.min(300, 9 * k), wave(k, 6)] },
];

describe('control kernels follow the host block implementations', () => {
  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => undefined); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('covers every kernel type', () => {
    const covered = new Set(SCENARIOS.map((scenario) => scenario.type));
    expect([...covered].sort()).toEqual([...xbControlKernelTypes()].sort());
  });

  it.each(SCENARIOS.map((scenario, index) => [`${scenario.type} #${index}`, scenario] as const))('%s', (_label, scenario) => {
    expect(isXBControlKernelType(scenario.type)).toBe(true);
    const host = BLOCK_LIBRARY[scenario.type]('b', scenario.params);
    const program = buildXBControlProgram(scenario.type, scenario.params, scenario.dt);
    const inputIds = host.inputs.map((port: { id: string }) => port.id);
    const outputIds = host.outputs.map((port: { id: string }) => port.id);
    let hostState: Record<string, number> = host.state ? { ...host.state } : {};
    let kernelState: Record<string, number> = Object.fromEntries(program.stateRoles.map((role) => [role, 0]));
    for (let k = 0; k < scenario.steps; k += 1) {
      const time = (k + scenario.firstStep) * scenario.dt;
      const inputValues = scenario.inputs(k);
      const hostResult = host.execute(inputValues, host.params, hostState, time);
      if (hostResult.nextState !== undefined) hostState = hostResult.nextState as Record<string, number>;
      const kernelResult = evaluateXBControlProgram(
        program,
        Object.fromEntries(inputIds.map((id: string, index: number) => [id, inputValues[index] ?? 0])),
        kernelState,
        time,
      );
      kernelState = { ...kernelResult.nextState };
      outputIds.forEach((id: string, index: number) => {
        const expected = Number(hostResult.outputs[index]);
        const actual = kernelResult.outputs[id];
        const tolerance = 1e-9 * Math.max(1, Math.abs(expected));
        expect(Math.abs(actual - expected), `${scenario.type} step ${k} output ${id}: kernel ${actual} host ${expected}`)
          .toBeLessThanOrEqual(tolerance);
      });
    }
  });

  it('prints only the locals a result depends on, fully parenthesised', () => {
    const program = buildXBControlProgram('SPEED_CONTROLLER', { Kp: 1, Ki: 2, maxIq: 3 }, 0.001);
    const plan = planXBControlProgramC(program, 'nextState', (name) => `k_${name}`);
    expect(plan.usedInputs).toEqual(['speed_ref', 'speed_actual']);
    expect(plan.usedState).toEqual(['integral']);
    expect(plan.locals.map((local) => local.name)).toEqual(['err', 'nextIntegral']);
    expect(plan.values).toEqual(['k_nextIntegral']);
    const outputs = planXBControlProgramC(program, 'outputs', (name) => `k_${name}`);
    expect(outputs.values[0]).toBe('fmax((-3.0), fmin(3.0, ((1.0 * k_err) + (2.0 * k_nextIntegral))))');
  });
});
