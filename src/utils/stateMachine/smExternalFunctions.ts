import type { ExternalFunctionDef, VariableType } from '../../types/sm_types';
import { parseCondition, toCIdentifier, type ActionNode, type ExpressionNode } from './smExpressions';

/*
 * External C functions (Stateflow custom code): declaration checks and call resolution shared
 * by the semantic validator, the semantic builder, the interpreter and the C renderer.
 * See smExternalFunctions.test.ts for the contract.
 */

export const BUILTIN_FUNCTION_NAMES: readonly string[] = ['sin', 'cos', 'exp', 'sqrt', 'abs', 'send'];

const C_KEYWORDS = new Set([
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extern', 'float', 'for', 'goto', 'if', 'inline', 'int', 'long', 'register', 'restrict', 'return',
  'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void',
  'volatile', 'while', 'bool', 'true', 'false', 'NULL',
]);

const PARAM_TYPES: ReadonlySet<string> = new Set([
  'bool', 'int', 'uint', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64',
  'float', 'single', 'double',
]);

export const isValidExternalType = (type: unknown): type is VariableType =>
  typeof type === 'string' && PARAM_TYPES.has(type);

export const isCIdentifier = (name: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);

/** Plain relative header name: no leading '/', no '..' segment. */
export const isValidExternalHeader = (header: string): boolean =>
  /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.h$/.test(header)
  && !header.split('/').some((segment) => segment === '..' || segment === '');

export interface ExternalCallIssue {
  code: 'SM_UNKNOWN_FUNCTION' | 'SM_FUNCTION_ARITY';
  message: string;
}

/**
 * Annotates every external call of the expression with the declared return and parameter types
 * and returns the issues found (unknown function, wrong number of arguments).
 */
export const resolveExternalCalls = (
  node: ExpressionNode,
  functions: readonly ExternalFunctionDef[] | undefined,
  issues: ExternalCallIssue[] = [],
): ExternalCallIssue[] => {
  switch (node.kind) {
    case 'literal': case 'variable': break;
    case 'unary': resolveExternalCalls(node.operand, functions, issues); break;
    case 'binary':
      resolveExternalCalls(node.left, functions, issues);
      resolveExternalCalls(node.right, functions, issues);
      break;
    case 'call': resolveExternalCalls(node.argument, functions, issues); break;
    case 'extcall': {
      node.args.forEach((arg) => resolveExternalCalls(arg, functions, issues));
      const def = functions?.find((candidate) => candidate.name === node.functionName);
      if (def === undefined) {
        issues.push({
          code: 'SM_UNKNOWN_FUNCTION',
          message: `call to undeclared function '${node.functionName}'`,
        });
      } else if (def.params.length !== node.args.length) {
        issues.push({
          code: 'SM_FUNCTION_ARITY',
          message: `function '${def.name}' takes ${def.params.length} argument(s), ${node.args.length} given`,
        });
      } else {
        node.returnType = def.returnType;
        node.paramTypes = def.params.map((param) => param.type);
      }
      break;
    }
  }
  return issues;
};

export const resolveExternalCallsInActions = (
  actions: readonly ActionNode[],
  functions: readonly ExternalFunctionDef[] | undefined,
  issues: ExternalCallIssue[] = [],
): ExternalCallIssue[] => {
  for (const action of actions) {
    if (action.kind === 'assign') resolveExternalCalls(action.value, functions, issues);
  }
  return issues;
};

/** Names of the external functions called anywhere in the expression. */
export const collectExternalCallNames = (node: ExpressionNode, into: Set<string> = new Set()): Set<string> => {
  switch (node.kind) {
    case 'literal': case 'variable': break;
    case 'unary': collectExternalCallNames(node.operand, into); break;
    case 'binary': collectExternalCallNames(node.left, into); collectExternalCallNames(node.right, into); break;
    case 'call': collectExternalCallNames(node.argument, into); break;
    case 'extcall': into.add(node.functionName); node.args.forEach((arg) => collectExternalCallNames(arg, into)); break;
  }
  return into;
};

/** Parses a simulation expression over the parameters of the function. Throws on a syntax error or a reference outside the parameters. */
export const parseSimulationExpression = (def: ExternalFunctionDef): ExpressionNode => {
  if (def.simulation.trim() === '') throw new SyntaxError('the simulation expression is empty');
  const symbols = new Map(def.params.map((param) => [param.name, { id: param.name, cName: param.name }]));
  const expression = parseCondition(def.simulation, symbols);
  if (collectExternalCallNames(expression).size > 0) {
    throw new SyntaxError('the simulation expression may not call external functions');
  }
  return expression;
};

export interface ExternalFunctionDiagnostic {
  code: 'SM_INVALID_FUNCTION';
  message: string;
  elementId: string;
}

/** Declaration-level checks of the chart's external functions (SM_INVALID_FUNCTION). */
export const validateExternalFunctionDefs = (
  functions: readonly ExternalFunctionDef[] | undefined,
  reservedNames: ReadonlySet<string>,
): ExternalFunctionDiagnostic[] => {
  const diagnostics: ExternalFunctionDiagnostic[] = [];
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const def of functions ?? []) {
    const bad = (message: string): void => {
      diagnostics.push({ code: 'SM_INVALID_FUNCTION', message: `External function '${def.name}': ${message}`, elementId: def.id });
    };
    if (typeof def.name !== 'string' || !isCIdentifier(def.name) || C_KEYWORDS.has(def.name)) {
      bad('the name is not a valid C identifier.');
    } else if (BUILTIN_FUNCTION_NAMES.includes(def.name)) {
      bad('the name clashes with a built-in function (sin, cos, exp, sqrt, abs, send).');
    } else if (reservedNames.has(def.name) || reservedNames.has(toCIdentifier(def.name))) {
      bad('the name collides with a chart variable or event.');
    }
    if (names.has(def.name)) bad('the name is declared more than once.');
    if (ids.has(def.id)) bad('the id is declared more than once.');
    names.add(def.name);
    ids.add(def.id);
    if (typeof def.header !== 'string' || !isValidExternalHeader(def.header)) {
      bad('the header must be a relative file name ending in .h, without a leading "/" or ".." segment.');
    }
    if (!isValidExternalType(def.returnType)) {
      bad(`the return type '${String(def.returnType)}' is not supported (bool, integer and floating types only).`);
    }
    const paramNames = new Set<string>();
    for (const param of def.params ?? []) {
      if (typeof param.name !== 'string' || !isCIdentifier(param.name) || C_KEYWORDS.has(param.name)) {
        bad(`parameter name '${String(param.name)}' is not a valid C identifier.`);
      }
      if (paramNames.has(param.name)) bad(`parameter '${param.name}' is declared more than once.`);
      paramNames.add(param.name);
      if (!isValidExternalType(param.type)) {
        bad(`parameter '${String(param.name)}' has unsupported type '${String(param.type)}'.`);
      }
    }
    try {
      parseSimulationExpression(def);
    } catch (error) {
      bad(`the simulation expression is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return diagnostics;
};
