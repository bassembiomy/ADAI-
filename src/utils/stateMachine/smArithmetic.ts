import type { FixedPointFormat, FixedPointRounding, VariableOverflowPolicy, VariableType } from '../../types/sm_types';
import type { ExpressionNode } from './smExpressions';
import {
  fxAlign,
  fxDiv,
  fxRescaleDown,
  fxStoreDouble,
  fxToDouble,
  fxStore,
} from './smFixedPoint';
import { FLT_MAX } from './smTypedValue';

/*
 * Typed action-language arithmetic shared by the simulation (smInterpreter.ts) and, for the
 * typing rules, by the C renderer (smCExpressions.ts), so that both compute the same thing.
 *
 * Typing (C / Stateflow like):
 *  - bool, integer variables and integer literals are integer-typed (bool counts as 0/1);
 *  - float/single/double variables, literals written with '.', an exponent or an f suffix, and
 *    the calls sin/cos/exp/sqrt are floating (evaluated in double);
 *  - an arithmetic or comparison expression is floating when any operand is floating, integer
 *    otherwise; abs() keeps the type of its argument.
 *
 * Integer expressions are evaluated in a signed 64-bit intermediate ('int64' mode): + - * and
 * unary minus saturate at INT64_MIN/INT64_MAX (never wrap), '/' truncates toward zero, '%'
 * follows C (sign of the dividend), division/remainder by zero is an arithmetic error.
 * C90 has no 64-bit type, so with cStandard 'c90' ('double' mode) integer expressions are
 * evaluated in double: '/' truncates toward zero afterwards, '%' is fmod, nothing saturates
 * (results are exact up to 2^53).
 *
 * Fixed-point (type 'fixdt', see smFixedPoint.ts and smFixedPointSemantics.test.ts): a value is a
 * stored integer and a fraction length (integers and bool have fraction length 0). An expression
 * with a fixed-point operand and no floating operand stays fixed-point and is evaluated exactly
 * on the stored integers in the saturating 64-bit intermediate: + - align to the larger fraction
 * length, * adds fraction lengths, / yields the larger fraction length rounded with the chart
 * rounding mode, % aligns like +. Comparisons align and compare exactly. A floating operand
 * makes the expression floating (the fixed-point operand is converted to double).
 *
 * An arithmetic error (zero divisor, non-finite floating result, overflow under policy 'error')
 * calls env.fault(); the surrounding assignment is skipped and the surrounding guard is false.
 */

export type NumericKind = 'bool' | 'int' | 'float';
export type ArithmeticMode = 'int64' | 'double';

export const I64_MIN = -(1n << 63n);
export const I64_MAX = (1n << 63n) - 1n;

const FLOAT_VARIABLE_TYPES = new Set<VariableType>(['float', 'single', 'double']);

export const isFloatType = (type: VariableType): boolean => FLOAT_VARIABLE_TYPES.has(type);

export const arithmeticModeFor = (cStandard: string | undefined): ArithmeticMode =>
  cStandard === 'c90' ? 'double' : 'int64';

export const kindOfType = (type: VariableType | undefined): NumericKind => {
  if (type === undefined) return 'int';
  if (type === 'bool') return 'bool';
  return isFloatType(type) ? 'float' : 'int';
};

/** Static type of an expression (never depends on run-time values). */
export const inferKind = (
  node: ExpressionNode,
  typeOfVariable: (node: Extract<ExpressionNode, { kind: 'variable' }>) => VariableType | undefined,
): NumericKind => {
  switch (node.kind) {
    case 'literal':
      if (typeof node.value === 'boolean') return 'bool';
      return node.floating === true ? 'float' : 'int';
    case 'variable':
      return kindOfType(typeOfVariable(node));
    case 'unary': {
      if (node.operator === '!') return 'bool';
      const inner = inferKind(node.operand, typeOfVariable);
      return inner === 'float' ? 'float' : 'int';
    }
    case 'call': {
      if (node.functionName !== 'abs') return 'float';
      return inferKind(node.argument, typeOfVariable) === 'float' ? 'float' : 'int';
    }
    case 'extcall':
      return kindOfType(node.returnType);
    case 'binary': {
      switch (node.operator) {
        case '||': case '&&': case '==': case '!=': case '<': case '<=': case '>': case '>=':
          return 'bool';
        default: {
          const left = inferKind(node.left, typeOfVariable);
          const right = inferKind(node.right, typeOfVariable);
          return left === 'float' || right === 'float' ? 'float' : 'int';
        }
      }
    }
  }
};

/** True when evaluating the expression can raise an arithmetic error. */
export const mayFault = (
  node: ExpressionNode,
  typeOfVariable: (node: Extract<ExpressionNode, { kind: 'variable' }>) => VariableType | undefined,
): boolean => {
  switch (node.kind) {
    case 'literal': case 'variable': return false;
    case 'unary': return mayFault(node.operand, typeOfVariable);
    case 'call': return node.functionName !== 'abs'
      || mayFault(node.argument, typeOfVariable)
      || inferKind(node.argument, typeOfVariable) === 'float';
    case 'extcall':
      return node.args.some((arg) => mayFault(arg, typeOfVariable)) || kindOfType(node.returnType) === 'float';
    case 'binary': {
      if (mayFault(node.left, typeOfVariable) || mayFault(node.right, typeOfVariable)) return true;
      if (node.operator === '/' || node.operator === '%') return true;
      if (node.operator === '+' || node.operator === '-' || node.operator === '*') {
        return inferKind(node, typeOfVariable) === 'float';
      }
      return false;
    }
  }
};

export type ArithmeticValue =
  | { k: 'b'; v: boolean }
  | { k: 'i'; v: bigint | number }
  | { k: 'f'; v: number }
  | { k: 'x'; v: bigint; f: number };

export interface ArithmeticEnv {
  mode: ArithmeticMode;
  /** Chart rounding mode for fixed-point conversions and divisions (default 'floor'). */
  rounding?: FixedPointRounding;
  variable(name: string): { value: number | boolean; type: VariableType; fixedPoint?: FixedPointFormat };
  fault(): void;
  /** Declared external C functions (the simulation evaluates their `simulationExpression`). */
  externalFunction?(name: string): ExternalFunctionModel | undefined;
}

export interface ExternalFunctionModel {
  returnType: VariableType;
  params: { name: string; type: VariableType }[];
  simulationExpression: ExpressionNode;
}

const sat64 = (value: bigint): bigint => (value < I64_MIN ? I64_MIN : value > I64_MAX ? I64_MAX : value);

const intValue = (env: ArithmeticEnv, value: bigint | number): ArithmeticValue =>
  ({ k: 'i', v: env.mode === 'int64' ? BigInt(value) : Number(value) });

const zeroInt = (env: ArithmeticEnv): ArithmeticValue => intValue(env, 0);

const checkedDouble = (env: ArithmeticEnv, value: number): ArithmeticValue => {
  if (!Number.isFinite(value)) {
    env.fault();
    return { k: 'f', v: 0 };
  }
  return { k: 'f', v: value };
};

const asNumber = (value: ArithmeticValue): number =>
  value.k === 'b' ? (value.v ? 1 : 0)
    : value.k === 'x' ? fxToDouble(value.v, value.f)
      : Number(value.v);

const roundingOf = (env: ArithmeticEnv): FixedPointRounding => env.rounding ?? 'floor';

/** Stored integer and fraction length of a non-floating operand (bool and integers have fraction 0). */
const asFixed = (env: ArithmeticEnv, value: ArithmeticValue): { v: bigint; f: number } => {
  if (value.k === 'x') return { v: value.v, f: value.f };
  if (value.k === 'b') return { v: value.v ? 1n : 0n, f: 0 };
  if (value.k === 'i') return { v: BigInt(value.v), f: 0 };
  throw new Error('floating operand in fixed-point arithmetic');
};

/** Integer operand: bool becomes 0/1. */
const asInt = (env: ArithmeticEnv, value: ArithmeticValue): bigint | number => {
  if (value.k === 'b') return env.mode === 'int64' ? (value.v ? 1n : 0n) : (value.v ? 1 : 0);
  return value.v as bigint | number;
};

export const arithmeticTruth = (value: ArithmeticValue): boolean => {
  if (value.k === 'b') return value.v;
  if (value.k === 'f') return value.v !== 0;
  if (value.k === 'x') return value.v !== 0n;
  return value.v !== 0n && value.v !== 0;
};

const readVariable = (env: ArithmeticEnv, name: string): ArithmeticValue => {
  const { value, type, fixedPoint } = env.variable(name);
  if (type === 'bool') return { k: 'b', v: Boolean(value) };
  const numeric = Number(value);
  if (type === 'fixdt' && fixedPoint !== undefined) {
    return { k: 'x', v: BigInt(Math.round(numeric * 2 ** fixedPoint.fractionLength)), f: fixedPoint.fractionLength };
  }
  if (isFloatType(type)) return { k: 'f', v: numeric };
  if (env.mode === 'int64') {
    return { k: 'i', v: Number.isFinite(numeric) ? sat64(BigInt(Math.trunc(numeric))) : 0n };
  }
  return { k: 'i', v: numeric };
};

export const evaluateArithmetic = (
  node: ExpressionNode,
  env: ArithmeticEnv,
): ArithmeticValue => {
  switch (node.kind) {
    case 'literal':
      if (typeof node.value === 'boolean') return { k: 'b', v: node.value };
      if (node.floating === true) return { k: 'f', v: node.value };
      return intValue(env, env.mode === 'int64' ? BigInt(node.value) : node.value);
    case 'variable':
      return readVariable(env, node.name);
    case 'unary': {
      const operand = evaluateArithmetic(node.operand, env);
      if (node.operator === '!') return { k: 'b', v: !arithmeticTruth(operand) };
      if (operand.k === 'f') return { k: 'f', v: node.operator === '-' ? -operand.v : operand.v };
      if (operand.k === 'x') {
        return node.operator === '-' ? { k: 'x', v: sat64(-operand.v), f: operand.f } : operand;
      }
      const value = asInt(env, operand);
      if (node.operator === '+') return { k: 'i', v: value };
      return env.mode === 'int64'
        ? { k: 'i', v: sat64(-(value as bigint)) }
        : { k: 'i', v: 0 - (value as number) };
    }
    case 'call': {
      const argument = evaluateArithmetic(node.argument, env);
      if (node.functionName === 'abs' && argument.k === 'x') {
        return { k: 'x', v: argument.v < 0n ? sat64(-argument.v) : argument.v, f: argument.f };
      }
      if (node.functionName === 'abs' && argument.k !== 'f') {
        const value = asInt(env, argument);
        if (env.mode === 'int64') {
          const v = value as bigint;
          return { k: 'i', v: v < 0n ? sat64(-v) : v };
        }
        return { k: 'i', v: Math.abs(value as number) };
      }
      const number = asNumber(argument);
      switch (node.functionName) {
        case 'sin': return checkedDouble(env, Math.sin(number));
        case 'cos': return checkedDouble(env, Math.cos(number));
        case 'exp': return checkedDouble(env, Math.exp(number));
        case 'sqrt': return checkedDouble(env, Math.sqrt(number));
        case 'abs': return checkedDouble(env, Math.abs(number));
        default: throw new Error(`unsupported function '${node.functionName}'`);
      }
    }
    case 'extcall': return evaluateExternalCall(node, env);
    case 'binary': {
      if (node.operator === '&&') {
        return { k: 'b', v: arithmeticTruth(evaluateArithmetic(node.left, env))
          && arithmeticTruth(evaluateArithmetic(node.right, env)) };
      }
      if (node.operator === '||') {
        return { k: 'b', v: arithmeticTruth(evaluateArithmetic(node.left, env))
          || arithmeticTruth(evaluateArithmetic(node.right, env)) };
      }
      const left = evaluateArithmetic(node.left, env);
      const right = evaluateArithmetic(node.right, env);
      const floating = left.k === 'f' || right.k === 'f';
      const fixed = !floating && (left.k === 'x' || right.k === 'x');
      if (fixed) return evaluateFixed(node.operator, asFixed(env, left), asFixed(env, right), env);
      switch (node.operator) {
        case '==': case '!=': case '<': case '<=': case '>': case '>=': {
          const a = floating ? asNumber(left) : asInt(env, left);
          const b = floating ? asNumber(right) : asInt(env, right);
          let result: boolean;
          switch (node.operator) {
            case '==': result = a === b; break;
            case '!=': result = a !== b; break;
            case '<': result = a < b; break;
            case '<=': result = a <= b; break;
            case '>': result = a > b; break;
            default: result = a >= b; break;
          }
          return { k: 'b', v: result };
        }
        default:
          break;
      }
      if (floating) {
        const a = asNumber(left);
        const b = asNumber(right);
        switch (node.operator) {
          case '+': return checkedDouble(env, a + b);
          case '-': return checkedDouble(env, a - b);
          case '*': return checkedDouble(env, a * b);
          case '/':
            if (b === 0) { env.fault(); return { k: 'f', v: 0 }; }
            return checkedDouble(env, a / b);
          default:
            if (b === 0) { env.fault(); return { k: 'f', v: 0 }; }
            return checkedDouble(env, a % b);
        }
      }
      const a = asInt(env, left);
      const b = asInt(env, right);
      if (env.mode === 'int64') {
        const x = a as bigint;
        const y = b as bigint;
        switch (node.operator) {
          case '+': return { k: 'i', v: sat64(x + y) };
          case '-': return { k: 'i', v: sat64(x - y) };
          case '*': return { k: 'i', v: sat64(x * y) };
          case '/':
            if (y === 0n) { env.fault(); return zeroInt(env); }
            return { k: 'i', v: sat64(x / y) };
          default:
            if (y === 0n) { env.fault(); return zeroInt(env); }
            return { k: 'i', v: x % y };
        }
      }
      const x = a as number;
      const y = b as number;
      switch (node.operator) {
        case '+': return checkedInt(env, x + y);
        case '-': return checkedInt(env, x - y);
        case '*': return checkedInt(env, x * y);
        case '/':
          if (y === 0) { env.fault(); return zeroInt(env); }
          return checkedInt(env, Math.trunc(x / y));
        default:
          if (y === 0) { env.fault(); return zeroInt(env); }
          return checkedInt(env, x % y);
      }
    }
  }
};

/**
 * Simulation of a call of an external C function: the arguments are converted to the parameter
 * types and the simulation expression is evaluated over them (the parameters shadow the chart
 * variables); the result is converted to the return type. Conversions saturate; a non-finite
 * value is an arithmetic error (the call then yields 0).
 */
const evaluateExternalCall = (
  node: Extract<ExpressionNode, { kind: 'extcall' }>,
  env: ArithmeticEnv,
): ArithmeticValue => {
  const def = env.externalFunction?.(node.functionName);
  if (def === undefined) throw new Error(`call to undeclared function '${node.functionName}'`);
  const toValue = (value: number | boolean, type: VariableType): ArithmeticValue => {
    if (type === 'bool') return { k: 'b', v: Boolean(value) };
    if (isFloatType(type)) return { k: 'f', v: Number(value) };
    return intValue(env, env.mode === 'int64' ? BigInt(value as number) : Number(value));
  };
  const bound = new Map<string, { value: number | boolean; type: VariableType }>();
  node.args.forEach((arg, index) => {
    const param = def.params[index];
    const converted = convertForAssignment(evaluateArithmetic(arg, env), param.type, 'saturate', env);
    if (!converted.ok) {
      env.fault();
      bound.set(param.name, { value: param.type === 'bool' ? false : 0, type: param.type });
    } else {
      bound.set(param.name, { value: converted.value, type: param.type });
    }
  });
  const inner: ArithmeticEnv = {
    ...env,
    externalFunction: undefined,
    variable: (name) => {
      const entry = bound.get(name);
      if (entry === undefined) throw new Error(`'${name}' is not a parameter of '${node.functionName}'`);
      return entry;
    },
  };
  const result = evaluateArithmetic(def.simulationExpression, inner);
  const converted = convertForAssignment(result, def.returnType, 'saturate', env);
  if (!converted.ok) {
    env.fault();
    return toValue(def.returnType === 'bool' ? false : 0, def.returnType);
  }
  return toValue(converted.value, def.returnType);
};

const evaluateFixed = (
  operator: string,
  left: { v: bigint; f: number },
  right: { v: bigint; f: number },
  env: ArithmeticEnv,
): ArithmeticValue => {
  const common = Math.max(left.f, right.f);
  const a = fxAlign(left.v, common - left.f);
  const b = fxAlign(right.v, common - right.f);
  switch (operator) {
    case '==': return { k: 'b', v: a === b };
    case '!=': return { k: 'b', v: a !== b };
    case '<': return { k: 'b', v: a < b };
    case '<=': return { k: 'b', v: a <= b };
    case '>': return { k: 'b', v: a > b };
    case '>=': return { k: 'b', v: a >= b };
    case '+': return { k: 'x', v: sat64(a + b), f: common };
    case '-': return { k: 'x', v: sat64(a - b), f: common };
    case '*': return { k: 'x', v: sat64(left.v * right.v), f: left.f + right.f };
    case '/': {
      const quotient = fxDiv(fxAlign(left.v, common - left.f + right.f), right.v, roundingOf(env));
      if (quotient === null) { env.fault(); return { k: 'x', v: 0n, f: common }; }
      return { k: 'x', v: sat64(quotient), f: common };
    }
    default:
      if (b === 0n) { env.fault(); return { k: 'x', v: 0n, f: common }; }
      return { k: 'x', v: b === -1n ? 0n : a % b, f: common };
  }
};

const checkedInt = (env: ArithmeticEnv, value: number): ArithmeticValue => {
  if (!Number.isFinite(value)) {
    env.fault();
    return zeroInt(env);
  }
  return { k: 'i', v: value };
};

interface IntegerRange { min: bigint; max: bigint }

const INTEGER_RANGES: Partial<Record<VariableType, IntegerRange>> = {
  int8: { min: -128n, max: 127n },
  uint8: { min: 0n, max: 255n },
  int16: { min: -32768n, max: 32767n },
  uint16: { min: 0n, max: 65535n },
  int: { min: -2147483648n, max: 2147483647n },
  int32: { min: -2147483648n, max: 2147483647n },
  uint: { min: 0n, max: 4294967295n },
  uint32: { min: 0n, max: 4294967295n },
  int64: { min: I64_MIN, max: I64_MAX },
  // An integer intermediate never exceeds INT64_MAX, so uint64 is bounded by it.
  uint64: { min: 0n, max: I64_MAX },
};

export const integerRangeOf = (type: VariableType): IntegerRange | null => INTEGER_RANGES[type] ?? null;

export type AssignmentConversion =
  | { ok: true; value: number | boolean }
  | { ok: false };

/**
 * Converts an evaluated expression to the assignment target type. `ok: false` is an arithmetic
 * error (overflow under policy 'error' or a non-finite value): the caller must call fault()
 * and keep the old value.
 */
export const convertForAssignment = (
  value: ArithmeticValue,
  type: VariableType,
  policy: VariableOverflowPolicy,
  env: ArithmeticEnv,
  fixedPoint?: FixedPointFormat,
): AssignmentConversion => {
  if (type === 'bool') return { ok: true, value: arithmeticTruth(value) };
  if (type === 'fixdt' && fixedPoint !== undefined) {
    const errorOnOverflow = policy === 'error';
    const result = value.k === 'f'
      ? fxStoreDouble(value.v, fixedPoint, roundingOf(env), errorOnOverflow)
      : (() => {
        const operand = asFixed(env, value);
        return fxStore(operand.v, operand.f, fixedPoint, roundingOf(env), errorOnOverflow);
      })();
    return result.ok ? { ok: true, value: fxToDouble(result.stored, fixedPoint.fractionLength) } : { ok: false };
  }
  if (isFloatType(type)) {
    const numeric = asNumber(value);
    if (!Number.isFinite(numeric)) return { ok: false };
    if (type === 'double') return { ok: true, value: numeric };
    if (Math.abs(numeric) > FLT_MAX) {
      if (policy === 'error') return { ok: false };
      return { ok: true, value: Math.fround(numeric < 0 ? -FLT_MAX : FLT_MAX) };
    }
    return { ok: true, value: Math.fround(numeric) };
  }
  const range = integerRangeOf(type);
  if (range === null) return { ok: true, value: asNumber(value) };
  if (value.k === 'x') {
    const rounded = fxRescaleDown(value.v, value.f, roundingOf(env));
    if (rounded >= range.min && rounded <= range.max) return { ok: true, value: Number(rounded) };
    if (policy === 'error') return { ok: false };
    return { ok: true, value: Number(rounded < range.min ? range.min : range.max) };
  }
  if (env.mode === 'double') {
    const numeric = Math.trunc(asNumber(value));
    if (!Number.isFinite(numeric)) return { ok: false };
    const min = Number(range.min);
    const max = Number(range.max);
    if (numeric >= min && numeric <= max) return { ok: true, value: numeric === 0 ? 0 : numeric };
    if (policy === 'error') return { ok: false };
    return { ok: true, value: numeric < min ? min : max };
  }
  let exact: bigint;
  if (value.k === 'f') {
    if (!Number.isFinite(value.v)) return { ok: false };
    exact = BigInt(Math.trunc(value.v));
  } else {
    exact = BigInt(asInt(env, value));
  }
  if (exact >= range.min && exact <= range.max) return { ok: true, value: Number(exact) };
  if (policy === 'error') return { ok: false };
  return { ok: true, value: Number(exact < range.min ? range.min : range.max) };
};
