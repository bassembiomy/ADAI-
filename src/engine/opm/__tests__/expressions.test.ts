import { describe, it, expect } from 'vitest';
import { compileOpmExpression, type OpmExpressionScope } from '../expressionCompiler';
import type { OpmSourceRef } from '../executableTypes';

const source: OpmSourceRef = {
  elementId: 'proc_1',
  propertyPath: 'processExecution.guard',
};

const scope: OpmExpressionScope = {
  symbols: {
    'temperature.value': {
      id: 'temperature_value',
      name: 'temperature.value',
      cIdentifier: 'temperature_value',
      type: { kind: 'float32' },
      access: 'readWrite',
    },
    'target.value': {
      id: 'target_value',
      name: 'target.value',
      cIdentifier: 'target_value',
      type: { kind: 'float32' },
      access: 'readOnly',
    },
    'fan.enabled': {
      id: 'fan_enabled',
      name: 'fan.enabled',
      cIdentifier: 'fan_enabled',
      type: { kind: 'bool' },
      access: 'readWrite',
    },
    count: {
      id: 'count',
      name: 'count',
      cIdentifier: 'count',
      type: { kind: 'int32' },
      access: 'readWrite',
    },
    mode: {
      id: 'mode',
      name: 'mode',
      cIdentifier: 'mode',
      type: { kind: 'enum', enumId: 'enum_mode' },
      access: 'readWrite',
    },
    other_mode: {
      id: 'other_mode',
      name: 'other_mode',
      cIdentifier: 'other_mode',
      type: { kind: 'enum', enumId: 'enum_other' },
      access: 'readWrite',
    },
  },
};

describe('OPM restricted expression compiler', () => {
  it.each([
    ['1 + 2 * 3', 'add'],
    ['(1 + 2) * 3', 'multiply'],
    ['temperature.value < target.value && fan.enabled', 'and'],
  ])('parses %s with typed precedence', (text, rootOp) => {
    const res = compileOpmExpression(text, { kind: 'anyScalar' }, scope, source);
    expect(res.ir?.op).toBe(rootOp);
  });

  it.each([
    ['missing + 1', 'OPM_EXPR_UNKNOWN_REFERENCE'],
    ['fan.enabled + 1', 'OPM_EXPR_TYPE_MISMATCH'],
    ['system("erase")', 'OPM_EXPR_UNKNOWN_INTRINSIC'],
    ['2147483648', 'OPM_EXPR_INTEGER_OVERFLOW'],
  ])('rejects %s', (text, code) => {
    const res = compileOpmExpression(text, { kind: 'anyScalar' }, scope, source);
    expect(res.diagnostics.length).toBeGreaterThan(0);
    expect(res.diagnostics[0].code).toBe(code);
  });

  it('compiles arithmetic and numeric promotion', () => {
    const res = compileOpmExpression('count + 5.5', { kind: 'numeric' }, scope, source);
    expect(res.ir).toBeDefined();
    expect(res.ir?.type.kind).toBe('float32');
    expect(res.ir?.kind).toBe('binary');
    if (res.ir?.kind === 'binary') {
      expect(res.ir.op).toBe('add');
      expect(res.ir.left.type.kind).toBe('int32');
      expect(res.ir.right.type.kind).toBe('float32');
    }
  });

  it('compiles unary operations', () => {
    const notRes = compileOpmExpression('!fan.enabled', { kind: 'boolean' }, scope, source);
    expect(notRes.ir?.kind).toBe('unary');
    if (notRes.ir?.kind === 'unary') {
      expect(notRes.ir.op).toBe('not');
      expect(notRes.ir.type.kind).toBe('bool');
    }

    const negRes = compileOpmExpression('-count', { kind: 'numeric' }, scope, source);
    expect(negRes.ir?.kind).toBe('unary');
    if (negRes.ir?.kind === 'unary') {
      expect(negRes.ir.op).toBe('negate');
      expect(negRes.ir.type.kind).toBe('int32');
    }
  });

  it('compiles intrinsics: abs, min, max, clamp', () => {
    const absRes = compileOpmExpression('abs(count)', { kind: 'numeric' }, scope, source);
    expect(absRes.ir?.kind).toBe('intrinsic');
    if (absRes.ir?.kind === 'intrinsic') {
      expect(absRes.ir.name).toBe('abs');
      expect(absRes.ir.args).toHaveLength(1);
    }

    const clampRes = compileOpmExpression('clamp(temperature.value, 0.0, 100.0)', { kind: 'numeric' }, scope, source);
    expect(clampRes.ir?.kind).toBe('intrinsic');
    if (clampRes.ir?.kind === 'intrinsic') {
      expect(clampRes.ir.name).toBe('clamp');
      expect(clampRes.ir.args).toHaveLength(3);
    }
  });

  it('rejects wrong intrinsic arity', () => {
    const res = compileOpmExpression('abs(count, 2)', { kind: 'anyScalar' }, scope, source);
    expect(res.diagnostics[0].code).toBe('OPM_EXPR_WRONG_ARITY');
  });

  it('compiles enum comparisons only for matching enum types', () => {
    const valid = compileOpmExpression('mode == mode', { kind: 'boolean' }, scope, source);
    expect(valid.ir?.kind).toBe('binary');

    const invalid = compileOpmExpression('mode == other_mode', { kind: 'boolean' }, scope, source);
    expect(invalid.diagnostics[0].code).toBe('OPM_EXPR_TYPE_MISMATCH');
  });

  it('validates expected type constraints', () => {
    const boolMismatch = compileOpmExpression('count + 1', { kind: 'boolean' }, scope, source);
    expect(boolMismatch.diagnostics[0].code).toBe('OPM_EXPR_TYPE_MISMATCH');

    const numMismatch = compileOpmExpression('fan.enabled', { kind: 'numeric' }, scope, source);
    expect(numMismatch.diagnostics[0].code).toBe('OPM_EXPR_TYPE_MISMATCH');
  });
});

