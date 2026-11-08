/**
 * Simulink-style evaluation of block parameter text (MATLAB expressions).
 * Contract: docs/superpowers/plans/2026-11-08-xbridges-parameter-errors.md (WP1).
 *
 * Allowed grammar (nothing else is ever executed - this is a hand written parser, not an `eval`):
 *   numbers (1, 2.5, .5, 1e-3), the constants pi, e, eps, inf/Inf, nan/NaN (rejected in the result), true, false;
 *   operators + - * / ^ .* ./ .^ unary + -, parentheses;
 *   pure math functions (see FUNCTIONS) applied element-wise;
 *   MATLAB arrays: `[1 2 3]`, `[1, 2*2, 3]`, `[1 2; 3 4]` (inside brackets `1 -2` is two elements, `1 - 2` is one).
 * No assignment, function definition, strings, units, workspace access, `import`, `evaluate`, ...
 */
export type ParameterKind =
  | { kind: 'number' }
  | { kind: 'numeric' }
  | { kind: 'vector' }
  | { kind: 'matrix' }
  | { kind: 'integer'; min?: number; max?: number }
  | { kind: 'positive' }
  | { kind: 'nonnegative' }
  | { kind: 'sampleTime' }
  | { kind: 'boolean' }
  | { kind: 'option'; options: readonly string[] };

export type ParameterErrorCode =
  | 'PARAMETER_EMPTY'
  | 'PARAMETER_INVALID'
  | 'PARAMETER_NOT_INTEGER'
  | 'PARAMETER_OUT_OF_RANGE'
  | 'PARAMETER_OPTION_INVALID';

export type ParameterEvaluation =
  | { ok: true; value: number | number[] | number[][] | boolean | string }
  | { ok: false; code: ParameterErrorCode; reason: string };

/** Every code evaluateParameter can return, with what it means (the help guidance documents each). */
export const PARAMETER_ERROR_CODES: readonly { code: ParameterErrorCode; title: string }[] = [
  { code: 'PARAMETER_EMPTY', title: 'The field is empty' },
  { code: 'PARAMETER_INVALID', title: 'The text is not a valid expression or has the wrong shape' },
  { code: 'PARAMETER_NOT_INTEGER', title: 'An integer is required' },
  { code: 'PARAMETER_OUT_OF_RANGE', title: 'The value is outside the allowed range' },
  { code: 'PARAMETER_OPTION_INVALID', title: 'The value is not one of the allowed options' },
];

type Mat = number[][]; // rows; a scalar is the 1x1 matrix
type Tok = { t: 'num' | 'id' | 'op' | 'end'; v: string; n?: number; sp: boolean; pos: number };

class ParamError extends Error {
  constructor(readonly code: ParameterErrorCode, readonly reason: string) { super(reason); }
}
const invalid = (reason = 'Invalid expression.') => new ParamError('PARAMETER_INVALID', reason);

const CONSTANTS: Record<string, number> = {
  pi: Math.PI, e: Math.E, eps: Number.EPSILON, inf: Infinity, Inf: Infinity, nan: NaN, NaN: NaN, true: 1, false: 0,
};
const roundHalfAway = (x: number) => (x < 0 ? -Math.round(-x) : Math.round(x));
const UNARY: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, log: Math.log, log10: Math.log10, log2: Math.log2,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, floor: Math.floor, ceil: Math.ceil, round: roundHalfAway,
  fix: Math.trunc, sign: Math.sign, cbrt: Math.cbrt, deg2rad: (x) => (x * Math.PI) / 180, rad2deg: (x) => (x * 180) / Math.PI,
};
const BINARY: Record<string, (a: number, b: number) => number> = {
  atan2: Math.atan2, pow: Math.pow, hypot: Math.hypot,
  mod: (a, b) => (b === 0 ? a : a - Math.floor(a / b) * b),
  rem: (a, b) => (b === 0 ? a : a - Math.trunc(a / b) * b),
};
const REDUCERS = new Set(['min', 'max']);
export const PARAMETER_FUNCTIONS: readonly string[] = [...Object.keys(UNARY), ...Object.keys(BINARY), ...REDUCERS];

const isScalar = (m: Mat) => m.length === 1 && m[0].length === 1;
const scalar = (x: number): Mat => [[x]];
const dims = (m: Mat) => `${m.length}x${m[0]?.length ?? 0}`;

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let sp = false;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { sp = true; i++; continue; }
    const pos = i;
    const rest = src.slice(i);
    const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (num) {
      i += num[0].length;
      if (i < src.length && /[A-Za-z_0-9.]/.test(src[i]) && !/^\.[*/^]/.test(src.slice(i))) {
        // 5abc, 1.2.3 : a number must not run into a name or a second decimal point
        throw invalid();
      }
      out.push({ t: 'num', v: num[0], n: Number(num[0]), sp, pos }); sp = false; continue;
    }
    const id = /^[A-Za-z_][A-Za-z_0-9]*/.exec(rest);
    if (id) { i += id[0].length; out.push({ t: 'id', v: id[0], sp, pos }); sp = false; continue; }
    const op = /^(?:\.\*|\.\/|\.\^|[-+*/^()[\],;])/.exec(rest);
    if (op) { i += op[0].length; out.push({ t: 'op', v: op[0], sp, pos }); sp = false; continue; }
    throw invalid();
  }
  out.push({ t: 'end', v: '', sp, pos: src.length });
  return out;
}

function broadcast(a: Mat, b: Mat, f: (x: number, y: number) => number, name: string): Mat {
  if (isScalar(a)) return b.map((r) => r.map((y) => f(a[0][0], y)));
  if (isScalar(b)) return a.map((r) => r.map((x) => f(x, b[0][0])));
  if (a.length !== b.length || a[0].length !== b[0].length)
    throw invalid(`Arrays have incompatible sizes for this operation (${dims(a)} ${name} ${dims(b)}).`);
  return a.map((r, i) => r.map((x, j) => f(x, b[i][j])));
}

class Parser {
  private i = 0;
  private bracket = 0;
  constructor(private readonly toks: Tok[]) {}
  private get cur() { return this.toks[this.i]; }
  private get next() { return this.toks[this.i + 1]; }
  private isOp(v: string) { return this.cur.t === 'op' && this.cur.v === v; }

  parseAll(): Mat {
    const v = this.expr();
    if (this.cur.t !== 'end') throw invalid();
    return v;
  }

  /** In brackets, `1 -2` starts a new element: a sign after a space and before a non-space. */
  private startsNewElement(): boolean {
    return this.bracket > 0 && this.cur.sp && !this.next.sp && this.next.t !== 'end';
  }

  private expr(): Mat {
    let left = this.term();
    while ((this.isOp('+') || this.isOp('-')) && !this.startsNewElement()) {
      const op = this.cur.v; this.i++;
      const right = this.term();
      left = broadcast(left, right, op === '+' ? (x, y) => x + y : (x, y) => x - y, op);
    }
    return left;
  }

  private term(): Mat {
    let left = this.unary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('.*') || this.isOp('./')) {
      const op = this.cur.v; this.i++;
      const right = this.unary();
      if (op === '*' && !isScalar(left) && !isScalar(right)) left = this.matmul(left, right);
      else if (op === '/' && !isScalar(right)) throw invalid('Matrix division is not supported; use ./ for element-wise division.');
      else left = broadcast(left, right, op === '*' || op === '.*' ? (x, y) => x * y : (x, y) => x / y, op);
    }
    return left;
  }

  private matmul(a: Mat, b: Mat): Mat {
    if (a[0].length !== b.length) throw invalid(`Incorrect dimensions for matrix multiplication (${dims(a)} * ${dims(b)}).`);
    return a.map((row) => b[0].map((_, j) => row.reduce((s, x, k) => s + x * b[k][j], 0)));
  }

  private unary(): Mat {
    if (this.isOp('-')) { this.i++; return this.unary().map((r) => r.map((x) => -x)); }
    if (this.isOp('+')) { this.i++; return this.unary(); }
    return this.power();
  }

  private power(): Mat {
    let base = this.primary();
    while (this.isOp('^') || this.isOp('.^')) {
      const op = this.cur.v; this.i++;
      const exp = this.powerOperand();
      if (op === '^' && (!isScalar(base) || !isScalar(exp))) throw invalid('Matrix powers are not supported; use .^ for element-wise powers.');
      base = broadcast(base, exp, Math.pow, op);
    }
    return base;
  }

  private powerOperand(): Mat {
    if (this.isOp('-')) { this.i++; return this.powerOperand().map((r) => r.map((x) => -x)); }
    if (this.isOp('+')) { this.i++; return this.powerOperand(); }
    return this.primary();
  }

  private primary(): Mat {
    const tok = this.cur;
    if (tok.t === 'num') { this.i++; return scalar(tok.n as number); }
    if (tok.t === 'id') {
      this.i++;
      const callable = this.isOp('(') && !(this.bracket > 0 && this.cur.sp);
      if (callable) return this.call(tok.v);
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, tok.v)) return scalar(CONSTANTS[tok.v]);
      throw new ParamError('PARAMETER_INVALID', `Undefined function or variable '${tok.v}'.`);
    }
    if (tok.t === 'op' && tok.v === '(') {
      this.i++;
      const saved = this.bracket; this.bracket = 0;
      const v = this.expr();
      this.bracket = saved;
      if (!this.isOp(')')) throw invalid();
      this.i++;
      return v;
    }
    if (tok.t === 'op' && tok.v === '[') return this.array();
    throw invalid();
  }

  private args(): Mat[] {
    this.i++; // (
    const saved = this.bracket; this.bracket = 0;
    const list: Mat[] = [];
    if (!this.isOp(')')) {
      for (;;) {
        list.push(this.expr());
        if (this.isOp(',')) { this.i++; continue; }
        break;
      }
    }
    this.bracket = saved;
    if (!this.isOp(')')) throw invalid();
    this.i++;
    return list;
  }

  private call(name: string): Mat {
    if (!PARAMETER_FUNCTIONS.includes(name)) {
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) throw invalid();
      throw new ParamError('PARAMETER_INVALID', `Undefined function or variable '${name}'.`);
    }
    const a = this.args();
    if (name in UNARY) {
      if (a.length !== 1) throw invalid(`Incorrect number of arguments for function '${name}'.`);
      const f = UNARY[name];
      return a[0].map((r) => r.map(f));
    }
    if (name in BINARY) {
      if (a.length !== 2) throw invalid(`Incorrect number of arguments for function '${name}'.`);
      return broadcast(a[0], a[1], BINARY[name], name);
    }
    // min / max
    const pick = name === 'min' ? Math.min : Math.max;
    if (a.length === 0) throw invalid(`Incorrect number of arguments for function '${name}'.`);
    if (a.length === 1) return scalar(pick(...a[0].flat()));
    return a.reduce((acc, m) => broadcast(acc, m, (x, y) => (Number.isNaN(x) ? y : Number.isNaN(y) ? x : pick(x, y)), name));
  }

  private array(): Mat {
    this.i++; // [
    this.bracket++;
    const rows: Mat[] = [];
    let row: Mat[] = [];
    let nested = 0; // elements of the current row that are themselves bracketed
    let sawSemicolon = false;
    const flushRow = () => {
      if (row.length) rows.push(this.hcat(row));
      row = [];
    };
    for (;;) {
      if (this.cur.t === 'end') throw invalid();
      if (this.isOp(']')) { this.i++; break; }
      if (this.isOp(';')) { this.i++; sawSemicolon = true; flushRow(); continue; }
      if (this.isOp(',')) { this.i++; continue; }
      if (this.isOp('[')) nested++;
      row.push(this.expr());
    }
    // JSON-style rows, [[1 2], [3 4]] (kept from the earlier Constant syntax): bracketed elements are rows, not a concatenation.
    if (!sawSemicolon && nested > 0 && nested === row.length && row.every((r) => r.length === 1)) {
      this.bracket--;
      return this.vcat(row);
    }
    flushRow();
    this.bracket--;
    if (rows.length === 0) return [];
    return this.vcat(rows);
  }

  private hcat(parts: Mat[]): Mat {
    const nonEmpty = parts.filter((p) => p.length > 0);
    if (nonEmpty.length === 0) return [];
    const h = nonEmpty[0].length;
    if (nonEmpty.some((p) => p.length !== h)) throw invalid('Dimensions of arrays being concatenated are not consistent.');
    return Array.from({ length: h }, (_, i) => nonEmpty.flatMap((p) => p[i]));
  }

  private vcat(rows: Mat[]): Mat {
    const nonEmpty = rows.filter((p) => p.length > 0);
    if (nonEmpty.length === 0) return [];
    const w = nonEmpty[0][0].length;
    if (nonEmpty.some((p) => p[0].length !== w)) throw invalid('Dimensions of arrays being concatenated are not consistent.');
    return nonEmpty.flat();
  }
}

function toMat(raw: unknown): Mat {
  if (typeof raw === 'number') return scalar(raw);
  if (typeof raw === 'boolean') return scalar(raw ? 1 : 0);
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) throw new ParamError('PARAMETER_EMPTY', 'The field is empty.');
    return new Parser(tokenize(text)).parseAll();
  }
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    if (raw.every((x) => !Array.isArray(x))) return [raw.map((x) => scalarOf(x))];
    const rows = raw.map((r) => (Array.isArray(r) ? r.map((x) => scalarOf(x)) : [scalarOf(r)]));
    if (rows.some((r) => r.length !== rows[0].length)) throw invalid('Dimensions of arrays being concatenated are not consistent.');
    return rows;
  }
  throw invalid();
}
function scalarOf(x: unknown): number {
  const m = toMat(x);
  if (!isScalar(m)) throw invalid();
  return m[0][0];
}

const asValue = (m: Mat): number | number[] | number[][] => {
  if (isScalar(m)) return m[0][0];
  if (m.length === 1) return [...m[0]];
  if (m[0].length === 1) return m.map((r) => r[0]);
  return m.map((r) => [...r]);
};

function evaluate(raw: unknown, kind: ParameterKind): { value: number | number[] | number[][] | boolean | string } {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) throw new ParamError('PARAMETER_EMPTY', 'The field is empty.');

  if (kind.kind === 'option') {
    const text = String(raw).trim();
    if (kind.options.includes(text)) return { value: text };
    throw new ParamError('PARAMETER_OPTION_INVALID', `'${text}' is not one of the allowed values: ${kind.options.join(', ')}.`);
  }
  if (kind.kind === 'sampleTime' && typeof raw === 'string' && raw.trim() === 'inherited') return { value: 'inherited' };
  if (kind.kind === 'boolean' && typeof raw === 'string') {
    const t = raw.trim().toLowerCase();
    if (t === 'on') return { value: true };
    if (t === 'off') return { value: false };
  }

  const m = toMat(raw);
  const flat = m.flat();
  if (m.length === 0 || flat.length === 0) throw invalid('The value is an empty array.');
  // Text that evaluates to NaN is a mistake; a NaN stored as a number is accepted as is (the block diagnostics handle it).
  if (typeof raw === 'string' && flat.some((x) => Number.isNaN(x))) throw invalid('The result is not a number (NaN).');
  const needScalar = (): number => {
    if (!isScalar(m)) throw invalid(`Expected a scalar value, got a ${dims(m)} array.`);
    return m[0][0];
  };

  switch (kind.kind) {
    case 'number': return { value: needScalar() };
    case 'numeric': return { value: asValue(m) };
    case 'vector': {
      if (m.length !== 1 && m[0].length !== 1) throw invalid(`Expected a vector, got a ${dims(m)} array.`);
      return { value: flat };
    }
    case 'matrix': return { value: m.map((r) => [...r]) };
    case 'boolean': return { value: needScalar() !== 0 };
    case 'integer': {
      const x = needScalar();
      if (!Number.isInteger(x)) throw new ParamError('PARAMETER_NOT_INTEGER', `Expected an integer, got ${x}.`);
      if (kind.min !== undefined && x < kind.min) throw new ParamError('PARAMETER_OUT_OF_RANGE', `Value ${x} is below the minimum ${kind.min}.`);
      if (kind.max !== undefined && x > kind.max) throw new ParamError('PARAMETER_OUT_OF_RANGE', `Value ${x} is above the maximum ${kind.max}.`);
      return { value: x };
    }
    case 'positive': {
      const x = needScalar();
      if (!(x > 0)) throw new ParamError('PARAMETER_OUT_OF_RANGE', `Value ${x} must be greater than 0.`);
      return { value: x };
    }
    case 'nonnegative': {
      const x = needScalar();
      if (!(x >= 0)) throw new ParamError('PARAMETER_OUT_OF_RANGE', `Value ${x} must be 0 or greater.`);
      return { value: x };
    }
    case 'sampleTime': {
      const x = needScalar();
      if (!Number.isFinite(x)) throw new ParamError('PARAMETER_OUT_OF_RANGE', 'The sample time must be finite.');
      if (x < 0 && x !== -1) throw new ParamError('PARAMETER_OUT_OF_RANGE', `Sample time ${x} must be -1 (inherited) or 0 or greater.`);
      return { value: x };
    }
  }
}

/** Evaluates the text (or JSON value) of a block parameter against the kind the schema declares for it. */
export function evaluateParameter(raw: unknown, kind: ParameterKind): ParameterEvaluation {
  try {
    return { ok: true, ...(evaluate(raw, kind) as { value: any }) };
  } catch (e) {
    if (e instanceof ParamError) return { ok: false, code: e.code, reason: e.reason };
    return { ok: false, code: 'PARAMETER_INVALID', reason: 'Invalid expression.' };
  }
}
