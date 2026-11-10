/**
 * WP-06 — gates V2/V3/V4 for continuous, discrete & delay, discontinuity, lookup-table and bus blocks.
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md (sections 2, 3 oracles 1 and 2, 4.2).
 *
 * Oracles (written here, never taken from the code under test):
 *  - analytic dynamics: closed-form step/ramp responses of 1/(s+1), second-order systems, state space, filters;
 *  - difference equations evaluated by hand for the discrete blocks (Simulink Unit Delay, Delay, Memory,
 *    Discrete-Time Integrator, Discrete Transfer Fcn, Moving Average);
 *  - Simulink block rules for Saturation, Dead Zone, Rate Limiter, Relay, n-D Lookup Table, Prelookup,
 *    Interpolation Using Prelookup, Bus Creator and Bus Selector.
 * Dynamic cases run through the canvas loop (testkit runModel); discrete/sequential logic is also driven
 * block-level with the state threaded through execute as the engine does.
 * Failures of the product are pinned with it.fails and their finding id (docs/xbridges-verification/ledger.json).
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { buildModel, runModel, type RunResult } from '../testkit';

type B = { id: string; type: string; params?: Record<string, unknown> };

const sim = (
  blocks: B[], wires: string[], probes: string[],
  o: { solver?: string; dt?: number; stop?: number } = {},
): RunResult => runModel(buildModel({ blocks, wires }), {
  solver: o.solver ?? 'rk4', dt: o.dt ?? 0.01, stopTime: o.stop ?? 1, probes,
});
const sampleIndex = (r: RunResult, t: number) => {
  const i = r.t.findIndex((x) => Math.abs(x - t) < 1e-9);
  expect(i, `no sample at t=${t} (run has ${r.t.length} samples)`).toBeGreaterThanOrEqual(0);
  return i;
};
const valueAt = (r: RunResult, probe: string, t: number): unknown => r.signals[probe][sampleIndex(r, t)];
const num = (v: unknown): number => Number(Array.isArray(v) ? (v.flat(Infinity) as unknown[])[0] : v);
const flat = (v: unknown): number[] => (Array.isArray(v) ? (v as unknown[]).flatMap(flat) : [Number(v)]);
const errorCodes = (r: RunResult) => r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
const near = (actual: number, expected: number, tol: number, what = '') =>
  expect(Math.abs(actual - expected), `${what} got ${actual}, expected ${expected}`).toBeLessThanOrEqual(tol);
const nearAll = (actual: unknown, expected: number[], tol: number, what = '') => {
  const a = flat(actual);
  expect(a.length, `${what} shape of ${JSON.stringify(actual)}`).toBe(expected.length);
  a.forEach((x, i) => near(x, expected[i], tol, `${what}[${i}]`));
};

/** Block-level execute of one block with the state threaded through (one call per step, 0.1 s apart). */
const run = (type: string, params: Record<string, unknown>, inputs: unknown[], t = 0) => {
  const b = BLOCK_LIBRARY[type]('x', params);
  try {
    const r = b.execute(inputs as never, b.params, b.state, t);
    return { y: r.outputs, error: r.error ?? r.diagnostic?.code, threw: null as string | null };
  } catch (e) {
    return { y: [] as unknown[], error: undefined, threw: String((e as Error).message) };
  }
};
const thread = (type: string, params: Record<string, unknown>, steps: unknown[], port = 0): unknown[] => {
  const b = BLOCK_LIBRARY[type]('x', params);
  let state = b.state;
  return steps.map((u, k) => {
    const r = b.execute([u] as never, b.params, state, k * 0.1);
    if (r.nextState !== undefined) state = r.nextState;
    return r.outputs[port];
  });
};
const constant = (id: string, value: unknown): B => ({ id, type: 'Constant', params: { value } });

// ---------------------------------------------------------------------------------------------------------------
describe('A. continuous blocks (rk4, dt 0.01)', () => {
  // Oracle: y(t) = IC + 2 t  ->  y(1) = 2.5; vector IC [1 2] with u = [1 1] -> [2 3].
  for (const [type, inPort, outPort, icKey] of [
    ['Integrator', 'in', 'out', 'initialCondition'],
    ['INTEGRATOR_CONTINUOUS', 'u', 'y', 'initial_condition'],
    ['INTEGRATOR', 'u', 'y', 'initialCondition'],
  ] as const) {
    it(`${type}: integral of Constant 2 with initial condition 0.5 is 2.5 at t = 1`, () => {
      const r = sim([constant('c', 2), { id: 'i', type, params: { [icKey]: 0.5 } }], [`c.out -> i.${inPort}`], [`i.${outPort}`]);
      near(num(valueAt(r, `i.${outPort}`, 1)), 2.5, 1e-8);
      near(num(valueAt(r, `i.${outPort}`, 0)), 0.5, 1e-12, 'y(0)');
    });
  }
  for (const [type, inPort, outPort, icKey, finding] of [
    ['Integrator', 'in', 'out', 'initialCondition', null],
    ['INTEGRATOR_CONTINUOUS', 'u', 'y', 'initial_condition', 'XBV-062'],
    ['INTEGRATOR', 'u', 'y', 'initialCondition', 'XBV-063'],
  ] as const) {
    const body = () => {
      const r = sim([constant('c', '[1 1]'), { id: 'i', type, params: { [icKey]: [1, 2] } }], [`c.out -> i.${inPort}`], [`i.${outPort}`]);
      nearAll(valueAt(r, `i.${outPort}`, 1), [2, 3], 1e-8);
    };
    if (finding) it.fails(`${finding}: ${type} accepts a vector initial condition [1 2] (u = [1 1] gives [2 3] at t = 1)`, body);
    else it(`${type}: vector initial condition [1 2] with Constant [1 1] gives [2 3] at t = 1`, body);
  }

  // Oracle (Simulink Integrator, limit output): y = min(t, 0.3); after the input turns negative the state leaves the
  // limit at once (the state is limited, so there is no wind-up).
  const limited = (input: B, wires: string[]) => sim(
    [input, { id: 'i', type: 'INTEGRATOR', params: { initialCondition: 0, limitOutput: true, upperLimit: 0.3, lowerLimit: -1 } }],
    wires, ['i.y'], { stop: 1 });
  it('INTEGRATOR limits [-1, 0.3] on Constant 1: y = t below the limit and exactly 0.3 at t = 1', () => {
    const r = limited(constant('c', 1), ['c.out -> i.u']);
    near(num(valueAt(r, 'i.y', 0.2)), 0.2, 1e-8);
    expect(num(valueAt(r, 'i.y', 1))).toBe(0.3);
  });
  // Under rk4 the stages of the step that reaches the limit see a saturated derivative, so the output arrives below
  // the limit (0.29833 at t = 0.3; with limit 0.305 it sags to 0.30333 at t = 0.5). Simulink evaluates the limit mode
  // at major steps only: y = min(t, limit) at every sample.
  it.fails('XBV-069: INTEGRATOR limited at 0.3 (rk4, dt 0.01) gives y = min(t, 0.3) at every sample, including t = 0.3', () => {
    const r = limited(constant('c', 1), ['c.out -> i.u']);
    r.t.forEach((t, k) => near(num(r.signals['i.y'][k]), Math.min(t, 0.3), 1e-9, `t=${t}`));
  });
  const negatingInput: B = { id: 'c', type: 'Step', params: { stepTime: 0.5, initialValue: 1, finalValue: -1 } };
  it('INTEGRATOR limit: the output sits at the 0.3 limit until the input turns negative (y(0.5) = 0.3)', () => {
    near(num(valueAt(limited(negatingInput, ['c.out -> i.u']), 'i.y', 0.5)), 0.3, 1e-8);
  });
  // The state is limited (anti-windup): with euler, where every stage is a major step, y(0.8) = 0.3 - 0.3 = 0.
  it('INTEGRATOR limit has no wind-up (euler): Step(1 -> -1 at 0.5) gives y(0.8) = 0', () => {
    const r = sim([negatingInput, { id: 'i', type: 'INTEGRATOR', params: { initialCondition: 0, limitOutput: true, upperLimit: 0.3, lowerLimit: -1 } }],
      ['c.out -> i.u'], ['i.y'], { stop: 1, solver: 'euler' });
    near(num(valueAt(r, 'i.y', 0.8)), 0.0, 1e-8, 'y(0.8)');
  });
  // Engine defect, not a block defect: on the canvas rk4 loop the last stage of the step ending at the Step time
  // already sees the new Step value. Simulink updates a Step's output (its mode) at major steps only, so the integral
  // of Step(0 -> 1 at 0.5) is 0 at t = 0.5 and 0.5 at t = 1; the canvas loses h/3 at the step.
  it.fails('XBV-067: plain Integrator of Step(0 -> 1 at 0.5), rk4 dt 0.1: y(0.5) = 0 and y(1) = 0.5', () => {
    const r = sim([{ id: 's', type: 'Step', params: { stepTime: 0.5, initialValue: 0, finalValue: 1 } }, { id: 'i', type: 'Integrator' }],
      ['s.out -> i.in'], ['i.out'], { stop: 1, dt: 0.1 });
    near(num(valueAt(r, 'i.out', 0.5)), 0, 1e-12, 'y(0.5)');
    near(num(valueAt(r, 'i.out', 1)), 0.5, 1e-12, 'y(1)');
  });

  // Oracle: G = 1/(s+1), unit step: y = 1 - e^-t.
  const tfRun = (num_: number[], den: number[], stop: number, type = 'TRANSFER_FUNCTION', extra: Record<string, unknown> = {}) =>
    sim([constant('c', 1), { id: 'tf', type, params: { numerator: num_, denominator: den, ...extra } }], ['c.out -> tf.u'], ['tf.y'], { stop });
  it('TRANSFER_FUNCTION 1/(s+1) step response: y = 1 - e^-t at t = 0.5, 1, 2', () => {
    const r = tfRun([1], [1, 1], 2);
    for (const t of [0.5, 1, 2]) near(num(valueAt(r, 'tf.y', t)), 1 - Math.exp(-t), 1e-8, `t=${t}`);
  });
  // Oracle: wn^2/(s^2 + 2 zeta wn s + wn^2), wn = 2, unit step.
  const WN = 2;
  const second = (zeta: number, t: number): number => {
    if (zeta < 1) {
      const wd = WN * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * WN * t) * (Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t));
    }
    if (zeta === 1) return 1 - Math.exp(-WN * t) * (1 + WN * t);
    const s1 = -WN * (zeta - Math.sqrt(zeta * zeta - 1));
    const s2 = -WN * (zeta + Math.sqrt(zeta * zeta - 1));
    return 1 + (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s1 - s2);
  };
  for (const zeta of [0.5, 1, 2]) {
    it(`TRANSFER_FUNCTION second order wn = 2, zeta = ${zeta} (${zeta < 1 ? 'under' : zeta === 1 ? 'critically' : 'over'}damped) step response`, () => {
      const r = tfRun([WN * WN], [1, 2 * zeta * WN, WN * WN], 2);
      for (const t of [0.5, 1, 2]) near(num(valueAt(r, 'tf.y', t)), second(zeta, t), 1e-7, `t=${t}`);
    });
  }
  it('TRANSFER_FUNCTION non-proper [1 0 0]/[1 1]: compile error TF_IMPROPER and the run is refused', () => {
    const r = tfRun([1, 0, 0], [1, 1], 1);
    expect(errorCodes(r)).toContain('TF_IMPROPER');
    expect(r.t.length).toBe(0);
  });
  it('TRANSFER_FUNCTION (s+2)/(s+1) with direct feedthrough: step response 2 - e^-t, y(0) = 1', () => {
    const r = tfRun([1, 2], [1, 1], 2);
    near(num(valueAt(r, 'tf.y', 0)), 1, 1e-12, 'y(0)');
    for (const t of [0.5, 1, 2]) near(num(valueAt(r, 'tf.y', t)), 2 - Math.exp(-t), 1e-8, `t=${t}`);
  });
  // Oracle: 1/(s^2 + 3 s + 2) step = 1/2 - e^-t + e^-2t / 2.
  const ssBlock = (over: Record<string, unknown> = {}): B => ({
    id: 'ss', type: 'STATE_SPACE', params: { A: [[0, 1], [-2, -3]], B: [[0], [1]], C: [[1, 0]], D: [[0]], ...over } });
  it('STATE_SPACE A = [[0 1] [-2 -3]], B = [0 1]^T, C = [1 0], D = 0: step response 1/2 - e^-t + e^-2t/2', () => {
    const r = sim([constant('c', 1), ssBlock()], ['c.out -> ss.u'], ['ss.y'], { stop: 2 });
    for (const t of [0.5, 1, 2]) near(num(valueAt(r, 'ss.y', t)), 0.5 - Math.exp(-t) + 0.5 * Math.exp(-2 * t), 1e-8, `t=${t}`);
  });
  it('STATE_SPACE with A 2x2 and B 3x1: compile error STATE_SPACE_DIMENSION_MISMATCH', () => {
    const r = sim([constant('c', 1), ssBlock({ B: [[0], [1], [1]] })], ['c.out -> ss.u'], ['ss.y']);
    expect(errorCodes(r)).toContain('STATE_SPACE_DIMENSION_MISMATCH');
    expect(r.t.length).toBe(0);
  });
  it('ZERO_POLE_GAIN zero -2, pole -1, gain 1 behaves like (s+2)/(s+1): y = 2 - e^-t, y(0) = 1', () => {
    const r = sim([constant('c', 1), { id: 'z', type: 'ZERO_POLE_GAIN', params: { zeros: [-2], poles: [-1], gain: 1 } }],
      ['c.out -> z.u'], ['z.y'], { stop: 2 });
    near(num(valueAt(r, 'z.y', 0)), 1, 1e-12, 'y(0)');
    for (const t of [0.5, 1, 2]) near(num(valueAt(r, 'z.y', t)), 2 - Math.exp(-t), 1e-8, `t=${t}`);
  });

  // Oracle: ideal derivative of a unit ramp is 1; the block is a filtered derivative s/(tau s + 1).
  it('DERIVATIVE of a ramp (Integrator of 1), tau 0.01: |y(0.5) - 1| < 1e-6', () => {
    const r = sim([constant('c', 1), { id: 'i', type: 'Integrator' }, { id: 'd', type: 'DERIVATIVE', params: { tau: 0.01 } }],
      ['c.out -> i.in', 'i.out -> d.u'], ['d.y'], { stop: 0.5 });
    near(num(valueAt(r, 'd.y', 0.5)), 1, 1e-6);
  });
  // Simulink Derivative of a step: a one-step spike then 0. The filtered derivative must show a spike (its height
  // depends on when the stage sees the step, see XBV-067) and must return to 0 (it does not stay non-zero).
  it('DERIVATIVE of Step(0.5), tau = dt = 0.01: spike at the step, back to 0 afterwards', () => {
    const r = sim([{ id: 's', type: 'Step', params: { stepTime: 0.5, initialValue: 0, finalValue: 1 } },
      { id: 'd', type: 'DERIVATIVE', params: { tau: 0.01 } }], ['s.out -> d.u'], ['d.y'], { stop: 1 });
    near(num(valueAt(r, 'd.y', 0.49)), 0, 1e-12, 'before the step');
    expect(num(valueAt(r, 'd.y', 0.5)), 'spike').toBeGreaterThan(10);
    near(num(valueAt(r, 'd.y', 1)), 0, 1e-6, 'after the spike');
  });

  // Oracle: first-order low pass 1/(tau s + 1) and high pass tau s/(tau s + 1), tau = 1/(2 pi fc).
  const TAU = 1 / (2 * Math.PI * 10);
  const filterRun = (type: string, stop: number) => sim([constant('c', 1), { id: 'f', type, params: { fc: 10 } }],
    ['c.out -> f.u'], ['f.y'], { dt: TAU / 64, stop });
  it('LOW_PASS_FILTER fc = 10 Hz: step response 1 - e^(-t/tau) at t = tau and 3 tau', () => {
    const r = filterRun('LOW_PASS_FILTER', 3 * TAU);
    near(num(valueAt(r, 'f.y', TAU)), 1 - Math.exp(-1), 1e-8, 't=tau');
    near(num(valueAt(r, 'f.y', 3 * TAU)), 1 - Math.exp(-3), 1e-8, 't=3 tau');
  });
  it('HIGH_PASS_FILTER fc = 10 Hz: step response e^(-t/tau) at t = 0, tau and 3 tau', () => {
    const r = filterRun('HIGH_PASS_FILTER', 3 * TAU);
    near(num(valueAt(r, 'f.y', 0)), 1, 1e-12, 't=0');
    near(num(valueAt(r, 'f.y', TAU)), Math.exp(-1), 1e-8, 't=tau');
    near(num(valueAt(r, 'f.y', 3 * TAU)), Math.exp(-3), 1e-8, 't=3 tau');
  });
  it('filters, constant input after 10 tau: DC gain 1 (low pass) and 0 (high pass)', () => {
    const lp = filterRun('LOW_PASS_FILTER', 10 * TAU);
    near(num(valueAt(lp, 'f.y', 10 * TAU)), 1 - Math.exp(-10), 1e-8, 'low pass');
    near(num(valueAt(lp, 'f.y', 10 * TAU)), 1, 1e-4, 'low pass DC gain');
    const hp = filterRun('HIGH_PASS_FILTER', 10 * TAU);
    near(num(valueAt(hp, 'f.y', 10 * TAU)), Math.exp(-10), 1e-8, 'high pass');
    near(num(valueAt(hp, 'f.y', 10 * TAU)), 0, 1e-4, 'high pass DC gain');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('B. discrete and delay blocks', () => {
  // Oracle: Simulink Unit Delay y(k) = u(k-1), y(0) = IC. Ramp u(k) = k from Integrator(10) (exact in rk4).
  it('UNIT_DELAY Ts 0.1, IC 5, ramp k (rk4 dt 0.1): y = 5, 0, 1, 2, 3', () => {
    const r = sim([constant('c', 10), { id: 'i', type: 'Integrator' }, { id: 'd', type: 'UNIT_DELAY', params: { sampleTime: 0.1, initialCondition: 5 } }],
      ['c.out -> i.in', 'i.out -> d.u'], ['d.y'], { dt: 0.1, stop: 0.4 });
    [5, 0, 1, 2, 3].forEach((e, k) => near(num(valueAt(r, 'd.y', k * 0.1)), e, 1e-9, `k=${k}`));
  });
  it('UNIT_DELAY block-level: y = IC then the previous input', () => {
    nearAll(thread('UNIT_DELAY', { sampleTime: 0.1, initialCondition: 5 }, [0, 1, 2, 3, 4]), [5, 0, 1, 2, 3], 0);
  });

  // Oracle: Simulink Delay, length N: y(k) = IC for k < N, then u(k-N).
  it('DELAY length 3, IC -1: y = -1, -1, -1, u0, u1, u2', () => {
    nearAll(thread('DELAY', { delay_length: 3, initial_condition: -1, sampleTime: 0.1 }, [1, 2, 3, 4, 5, 6]), [-1, -1, -1, 1, 2, 3], 0);
  });
  it('DELAY length 1 equals a Unit Delay', () => {
    nearAll(thread('DELAY', { delay_length: 1, initial_condition: 7, sampleTime: 0.1 }, [1, 2, 3]), [7, 1, 2], 0);
  });
  for (const bad of [2.5, -1]) {
    it(`DELAY length ${bad}: compile error DELAY_LENGTH_INVALID`, () => {
      const r = sim([constant('c', 1), { id: 'd', type: 'DELAY', params: { delay_length: bad, sampleTime: 0.1 } }],
        ['c.out -> d.u'], ['d.y'], { solver: 'discrete', dt: 0.1, stop: 0.3 });
      expect(errorCodes(r)).toContain('DELAY_LENGTH_INVALID');
    });
  }
  // Simulink Delay allows a delay length of 0 (the block is then direct feedthrough: y = u).
  it.fails('XBV-064: DELAY length 0 is accepted and behaves as direct feedthrough (y = u)', () => {
    const r = sim([constant('c', 4), { id: 'd', type: 'DELAY', params: { delay_length: 0, initial_condition: -1, sampleTime: 0.1 } }],
      ['c.out -> d.u'], ['d.y'], { solver: 'discrete', dt: 0.1, stop: 0.3 });
    expect(errorCodes(r)).not.toContain('DELAY_LENGTH_INVALID');
    near(num(valueAt(r, 'd.y', 0)), 4, 1e-12, 'y(0)');
  });

  // Oracle: Simulink Memory returns the input of the previous major step; y(0) = IC.
  it('MEMORY IC 7, ramp t (rk4 dt 0.1): y(t_k) = t_(k-1), y(0) = IC', () => {
    const r = sim([constant('c', 1), { id: 'i', type: 'Integrator' }, { id: 'm', type: 'MEMORY', params: { initialCondition: 7 } }],
      ['c.out -> i.in', 'i.out -> m.u'], ['m.y'], { dt: 0.1, stop: 0.5 });
    near(num(valueAt(r, 'm.y', 0)), 7, 1e-12, 'y(0)');
    for (let k = 1; k <= 5; k++) near(num(valueAt(r, 'm.y', k * 0.1)), (k - 1) * 0.1, 1e-9, `k=${k}`);
  });

  // Oracle (hand calculation, IC 1, Ts 0.1, u(n) = n, n = 0..4), Simulink Discrete-Time Integrator:
  //   Forward Euler   y(n) = y(n-1) + T u(n-1)         -> 1, 1, 1.1, 1.3, 1.6
  //   Backward Euler  y(n) = y(n-1) + T u(n)           -> 1, 1.1, 1.3, 1.6, 2.0   (u(0) = 0 so y(0) = IC)
  //   Trapezoidal     y(n) = y(n-1) + T/2 (u(n)+u(n-1)) -> 1, 1.05, 1.2, 1.45, 1.8
  const ramp = [0, 1, 2, 3, 4];
  const DI = { initial_condition: 1, sample_time: 0.1 };
  it('INTEGRATOR_DISCRETE forward Euler: 1, 1, 1.1, 1.3, 1.6', () => {
    nearAll(thread('INTEGRATOR_DISCRETE', { ...DI, method: 'forward_euler' }, ramp), [1, 1, 1.1, 1.3, 1.6], 1e-12);
  });
  it('INTEGRATOR_DISCRETE backward Euler: 1, 1.1, 1.3, 1.6, 2.0', () => {
    nearAll(thread('INTEGRATOR_DISCRETE', { ...DI, method: 'backward_euler' }, ramp), [1, 1.1, 1.3, 1.6, 2.0], 1e-12);
  });
  it('INTEGRATOR_DISCRETE trapezoidal (tustin): 1, 1.05, 1.2, 1.45, 1.8', () => {
    nearAll(thread('INTEGRATOR_DISCRETE', { ...DI, method: 'tustin' }, ramp), [1, 1.05, 1.2, 1.45, 1.8], 1e-12);
  });
  it('INTEGRATOR_DISCRETE forward Euler in the engine (rk4 dt 0.1, input 1, IC 1): y(k) = 1 + 0.1 k', () => {
    const r = sim([constant('c', 1), { id: 'd', type: 'INTEGRATOR_DISCRETE', params: { ...DI, method: 'forward_euler' } }],
      ['c.out -> d.u'], ['d.y'], { dt: 0.1, stop: 0.5 });
    for (let k = 0; k <= 5; k++) near(num(valueAt(r, 'd.y', k * 0.1)), 1 + 0.1 * k, 1e-12, `k=${k}`);
  });

  // Oracle: H(z) = 0.1/(z - 0.9), unit step: y(k) = 1 - 0.9^k.
  it('DISCRETE_TRANSFER_FUNCTION 0.1/(z - 0.9), Ts 0.1, unit step (discrete solver): y(k) = 1 - 0.9^k', () => {
    const r = sim([constant('c', 1), { id: 'h', type: 'DISCRETE_TRANSFER_FUNCTION', params: { numerator: [0.1], denominator: [1, -0.9], sampleTime: 0.1 } }],
      ['c.out -> h.u'], ['h.y'], { solver: 'discrete', dt: 0.1, stop: 1 });
    for (let k = 0; k <= 10; k++) near(num(valueAt(r, 'h.y', k * 0.1)), 1 - Math.pow(0.9, k), 1e-12, `k=${k}`);
  });

  // Oracle: mean of the last N samples with zero initial buffer: input 3, 6, 9, 12, N = 3 -> 1, 3, 6, 9.
  it.fails('XBV-068: MOVING_AVERAGE window 3, input 3, 6, 9, 12: y = 1, 3, 6, 9 (buffer starts filled with zeros)', () => {
    nearAll(thread('MOVING_AVERAGE', { window_size: 3 }, [3, 6, 9, 12]), [1, 3, 6, 9], 1e-12);
  });
  it('MOVING_AVERAGE window 1 is the identity', () => {
    nearAll(thread('MOVING_AVERAGE', { window_size: 1 }, [3, -6, 0, 12.5]), [3, -6, 0, 12.5], 1e-12);
  });

  it('a sample time that is not a multiple of the fixed step (UNIT_DELAY Ts 0.15, rk4 dt 0.1): SAMPLE_TIME_NOT_MULTIPLE_OF_FIXED_STEP', () => {
    const r = sim([constant('c', 1), { id: 'd', type: 'UNIT_DELAY', params: { sampleTime: 0.15 } }], ['c.out -> d.u'], ['d.y'], { dt: 0.1, stop: 0.5 });
    expect(errorCodes(r)).toContain('SAMPLE_TIME_NOT_MULTIPLE_OF_FIXED_STEP');
    expect(r.t.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('C. discontinuities', () => {
  const sat = (lo: unknown, hi: unknown, u: unknown) => run('SATURATION', { lowerLimit: lo, upperLimit: hi }, [u]);
  it('SATURATION [-1, 2]: -3, -1, 0.5, 2, 5 -> -1, -1, 0.5, 2, 2', () => {
    expect([-3, -1, 0.5, 2, 5].map((u) => sat(-1, 2, u).y[0])).toEqual([-1, -1, 0.5, 2, 2]);
  });
  it('SATURATION lower == upper gives that constant for every input', () => {
    expect([-3, 0.5, 1.5, 9].map((u) => sat(1.5, 1.5, u).y[0])).toEqual([1.5, 1.5, 1.5, 1.5]);
  });
  it('SATURATION lower > upper: compile error LIMITS_INVALID', () => {
    const r = sim([constant('c', 1), { id: 's', type: 'SATURATION', params: { lowerLimit: 2, upperLimit: 1 } }], ['c.out -> s.u'], ['s.y']);
    expect(errorCodes(r)).toContain('LIMITS_INVALID');
  });
  // Simulink Saturation is element-wise for vector signals and for vector limits.
  it.fails('XBV-065: SATURATION is element-wise on a vector input ([-3 0.5 5] with [-1, 2] -> [-1 0.5 2])', () => {
    nearAll(sat(-1, 2, [-3, 0.5, 5]).y[0], [-1, 0.5, 2], 0);
  });
  it.fails('XBV-065: SATURATION with vector limits lower [0 1], upper [1 2] is element-wise ([-5 5] -> [0 2], [0.5 1.5] -> [0.5 1.5])', () => {
    nearAll(sat([0, 1], [1, 2], [-5, 5]).y[0], [0, 2], 0);
    nearAll(sat([0, 1], [1, 2], [0.5, 1.5]).y[0], [0.5, 1.5], 0);
  });

  // Oracle: Simulink Dead Zone: y = u - upper above the zone, u - lower below it, 0 inside (edges included).
  it('DEADZONE [-0.5, 0.5]: -2, -0.5, 0, 0.5, 2 -> -1.5, 0, 0, 0, 1.5', () => {
    const y = [-2, -0.5, 0, 0.5, 2].map((u) => Number(run('DEADZONE', { lowerLimit: -0.5, upperLimit: 0.5 }, [u]).y[0]));
    nearAll(y, [-1.5, 0, 0, 0, 1.5], 0);
  });
  it('DEADZONE lower > upper: compile error LIMITS_INVALID', () => {
    const r = sim([constant('c', 1), { id: 'z', type: 'DEADZONE', params: { lowerLimit: 1, upperLimit: -1 } }], ['c.out -> z.u'], ['z.y']);
    expect(errorCodes(r)).toContain('LIMITS_INVALID');
  });

  // Oracle: rising 2/s, falling -1/s, IC 0, input 10 from t = 0 (rk4 dt 0.1): y(t) = min(10, 2 t).
  const rl = (input: B, ic: number, stop: number) => sim(
    [input, { id: 'r', type: 'RATE_LIMITER', params: { risingSlewRate: 2, fallingSlewRate: -1, initialCondition: ic } }],
    ['u.out -> r.u'], ['r.y'], { dt: 0.1, stop });
  it('RATE_LIMITER up step 0 -> 10: y(0) = IC, y(t) = min(10, 2 t): y(1) = 2, y(5) = 10', () => {
    const r = rl({ id: 'u', type: 'Step', params: { stepTime: 0, initialValue: 0, finalValue: 10 } }, 0, 6);
    near(num(valueAt(r, 'r.y', 0)), 0, 1e-12, 'y(0) = IC');
    for (const t of [0.5, 1, 2, 4.9]) near(num(valueAt(r, 'r.y', t)), Math.min(10, 2 * t), 1e-9, `t=${t}`);
    near(num(valueAt(r, 'r.y', 5)), 10, 1e-9, 't=5');
    near(num(valueAt(r, 'r.y', 6)), 10, 1e-9, 't=6');
  });
  it('RATE_LIMITER down step 10 -> 0 (IC 10) slews at -1/s: y(t) = 10 - t, then 0', () => {
    const r = rl({ id: 'u', type: 'Constant', params: { value: 0 } }, 10, 11);
    for (const t of [0.5, 1, 4, 9.5]) near(num(valueAt(r, 'r.y', t)), 10 - t, 1e-9, `t=${t}`);
    near(num(valueAt(r, 'r.y', 11)), 0, 1e-9, 't=11');
  });
  it('RATE_LIMITER rising < falling: compile error LIMITS_INVALID', () => {
    const r = sim([constant('c', 1), { id: 'r', type: 'RATE_LIMITER', params: { risingSlewRate: -1, fallingSlewRate: 1 } }], ['c.out -> r.u'], ['r.y']);
    expect(errorCodes(r)).toContain('LIMITS_INVALID');
  });

  // Oracle: Simulink Relay, on at u >= switch-on, off at u <= switch-off, otherwise keeps its state.
  const relay = (params: Record<string, unknown>, seq: number[]) => thread('RELAY', params, seq).map(Number);
  const R = { switchOn: 1, switchOff: 0, onValue: 5, offValue: -5 };
  const SEQ = [0, 0.5, 1, 0.5, 0, -1, 0.5];
  it('RELAY hysteresis per the stated rule (on at u >= 1, off at u <= 0): 0, 0.5, 1, 0.5, 0, -1, 0.5 -> -5, -5, 5, 5, -5, -5, -5', () => {
    expect(relay(R, SEQ)).toEqual([-5, -5, 5, 5, -5, -5, -5]);
  });
  // Only points away from the shared threshold: at u equal to it, on (u >= on) and off (u <= off) both apply.
  it('RELAY with switchOn == switchOff is a comparator away from the threshold', () => {
    expect(relay({ switchOn: 0.5, switchOff: 0.5, onValue: 5, offValue: -5 }, [0.6, 0.4, 0.7, 0.1])).toEqual([5, -5, 5, -5]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('D. lookup tables', () => {
  const L1 = { BreakpointsForDimension1: [0, 1, 2], Table: [0, 10, 40] };
  const lut1 = (extra: Record<string, unknown>, u: number) => Number(run('LOOKUP_1D', { ...L1, ...extra }, [u]).y[0]);
  it('LOOKUP_1D linear: 0, 0.5, 1, 1.5, 2 -> 0, 5, 10, 25, 40', () => {
    nearAll([0, 0.5, 1, 1.5, 2].map((u) => lut1({}, u)), [0, 5, 10, 25, 40], 1e-12);
  });
  it('LOOKUP_1D linear extrapolation: -1 -> -10, 3 -> 70', () => {
    near(lut1({}, -1), -10, 1e-12);
    near(lut1({}, 3), 70, 1e-12);
  });
  it("LOOKUP_1D ExtrapMethod 'Clip': -1 -> 0, 3 -> 40", () => {
    expect([-1, 3].map((u) => lut1({ ExtrapMethod: 'Clip' }, u))).toEqual([0, 40]);
  });
  it("LOOKUP_1D InterpMethod 'Flat' (previous breakpoint value): 1.5 -> 10", () => {
    const f = { InterpMethod: 'Flat', ExtrapMethod: 'Clip' };
    expect([0.5, 1, 1.5, 2].map((u) => lut1(f, u))).toEqual([0, 10, 10, 40]);
  });
  it("LOOKUP_1D InterpMethod 'Nearest': 1.4 -> 10, 1.6 -> 40, tie 0.5 rounds up -> 10", () => {
    const n = { InterpMethod: 'Nearest', ExtrapMethod: 'Clip' };
    expect([1.4, 1.6, 0.5].map((u) => lut1(n, u))).toEqual([10, 40, 10]);
  });
  // Non-monotonic or repeated breakpoints and a table of the wrong size must be reported, never a silent result.
  for (const [what, p] of [
    ['non-monotonic breakpoints [0 2 1]', { BreakpointsForDimension1: [0, 2, 1], Table: [0, 10, 40] }],
    ['repeated breakpoints [0 1 1]', { BreakpointsForDimension1: [0, 1, 1], Table: [0, 10, 40] }],
    ['table size mismatch (3 breakpoints, 2 table values)', { BreakpointsForDimension1: [0, 1, 2], Table: [0, 10] }],
  ] as const) {
    it(`LOOKUP_1D ${what}: reported error`, () => {
      const r = run('LOOKUP_1D', p, [0.5]);
      expect(r.threw).toBeNull();
      expect(Boolean(r.error), `silent result ${JSON.stringify(r.y)}`).toBe(true);
    });
  }

  // Oracle: bilinear interpolation of T = [[4 5 6] [16 19 20] [10 18 23]] over [1 2 3] x [4 5 6] (rows = dim 1).
  const T2 = [[4, 5, 6], [16, 19, 20], [10, 18, 23]];
  const L2 = { BreakpointsForDimension1: [1, 2, 3], BreakpointsForDimension2: [4, 5, 6], Table: T2 };
  it('LOOKUP_2D bilinear at (1.5, 4.5) = (4 + 5 + 16 + 19) / 4 = 11; grid point (2, 5) = 19', () => {
    near(Number(run('LOOKUP_2D', L2, [1.5, 4.5]).y[0]), 11, 1e-12);
    near(Number(run('LOOKUP_2D', L2, [2, 5]).y[0]), 19, 1e-12);
    near(Number(run('LOOKUP_2D', L2, [3, 6]).y[0]), 23, 1e-12);
    near(Number(run('LOOKUP_2D', L2, [2.5, 4]).y[0]), (16 + 10) / 2, 1e-12);
  });

  // Oracle: Prelookup with breakpoints [10 20 30]: zero-based interval index k, fraction f.
  const pre = (u: number) => run('PRELOOKUP', { BreakpointsData: [10, 20, 30] }, [u]).y.map(Number);
  it('PRELOOKUP [10 20 30]: 25 -> (k 1, f 0.5); 30 -> (k 1, f 1) with UseLastBreakpoint off; 10 -> (0, 0); 15 -> (0, 0.5); 20 -> (1, 0)', () => {
    expect(pre(25)).toEqual([1, 0.5]);
    expect(pre(30)).toEqual([1, 1]);
    expect(pre(10)).toEqual([0, 0]);
    expect(pre(15)).toEqual([0, 0.5]);
    expect(pre(20)).toEqual([1, 0]);
  });
  // Metamorphic: Prelookup -> Interpolation Using Prelookup equals the n-D Lookup Table at the same point.
  it('INTERP_PRELOOKUP fed by two PRELOOKUPs reproduces LOOKUP_ND (inside the grid and linearly extrapolated)', () => {
    for (const [u1, u2] of [[1.5, 4.5], [2, 5], [2.5, 5.2], [3, 6], [0.5, 7]]) {
      const [k1, f1] = run('PRELOOKUP', { BreakpointsData: [1, 2, 3] }, [u1]).y;
      const [k2, f2] = run('PRELOOKUP', { BreakpointsData: [4, 5, 6] }, [u2]).y;
      const ip = run('INTERP_PRELOOKUP', { NumberOfTableDimensions: 2, Table: T2 }, [k1, f1, k2, f2]);
      const nd = run('LOOKUP_ND', { NumberOfTableDimensions: 2, ...L2 }, [u1, u2]);
      expect(ip.error, `interp (${u1}, ${u2})`).toBeUndefined();
      near(Number(ip.y[0]), Number(nd.y[0]), 1e-12, `(${u1}, ${u2})`);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('E. buses', () => {
  const create = (a: unknown, b: unknown) => run('BUS_CREATOR', { Inputs: 2, SignalNames: 'a,b' }, [a, b]);
  it("BUS_CREATOR of 1 and [2 3] with SignalNames 'a,b' gives the bus {a: 1, b: [2, 3]}", () => {
    const r = create(1, [2, 3]);
    expect(r.error).toBeUndefined();
    expect(r.y[0]).toEqual({ a: 1, b: [2, 3] });
  });
  it("BUS_SELECTOR OutputSignals 'b,a' returns out1 = [2 3], out2 = 1", () => {
    const r = run('BUS_SELECTOR', { OutputSignals: 'b,a' }, [{ a: 1, b: [2, 3] }]);
    expect(r.error).toBeUndefined();
    expect(r.y).toEqual([[2, 3], 1]);
  });
  it('BUS_SELECTOR of a missing element is a reported error', () => {
    const r = run('BUS_SELECTOR', { OutputSignals: 'c' }, [{ a: 1, b: [2, 3] }]);
    expect(Boolean(r.error)).toBe(true);
  });
  const busModel = (ic: number): B[] => [
    constant('a', 1), constant('b', '[2 3]'),
    { id: 'bc', type: 'BUS_CREATOR', params: { Inputs: 2, SignalNames: 'a,b' } },
    { id: 'd', type: 'UNIT_DELAY', params: { sampleTime: 0.1, initialCondition: ic } },
    { id: 'bs', type: 'BUS_SELECTOR', params: { OutputSignals: 'b,a' } },
  ];
  const busWires = ['a.out -> bc.in1', 'b.out -> bc.in2', 'bc.bus -> d.u', 'd.y -> bs.bus'];
  it('a bus through UNIT_DELAY keeps its structure after the first sample (BUS_SELECTOR b,a gives [2 3] and 1)', () => {
    const r = sim(busModel(0), busWires, ['bs.out1', 'bs.out2', 'd.y'], { solver: 'discrete', dt: 0.1, stop: 0.4 });
    expect(r.t.length).toBeGreaterThan(0);
    for (const t of [0.2, 0.3, 0.4]) {
      expect(valueAt(r, 'd.y', t)).toEqual({ a: 1, b: [2, 3] });
      expect(valueAt(r, 'bs.out1', t)).toEqual([2, 3]);
      expect(valueAt(r, 'bs.out2', t)).toBe(1);
    }
  });
  // Simulink Unit Delay on a bus signal applies the initial condition 0 to every element: the output at t = 0 is the
  // bus {a: 0, b: [0 0]}, so a Bus Selector behind it never sees a non-bus.
  it.fails('XBV-066: a bus through UNIT_DELAY has the bus structure from the first sample (IC 0 applied to every element)', () => {
    const r = sim(busModel(0), busWires, ['d.y'], { solver: 'discrete', dt: 0.1, stop: 0.4 });
    expect(errorCodes(r)).toEqual([]);
    expect(valueAt(r, 'd.y', 0)).toEqual({ a: 0, b: [0, 0] });
  });
});
