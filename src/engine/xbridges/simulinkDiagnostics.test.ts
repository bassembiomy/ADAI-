/**
 * Acceptance tests — Simulink-equivalent diagnostics and s/z-domain constraints for X-Bridges.
 * Plan: docs/superpowers/plans/2026-11-08-xbridges-simulink-diagnostics.md
 *
 * Contract:
 *  - XbridgesEngine.compile() reports model/parameter errors (severity 'error') before simulation.
 *    compile() uses engine.options when set (Solvers.runFixedStep sets it before compiling).
 *  - Solvers.runFixedStep does not simulate when compile() produced an error: time and block states stay at start.
 *  - Runtime math/logic problems are reported once per block per run with their own code.
 *  - Continuous (s) and discrete (z) blocks run in one model with Simulink semantics:
 *    discrete blocks update only at their sample hits (k*Ts), hold their output between hits (ZOH),
 *    and sample continuous signals at the hit.
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from './BlockDefinitions';
import { XbridgesEngine } from './XbridgesEngine';
import { Solvers } from './Solvers';

type Conn = [string, string, string, string];

const engineOf = (blocks: any[], conns: Conn[] = []) =>
  new XbridgesEngine({
    blocks,
    connections: conns.map(([sourceBlock, sourcePort, targetBlock, targetPort]) => ({
      sourceBlock, sourcePort, targetBlock, targetPort,
    })),
  } as any);

const b = (type: string, id: string, params: Record<string, unknown> = {}) => BLOCK_LIBRARY[type](id, params);

const compileCodes = (blocks: any[], conns: Conn[] = [], options?: any) => {
  const e = engineOf(blocks, conns);
  if (options) e.options = options;
  return e.compile().filter((d) => d.severity === 'error').map((d) => d.code);
};

const run = (blocks: any[], conns: Conn[], options: Record<string, unknown>) => {
  const e = engineOf(blocks, conns);
  Solvers.runFixedStep(e, { startTime: 0, stopTime: 1, fixedStep: 0.01, solver: 'ode4', ...options } as any);
  return e;
};

const codesOf = (e: XbridgesEngine, severity?: string) =>
  e.diagnostics.filter((d) => severity === undefined || d.severity === severity).map((d) => d.code);

// ---------------------------------------------------------------------------------------------
describe('A. connectivity (Simulink: unconnected block input / output ports — warning)', () => {
  it('warns on an unconnected data input port', () => {
    const e = engineOf([b('GAIN', 'g', { gain: 2 })]);
    const d = e.compile().find((x) => x.code === 'UNCONNECTED_INPUT_PORT');
    expect(d?.severity).toBe('warning');
    expect(d?.blockIds).toEqual(['g']);
  });

  it('warns on an unconnected output port', () => {
    const e = engineOf([b('Constant', 'k', { value: 1 })]);
    expect(e.compile().find((x) => x.code === 'UNCONNECTED_OUTPUT_PORT')?.severity).toBe('warning');
  });

  it('does not warn for control ports with defaults (PID Enable/Reset) or a connected chain', () => {
    const e = engineOf(
      [b('Constant', 'k', { value: 1 }), b('PID_BASIC', 'pid', {}), b('TERMINATOR', 't')],
      [['k', 'out', 'pid', 'e'], ['pid', 'u', 't', 'u']],
    );
    const codes = e.compile().map((x) => x.code);
    expect(codes).not.toContain('UNCONNECTED_INPUT_PORT');
    expect(codes).not.toContain('UNCONNECTED_OUTPUT_PORT');
  });
});

// ---------------------------------------------------------------------------------------------
describe('B. sample time and solver (s/z mixing)', () => {
  it('rejects an invalid sample time (negative other than -1, NaN, Infinity)', () => {
    for (const ts of [-0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(compileCodes([b('UNIT_DELAY', 'd', { sampleTime: ts })])).toContain('INVALID_SAMPLE_TIME');
    }
  });

  it('rejects a continuous (0) sample time on a discrete-only block', () => {
    expect(compileCodes([b('DISCRETE_TRANSFER_FUNCTION', 'dtf', { sampleTime: 0 })]))
      .toContain('DISCRETE_BLOCK_CONTINUOUS_SAMPLE_TIME');
    expect(compileCodes([b('INTEGRATOR_DISCRETE', 'di', { sample_time: 0 })]))
      .toContain('DISCRETE_BLOCK_CONTINUOUS_SAMPLE_TIME');
  });

  it('fixed-step: a discrete sample time must be an integer multiple of the step size', () => {
    const opts = { solver: 'ode4', fixedStep: 0.03, startTime: 0, stopTime: 1 };
    expect(compileCodes([b('UNIT_DELAY', 'd', { sampleTime: 0.1 })], [], opts))
      .toContain('SAMPLE_TIME_NOT_MULTIPLE_OF_FIXED_STEP');
    expect(compileCodes([b('UNIT_DELAY', 'd', { sampleTime: 0.09 })], [], opts))
      .not.toContain('SAMPLE_TIME_NOT_MULTIPLE_OF_FIXED_STEP');
  });

  it('discrete solver: rejects a model with continuous states', () => {
    const opts = { solver: 'discrete', fixedStep: 0.1, startTime: 0, stopTime: 1 };
    expect(compileCodes([b('INTEGRATOR_CONTINUOUS', 'i')], [], opts))
      .toContain('CONTINUOUS_STATES_WITH_DISCRETE_SOLVER');
    expect(compileCodes([b('UNIT_DELAY', 'd', { sampleTime: 0.1 })], [], opts))
      .not.toContain('CONTINUOUS_STATES_WITH_DISCRETE_SOLVER');
  });

  it('discrete solver runs a purely discrete model', () => {
    const e = run(
      [b('Constant', 'k', { value: 1 }), b('DISCRETE_TRANSFER_FUNCTION', 'dtf', { numerator: [0.1], denominator: [1, -0.9], sampleTime: 0.1 })],
      [['k', 'out', 'dtf', 'u']],
      { solver: 'discrete', fixedStep: 0.1 },
    );
    expect(codesOf(e, 'error')).toEqual([]);
    expect(Number(e.getSignalValue('dtf', 'y'))).toBeGreaterThan(0.5);
  });

  it('warns when two discrete blocks with different rates are connected directly (rate transition)', () => {
    const e = engineOf(
      [b('UNIT_DELAY', 'fast', { sampleTime: 0.01 }), b('UNIT_DELAY', 'slow', { sampleTime: 0.1 })],
      [['fast', 'y', 'slow', 'u']],
    );
    expect(e.compile().find((x) => x.code === 'RATE_TRANSITION_REQUIRED')?.severity).toBe('warning');
  });

  it('does not simulate when compile reports an error', () => {
    const e = engineOf([b('Constant', 'k', { value: 1 }), b('INTEGRATOR_CONTINUOUS', 'i'), b('UNIT_DELAY', 'd', { sampleTime: -3 })],
      [['k', 'out', 'i', 'u']]);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 1, fixedStep: 0.01 } as any);
    expect(codesOf(e, 'error')).toContain('INVALID_SAMPLE_TIME');
    expect(Number(e.getSignalValue('i', 'y'))).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('C. parameter constraints (compile errors)', () => {
  it('transfer function: leading denominator coefficient must be non-zero', () => {
    expect(compileCodes([b('TRANSFER_FUNCTION', 'tf', { numerator: [1], denominator: [0, 1, 1] })]))
      .toContain('TF_DENOMINATOR_LEADING_ZERO');
    expect(compileCodes([b('DISCRETE_TRANSFER_FUNCTION', 'dtf', { numerator: [1], denominator: [0, 1], sampleTime: 0.1 })]))
      .toContain('TF_DENOMINATOR_LEADING_ZERO');
  });

  it('transfer function must be proper (numerator order <= denominator order)', () => {
    expect(compileCodes([b('TRANSFER_FUNCTION', 'tf', { numerator: [1, 0, 0], denominator: [1, 1] })]))
      .toContain('TF_IMPROPER');
    expect(compileCodes([b('DISCRETE_TRANSFER_FUNCTION', 'dtf', { numerator: [1, 0, 0], denominator: [1, 0.5], sampleTime: 0.1 })]))
      .toContain('TF_IMPROPER');
    expect(compileCodes([b('ZERO_POLE_GAIN', 'zpk', { zeros: [-1, -2], poles: [-3], gain: 1 })]))
      .toContain('TF_IMPROPER');
    expect(compileCodes([b('TRANSFER_FUNCTION', 'tf', { numerator: [1, 2], denominator: [1, 3] })]))
      .not.toContain('TF_IMPROPER');
  });

  it('rejects non-finite or empty coefficients', () => {
    expect(compileCodes([b('TRANSFER_FUNCTION', 'tf', { numerator: [Number.NaN], denominator: [1, 1] })]))
      .toContain('PARAMETER_NOT_FINITE');
    expect(compileCodes([b('GAIN', 'g', { gain: Number.POSITIVE_INFINITY })]))
      .toContain('PARAMETER_NOT_FINITE');
  });

  it('saturation / dead zone: lower limit must be <= upper limit', () => {
    expect(compileCodes([b('SATURATION', 's', { lowerLimit: 2, upperLimit: 1 })])).toContain('LIMITS_INVALID');
    expect(compileCodes([b('DEADZONE', 'dz', { lowerLimit: 1, upperLimit: -1 })])).toContain('LIMITS_INVALID');
    expect(compileCodes([b('SATURATION', 's', { lowerLimit: -1, upperLimit: 1 })])).not.toContain('LIMITS_INVALID');
  });

  it('PID: output limits ordered and derivative filter coefficient N > 0', () => {
    expect(compileCodes([b('PID_BASIC', 'p', { min: 5, max: -5 })])).toContain('LIMITS_INVALID');
    expect(compileCodes([b('PID_CONTROLLER', 'p', { N: 0, mode: 'PID' })])).toContain('PID_FILTER_COEFFICIENT_INVALID');
  });

  it('rate limiter: rising slew rate must be >= falling slew rate', () => {
    expect(compileCodes([b('RATE_LIMITER', 'r', { risingSlewRate: -1, fallingSlewRate: 1 })]))
      .toContain('LIMITS_INVALID');
  });

  it('delay length must be a positive integer', () => {
    expect(compileCodes([b('DELAY', 'd', { delay_length: 2.5 })])).toContain('DELAY_LENGTH_INVALID');
    expect(compileCodes([b('DELAY', 'd', { delay_length: -1 })])).toContain('DELAY_LENGTH_INVALID');
  });

  it('state space: A must be n x n and B, C, D consistent', () => {
    expect(compileCodes([b('STATE_SPACE', 'ss', { A: [[1, 2]], B: [[1]], C: [[1]], D: [[0]] })]))
      .toContain('STATE_SPACE_DIMENSION_MISMATCH');
    expect(compileCodes([b('STATE_SPACE', 'ss', { A: [[-1]], B: [[1]], C: [[1]], D: [[0]] })]))
      .not.toContain('STATE_SPACE_DIMENSION_MISMATCH');
  });
});

// ---------------------------------------------------------------------------------------------
describe('D. runtime math and logic', () => {
  it('product divide by zero gives IEEE Inf (not a silent 1) and warns DIVIDE_BY_ZERO', () => {
    const e = run(
      [b('Constant', 'n', { value: 4 }), b('Constant', 'z', { value: 0 }), b('PRODUCT', 'p', { operation: 'divide' }), b('TERMINATOR', 't')],
      [['n', 'out', 'p', 'in1'], ['z', 'out', 'p', 'in2'], ['p', 'y', 't', 'u']],
      { stopTime: 0.05 },
    );
    expect(e.getSignalValue('p', 'y')).toBe(Number.POSITIVE_INFINITY);
    expect(e.diagnostics.filter((d) => d.code === 'DIVIDE_BY_ZERO')).toHaveLength(1);
  });

  it('product divide of non-zero values is ordinary division', () => {
    const e = run(
      [b('Constant', 'n', { value: 3 }), b('Constant', 'z', { value: 4 }), b('PRODUCT', 'p', { operation: 'divide' }), b('TERMINATOR', 't')],
      [['n', 'out', 'p', 'in1'], ['z', 'out', 'p', 'in2'], ['p', 'y', 't', 'u']],
      { stopTime: 0.05 },
    );
    expect(e.getSignalValue('p', 'y')).toBeCloseTo(0.75, 12);
  });

  it('inverse trigonometric input outside its domain warns MATH_DOMAIN_ERROR', () => {
    for (const [type, value] of [['ASIN', 1.5], ['ACOS', -2], ['ACOSH', 0.5], ['ATANH', 2]] as const) {
      const e = run(
        [b('Constant', 'k', { value }), b(type, 'f'), b('TERMINATOR', 't')],
        [['k', 'out', 'f', 'u'], ['f', 'y', 't', 'u']],
        { stopTime: 0.05 },
      );
      expect(e.diagnostics.filter((d) => d.code === 'MATH_DOMAIN_ERROR').map((d) => d.blockIds)).toEqual([['f']]);
    }
  });

  it('logical operator with a NaN input is an error (NaN cannot be converted to logical)', () => {
    const e = run(
      [b('Constant', 'a', { value: Number.NaN }), b('Constant', 'c', { value: 1 }), b('AND', 'and'), b('TERMINATOR', 't')],
      [['a', 'out', 'and', 'in1'], ['c', 'out', 'and', 'in2'], ['and', 'out', 't', 'u']],
      { stopTime: 0.05 },
    );
    const d = e.diagnostics.find((x) => x.code === 'LOGIC_NAN_INPUT');
    expect(d?.severity).toBe('error');
    expect(d?.blockIds).toEqual(['and']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('E. s-domain and z-domain integration in one model', () => {
  it('continuous integrator 1/s of a unit constant gives y(1) = 1', () => {
    const e = run([b('Constant', 'k', { value: 1 }), b('INTEGRATOR_CONTINUOUS', 'i'), b('TERMINATOR', 't')],
      [['k', 'out', 'i', 'u'], ['i', 'y', 't', 'u']], {});
    expect(Number(e.getSignalValue('i', 'y'))).toBeCloseTo(1, 6);
  });

  it('continuous first order 1/(s+1) step response at t=1 is 1 - e^-1', () => {
    const e = run([b('Constant', 'k', { value: 1 }), b('TRANSFER_FUNCTION', 'tf', { numerator: [1], denominator: [1, 1] }), b('TERMINATOR', 't')],
      [['k', 'out', 'tf', 'u'], ['tf', 'y', 't', 'u']], { fixedStep: 0.001 });
    expect(Number(e.getSignalValue('tf', 'y'))).toBeCloseTo(1 - Math.exp(-1), 4);
  });

  it('discrete integrator Ts/(z-1) updates only at its sample time (forward Euler)', () => {
    // Ts = 0.1, fixed step 0.01: y(kTs) = (k)*Ts*1 -> at t = 1 (k = 10 hits after t = 0) y = 1.0, never 0.99 / 1.01 artefacts
    const e = run([b('Constant', 'k', { value: 1 }), b('INTEGRATOR_DISCRETE', 'di', { sample_time: 0.1 }), b('TERMINATOR', 't')],
      [['k', 'out', 'di', 'u'], ['di', 'y', 't', 'u']], { fixedStep: 0.01 });
    expect(Number(e.getSignalValue('di', 'y'))).toBeCloseTo(1.0, 9);
  });

  it('discrete integrator gives the same result whatever the solver step (rate independence)', () => {
    const y = (fixedStep: number) => Number(run(
      [b('Constant', 'k', { value: 2 }), b('INTEGRATOR_DISCRETE', 'di', { sample_time: 0.1 }), b('TERMINATOR', 't')],
      [['k', 'out', 'di', 'u'], ['di', 'y', 't', 'u']], { fixedStep }).getSignalValue('di', 'y'));
    expect(y(0.01)).toBeCloseTo(y(0.05), 9);
    expect(y(0.01)).toBeCloseTo(y(0.1), 9);
  });

  it('discrete first order 0.1/(z-0.9), Ts=0.1, step response follows 1 - 0.9^k', () => {
    const e = run([b('Constant', 'k', { value: 1 }), b('DISCRETE_TRANSFER_FUNCTION', 'dtf', { numerator: [0.1], denominator: [1, -0.9], sampleTime: 0.1 }), b('TERMINATOR', 't')],
      [['k', 'out', 'dtf', 'u'], ['dtf', 'y', 't', 'u']], { fixedStep: 0.01 });
    // hits at t = 0, 0.1, ..., 1.0 -> output at t = 1 is y(10) = 1 - 0.9^10
    expect(Number(e.getSignalValue('dtf', 'y'))).toBeCloseTo(1 - 0.9 ** 10, 9);
  });

  it('z -> s: a discrete (ZOH) staircase integrated by a continuous integrator', () => {
    // discrete integrator output is the staircase y_d(t) = Ts*floor(t/Ts) (u = 1, Ts = 0.1);
    // its continuous integral over [0,1] is Ts^2 * (0+1+...+9) = 0.45
    const e = run(
      [b('Constant', 'k', { value: 1 }), b('INTEGRATOR_DISCRETE', 'di', { sample_time: 0.1 }), b('INTEGRATOR_CONTINUOUS', 'ci'), b('TERMINATOR', 't')],
      [['k', 'out', 'di', 'u'], ['di', 'y', 'ci', 'u'], ['ci', 'y', 't', 'u']],
      { fixedStep: 0.01 },
    );
    expect(Number(e.getSignalValue('ci', 'y'))).toBeCloseTo(0.45, 6);
  });

  it('s -> z: a continuous ramp sampled by a unit delay holds the previous sample', () => {
    // ramp r(t) = t from a continuous integrator; unit delay Ts = 0.1 outputs r((k-1)Ts) at t = kTs
    const e = run(
      [b('Constant', 'k', { value: 1 }), b('INTEGRATOR_CONTINUOUS', 'ci'), b('UNIT_DELAY', 'ud', { sampleTime: 0.1 }), b('TERMINATOR', 't')],
      [['k', 'out', 'ci', 'u'], ['ci', 'y', 'ud', 'u'], ['ud', 'y', 't', 'u']],
      { fixedStep: 0.01 },
    );
    expect(Number(e.getSignalValue('ud', 'y'))).toBeCloseTo(0.9, 6);
  });
});
