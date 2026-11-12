import type { VariableType } from '../../types/sm_types';
import type { ActionNode, ExpressionNode } from './smExpressions';
import {
  I64_MAX,
  I64_MIN,
  arithmeticModeFor,
  integerRangeOf,
  isFloatType,
  kindOfType,
  mayFault,
  type ArithmeticMode,
  type NumericKind,
} from './smArithmetic';
import type { SemanticVariable } from './smSemanticModel';

const UNSIGNED_TYPES = new Set<VariableType>([
  'uint',
  'uint8',
  'uint16',
  'uint32',
  'uint64',
]);

const FLOAT_TYPES = new Set<VariableType>(['float', 'single']);

const variableType = (
  node: ExpressionNode,
  variables: Readonly<Record<string, SemanticVariable>>,
): VariableType | undefined => {
  if (node.kind === 'variable') {
    return Object.values(variables).find((variable) =>
      variable.id === node.name
      || variable.name === node.name
      || variable.cName === node.cName)?.type;
  }
  if (node.kind === 'unary') return variableType(node.operand, variables);
  if (node.kind === 'binary') {
    return variableType(node.left, variables)
      ?? variableType(node.right, variables);
  }
  if (node.kind === 'call') return variableType(node.argument, variables);
  return undefined;
};

/** A valid C floating literal for a finite number (never appends '.0' to an exponent form). */
export const renderDoubleLiteral = (value: number): string => {
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
};

const renderLiteral = (
  value: number | boolean,
  expectedType?: VariableType,
): string => {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (FLOAT_TYPES.has(expectedType as VariableType)) {
    return `${renderDoubleLiteral(value)}f`;
  }
  if (expectedType === 'double') {
    return renderDoubleLiteral(value);
  }
  if (UNSIGNED_TYPES.has(expectedType as VariableType) && value >= 0) {
    return `${value}U`;
  }
  return String(value);
};

const renderNode = (
  node: ExpressionNode,
  variables: Readonly<Record<string, SemanticVariable>>,
  expectedType?: VariableType,
  resolveVariable?: (
    node: Extract<ExpressionNode, { kind: 'variable' }>,
  ) => string | undefined,
): string => {
  switch (node.kind) {
    case 'variable':
      return resolveVariable?.(node) ?? `instance->data.${node.cName}`;
    case 'literal':
      return renderLiteral(node.value, expectedType);
    case 'binary': {
      const operandType = variableType(node.left, variables)
        ?? variableType(node.right, variables)
        ?? expectedType;
      return `(${renderNode(node.left, variables, operandType, resolveVariable)} ${node.operator} ${renderNode(node.right, variables, operandType, resolveVariable)})`;
    }
    case 'unary':
      return `(${node.operator}${renderNode(
        node.operand,
        variables,
        variableType(node.operand, variables) ?? expectedType,
        resolveVariable,
      )})`;
    case 'call':
      return `${node.functionName}(${renderNode(
        node.argument,
        variables,
        variableType(node.argument, variables) ?? expectedType,
        resolveVariable,
      )})`;
  }
};

export const renderCExpression = (
  node: ExpressionNode,
  variables: Readonly<Record<string, SemanticVariable>> = {},
  expectedType?: VariableType,
  resolveVariable?: (
    node: Extract<ExpressionNode, { kind: 'variable' }>,
  ) => string | undefined,
): string => renderNode(node, variables, expectedType, resolveVariable);

const cType = (type: VariableType): string => {
  switch (type) {
    case 'bool': return 'bool';
    case 'int':
    case 'int32': return 'int32_t';
    case 'uint':
    case 'uint32': return 'uint32_t';
    case 'int8': return 'int8_t';
    case 'uint8': return 'uint8_t';
    case 'int16': return 'int16_t';
    case 'uint16': return 'uint16_t';
    case 'int64': return 'int64_t';
    case 'uint64': return 'uint64_t';
    case 'float':
    case 'single': return 'float';
    case 'double': return 'double';
  }
};

/*
 * Typed rendering (see smArithmetic.ts for the rules). In 'int64' mode integer expressions are
 * int64_t built from the saturating helpers in sm_core.h; in 'double' mode (C90) they are
 * double. Floating expressions are double in both. Arithmetic errors set a pending flag on the
 * instance; a guard consumes it (false) and an assignment consumes it (skipped).
 */
interface Rendered { code: string; kind: NumericKind; literal?: number }

interface RenderContext {
  variables: Readonly<Record<string, SemanticVariable>>;
  mode: ArithmeticMode;
}

type VariableNode = Extract<ExpressionNode, { kind: 'variable' }>;

const findVariable = (
  node: VariableNode,
  variables: Readonly<Record<string, SemanticVariable>>,
): SemanticVariable | undefined =>
  Object.values(variables).find((variable) =>
    variable.id === node.name
    || variable.name === node.name
    || variable.cName === node.cName);

const intType = (ctx: RenderContext): string => (ctx.mode === 'int64' ? 'int64_t' : 'double');

const intLiteral = (value: number, ctx: RenderContext): string => {
  if (ctx.mode === 'double') return renderDoubleLiteral(value);
  const text = String(Math.abs(value));
  const suffixed = Math.abs(value) >= 2147483648 ? `${text}LL` : text;
  return `((int64_t)${value < 0 ? '-' : ''}${suffixed})`;
};

const asBool = (value: Rendered, ctx: RenderContext): string => {
  if (value.kind === 'bool') return value.code;
  if (value.kind === 'float' || ctx.mode === 'double') return `(${value.code} != 0.0)`;
  return `(${value.code} != 0)`;
};

const asInt = (value: Rendered, ctx: RenderContext): string =>
  value.kind === 'bool' ? `((${intType(ctx)})(${value.code}))` : value.code;

const asDouble = (value: Rendered): string => {
  if (value.kind === 'float') return value.code;
  if (value.literal !== undefined) return renderDoubleLiteral(value.literal);
  return `((double)(${value.code}))`;
};

const renderTyped = (node: ExpressionNode, ctx: RenderContext): Rendered => {
  switch (node.kind) {
    case 'literal':
      if (typeof node.value === 'boolean') {
        return { code: node.value ? 'true' : 'false', kind: 'bool' };
      }
      return node.floating === true
        ? { code: renderDoubleLiteral(node.value), kind: 'float' }
        : { code: intLiteral(node.value, ctx), kind: 'int', literal: node.value };
    case 'variable': {
      const variable = findVariable(node, ctx.variables);
      const access = `instance->data.${variable?.cName ?? node.cName}`;
      const kind = kindOfType(variable?.type);
      if (kind === 'bool') return { code: access, kind };
      if (kind === 'float') return { code: `((double)${access})`, kind };
      if (ctx.mode === 'double') return { code: `((double)${access})`, kind };
      return variable?.type === 'uint64'
        ? { code: `SM_U64ToI64(${access})`, kind }
        : { code: `((int64_t)${access})`, kind };
    }
    case 'unary': {
      const operand = renderTyped(node.operand, ctx);
      if (node.operator === '!') return { code: `(!${asBool(operand, ctx)})`, kind: 'bool' };
      if (operand.kind === 'float') {
        return { code: `(${node.operator}${operand.code})`, kind: 'float' };
      }
      const value = asInt(operand, ctx);
      if (node.operator === '+') return { code: value, kind: 'int' };
      return {
        code: ctx.mode === 'int64' ? `SM_NegI64(${value})` : `(0.0 - ${value})`,
        kind: 'int',
      };
    }
    case 'call': {
      const argument = renderTyped(node.argument, ctx);
      if (node.functionName === 'abs' && argument.kind !== 'float') {
        const value = asInt(argument, ctx);
        return { code: ctx.mode === 'int64' ? `SM_AbsI64(${value})` : `fabs(${value})`, kind: 'int' };
      }
      const fn = node.functionName === 'abs' ? 'fabs' : node.functionName;
      return { code: `SM_ChkD(instance, ${fn}(${asDouble(argument)}))`, kind: 'float' };
    }
    case 'binary': {
      const left = renderTyped(node.left, ctx);
      const right = renderTyped(node.right, ctx);
      if (node.operator === '&&' || node.operator === '||') {
        return {
          code: `(${asBool(left, ctx)} ${node.operator} ${asBool(right, ctx)})`,
          kind: 'bool',
        };
      }
      const floating = left.kind === 'float' || right.kind === 'float';
      switch (node.operator) {
        case '==': case '!=': case '<': case '<=': case '>': case '>=': {
          const a = floating ? asDouble(left) : asInt(left, ctx);
          const b = floating ? asDouble(right) : asInt(right, ctx);
          return { code: `(${a} ${node.operator} ${b})`, kind: 'bool' };
        }
        default:
          break;
      }
      if (floating || ctx.mode === 'double') {
        const a = floating ? asDouble(left) : asInt(left, ctx);
        const b = floating ? asDouble(right) : asInt(right, ctx);
        const kind: NumericKind = floating ? 'float' : 'int';
        switch (node.operator) {
          case '/':
            return {
              code: floating
                ? `SM_DivD(instance, ${a}, ${b})`
                : `SM_DivInt(instance, ${a}, ${b})`,
              kind,
            };
          case '%':
            return { code: `SM_RemD(instance, ${a}, ${b})`, kind };
          default:
            return { code: `SM_ChkD(instance, (${a} ${node.operator} ${b}))`, kind };
        }
      }
      const a = asInt(left, ctx);
      const b = asInt(right, ctx);
      const helper: Record<string, string> = {
        '+': 'SM_AddI64(', '-': 'SM_SubI64(', '*': 'SM_MulI64(',
        '/': 'SM_DivI64(instance, ', '%': 'SM_RemI64(instance, ',
      };
      return { code: `${helper[node.operator]}${a}, ${b})`, kind: 'int' };
    }
  }
};

const typedContext = (
  variables: Readonly<Record<string, SemanticVariable>>,
  cStandard?: string,
): RenderContext => ({ variables, mode: arithmeticModeFor(cStandard) });

/** C boolean expression for a guard; an arithmetic error makes the guard false. */
export const renderCGuard = (
  node: ExpressionNode,
  variables: Readonly<Record<string, SemanticVariable>>,
  cStandard?: string,
): string => {
  const ctx = typedContext(variables, cStandard);
  const rendered = asBool(renderTyped(node, ctx), ctx);
  const faults = mayFault(node, (variable) => findVariable(variable, variables)?.type);
  return faults ? `SM_GuardOk(instance, ${rendered})` : rendered;
};

const typeBounds = (type: VariableType, ctx: RenderContext): { min: string; max: string } => {
  const range = integerRangeOf(type);
  if (range === null) throw new Error(`type '${type}' has no integer range`);
  if (ctx.mode === 'double') {
    return { min: renderDoubleLiteral(Number(range.min)), max: renderDoubleLiteral(Number(range.max)) };
  }
  const render = (value: bigint): string => {
    if (value === I64_MIN) return 'INT64_MIN';
    if (value === I64_MAX) return 'INT64_MAX';
    const abs = value < 0n ? -value : value;
    return `${value < 0n ? '-' : ''}${abs}${abs >= 2147483648n ? 'LL' : ''}`;
  };
  return { min: render(range.min), max: render(range.max) };
};

export const renderCAction = (
  action: Extract<ActionNode, { kind: 'assign' }>,
  variables: Readonly<Record<string, SemanticVariable>>,
  cStandard?: string,
  indent = '',
): string => {
  const target = variables[action.target];
  if (target === undefined) {
    throw new Error(`action target '${action.target}' is absent from semantic IR`);
  }
  const ctx = typedContext(variables, cStandard);
  const value = renderTyped(action.value, ctx);
  const destination = `instance->data.${target.cName}`;
  const errorOnOverflow = target.overflowPolicy === 'error' ? 'true' : 'false';
  let tmpType: string;
  let call: string;
  let cast: string;
  if (target.type === 'bool') {
    tmpType = 'bool';
    call = `SM_StoreBool(instance, ${asBool(value, ctx)}, &sm_tmp)`;
    cast = 'sm_tmp';
  } else if (target.type === 'double') {
    tmpType = 'double';
    call = `SM_StoreDouble(instance, ${asDouble(value)}, &sm_tmp)`;
    cast = 'sm_tmp';
  } else if (isFloatType(target.type)) {
    tmpType = 'float';
    call = `SM_StoreFloat(instance, ${asDouble(value)}, ${errorOnOverflow}, &sm_tmp)`;
    cast = 'sm_tmp';
  } else {
    const bounds = typeBounds(target.type, ctx);
    if (ctx.mode === 'double') {
      tmpType = 'double';
      call = `SM_StoreIntD(instance, ${asDouble(value)}, ${bounds.min}, ${bounds.max}, ${errorOnOverflow}, &sm_tmp)`;
    } else {
      tmpType = 'int64_t';
      call = value.kind === 'float'
        ? `SM_StoreDoubleToI64(instance, ${value.code}, ${bounds.min}, ${bounds.max}, ${errorOnOverflow}, &sm_tmp)`
        : `SM_StoreI64(instance, ${asInt(value, ctx)}, ${bounds.min}, ${bounds.max}, ${errorOnOverflow}, &sm_tmp)`;
    }
    cast = `(${cType(target.type)})sm_tmp`;
  }
  return [
    `${indent}{`,
    `${indent}    ${tmpType} sm_tmp;`,
    `${indent}    if (${call}) {`,
    `${indent}        ${destination} = ${cast};`,
    `${indent}    }`,
    `${indent}}`,
  ].join('\n');
};

export const renderCType = cType;

export const renderCInitialValue = (
  variable: SemanticVariable,
): string => renderLiteral(variable.initialValue, variable.type);

export function outerParenthesesWrapWholeExpression(expression: string): boolean {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
    return false;
  }
  let depth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
      if (depth === 0 && i < trimmed.length - 1) {
        return false;
      }
    }
  }
  return depth === 0;
}

export function unwrapTopLevelCondition(expression: string): string {
  let value = expression.trim();
  while (
    value.startsWith('(') &&
    value.endsWith(')') &&
    outerParenthesesWrapWholeExpression(value)
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

