export type BinaryOperator =
  | '||'
  | '&&'
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | '+'
  | '-'
  | '*'
  | '/'
  | '%';

export type UnaryOperator = '!' | '+' | '-';

export type ExpressionNode =
  | { kind: 'literal'; value: number | boolean }
  | { kind: 'variable'; name: string; cName: string }
  | {
    kind: 'binary';
    operator: BinaryOperator;
    left: ExpressionNode;
    right: ExpressionNode;
  }
  | { kind: 'unary'; operator: UnaryOperator; operand: ExpressionNode };

export type ActionNode = {
  kind: 'assign';
  target: string;
  value: ExpressionNode;
};

export interface ParsedInternalTransition {
  guard: ExpressionNode;
  actions: ActionNode[];
  afterTicks: number | null;
  triggerMode: 'condition' | 'after' | 'and' | 'or';
}

export interface SymbolReference {
  id: string;
  cName: string;
}

export type SymbolDeclarations =
  | ReadonlySet<string>
  | ReadonlyMap<string, string | SymbolReference>;

type TokenKind = 'identifier' | 'number' | 'operator' | 'punctuation' | 'eof';

interface Token {
  kind: TokenKind;
  value: string;
  offset: number;
}

const BINARY_PRECEDENCE: Readonly<Record<string, number>> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

const normalizeIdentifierOperator = (value: string): string => {
  if (value === 'and') return '&&';
  if (value === 'or') return '||';
  if (value === 'not') return '!';
  return value;
};

export const toCIdentifier = (value: string): string => {
  const normalized = value.replace(/[^A-Za-z0-9_]/g, '_');
  const prefixed = /^[A-Za-z_]/.test(normalized) ? normalized : `_${normalized}`;
  return prefixed || '_';
};

const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  let offset = 0;

  while (offset < source.length) {
    const rest = source.slice(offset);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) {
      offset += whitespace[0].length;
      continue;
    }

    if (rest.startsWith('//')) {
      const newline = rest.indexOf('\n');
      offset += newline < 0 ? rest.length : newline;
      continue;
    }

    if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/', 2);
      if (end < 0) {
        throw new SyntaxError(`unterminated comment at offset ${offset}`);
      }
      offset += end + 2;
      continue;
    }

    const number = rest.match(
      /^(?:(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?)(?:[uUlLfF]+)?/,
    );
    if (number) {
      tokens.push({ kind: 'number', value: number[0], offset });
      offset += number[0].length;
      continue;
    }

    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) {
      const value = normalizeIdentifierOperator(identifier[0]);
      tokens.push({
        kind: value === '&&' || value === '||' || value === '!'
          ? 'operator'
          : 'identifier',
        value,
        offset,
      });
      offset += identifier[0].length;
      continue;
    }

    const operator = [
      '===', '!==', '&&', '||', '<=', '>=', '==', '!=',
      '+=', '-=', '*=', '/=', '%=', '++', '--',
      '=', '+', '-', '*', '/', '%', '<', '>', '!',
    ].find((candidate) => rest.startsWith(candidate));
    if (operator) {
      tokens.push({
        kind: 'operator',
        value: operator === '===' ? '==' : operator === '!==' ? '!=' : operator,
        offset,
      });
      offset += operator.length;
      continue;
    }

    if (rest[0] === '(' || rest[0] === ')' || rest[0] === ';') {
      tokens.push({ kind: 'punctuation', value: rest[0], offset });
      offset += 1;
      continue;
    }

    throw new SyntaxError(`unexpected token '${rest[0]}' at offset ${offset}`);
  }

  tokens.push({ kind: 'eof', value: '', offset: source.length });
  return tokens;
};

class Parser {
  private readonly tokens: Token[];
  private index = 0;

  constructor(
    source: string,
    private readonly declaredSymbols?: SymbolDeclarations,
  ) {
    this.tokens = tokenize(source);
  }

  parseExpression(minimumPrecedence = 0): ExpressionNode {
    let left = this.parseUnary();

    while (true) {
      const token = this.peek();
      const precedence = BINARY_PRECEDENCE[token.value];
      if (
        token.kind !== 'operator'
        || precedence === undefined
        || precedence < minimumPrecedence
      ) {
        break;
      }

      this.index += 1;
      const right = this.parseExpression(precedence + 1);
      left = {
        kind: 'binary',
        operator: token.value as BinaryOperator,
        left,
        right,
      };
    }

    return left;
  }

  parseStatement(): ActionNode {
    const targetToken = this.consume('identifier').value;
    this.assertDeclared(targetToken);
    const target = this.resolveSymbol(targetToken).id;
    const assignment = this.consume('operator');

    if (assignment.value === '++' || assignment.value === '--') {
      return {
        kind: 'assign',
        target,
        value: {
          kind: 'binary',
          operator: assignment.value === '++' ? '+' : '-',
          left: this.variable(targetToken),
          right: { kind: 'literal', value: 1 },
        },
      };
    }

    if (!['=', '+=', '-=', '*=', '/=', '%='].includes(assignment.value)) {
      throw new SyntaxError(
        `expected assignment operator at offset ${assignment.offset}`,
      );
    }

    const parsedValue = this.parseExpression();
    const value = assignment.value === '='
      ? parsedValue
      : {
        kind: 'binary' as const,
        operator: assignment.value[0] as BinaryOperator,
        left: this.variable(targetToken),
        right: parsedValue,
      };
    return { kind: 'assign', target, value };
  }

  consumeTerminator(): void {
    if (this.peek().value === ';') {
      this.index += 1;
      return;
    }
    if (this.peek().kind !== 'eof') {
      throw new SyntaxError(
        `expected ';' at offset ${this.peek().offset}`,
      );
    }
  }

  consumeEnd(): void {
    if (this.peek().kind !== 'eof') {
      throw new SyntaxError(
        `unexpected token '${this.peek().value}' at offset ${this.peek().offset}`,
      );
    }
  }

  isAtEnd(): boolean {
    return this.peek().kind === 'eof';
  }

  private parseUnary(): ExpressionNode {
    const token = this.peek();
    if (
      token.kind === 'operator'
      && (token.value === '!' || token.value === '+' || token.value === '-')
    ) {
      this.index += 1;
      return {
        kind: 'unary',
        operator: token.value as UnaryOperator,
        operand: this.parseUnary(),
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    const token = this.peek();
    if (token.kind === 'number') {
      this.index += 1;
      const value = Number(token.value.replace(/[uUlLfF]+$/, ''));
      if (!Number.isFinite(value)) {
        throw new SyntaxError(`invalid numeric literal '${token.value}'`);
      }
      return { kind: 'literal', value };
    }

    if (token.kind === 'identifier') {
      this.index += 1;
      if (token.value === 'true' || token.value === 'false') {
        return { kind: 'literal', value: token.value === 'true' };
      }
      this.assertDeclared(token.value);
      return this.variable(token.value);
    }

    if (token.value === '(') {
      this.index += 1;
      const expression = this.parseExpression();
      this.consumeValue(')');
      return expression;
    }

    throw new SyntaxError(
      `expected expression at offset ${token.offset}`,
    );
  }

  private variable(name: string): ExpressionNode {
    const resolver = this.declaredSymbols as
      | ReadonlyMap<string, string | SymbolReference>
      | undefined;
    const resolution = typeof resolver?.get === 'function'
      ? resolver.get(name)
      : undefined;
    const symbol = typeof resolution === 'string'
      ? { id: name, cName: resolution }
      : resolution ?? { id: name, cName: name };
    return {
      kind: 'variable',
      name: symbol.id,
      cName: toCIdentifier(symbol.cName),
    };
  }

  private resolveSymbol(name: string): SymbolReference {
    const resolver = this.declaredSymbols as
      | ReadonlyMap<string, string | SymbolReference>
      | undefined;
    const resolution = typeof resolver?.get === 'function'
      ? resolver.get(name)
      : undefined;
    if (typeof resolution === 'string') return { id: name, cName: resolution };
    return resolution ?? { id: name, cName: name };
  }

  private assertDeclared(name: string): void {
    if (this.declaredSymbols && !this.declaredSymbols.has(name)) {
      throw new ReferenceError(`undeclared symbol '${name}'`);
    }
  }

  private consume(kind: TokenKind): Token {
    const token = this.peek();
    if (token.kind !== kind) {
      throw new SyntaxError(`expected ${kind} at offset ${token.offset}`);
    }
    this.index += 1;
    return token;
  }

  private consumeValue(value: string): void {
    const token = this.peek();
    if (token.value !== value) {
      throw new SyntaxError(`expected '${value}' at offset ${token.offset}`);
    }
    this.index += 1;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }
}

export const parseCondition = (
  source: string,
  declaredSymbols?: SymbolDeclarations,
): ExpressionNode => {
  if (source.trim() === '') {
    return { kind: 'literal', value: true };
  }
  const parser = new Parser(source, declaredSymbols);
  const expression = parser.parseExpression();
  parser.consumeTerminator();
  parser.consumeEnd();
  return expression;
};

export const parseActions = (
  source: string,
  declaredSymbols?: SymbolDeclarations,
): ActionNode[] => {
  const parser = new Parser(source, declaredSymbols);
  const actions: ActionNode[] = [];
  while (!parser.isAtEnd()) {
    actions.push(parser.parseStatement());
    parser.consumeTerminator();
  }
  return actions;
};

export const parseAction = (
  source: string,
  declaredSymbols?: SymbolDeclarations,
): ActionNode => {
  const actions = parseActions(source, declaredSymbols);
  if (actions.length !== 1) {
    throw new SyntaxError(`expected exactly one action, received ${actions.length}`);
  }
  return actions[0];
};

const findInternalActionSlash = (source: string): number => {
  let bracketDepth = 0;
  let parenDepth = 0;
  let inBlockComment = false;
  for (let offset = 0; offset < source.length; offset += 1) {
    const current = source[offset];
    const next = source[offset + 1];
    if (inBlockComment) {
      if (current === '*' && next === '/') {
        inBlockComment = false;
        offset += 1;
      }
      continue;
    }
    if (current === '/' && next === '*') {
      inBlockComment = true;
      offset += 1;
      continue;
    }
    if (current === '/' && next === '/') return -1;
    if (current === '[') bracketDepth += 1;
    else if (current === ']') bracketDepth -= 1;
    else if (current === '(') parenDepth += 1;
    else if (current === ')') parenDepth -= 1;
    else if (current === '/' && bracketDepth === 0 && parenDepth === 0) {
      return offset;
    }
    if (bracketDepth < 0 || parenDepth < 0) {
      throw new SyntaxError(`unbalanced internal transition at offset ${offset}`);
    }
  }
  if (inBlockComment || bracketDepth !== 0 || parenDepth !== 0) {
    throw new SyntaxError('unbalanced internal transition');
  }
  return -1;
};

export const parseInternalTransition = (
  source: string,
  declaredSymbols?: SymbolDeclarations,
): ParsedInternalTransition => {
  const actionSlash = findInternalActionSlash(source);
  const trigger = (
    actionSlash < 0 ? source : source.slice(0, actionSlash)
  ).trim();
  const actionSource = actionSlash < 0 ? '' : source.slice(actionSlash + 1);
  const openBracket = trigger.indexOf('[');
  const closeBracket = trigger.lastIndexOf(']');
  if ((openBracket < 0) !== (closeBracket < 0) || closeBracket < openBracket) {
    throw new SyntaxError('invalid internal-transition guard brackets');
  }
  const condition = openBracket < 0
    ? ''
    : trigger.slice(openBracket + 1, closeBracket);
  const afterMatch = trigger.match(/after\s*\(\s*(\d+)\s*\)/);
  let unparsedTrigger = trigger;
  if (openBracket >= 0) {
    unparsedTrigger =
      `${unparsedTrigger.slice(0, openBracket)}${unparsedTrigger.slice(closeBracket + 1)}`;
  }
  if (afterMatch) {
    unparsedTrigger = unparsedTrigger.replace(afterMatch[0], '');
  }
  const hasCondition = openBracket >= 0;
  const hasTemporal = afterMatch !== null;
  const connector = unparsedTrigger.trim();
  if (
    hasCondition
    && hasTemporal
    && connector !== '&&'
    && connector !== '||'
  ) {
    throw new SyntaxError(
      `invalid internal-transition trigger '${trigger}': expected exactly one '&&' or '||'`,
    );
  }
  if ((!hasCondition || !hasTemporal) && connector !== '') {
    throw new SyntaxError(`invalid internal-transition trigger '${trigger}'`);
  }
  const afterTicks = afterMatch ? Number(afterMatch[1]) : null;
  if (afterTicks !== null && afterTicks <= 0) {
    throw new SyntaxError('after(...) requires a positive integer threshold');
  }
  const triggerMode = hasCondition && hasTemporal
    ? connector === '||' ? 'or' : 'and'
    : hasTemporal ? 'after' : 'condition';
  return {
    guard: parseCondition(condition, declaredSymbols),
    actions: parseActions(actionSource, declaredSymbols),
    afterTicks,
    triggerMode,
  };
};

export const parseInternalTransitions = (
  source: string,
  declaredSymbols?: SymbolDeclarations,
): ParsedInternalTransition[] =>
  source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseInternalTransition(line, declaredSymbols));
