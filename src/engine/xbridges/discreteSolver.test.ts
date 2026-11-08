/**
 * Acceptance tests — discrete solver and Simulink-style start/stop time (simulation side).
 * Plan: docs/superpowers/plans/2026-11-08-xbridges-discrete-solver-start-stop.md
 *
 * Contract (src/engine/xbridges/simulationConfig.ts):
 *   interface XSimulationConfig { solver; startTime: number; stopTime: number (Infinity allowed); fixedStep: number | 'auto' }
 *   DEFAULT_SIMULATION_CONFIG = { solver: 'rk4', startTime: 0, stopTime: 10, fixedStep: 'auto' }   (Simulink defaults 0 / 10 / auto)
 *   parseTimeInput(text): number | null      '10' -> 10, 'inf' / 'Inf' / 'INF' -> Infinity, '1e-3' -> 0.001, '' / 'abc' -> null
 *   resolveSimulationConfig(config, blocks) -> { startTime, stopTime, fixedStep: number, diagnostics }
 *     errors: START_TIME_INVALID (non-finite start), STOP_TIME_BEFORE_START, FIXED_STEP_INVALID (<= 0 or non-finite)
 *     fixedStep 'auto': discrete sample times present -> their greatest common divisor (fundamental sample time);
 *                       none -> (stop - start) / 50, or 0.2 when stop is Infinity.
 * Engine:
 *   - solver 'discrete' never integrates (no derivative evaluation); a model with continuous states is rejected.
 *   - discrete sample hits are on the absolute grid t = n*Ts (n integer) at or after the start time.
 *   - Solvers.runFixedStep resolves fixedStep 'auto' (engine.options.fixedStep holds the resolved number) and refuses an
 *     infinite stop time with STOP_TIME_INFINITE_BATCH (a batch run must end; the live canvas may run to Infinity).
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from './BlockDefinitions';
import { XbridgesEngine } from './XbridgesEngine';
import { Solvers } from './Solvers';
import {
  DEFAULT_SIMULATION_CONFIG,
  parseTimeInput,
  resolveSimulationConfig,
} from './simulationConfig';

type Conn = [string, string, string, string];
const b = (type: string, id: string, params: Record<string, unknown> = {}) => BLOCK_LIBRARY[type](id, params);
const engineOf = (blocks: any[], conns: Conn[] = []) => new XbridgesEngine({
  blocks,
  connections: conns.map(([sourceBlock, sourcePort, targetBlock, targetPort]) => ({ sourceBlock, sourcePort, targetBlock, targetPort })),
} as any);

describe('simulation configuration (Simulink Configuration Parameters > Solver)', () => {
  it('defaults to start 0, stop 10, auto step', () => {
    expect(DEFAULT_SIMULATION_CONFIG).toMatchObject({ startTime: 0, stopTime: 10, fixedStep: 'auto' });
  });

  it('parses time fields like Simulink, including inf', () => {
    expect(parseTimeInput('10')).toBe(10);
    expect(parseTimeInput(' 2.5 ')).toBe(2.5);
    expect(parseTimeInput('1e-3')).toBe(0.001);
    expect(parseTimeInput('inf')).toBe(Number.POSITIVE_INFINITY);
    expect(parseTimeInput('Inf')).toBe(Number.POSITIVE_INFINITY);
    expect(parseTimeInput('')).toBeNull();
    expect(parseTimeInput('abc')).toBeNull();
  });

  const codes = (r: { diagnostics: { code: string }[] }) => r.diagnostics.map((d) => d.code);

  it('rejects stop time before start time and a non-finite start time', () => {
    expect(codes(resolveSimulationConfig({ solver: 'rk4', startTime: 5, stopTime: 1, fixedStep: 0.1 }, []))).toContain('STOP_TIME_BEFORE_START');
    expect(codes(resolveSimulationConfig({ solver: 'rk4', startTime: Number.NaN, stopTime: 1, fixedStep: 0.1 }, []))).toContain('START_TIME_INVALID');
    expect(codes(resolveSimulationConfig({ solver: 'rk4', startTime: 0, stopTime: 1, fixedStep: 0 }, []))).toContain('FIXED_STEP_INVALID');
    expect(codes(resolveSimulationConfig({ solver: 'rk4', startTime: 0, stopTime: Number.POSITIVE_INFINITY, fixedStep: 0.1 }, []))).toEqual([]);
  });

  it('auto step for a discrete model is the fundamental sample time (GCD of sample times)', () => {
    const blocks = [b('UNIT_DELAY', 'a', { sampleTime: 0.1 }), b('INTEGRATOR_DISCRETE', 'c', { sample_time: 0.25 })];
    const r = resolveSimulationConfig({ solver: 'discrete', startTime: 0, stopTime: 10, fixedStep: 'auto' }, blocks);
    expect(r.diagnostics).toEqual([]);
    expect(r.fixedStep).toBeCloseTo(0.05, 12);
  });

  it('auto step without discrete blocks is (stop - start) / 50, or 0.2 for an infinite stop time', () => {
    expect(resolveSimulationConfig({ solver: 'rk4', startTime: 0, stopTime: 10, fixedStep: 'auto' }, [b('GAIN', 'g')]).fixedStep).toBeCloseTo(0.2, 12);
    expect(resolveSimulationConfig({ solver: 'rk4', startTime: 2, stopTime: 4, fixedStep: 'auto' }, []).fixedStep).toBeCloseTo(0.04, 12);
    expect(resolveSimulationConfig({ solver: 'rk4', startTime: 0, stopTime: Number.POSITIVE_INFINITY, fixedStep: 'auto' }, []).fixedStep).toBeCloseTo(0.2, 12);
  });

  it('an explicit step is kept as entered', () => {
    expect(resolveSimulationConfig({ solver: 'rk4', startTime: 0, stopTime: 1, fixedStep: 0.003 }, []).fixedStep).toBe(0.003);
  });
});

describe('discrete solver in simulation', () => {
  it('never evaluates continuous derivatives', () => {
    const e = engineOf([b('Constant', 'k', { value: 1 }), b('UNIT_DELAY', 'd', { sampleTime: 0.1 }), b('TERMINATOR', 't')],
      [['k', 'out', 'd', 'u'], ['d', 'y', 't', 'u']]);
    let derivativeCalls = 0;
    const original = e.computeDerivatives.bind(e);
    (e as any).computeDerivatives = (t: number, tempStates?: any) => { derivativeCalls++; return (original as any)(t, tempStates); };
    Solvers.runFixedStep(e, { solver: 'discrete', startTime: 0, stopTime: 1, fixedStep: 0.1 } as any);
    expect(e.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(derivativeCalls).toBe(0);
    expect(Number(e.getSignalValue('d', 'y'))).toBe(1);
  });

  it('runs a z-domain model exactly: 0.1/(z-0.9), Ts = 0.1, auto step', () => {
    const e = engineOf([b('Constant', 'k', { value: 1 }), b('DISCRETE_TRANSFER_FUNCTION', 'dtf', { numerator: [0.1], denominator: [1, -0.9], sampleTime: 0.1 }), b('TERMINATOR', 't')],
      [['k', 'out', 'dtf', 'u'], ['dtf', 'y', 't', 'u']]);
    Solvers.runFixedStep(e, { solver: 'discrete', startTime: 0, stopTime: 1, fixedStep: 'auto' } as any);
    expect(e.options?.fixedStep).toBeCloseTo(0.1, 12);
    expect(Number(e.getSignalValue('dtf', 'y'))).toBeCloseTo(1 - 0.9 ** 10, 9);
  });

  it('resolves auto step to the GCD of the model sample times', () => {
    const e = engineOf([b('Constant', 'k', { value: 1 }), b('UNIT_DELAY', 'a', { sampleTime: 0.1 }), b('INTEGRATOR_DISCRETE', 'c', { sample_time: 0.25 }), b('TERMINATOR', 't1'), b('TERMINATOR', 't2')],
      [['k', 'out', 'a', 'u'], ['k', 'out', 'c', 'u'], ['a', 'y', 't1', 'u'], ['c', 'y', 't2', 'u']]);
    Solvers.runFixedStep(e, { solver: 'discrete', startTime: 0, stopTime: 1, fixedStep: 'auto' } as any);
    expect(e.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(e.options?.fixedStep).toBeCloseTo(0.05, 12);
  });

  it('rejects continuous states', () => {
    const e = engineOf([b('Constant', 'k', { value: 1 }), b('INTEGRATOR_CONTINUOUS', 'i'), b('TERMINATOR', 't')],
      [['k', 'out', 'i', 'u'], ['i', 'y', 't', 'u']]);
    Solvers.runFixedStep(e, { solver: 'discrete', startTime: 0, stopTime: 1, fixedStep: 0.1 } as any);
    expect(e.diagnostics.map((d) => d.code)).toContain('CONTINUOUS_STATES_WITH_DISCRETE_SOLVER');
  });

  it('refuses an infinite stop time in a batch run', () => {
    const e = engineOf([b('Constant', 'k', { value: 1 }), b('TERMINATOR', 't')], [['k', 'out', 't', 'u']]);
    Solvers.runFixedStep(e, { solver: 'discrete', startTime: 0, stopTime: Number.POSITIVE_INFINITY, fixedStep: 0.1 } as any);
    expect(e.diagnostics.map((d) => d.code)).toContain('STOP_TIME_INFINITE_BATCH');
  });
});

describe('start time', () => {
  // Step 0 -> 1 at t = 0.27 sampled by a forward-Euler discrete integrator, Ts = 0.1, start 0.25, stop 1.0.
  // Absolute grid hits: 0.3, 0.4, ..., 1.0 (u = 1 at every hit) -> y(1.0) = x = 7 * 0.1 = 0.7.
  // (A grid relative to the start time, 0.25, 0.35, ..., 0.95, would give 0.6.)
  for (const [solver, fixedStep] of [['discrete', 0.05], ['rk4', 0.05], ['euler', 0.01]] as const) {
    it(`${solver}: discrete sample hits stay on the absolute grid n*Ts when the start time is not a multiple of Ts`, () => {
      const e = engineOf([b('Step', 's', { stepTime: 0.27, initialValue: 0, finalValue: 1 }), b('INTEGRATOR_DISCRETE', 'di', { sample_time: 0.1 }), b('TERMINATOR', 't')],
        [['s', 'out', 'di', 'u'], ['di', 'y', 't', 'u']]);
      Solvers.runFixedStep(e, { solver, startTime: 0.25, stopTime: 1.0, fixedStep } as any);
      expect(e.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(Number(e.getSignalValue('di', 'y'))).toBeCloseTo(0.7, 9);
    });
  }

  it('a continuous model started at t0 integrates from t0: 1/s of 1 from 2 to 5 gives 3', () => {
    const e = engineOf([b('Constant', 'k', { value: 1 }), b('INTEGRATOR_CONTINUOUS', 'i'), b('TERMINATOR', 't')],
      [['k', 'out', 'i', 'u'], ['i', 'y', 't', 'u']]);
    Solvers.runFixedStep(e, { solver: 'rk4', startTime: 2, stopTime: 5, fixedStep: 'auto' } as any);
    expect(Number(e.getSignalValue('i', 'y'))).toBeCloseTo(3, 9);
  });
});
