import type { VariableType } from '../../types/sm_types';
import type { ActionNode, ExpressionNode } from './smExpressions';
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

export const renderCAction = (
  action: ActionNode,
  variables: Readonly<Record<string, SemanticVariable>>,
): string => {
  const target = variables[action.target];
  if (target === undefined) {
    throw new Error(`action target '${action.target}' is absent from semantic IR`);
  }
  return `instance->data.${target.cName} = (${cType(target.type)})(${renderCExpression(
    action.value,
    variables,
    target.type,
  )});`;
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

