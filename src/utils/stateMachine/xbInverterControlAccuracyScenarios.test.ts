import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import { buildXBControlProgram, evaluateXBControlProgram } from './xbControlKernels';

/*
 * Host-versus-kernel scenarios for the accuracy behaviour that the original scenarios do not exercise: the
 * optional vMax limit with anti-windup recovery, zero-valued gains, and phase-continuous references whose first
 * call is not at t = 0. Same step-by-step comparison as xbInverterControlKernels.test.ts.
 */

type Scenario = {
  readonly type: string;
  readonly params: Record<string, unknown>;
  readonly dt: number;
  readonly firstStep: number;
  readonly steps: number;
  readonly inputs: (k: number) => number[];
};

const wave = (k: number, scale: number, phase = 0): number => scale * Math.sin((0.37 * k) + phase);

const SCENARIOS: readonly Scenario[] = [
  // Saturation of the d/q outputs at +-vMax, then the error reverses and the loops recover.
  { type: 'CURRENT_CONTROLLER_DQ', params: { Kp_d: 2, Ki_d: 300, Kp_q: 2.5, Ki_q: 350, iMax: 10, vMax: 12 }, dt: 1e-4, firstStep: 1, steps: 200,
    inputs: (k) => [wave(k, 2), (k < 120 ? 9 : -9) + wave(k, 1, 1), wave(k, 2, 2), k < 120 ? wave(k, 1, 3) : 4 + wave(k, 1, 3)] },
  { type: 'FIELD_ORIENTED_CONTROL', params: { Kp: 3, Ki: 500, vMax: 20 }, dt: 1e-4, firstStep: 1, steps: 200,
    inputs: (k) => [wave(k, 1), (k < 120 ? 9 : -9) + wave(k, 1, 1), wave(k, 5, 2), wave(k, 5, 4), 0.2 * k] },
  // A limit of zero clamps the axis outputs to zero (an explicit zero is honoured).
  { type: 'CURRENT_CONTROLLER_DQ', params: { Kp_d: 1, Ki_d: 50, Kp_q: 1, Ki_q: 50, iMax: 10, vMax: 0 }, dt: 1e-4, firstStep: 1, steps: 40,
    inputs: (k) => [wave(k, 1), 3 + wave(k, 1, 1), 0, 0] },
  // Zero integral gain: the speed controller is proportional and its integrator never accumulates.
  { type: 'SPEED_CONTROLLER', params: { Kp: 0.02, Ki: 0, maxIq: 6 }, dt: 1e-3, firstStep: 1, steps: 60,
    inputs: (k) => [100 + wave(k, 80), 60 + wave(k, 20, 1)] },
  // Zero proportional gain with a nonzero integral gain.
  { type: 'SPEED_CONTROLLER', params: { Kp: 0, Ki: 4, maxIq: 6 }, dt: 1e-3, firstStep: 1, steps: 60,
    inputs: (k) => [100 + wave(k, 80), 60 + wave(k, 20, 1)] },
  // Electrical angle seeded from absolute time when the first call is not at t = 0.
  { type: 'VOLTAGE_REFERENCE_GENERATOR', params: { amplitude: 0.8 }, dt: 1e-4, firstStep: 37, steps: 60, inputs: (k) => [30 + k] },
  { type: 'IM_SCALAR_CONTROL', params: { v_f_ratio: 3, boost: 6 }, dt: 1e-3, firstStep: 12, steps: 60,
    inputs: (k) => [k < 30 ? 60 : 200 - 3 * k] },
  { type: 'VF_SLIP_COMP', params: { v_f_ratio: 3, rated_slip: 0.04, rated_iq: 8 }, dt: 1e-3, firstStep: 9, steps: 60,
    inputs: (k) => [k < 30 ? 100 : 180, wave(k, 6)] },
];

describe('host and kernel agree on the accuracy scenarios', () => {
  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => undefined); });
  afterEach(() => { vi.restoreAllMocks(); });

  it.each(SCENARIOS.map((scenario, index) => [`${scenario.type} #${index}`, scenario] as const))('%s', (_label, scenario) => {
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
});
