// WP-15: requirement condition language. Contract: plan §7.3

export type SimBinaryOp = '||' | '&&' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '+' | '-' | '*' | '/';
export type SimCallName = 'abs' | 'min' | 'max';

export type SimExprNode =
  | { kind: 'num'; value: number }
  | { kind: 'alias'; name: string }
  | { kind: 'unary'; op: '!' | '-'; arg: SimExprNode }
  | { kind: 'binary'; op: SimBinaryOp; left: SimExprNode; right: SimExprNode }
  | { kind: 'call'; name: SimCallName; args: SimExprNode[] };

export type SimExprParse =
  | { ok: true; ast: SimExprNode; aliases: string[] }
  | { ok: false; error: string; at: number };

type Token =
  | { t: 'num'; value: number; at: number }
  | { t: 'id'; name: string; at: number }
  | { t: 'op'; op: string; at: number }
  | { t: 'eof'; at: number };

class SimParseError extends Error {
  constructor(message: string, public at: number) {
    super(message);
  }
}

const FUNCS = ['abs', 'min', 'max'];
const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdStart = (c: string) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    const start = i;
    if (isDigit(c) || (c === '.' && i + 1 < src.length && isDigit(src[i + 1]))) {
      while (i < src.length && isDigit(src[i])) i++;
      if (src[i] === '.') {
        i++;
        while (i < src.length && isDigit(src[i])) i++;
      }
      if (src[i] === 'e' || src[i] === 'E') {
        let j = i + 1;
        if (src[j] === '+' || src[j] === '-') j++;
        if (j < src.length && isDigit(src[j])) {
          while (j < src.length && isDigit(src[j])) j++;
          i = j;
        }
      }
      out.push({ t: 'num', value: Number(src.slice(start, i)), at: start });
      continue;
    }
    if (isIdStart(c)) {
      while (i < src.length && (isIdStart(src[i]) || isDigit(src[i]))) i++;
      out.push({ t: 'id', name: src.slice(start, i), at: start });
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['||', '&&', '==', '!=', '<=', '>='].includes(two)) {
      out.push({ t: 'op', op: two, at: start });
      i += 2;
      continue;
    }
    if (c === '=') throw new SimParseError("Single '=' is not an operator; use '==' to compare", start);
    if (c === '&') throw new SimParseError("Single '&' is not an operator; use '&&'", start);
    if (c === '|') throw new SimParseError("Single '|' is not an operator; use '||'", start);
    if ('<>+-*/!(),'.includes(c)) {
      out.push({ t: 'op', op: c, at: start });
      i++;
      continue;
    }
    throw new SimParseError(`Unexpected character '${c}'`, start);
  }
  out.push({ t: 'eof', at: src.length });
  return out;
}

export function parseSimExpression(src: string): SimExprParse {
  try {
    const toks = tokenize(src);
    let p = 0;
    const aliases: string[] = [];
    const peek = () => toks[p];
    const isOp = (...ops: string[]) => {
      const k = toks[p];
      return k.t === 'op' && ops.includes(k.op);
    };
    const describe = (k: Token) =>
      k.t === 'eof' ? 'end of input' : k.t === 'num' ? 'number' : k.t === 'id' ? `'${k.name}'` : `'${k.op}'`;

    const binaryLevel = (ops: string[], next: () => SimExprNode) => (): SimExprNode => {
      let left = next();
      while (isOp(...ops)) {
        const op = (toks[p++] as { op: string }).op as SimBinaryOp;
        left = { kind: 'binary', op, left, right: next() };
      }
      return left;
    };

    const primary = (): SimExprNode => {
      const k = peek();
      if (k.t === 'num') {
        p++;
        return { kind: 'num', value: k.value };
      }
      if (k.t === 'id') {
        const next = toks[p + 1];
        const isCall = next.t === 'op' && next.op === '(';
        if (isCall) {
          if (!FUNCS.includes(k.name)) throw new SimParseError(`Unknown function '${k.name}'`, k.at);
          p += 2;
          const args: SimExprNode[] = [];
          if (!isOp(')')) {
            args.push(orExpr());
            while (isOp(',')) {
              p++;
              args.push(orExpr());
            }
          }
          if (!isOp(')')) throw new SimParseError(`Expected ')' but found ${describe(peek())}`, peek().at);
          p++;
          const okArity = k.name === 'abs' ? args.length === 1 : args.length >= 2;
          if (!okArity) {
            throw new SimParseError(
              k.name === 'abs' ? "'abs' takes exactly 1 argument" : `'${k.name}' takes at least 2 arguments`,
              k.at,
            );
          }
          return { kind: 'call', name: k.name as SimCallName, args };
        }
        p++;
        if (k.name === 'true') return { kind: 'num', value: 1 };
        if (k.name === 'false') return { kind: 'num', value: 0 };
        if (FUNCS.includes(k.name)) {
          throw new SimParseError(`'${k.name}' is a function name and cannot be used as a value`, k.at);
        }
        if (!aliases.includes(k.name)) aliases.push(k.name);
        return { kind: 'alias', name: k.name };
      }
      if (isOp('(')) {
        p++;
        const inner = orExpr();
        if (!isOp(')')) throw new SimParseError(`Expected ')' but found ${describe(peek())}`, peek().at);
        p++;
        return inner;
      }
      throw new SimParseError(`Unexpected ${describe(k)}`, k.at);
    };

    const unary = (): SimExprNode => {
      if (isOp('!', '-')) {
        const op = (toks[p++] as { op: string }).op as '!' | '-';
        return { kind: 'unary', op, arg: unary() };
      }
      return primary();
    };

    const mul = binaryLevel(['*', '/'], unary);
    const add = binaryLevel(['+', '-'], mul);
    const rel = binaryLevel(['<', '<=', '>', '>='], add);
    const eq = binaryLevel(['==', '!='], rel);
    const andExpr = binaryLevel(['&&'], eq);
    const orExpr: () => SimExprNode = binaryLevel(['||'], andExpr);

    const ast = orExpr();
    if (peek().t !== 'eof') throw new SimParseError(`Unexpected ${describe(peek())}`, peek().at);
    return { ok: true, ast, aliases };
  } catch (e) {
    if (e instanceof SimParseError) return { ok: false, error: e.message, at: e.at };
    throw e;
  }
}

export function evaluateSimExpression(ast: SimExprNode, env: Readonly<Record<string, number>>): number {
  switch (ast.kind) {
    case 'num':
      return ast.value;
    case 'alias': {
      if (!Object.prototype.hasOwnProperty.call(env, ast.name)) {
        throw new Error(`Alias '${ast.name}' is missing from the environment`);
      }
      return env[ast.name];
    }
    case 'unary': {
      const v = evaluateSimExpression(ast.arg, env);
      if (ast.op === '-') return -v;
      return Number.isFinite(v) ? (v === 0 ? 1 : 0) : Number.NaN;
    }
    case 'binary': {
      const a = evaluateSimExpression(ast.left, env);
      const b = evaluateSimExpression(ast.right, env);
      switch (ast.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        default: {
          if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
          switch (ast.op) {
            case '||':
              return a !== 0 || b !== 0 ? 1 : 0;
            case '&&':
              return a !== 0 && b !== 0 ? 1 : 0;
            case '==':
              return a === b ? 1 : 0;
            case '!=':
              return a !== b ? 1 : 0;
            case '<':
              return a < b ? 1 : 0;
            case '<=':
              return a <= b ? 1 : 0;
            case '>':
              return a > b ? 1 : 0;
            default:
              return a >= b ? 1 : 0;
          }
        }
      }
    }
    case 'call': {
      const vals = ast.args.map((a) => evaluateSimExpression(a, env));
      if (ast.name === 'abs') return Math.abs(vals[0]);
      return ast.name === 'min' ? Math.min(...vals) : Math.max(...vals);
    }
  }
}

export function isTruthy(v: number): boolean {
  return v !== 0;
}
