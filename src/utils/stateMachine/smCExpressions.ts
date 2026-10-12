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

const renderFloatingText = (value: number): string => {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot render non-finite literal '${String(value)}' as C`);
  }
  const text = String(value);
  return text.includes('.') || text.includes('e') ? text : `${text}.0`;
};

const UINT32_MAX = 0xFFFFFFFF;

const renderLiteral = (
  value: number | boolean,
  expectedType?: VariableType,
): string => {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (FLOAT_TYPES.has(expectedType as VariableType)) {
    return `${renderFloatingText(value)}f`;
  }
  if (expectedType === 'double') {
    return renderFloatingText(value);
  }
  if (UNSIGNED_TYPES.has(expectedType as VariableType) && value >= 0) {
    if (!Number.isInteger(value)) return renderFloatingText(value);
    if (value > UINT32_MAX) {
      throw new Error(
        `Unsigned literal '${String(value)}' is out of range for a 32-bit target`,
      );
    }
    return `${value}U`;
  }
  return Number.isFinite(value) ? String(value) : renderFloatingText(value);
};

const SIGNED_SMALL_INT_TYPES = new Set<VariableType>([
  'int', 'int8', 'int16', 'int32',
]);

const renderMathFunction = (
  functionName: string,
  argument: ExpressionNode,
  argumentType: VariableType | undefined,
): string => {
  const isFloat = FLOAT_TYPES.has(argumentType as VariableType);
  if (functionName === 'abs') {
    // Interpreter parity: JS Math.abs is a floating-point absolute value.
    // Integer abs() is only used for a bare signed variable of <= 32 bits.
    if (
      argument.kind === 'variable'
      && SIGNED_SMALL_INT_TYPES.has(argumentType as VariableType)
    ) {
      return 'abs';
    }
    return isFloat ? 'fabsf' : 'fabs';
  }
  return isFloat ? `${functionName}f` : functionName;
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
    case 'call': {
      const argumentType = variableType(node.argument, variables) ?? expectedType;
      return `${renderMathFunction(node.functionName, node.argument, argumentType)}(${renderNode(
        node.argument,
        variables,
        argumentType,
        resolveVariable,
      )})`;
    }
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
    default:
      throw new Error(`Unsupported variable type '${String(type)}'`);
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

