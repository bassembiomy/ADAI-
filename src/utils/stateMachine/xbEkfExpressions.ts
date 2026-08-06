import { parseCondition, type ExpressionNode, type SymbolDeclarations } from './smExpressions';

export interface EkfExpressionLimits {
  maxNodes: number;
  maxExpressions: number;
}

const enforcePolicy = (node: ExpressionNode): void => {
  if (node.kind === 'literal' || node.kind === 'variable') return;
  if (node.kind === 'unary') {
    enforcePolicy(node.operand);
    return;
  }
  if (node.kind === 'call') {
    if (!['sin', 'cos', 'exp', 'sqrt', 'abs'].includes(node.functionName)) {
      throw new Error(`Forbidden function call: ${node.functionName}`);
    }
    enforcePolicy(node.argument);
    return;
  }
  if (node.kind === 'binary') {
    if (!['+', '-', '*', '/', '%'].includes(node.operator)) {
      throw new Error(`Forbidden operator: ${node.operator}`);
    }
    enforcePolicy(node.left);
    enforcePolicy(node.right);
    return;
  }
  throw new Error(`Unknown expression node kind: ${(node as any).kind}`);
};

const countNodes = (node: ExpressionNode): number => {
  if (node.kind === 'literal' || node.kind === 'variable') return 1;
  if (node.kind === 'unary') return 1 + countNodes(node.operand);
  if (node.kind === 'call') return 1 + countNodes(node.argument);
  return 1 + countNodes(node.left) + countNodes(node.right);
};

export const compileEkfVectorExpressions = (
  expressions: readonly string[],
  symbols: SymbolDeclarations,
  limits: EkfExpressionLimits,
): readonly ExpressionNode[] => {
  if (expressions.length > limits.maxExpressions) {
    throw new Error(`Too many expressions: ${expressions.length} > ${limits.maxExpressions}`);
  }
  
  const nodes = expressions.map((expr) => {
    // We reuse smExpressions tokenizer/parser which will throw on invalid syntax.
    // It already checks that the variable exists in `symbols`.
    const node = parseCondition(expr, symbols);
    enforcePolicy(node);
    return node;
  });
  
  const totalNodes = nodes.reduce((sum, node) => sum + countNodes(node), 0);
  if (totalNodes > limits.maxNodes) {
    throw new Error(`Expression too complex: ${totalNodes} nodes > ${limits.maxNodes}`);
  }
  
  return nodes;
};

export const evaluateEkfAst = (node: ExpressionNode, x: number[][], u: number[][], dt: number): number => {
  if (node.kind === 'literal') return Number(node.value);
  if (node.kind === 'variable') {
    if (node.name === 'dt') return dt;
    if (node.name.startsWith('x')) return x[parseInt(node.name.slice(1), 10)]?.[0] ?? 0;
    if (node.name.startsWith('u')) return u[parseInt(node.name.slice(1), 10)]?.[0] ?? 0;
    return 0; // should not happen
  }
  if (node.kind === 'unary') {
    const val = evaluateEkfAst(node.operand, x, u, dt);
    if (node.operator === '!') return val ? 0 : 1;
    if (node.operator === '+') return val;
    if (node.operator === '-') return -val;
    return val;
  }
  if (node.kind === 'call') {
    const val = evaluateEkfAst(node.argument, x, u, dt);
    switch (node.functionName) {
      case 'sin': return Math.sin(val);
      case 'cos': return Math.cos(val);
      case 'exp': return Math.exp(val);
      case 'sqrt': return Math.sqrt(val);
      case 'abs': return Math.abs(val);
      default: return 0;
    }
  }
  if (node.kind === 'binary') {
    const l = evaluateEkfAst(node.left, x, u, dt);
    const r = evaluateEkfAst(node.right, x, u, dt);
    switch (node.operator) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '/': return l / r;
      case '%': return l % r;
      default: return 0;
    }
  }
  return 0;
};

export const evaluateEkfVector = (asts: ExpressionNode[], x: number[][], u: number[][], dt: number): number[][] => {
  return asts.map(ast => [evaluateEkfAst(ast, x, u, dt)]);
};

export const computeEkfJacobian = (asts: ExpressionNode[], x: number[][], u: number[][], dt: number, epsilon: number): number[][] => {
  const J: number[][] = [];
  for (let i = 0; i < asts.length; i++) {
    J[i] = [];
    for (let j = 0; j < x.length; j++) {
      const xPlus = x.map(row => [...row]);
      xPlus[j][0] += epsilon;
      const xMinus = x.map(row => [...row]);
      xMinus[j][0] -= epsilon;
      const fPlus = evaluateEkfAst(asts[i], xPlus, u, dt);
      const fMinus = evaluateEkfAst(asts[i], xMinus, u, dt);
      J[i][j] = (fPlus - fMinus) / (2 * epsilon);
    }
  }
  return J;
};
