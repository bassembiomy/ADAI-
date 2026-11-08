/**
 * Acceptance tests — Simulink-style parameter evaluation and errors for X-Bridges blocks.
 * Plan: docs/superpowers/plans/2026-11-08-xbridges-parameter-errors.md
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY, XBRIDGES_CATEGORIES } from './BlockDefinitions';
import { XbridgesEngine } from './XbridgesEngine';
import { Solvers } from './Solvers';
import { evaluateParameter, type ParameterKind } from './parameterEvaluation';
import { XB_PARAMETER_SCHEMA, parameterKind } from './parameterSchema';

const SCOPE = ['Sources', 'Element-wise Math', 'Reductions', 'Linear Algebra', 'Continuous Systems', 'Discontinuities', 'Discrete & Delay',
  'Trigonometric & Hyperbolic', 'Control & Feedback', 'Signal Processing & Observers', 'Routing & Control Flow', 'Logic Gates', 'Bitwise',
  'Sequential', 'Ports', 'Sinks'];
const TYPES: string[] = [...(XBRIDGES_CATEGORIES as any[]).filter((c) => SCOPE.includes(c.name)).flatMap((c) => c.blocks.map((b: any) => b.type)), 'UNIT_DELAY', 'MEMORY'];
/** Values computed by the block from other parameters (the user edits numerator/denominator, not these). */
const DERIVED: Record<string, string[]> = {
  TRANSFER_FUNCTION: ['A', 'B', 'C', 'D', 'x0'], DISCRETE_TRANSFER_FUNCTION: ['A', 'B', 'C', 'D', 'x0'],
  ZERO_POLE_GAIN: ['A', 'B', 'C', 'D', 'x0'], LAPLACE_TRANSFORM: ['A', 'B', 'C', 'D', 'x0'],
};
const isNumeric = (v: unknown) => typeof v === 'number' || (Array.isArray(v) && v.flat(3).every((x) => typeof x === 'number'));
const userNumericParams = (type: string) => {
  const def = BLOCK_LIBRARY[type](`${type}_def`, {});
  return Object.entries(def.params).filter(([k, v]) => isNumeric(v) && !(DERIVED[type] ?? []).includes(k)).map(([k]) => k);
};

const ok = (raw: unknown, kind: ParameterKind) => {
  const r = evaluateParameter(raw, kind);
  expect(r.ok, `${JSON.stringify(raw)} should be valid`).toBe(true);
  return (r as any).value;
};
const fail = (raw: unknown, kind: ParameterKind) => {
  const r = evaluateParameter(raw, kind);
  expect(r.ok, `${JSON.stringify(raw)} should be rejected`).toBe(false);
  return r as { ok: false; code: string; reason: string };
};

describe('evaluateParameter (MATLAB-style expressions, like a Simulink parameter dialog)', () => {
  it('accepts numbers, expressions, constants and MATLAB arrays', () => {
    expect(ok(3, { kind: 'number' })).toBe(3);
    expect(ok('1e-3', { kind: 'number' })).toBe(0.001);
    expect(ok(' 2.5 ', { kind: 'number' })).toBe(2.5);
    expect(ok('2*pi', { kind: 'number' })).toBeCloseTo(2 * Math.PI, 12);
    expect(ok('sqrt(2)/2', { kind: 'number' })).toBeCloseTo(Math.SQRT1_2, 12);
    expect(ok('inf', { kind: 'number' })).toBe(Number.POSITIVE_INFINITY);
    expect(ok('-Inf', { kind: 'number' })).toBe(Number.NEGATIVE_INFINITY);
    expect(ok('[1 2 3]', { kind: 'vector' })).toEqual([1, 2, 3]);
    expect(ok('[1, 2*2, 3]', { kind: 'vector' })).toEqual([1, 4, 3]);
    expect(ok('[1 2; 3 4]', { kind: 'matrix' })).toEqual([[1, 2], [3, 4]]);
    expect(ok([[1, 0], [0, 1]], { kind: 'matrix' })).toEqual([[1, 0], [0, 1]]);
    expect(ok('[1 2 3]', { kind: 'numeric' })).toEqual([1, 2, 3]);
    expect(ok('true', { kind: 'boolean' })).toBe(true);
    expect(ok(0, { kind: 'boolean' })).toBe(false);
  });

  it('rejects undefined names like MATLAB ("abc")', () => {
    const r = fail('abc', { kind: 'number' });
    expect(r.code).toBe('PARAMETER_INVALID');
    expect(r.reason).toMatch(/undefined/i);
    expect(r.reason).toContain('abc');
  });

  it('rejects malformed expressions', () => {
    for (const bad of ['1.2.3', '2*', '(1', '1 2 3', '[1 2', '5abc']) expect(fail(bad, { kind: 'number' }).code, bad).toBe('PARAMETER_INVALID');
  });

  it('rejects an empty field', () => {
    for (const empty of ['', '   ', null, undefined]) expect(fail(empty, { kind: 'number' }).code).toBe('PARAMETER_EMPTY');
  });

  it('does not run arbitrary code (only arithmetic and math functions)', () => {
    for (const unsafe of ['import({})', 'evaluate("1")', 'createUnit("x")', 'f(x)=x', 'x=3', 'parse("1")', 'simplify("x")'])
      expect(fail(unsafe, { kind: 'number' }).ok).toBe(false);
  });

  it('checks the expected shape', () => {
    expect(fail('[1 2 3]', { kind: 'number' }).code).toBe('PARAMETER_INVALID');
    expect(fail('[1 2; 3 4]', { kind: 'vector' }).code).toBe('PARAMETER_INVALID');
    expect(fail('[1 2; 3]', { kind: 'matrix' }).code).toBe('PARAMETER_INVALID');
    expect(fail('nan', { kind: 'number' }).code).toBe('PARAMETER_INVALID');
  });

  it('checks integers, ranges, positive values and sample times', () => {
    expect(fail('2.5', { kind: 'integer', min: 1 }).code).toBe('PARAMETER_NOT_INTEGER');
    expect(fail('0', { kind: 'integer', min: 1 }).code).toBe('PARAMETER_OUT_OF_RANGE');
    expect(ok('3', { kind: 'integer', min: 1 })).toBe(3);
    expect(fail('0', { kind: 'positive' }).code).toBe('PARAMETER_OUT_OF_RANGE');
    expect(fail('-1', { kind: 'nonnegative' }).code).toBe('PARAMETER_OUT_OF_RANGE');
    for (const v of ['-1', '0', '0.01', 'inherited', -1]) expect(evaluateParameter(v, { kind: 'sampleTime' }).ok, String(v)).toBe(true);
    for (const v of ['-2', 'abc', 'inf']) expect(evaluateParameter(v, { kind: 'sampleTime' }).ok, v).toBe(false);
  });

  it('checks options', () => {
    expect(ok('>=', { kind: 'option', options: ['>', '>=', '~=0'] })).toBe('>=');
    expect(fail('xyz', { kind: 'option', options: ['>', '>=', '~=0'] }).code).toBe('PARAMETER_OPTION_INVALID');
  });
});

describe('parameter schema covers every user-editable parameter', () => {
  it.each(TYPES)('%s', (type) => {
    for (const param of userNumericParams(type)) expect(parameterKind(type, param), `${type}.${param}`).toBeDefined();
    for (const param of Object.keys(XB_PARAMETER_SCHEMA[type] ?? {}))
      expect(Object.keys(BLOCK_LIBRARY[type](`${type}_x`, {}).params), `${type}.${param} exists`).toContain(param);
  });

  it('declares the option lists of enumerated parameters', () => {
    for (const [type, param] of [['SWITCH', 'criteria'], ['PID_BASIC', 'mode'], ['PID_CONTROLLER', 'mode'], ['WaveformGen', 'type'],
      ['DATA_TYPE_CONVERSION', 'output_type'], ['DATA_TYPE_CONVERSION', 'rounding'], ['DATA_TYPE_CONVERSION', 'overflow'],
      ['PRODUCT', 'operation'], ['INTEGRATOR_DISCRETE', 'method'], ['STATE_SPACE', 'representation'], ['Constant', 'output_type']]) {
      const k = parameterKind(type, param);
      expect(k?.kind, `${type}.${param}`).toBe('option');
      const def = BLOCK_LIBRARY[type]('d', {}).params[param];
      expect((k as any).options, `${type}.${param} default is an option`).toContain(def);
    }
  });

  it('declares integer parameters as integers', () => {
    for (const [type, param] of [['Sum', 'numInputs'], ['PRODUCT', 'numInputs'], ['MUX', 'numInputs'], ['DEMUX', 'numOutputs'],
      ['MOVING_AVERAGE', 'window_size'], ['DELAY', 'delay_length'], ['Register', 'bitWidth'], ['AND', 'numInputs']] as const)
      expect(parameterKind(type, param)?.kind, `${type}.${param}`).toBe('integer');
  });
});

type Conn = [string, string, string, string];
const engineOf = (blocks: any[], conns: Conn[] = []) => new XbridgesEngine({
  blocks, connections: conns.map(([sourceBlock, sourcePort, targetBlock, targetPort]) => ({ sourceBlock, sourcePort, targetBlock, targetPort })),
} as any);
const compileErrors = (blocks: any[]) => engineOf(blocks).compile().filter((d) => d.severity === 'error');

describe('compile reports invalid parameters of every block (Simulink: "Invalid setting in block")', () => {
  it.each(TYPES)('%s', (type) => {
    for (const param of userNumericParams(type)) {
      const def = BLOCK_LIBRARY[type](`${type}_d`, {});
      for (const [bad, code] of [['abc', 'PARAMETER_INVALID'], ['', 'PARAMETER_EMPTY']] as const) {
        let blk: any;
        try { blk = BLOCK_LIBRARY[type]('blk', { ...def.params, [param]: bad }); } catch { blk = { ...def, id: 'blk', params: { ...def.params, [param]: bad } }; }
        const errs = compileErrors([blk]);
        const hit = errs.find((d) => d.code === code && d.blockIds?.includes('blk'));
        expect(hit, `${type}.${param} = ${JSON.stringify(bad)} → ${code}; got ${JSON.stringify(errs.map((d) => d.code))}`).toBeDefined();
        expect(hit!.message).toContain(param);
      }
    }
  });

  it('an invalid option is reported', () => {
    expect(compileErrors([b('SWITCH', 's', { criteria: 'xyz' })]).map((d) => d.code)).toContain('PARAMETER_OPTION_INVALID');
    expect(compileErrors([b('PID_BASIC', 'p', { mode: 'PX' })]).map((d) => d.code)).toContain('PARAMETER_OPTION_INVALID');
  });

  it('integer and range rules are reported', () => {
    expect(compileErrors([b('MOVING_AVERAGE', 'm', { window_size: 2.5 })]).map((d) => d.code)).toContain('PARAMETER_NOT_INTEGER');
    expect(compileErrors([b('MOVING_AVERAGE', 'm', { window_size: 0 })]).map((d) => d.code)).toContain('PARAMETER_OUT_OF_RANGE');
    expect(compileErrors([b('LOW_PASS_FILTER', 'f', { fc: -5 })]).map((d) => d.code)).toContain('PARAMETER_OUT_OF_RANGE');
    expect(compileErrors([b('WHITE_NOISE', 'w', { variance: -1 })]).map((d) => d.code)).toContain('PARAMETER_OUT_OF_RANGE');
  });

  it('Sum signs must use + and - and match the number of inputs', () => {
    expect(compileErrors([b('Sum', 's', { signs: '+*' })]).map((d) => d.code)).toContain('SUM_SIGNS_INVALID');
    expect(compileErrors([b('Sum', 's', { signs: '+-+', numInputs: 2 })]).map((d) => d.code)).toContain('SUM_SIGNS_INVALID');
    expect(compileErrors([b('Sum', 's', { signs: '+-', numInputs: 2 })]).map((d) => d.code)).not.toContain('SUM_SIGNS_INVALID');
  });

  it('a Constant with an integer data type checks its value in simulation too', () => {
    expect(compileErrors([b('Constant', 'k', { value: 'abc', output_type: 'int8' })]).map((d) => d.code)).toContain('PARAMETER_INVALID');
    expect(compileErrors([b('Constant', 'k', { value: 300, output_type: 'int8' })]).map((d) => d.code)).toContain('CONSTANT_VALUE_OUT_OF_RANGE');
    expect(compileErrors([b('Constant', 'k', { value: 2.5, output_type: 'uint8' })]).map((d) => d.code)).toContain('CONSTANT_VALUE_NOT_REPRESENTABLE');
    expect(compileErrors([b('Constant', 'k', { value: '2*50', output_type: 'int8' })])).toEqual([]);
  });

  it('a model with an invalid parameter is not simulated', () => {
    const e = engineOf([b('Constant', 'k', { value: 'abc' }), b('INTEGRATOR_CONTINUOUS', 'i'), b('TERMINATOR', 't')],
      [['k', 'out', 'i', 'u'], ['i', 'y', 't', 'u']]);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 1, fixedStep: 0.01 } as any);
    expect(e.diagnostics.map((d) => d.code)).toContain('PARAMETER_INVALID');
    expect(Number(e.getSignalValue('i', 'y'))).toBe(0);
  });
});

const b = (type: string, id: string, params: Record<string, unknown> = {}) => BLOCK_LIBRARY[type](id, params);
const run = (blocks: any[], conns: Conn[], stopTime = 1, fixedStep = 0.001) => {
  const e = engineOf(blocks, conns);
  Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime, fixedStep } as any);
  expect(e.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return e;
};

describe('expressions are evaluated in simulation', () => {
  it('Gain 2*pi', () => {
    const e = run([b('Constant', 'k', { value: 1 }), b('GAIN', 'g', { gain: '2*pi' }), b('TERMINATOR', 't')], [['k', 'out', 'g', 'u'], ['g', 'y', 't', 'u']], 0.01, 0.01);
    expect(Number(e.getSignalValue('g', 'y'))).toBeCloseTo(2 * Math.PI, 12);
  });
  it('Constant inf and [1 2*2 3]', () => {
    const e = run([b('Constant', 'k', { value: 'inf' }), b('TERMINATOR', 't'), b('Constant', 'v', { value: '[1 2*2 3]' }), b('TERMINATOR', 't2')],
      [['k', 'out', 't', 'u'], ['v', 'out', 't2', 'u']], 0.01, 0.01);
    expect(e.getSignalValue('k', 'out')).toBe(Number.POSITIVE_INFINITY);
    expect(e.getSignalValue('v', 'out')).toEqual([1, 4, 3]);
  });
  it('transfer function coefficients typed as text: 1/(s+1)', () => {
    const e = run([b('Constant', 'k', { value: 1 }), b('TRANSFER_FUNCTION', 'tf', { numerator: '1', denominator: '[1 1]' }), b('TERMINATOR', 't')],
      [['k', 'out', 'tf', 'u'], ['tf', 'y', 't', 'u']]);
    expect(Number(e.getSignalValue('tf', 'y'))).toBeCloseTo(1 - Math.exp(-1), 4);
  });
  it('Step time written as an expression', () => {
    const e = run([b('Step', 's', { stepTime: '1/4', initialValue: 0, finalValue: '2^3' }), b('TERMINATOR', 't')], [['s', 'out', 't', 'u']], 0.5, 0.01);
    expect(Number(e.getSignalValue('s', 'out'))).toBe(8);
  });
});

describe('parameter changes while running (live canvas)', () => {
  it('applies a valid change and rejects an invalid one, keeping the last valid value', () => {
    const e = engineOf([b('Constant', 'k', { value: 1 }), b('GAIN', 'g', { gain: 2 }), b('TERMINATOR', 't')], [['k', 'out', 'g', 'u'], ['g', 'y', 't', 'u']]);
    e.options = { solver: 'ode4', startTime: 0, stopTime: 1, fixedStep: 0.01 } as any;
    e.compile(0);
    e.applyParameterUpdates('g', { gain: '3*2' });
    Solvers.stepRK4(e, 0, 0.01);
    expect(Number(e.getSignalValue('g', 'y'))).toBe(6);
    e.applyParameterUpdates('g', { gain: 'abc' });
    Solvers.stepRK4(e, 0.01, 0.01);
    expect(Number(e.getSignalValue('g', 'y'))).toBe(6);
    expect(e.diagnostics.find((d) => d.code === 'PARAMETER_INVALID' && d.blockIds?.includes('g'))).toBeDefined();
  });
});

describe('an exception inside a block is reported and stops the run (Simulink stops on a runtime error)', () => {
  it('records BLOCK_RUNTIME_FAULT and executes nothing afterwards', () => {
    const times: number[] = [];
    const thrower = {
      id: 'bad', type: 'TestThrower', params: {}, inputs: [], outputs: [{ id: 'y', name: 'y', type: 'auto', direction: 'output', value: 0 }],
      execute: (_i: any, _p: any, _s: any, t: number) => { times.push(t); if (t >= 0.05 - 1e-9) throw new Error('boom'); return { outputs: [t] }; },
    };
    const e = engineOf([thrower, b('TERMINATOR', 't')], [['bad', 'y', 't', 'u']]);
    Solvers.runFixedStep(e, { solver: 'ode1', startTime: 0, stopTime: 1, fixedStep: 0.01 } as any);
    const fault = e.diagnostics.find((d) => d.code === 'BLOCK_RUNTIME_FAULT');
    expect(fault?.severity).toBe('error');
    expect(fault?.message).toContain('boom');
    expect(Math.max(...times)).toBeLessThan(0.1);
    expect(e.hasFatalError()).toBe(true);
  });
});
