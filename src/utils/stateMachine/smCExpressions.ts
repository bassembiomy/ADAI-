import type { VariableType } from '../../types/sm_types';
import type { ActionNode, ExpressionNode } from './smExpressions';
import type { SemanticVariable } from './smSemanticModel';
import { getTypeBounds } from './smTypedValue';

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

/**
 * AUTOSAR platform mode: `/` and `%` are rendered through guarded helpers (SM_Div, SM_Rem) and assignments through
 * coercing stores, so a zero divisor faults like the semantic interpreter and no value is undefined behaviour.
 * The default (Generate C/H) output is unaffected. Set only for the duration of one synchronous generation.
 */
let guardedDivision = false;

export const isDivisionGuarded = (): boolean => guardedDivision;

export const withGuardedDivision = <T>(enabled: boolean, body: () => T): T => {
  const previous = guardedDivision;
  guardedDivision = enabled;
  try {
    return body();
  } finally {
    guardedDivision = previous;
  }
};

export const expressionHasDivision = (node: ExpressionNode): boolean => {
  switch (node.kind) {
    case 'binary':
      return node.operator === '/' || node.operator === '%'
        || expressionHasDivision(node.left) || expressionHasDivision(node.right);
    case 'unary': return expressionHasDivision(node.operand);
    case 'call': return expressionHasDivision(node.argument);
    default: return false;
  }
};

const renderLiteral = (
  value: number | boolean,
  expectedType?: VariableType,
): string => {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (FLOAT_TYPES.has(expectedType as VariableType)) {
    const text = Number.isInteger(value) ? `${value}.0` : String(value);
    return `${text}f`;
  }
  if (expectedType === 'double') {
    return Number.isInteger(value) ? `${value}.0` : String(value);
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
      const left = renderNode(node.left, variables, operandType, resolveVariable);
      const right = renderNode(node.right, variables, operandType, resolveVariable);
      if (guardedDivision && (node.operator === '/' || node.operator === '%')) {
        return `${node.operator === '/' ? 'SM_Div' : 'SM_Rem'}(instance, (double)(${left}), (double)(${right}))`;
      }
      return `(${left} ${node.operator} ${right})`;
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

export const renderCAction = (
  action: ActionNode,
  variables: Readonly<Record<string, SemanticVariable>>,
): string => {
  const target = variables[action.target];
  if (target === undefined) {
    throw new Error(`action target '${action.target}' is absent from semantic IR`);
  }
  const value = renderCExpression(action.value, variables, target.type);
  if (!guardedDivision) {
    return `instance->data.${target.cName} = (${cType(target.type)})(${value});`;
  }
  // Once an arithmetic fault is latched the step is aborted in the model: no further assignment happens.
  const store = `instance->data.${target.cName}`;
  if (!expressionHasDivision(action.value)) {
    return [
      'if (instance->error_status == SM_ERR_NONE) {',
      `    ${store} = (${cType(target.type)})(${value});`,
      '}',
    ].join('\n');
  }
  const faultOnOverflow = target.overflowPolicy === 'error' ? 'true' : 'false';
  const bounds = getTypeBounds(target.type);
  const coerced = bounds !== null
    ? `SM_Coerce_Integer(instance, (double)(${value}), ${bounds.min}.0, ${bounds.max}.0, ${faultOnOverflow})`
    : `SM_Coerce_Real(instance, (double)(${value}), ${target.type === 'float' || target.type === 'single' ? 'true' : 'false'}, ${faultOnOverflow})`;
  return [
    '{',
    `    double sm_value = ${coerced};`,
    '    if (instance->error_status == SM_ERR_NONE) {',
    target.type === 'bool'
      ? `        ${store} = (sm_value != 0.0);`
      : `        ${store} = (${cType(target.type)})(sm_value);`,
    '    }',
    '}',
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

