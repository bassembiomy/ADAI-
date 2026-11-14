/*
 * Embedded inverter / motor-control kernels for the X-Bridges pipeline.
 *
 * Each block below is defined ONCE as a small deterministic discrete-time program written in a tiny
 * expression language (C-like arithmetic on doubles). The canonical interpreter evaluates the program
 * and the C generator prints the very same expression tree as C99 double arithmetic, so the two cannot
 * drift apart; the paired conformance cases then check that they agree numerically.
 *
 * Reference semantics are the host engine's implementations in src/engine/xbridges/BlockDefinitions.ts.
 * Where the host is continuous-time, tick dependent or relies on wall-clock bookkeeping, the discrete form
 * used here is stated explicitly next to the block:
 *
 *   - dt is the block's sample period: solver step * schedule.periodSubsteps. The host's
 *     `max(1e-6, time - lastTime)` is exactly this on every step but the first (the host seeds lastTime with
 *     0 and so integrates the first step with 1e-6); the discrete form uses dt on every step.
 *   - Integrators are forward Euler: I[k+1] = I[k] + e*dt. A block whose host output uses the freshly
 *     integrated value (the PI controllers) outputs Kp*e + Ki*I[k+1] and stores I[k+1] (the host's nextState).
 *   - `time` is the simulation time at the start of the solver step (k*dt), as the host's `time` argument.
 *   - Default parameter values follow the host factories exactly, including `x || default` (a zero value
 *     selects the default) where the factory uses it and `x !== undefined ? x : default` where it uses that.
 *   - State is held in the generated instance struct in float32 (or float64 when the first output port is
 *     float64), exactly like PID_BASIC state.
 */

type Bool = 'bool';
type Num = 'num';

export type KExpr =
  | { readonly k: 'num'; readonly v: number }
  | { readonly k: 'bool'; readonly v: boolean }
  | { readonly k: 'var'; readonly n: string }
  | { readonly k: 'neg'; readonly a: KExpr }
  | { readonly k: 'not'; readonly a: KExpr }
  | { readonly k: 'bin'; readonly op: string; readonly a: KExpr; readonly b: KExpr }
  | { readonly k: 'call'; readonly fn: string; readonly args: readonly KExpr[] }
  | { readonly k: 'cond'; readonly c: KExpr; readonly a: KExpr; readonly b: KExpr };

const ARITHMETIC = new Set(['+', '-', '*', '/']);
const COMPARISON = new Set(['<', '>', '<=', '>=', '==', '!=']);
const LOGICAL = new Set(['&&', '||']);

const FUNCTION_ARITY: Readonly<Record<string, number>> = {
  sin: 1, cos: 1, sqrt: 1, fabs: 1, floor: 1, atan2: 2, fmax: 2, fmin: 2, fmod: 2,
};

const nanAwareMax = (a: number, b: number): number => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.max(a, b));
const nanAwareMin = (a: number, b: number): number => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.min(a, b));

const FUNCTIONS: Readonly<Record<string, (...args: number[]) => number>> = {
  sin: Math.sin,
  cos: Math.cos,
  sqrt: Math.sqrt,
  fabs: Math.abs,
  floor: Math.floor,
  atan2: Math.atan2,
  fmax: nanAwareMax,
  fmin: nanAwareMin,
  fmod: (a, b) => a % b,
};

// ---------------------------------------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------------------------------------

const TOKEN = /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|(&&|\|\||<=|>=|==|!=|[-+*/<>!?:(),]))/y;

interface Token { readonly kind: 'num' | 'id' | 'op' | 'end'; readonly text: string }

const tokenize = (text: string): Token[] => {
  const tokens: Token[] = [];
  TOKEN.lastIndex = 0;
  let position = 0;
  while (position < text.length) {
    TOKEN.lastIndex = position;
    const match = TOKEN.exec(text);
    if (match === null) {
      if (text.slice(position).trim() === '') break;
      throw new Error(`X-Bridges control kernel expression has an unexpected token at ${position}: ${text}`);
    }
    position = TOKEN.lastIndex;
    if (match[1] !== undefined) tokens.push({ kind: 'num', text: match[1] });
    else if (match[2] !== undefined) tokens.push({ kind: 'id', text: match[2] });
    else tokens.push({ kind: 'op', text: match[3] });
  }
  tokens.push({ kind: 'end', text: '' });
  return tokens;
};

const parseExpression = (text: string): KExpr => {
  const tokens = tokenize(text);
  let index = 0;
  const peek = (): Token => tokens[index];
  const take = (): Token => tokens[index++];
  const isOp = (op: string): boolean => peek().kind === 'op' && peek().text === op;
  const expect = (op: string): void => {
    if (!isOp(op)) throw new Error(`X-Bridges control kernel expression expected '${op}': ${text}`);
    index += 1;
  };

  const parseConditional = (): KExpr => {
    const condition = parseOr();
    if (!isOp('?')) return condition;
    take();
    const whenTrue = parseConditional();
    expect(':');
    const whenFalse = parseConditional();
    return { k: 'cond', c: condition, a: whenTrue, b: whenFalse };
  };
  const parseBinaryLevel = (ops: readonly string[], next: () => KExpr): KExpr => {
    let left = next();
    while (peek().kind === 'op' && ops.includes(peek().text)) {
      const op = take().text;
      left = { k: 'bin', op, a: left, b: next() };
    }
    return left;
  };
  const parseOr = (): KExpr => parseBinaryLevel(['||'], parseAnd);
  const parseAnd = (): KExpr => parseBinaryLevel(['&&'], parseEquality);
  const parseEquality = (): KExpr => parseBinaryLevel(['==', '!='], parseRelational);
  const parseRelational = (): KExpr => parseBinaryLevel(['<', '>', '<=', '>='], parseAdditive);
  const parseAdditive = (): KExpr => parseBinaryLevel(['+', '-'], parseMultiplicative);
  const parseMultiplicative = (): KExpr => parseBinaryLevel(['*', '/'], parseUnary);
  const parseUnary = (): KExpr => {
    if (isOp('-')) { take(); return { k: 'neg', a: parseUnary() }; }
    if (isOp('!')) { take(); return { k: 'not', a: parseUnary() }; }
    return parsePrimary();
  };
  const parsePrimary = (): KExpr => {
    const token = take();
    if (token.kind === 'num') return { k: 'num', v: Number(token.text) };
    if (token.kind === 'id') {
      if (isOp('(')) {
        take();
        const args: KExpr[] = [];
        if (!isOp(')')) {
          args.push(parseConditional());
          while (isOp(',')) { take(); args.push(parseConditional()); }
        }
        expect(')');
        const arity = FUNCTION_ARITY[token.text];
        if (arity === undefined || arity !== args.length) {
          throw new Error(`X-Bridges control kernel expression calls unsupported function '${token.text}': ${text}`);
        }
        return { k: 'call', fn: token.text, args };
      }
      return { k: 'var', n: token.text };
    }
    if (token.kind === 'op' && token.text === '(') {
      const inner = parseConditional();
      expect(')');
      return inner;
    }
    throw new Error(`X-Bridges control kernel expression is malformed: ${text}`);
  };

  const result = parseConditional();
  if (peek().kind !== 'end') throw new Error(`X-Bridges control kernel expression has trailing input: ${text}`);
  return result;
};

// ---------------------------------------------------------------------------------------------------------
// Typing, constant folding, evaluation
// ---------------------------------------------------------------------------------------------------------

const typeOf = (expression: KExpr): Bool | Num => {
  switch (expression.k) {
    case 'num': return 'num';
    case 'bool': return 'bool';
    case 'var': return 'num';
    case 'neg': return 'num';
    case 'not': return 'bool';
    case 'call': return 'num';
    case 'cond': return 'num';
    case 'bin': return COMPARISON.has(expression.op) || LOGICAL.has(expression.op) ? 'bool' : 'num';
  }
};

const requireType = (expression: KExpr, type: Bool | Num, context: string): void => {
  if (typeOf(expression) !== type) {
    throw new Error(`X-Bridges control kernel expression needs a ${type} operand for ${context}`);
  }
};

const evaluateNumber = (op: string, a: number, b: number): number | boolean => {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    case '<': return a < b;
    case '>': return a > b;
    case '<=': return a <= b;
    case '>=': return a >= b;
    case '==': return a === b;
    case '!=': return a !== b;
    default: throw new Error(`X-Bridges control kernel has unsupported operator '${op}'`);
  }
};

/** Folds literal-only subtrees. Interpreter and C generator both consume the folded tree. */
const fold = (expression: KExpr): KExpr => {
  switch (expression.k) {
    case 'num':
    case 'bool':
    case 'var':
      return expression;
    case 'neg': {
      const a = fold(expression.a);
      requireType(a, 'num', 'unary minus');
      return a.k === 'num' ? { k: 'num', v: -a.v } : { k: 'neg', a };
    }
    case 'not': {
      const a = fold(expression.a);
      requireType(a, 'bool', 'logical not');
      return a.k === 'bool' ? { k: 'bool', v: !a.v } : { k: 'not', a };
    }
    case 'call': {
      const args = expression.args.map(fold);
      args.forEach((arg) => requireType(arg, 'num', `call to ${expression.fn}`));
      if (args.every((arg) => arg.k === 'num')) {
        return { k: 'num', v: FUNCTIONS[expression.fn](...args.map((arg) => (arg as { v: number }).v)) };
      }
      return { k: 'call', fn: expression.fn, args };
    }
    case 'cond': {
      const c = fold(expression.c);
      requireType(c, 'bool', 'a conditional test');
      const a = fold(expression.a);
      const b = fold(expression.b);
      requireType(a, 'num', 'a conditional branch');
      requireType(b, 'num', 'a conditional branch');
      if (c.k === 'bool') return c.v ? a : b;
      return { k: 'cond', c, a, b };
    }
    case 'bin': {
      const a = fold(expression.a);
      const b = fold(expression.b);
      if (LOGICAL.has(expression.op)) {
        requireType(a, 'bool', expression.op);
        requireType(b, 'bool', expression.op);
        const and = expression.op === '&&';
        if (a.k === 'bool' && b.k === 'bool') return { k: 'bool', v: and ? a.v && b.v : a.v || b.v };
        if (a.k === 'bool') return and ? (a.v ? b : a) : (a.v ? a : b);
        if (b.k === 'bool') return and ? (b.v ? a : b) : (b.v ? b : a);
        return { k: 'bin', op: expression.op, a, b };
      }
      requireType(a, 'num', expression.op);
      requireType(b, 'num', expression.op);
      if (a.k === 'num' && b.k === 'num') {
        const value = evaluateNumber(expression.op, a.v, b.v);
        return typeof value === 'boolean' ? { k: 'bool', v: value } : { k: 'num', v: value };
      }
      return { k: 'bin', op: expression.op, a, b };
    }
  }
};

export const compileKernelExpression = (text: string): KExpr => fold(parseExpression(text));

const evaluate = (expression: KExpr, environment: ReadonlyMap<string, number>): number => {
  switch (expression.k) {
    case 'num': return expression.v;
    case 'bool': return expression.v ? 1 : 0;
    case 'var': {
      const value = environment.get(expression.n);
      if (value === undefined) throw new Error(`X-Bridges control kernel references unknown name '${expression.n}'`);
      return value;
    }
    case 'neg': return -evaluate(expression.a, environment);
    case 'not': return evaluate(expression.a, environment) === 0 ? 1 : 0;
    case 'call': return FUNCTIONS[expression.fn](...expression.args.map((arg) => evaluate(arg, environment)));
    case 'cond': return evaluate(expression.c, environment) !== 0
      ? evaluate(expression.a, environment)
      : evaluate(expression.b, environment);
    case 'bin': {
      if (expression.op === '&&') {
        return evaluate(expression.a, environment) !== 0 && evaluate(expression.b, environment) !== 0 ? 1 : 0;
      }
      if (expression.op === '||') {
        return evaluate(expression.a, environment) !== 0 || evaluate(expression.b, environment) !== 0 ? 1 : 0;
      }
      const value = evaluateNumber(
        expression.op,
        evaluate(expression.a, environment),
        evaluate(expression.b, environment),
      );
      return typeof value === 'boolean' ? (value ? 1 : 0) : value;
    }
  }
};

const literalToC = (value: number): string => {
  if (!Number.isFinite(value)) {
    throw new Error(`X-Bridges control kernel C generation requires finite constants; received ${value}`);
  }
  if (Object.is(value, -0)) return '(-0.0)';
  const text = `${value}`;
  const literal = /[eE.]/.test(text) ? text : `${text}.0`;
  return value < 0 ? `(${literal})` : literal;
};

/** Prints a folded tree as fully parenthesised C99 (MISRA C:2012 12.1). */
const printC = (expression: KExpr, nameOf: (name: string) => string): string => {
  switch (expression.k) {
    case 'num': return literalToC(expression.v);
    case 'bool': throw new Error('X-Bridges control kernel left an unfolded boolean constant');
    case 'var': return nameOf(expression.n);
    case 'neg': return `(-${printC(expression.a, nameOf)})`;
    case 'not': return `(!${printC(expression.a, nameOf)})`;
    case 'call': return `${expression.fn}(${expression.args.map((arg) => printC(arg, nameOf)).join(', ')})`;
    case 'cond': return `(${printC(expression.c, nameOf)} ? ${printC(expression.a, nameOf)} : ${printC(expression.b, nameOf)})`;
    case 'bin': return `(${printC(expression.a, nameOf)} ${expression.op} ${printC(expression.b, nameOf)})`;
  }
};

const freeNames = (expression: KExpr, into: Set<string>): void => {
  switch (expression.k) {
    case 'var': into.add(expression.n); return;
    case 'neg':
    case 'not': freeNames(expression.a, into); return;
    case 'call': expression.args.forEach((arg) => freeNames(arg, into)); return;
    case 'cond': freeNames(expression.c, into); freeNames(expression.a, into); freeNames(expression.b, into); return;
    case 'bin': freeNames(expression.a, into); freeNames(expression.b, into); return;
    default:
  }
};

// ---------------------------------------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------------------------------------

export interface XBControlProgram {
  readonly type: string;
  /** Input port ids (host port ids); a program variable of the same name carries the value. */
  readonly inputs: readonly string[];
  /** Output port ids, parallel to `outputExpressions`. */
  readonly outputs: readonly string[];
  /** State slot roles; the previous value is the program variable of the same name. */
  readonly stateRoles: readonly string[];
  readonly usesTime: boolean;
  readonly locals: ReadonlyArray<{ readonly name: string; readonly expression: KExpr }>;
  readonly outputExpressions: readonly KExpr[];
  /** Next state, parallel to `stateRoles`. */
  readonly nextStateExpressions: readonly KExpr[];
}

class ProgramBuilder {
  readonly locals: Array<{ name: string; expression: KExpr }> = [];
  readonly outputs = new Map<string, KExpr>();
  readonly next = new Map<string, KExpr>();
  private readonly names: Set<string>;

  constructor(
    readonly inputs: readonly string[],
    readonly outputIds: readonly string[],
    readonly stateRoles: readonly string[],
    readonly usesTime: boolean,
  ) {
    this.names = new Set([...inputs, ...stateRoles, ...(usesTime ? ['time'] : [])]);
  }

  let(name: string, text: string): string {
    if (this.names.has(name)) throw new Error(`X-Bridges control kernel redefines '${name}'`);
    this.names.add(name);
    this.locals.push({ name, expression: compileKernelExpression(text) });
    return name;
  }

  out(port: string, text: string): void {
    this.outputs.set(port, compileKernelExpression(text));
  }

  nextState(role: string, text: string): void {
    this.next.set(role, compileKernelExpression(text));
  }
}

type Params = Readonly<Record<string, unknown>>;

const firstDefined = (parameters: Params, names: readonly string[]): unknown => {
  for (const name of names) {
    if (parameters[name] !== undefined) return parameters[name];
  }
  return undefined;
};

/** Host `Number(x) || fallback` (zero, NaN and absent select the fallback). */
const orDefault = (parameters: Params, names: readonly string[], fallback: number): number => {
  const value = Number(firstDefined(parameters, names));
  return Number.isFinite(value) && value !== 0 ? value : fallback;
};

/** Host `x !== undefined ? Number(x) : fallback` (an explicit zero is honoured). */
const definedOrDefault = (parameters: Params, names: readonly string[], fallback: number): number => {
  const raw = firstDefined(parameters, names);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const lit = (value: number): string => {
  if (!Number.isFinite(value)) throw new Error(`X-Bridges control kernel parameter is not finite: ${value}`);
  return value < 0 ? `(${value})` : `${value}`;
};

const PI = lit(Math.PI);
const TWO_PI = lit(2 * Math.PI);
const SQRT3 = lit(Math.sqrt(3));

interface KernelDefinition {
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly stateRoles: readonly string[];
  readonly usesTime: boolean;
  readonly build: (builder: ProgramBuilder, parameters: Params, dt: number) => void;
}

const addSvpwmCore = (b: ProgramBuilder, va: string, vb: string, Ts: number, Vdc: number): void => {
  b.let('c_theta', `atan2(${vb}, ${va})`);
  b.let('c_deg', `fmod(((c_theta * 180.0) / ${PI}) + 360.0, 360.0)`);
  b.let('c_sector', 'floor(c_deg / 60.0) + 1.0');
  b.let('c_vref', `sqrt((${va} * ${va}) + (${vb} * ${vb}))`);
  b.let('c_ths', `(fmod(c_deg, 60.0) * ${PI}) / 180.0`);
  b.let('c_scale', `${lit(Ts)} * ((${SQRT3} * c_vref) / ${lit(Vdc)})`);
  b.let('c_t1raw', `c_scale * sin((${PI} / 3.0) - c_ths)`);
  b.let('c_t2raw', 'c_scale * sin(c_ths)');
  b.let('c_t0raw', `(${lit(Ts)} - c_t1raw) - c_t2raw`);
  b.let('c_t1', 'fmax(0.0, c_t1raw)');
  b.let('c_t2', 'fmax(0.0, c_t2raw)');
  b.let('c_t0', 'fmax(0.0, c_t0raw)');
};

const addSvpwmGate = (
  b: ProgramBuilder, sector: string, t1: string, t2: string, t0: string, Ts: number,
): void => {
  b.let('g_trel', `fmod(time, ${lit(Ts)})`);
  b.let('g_t', `(g_trel > ${lit(Ts / 2)}) ? (${lit(Ts)} - g_trel) : g_trel`);
  b.let('g_q0', `${t0} / 4.0`);
  b.let('g_h1', `${t1} / 2.0`);
  b.let('g_h2', `${t2} / 2.0`);
  b.let('g_s12', '(g_q0 + g_h1) + g_h2');
  b.let('g_s1', 'g_q0 + g_h1');
  b.let('g_s2', 'g_q0 + g_h2');
  const pick = (values: readonly string[]): string => values.reduceRight(
    (rest, value, index) => `((${sector} == ${index + 1}.0) ? ${value} : ${rest})`,
    '0.0',
  );
  b.let('g_da', pick(['g_q0', 'g_s2', 'g_s12', 'g_s12', 'g_s1', 'g_q0']));
  b.let('g_db', pick(['g_s1', 'g_q0', 'g_q0', 'g_s2', 'g_s12', 'g_s12']));
  b.let('g_dc', pick(['g_s12', 'g_s12', 'g_s1', 'g_q0', 'g_q0', 'g_s2']));
  b.out('ga', '(g_t > g_da) ? 1.0 : 0.0');
  b.out('gb', '(g_t > g_db) ? 1.0 : 0.0');
  b.out('gc', '(g_t > g_dc) ? 1.0 : 0.0');
};

/** Carrier waveform of PWM_GENERATOR for a phase in [0,1). */
const pwmCarrier = (carrierType: string, phase: string): string => {
  switch (carrierType) {
    case 'sawtooth': return phase;
    case 'inv_sawtooth': return `1.0 - ${phase}`;
    case 'sine': return `(sin(${TWO_PI} * ${phase}) + 1.0) / 2.0`;
    case 'square': return `(${phase} < 0.5) ? 0.25 : 0.75`;
    default: return `(${phase} < 0.5) ? (2.0 * ${phase}) : (2.0 * (1.0 - ${phase}))`;
  }
};

const KERNELS: Readonly<Record<string, KernelDefinition>> = {
  // ---- Modulation -------------------------------------------------------------------------------------
  SECTOR_SELECTOR: {
    inputs: ['theta'], outputs: ['sector'], stateRoles: [], usesTime: false,
    build: (b) => {
      b.let('deg', `fmod(((theta * 180.0) / ${PI}) + 360.0, 360.0)`);
      b.out('sector', 'floor(deg / 60.0) + 1.0');
    },
  },
  SVPWM_CORE: {
    inputs: ['v_alpha', 'v_beta'], outputs: ['sector', 't1', 't2', 't0'], stateRoles: [], usesTime: false,
    build: (b, p) => {
      addSvpwmCore(b, 'v_alpha', 'v_beta', orDefault(p, ['Ts'], 0.0001), orDefault(p, ['Vdc'], 400));
      b.out('sector', 'c_sector');
      b.out('t1', 'c_t1');
      b.out('t2', 'c_t2');
      b.out('t0', 'c_t0');
    },
  },
  SWITCHING_TIME_CALCULATOR: {
    // The host reads Vdc and Ts from the vdc / ts input ports, not from parameters.
    inputs: ['vref', 'theta_s', 'vdc', 'ts'], outputs: ['t1', 't2', 't0'], stateRoles: [], usesTime: false,
    build: (b) => {
      b.let('scale', 'ts * ((' + SQRT3 + ' * vref) / vdc)');
      b.let('t1raw', `scale * sin((${PI} / 3.0) - theta_s)`);
      b.let('t2raw', 'scale * sin(theta_s)');
      b.let('t0raw', '(ts - t1raw) - t2raw');
      b.out('t1', 'fmax(0.0, t1raw)');
      b.out('t2', 'fmax(0.0, t2raw)');
      b.out('t0', 'fmax(0.0, t0raw)');
    },
  },
  SVPWM_GATE_GENERATOR: {
    // Host state is only a lastTime bookkeeping field with no effect on the outputs: stateless here.
    inputs: ['sector', 't1', 't2', 't0'], outputs: ['ga', 'gb', 'gc'], stateRoles: [], usesTime: true,
    build: (b, p) => addSvpwmGate(b, 'sector', 't1', 't2', 't0', orDefault(p, ['Ts'], 0.0001)),
  },
  SVPWM_MODULATOR: {
    inputs: ['v_alpha', 'v_beta'], outputs: ['ga', 'gb', 'gc'], stateRoles: [], usesTime: true,
    build: (b, p) => {
      const Ts = orDefault(p, ['Ts'], 0.0001);
      addSvpwmCore(b, 'v_alpha', 'v_beta', Ts, orDefault(p, ['Vdc'], 400));
      addSvpwmGate(b, 'c_sector', 'c_t1', 'c_t2', 'c_t0', Ts);
    },
  },
  ZERO_SEQUENCE_INJECTION: {
    inputs: ['va', 'vb', 'vc'], outputs: ['va_mod', 'vb_mod', 'vc_mod'], stateRoles: [], usesTime: false,
    build: (b) => {
      b.let('offset', '(fmax(fmax(va, vb), vc) + fmin(fmin(va, vb), vc)) / 2.0');
      b.out('va_mod', 'va - offset');
      b.out('vb_mod', 'vb - offset');
      b.out('vc_mod', 'vc - offset');
    },
  },
  PWM_GENERATOR: {
    // Carrier phase: seeded from absolute time on the first step, then advanced by the fractional carrier
    // cycles per step (golden-ratio step when the step is an exact multiple of the period), as the host.
    inputs: ['duty'], outputs: ['pwm'], stateRoles: ['phase', 'primed'], usesTime: true,
    build: (b, p, dt) => {
      const frequency = orDefault(p, ['frequency'], 50);
      const carrierType = String(p.carrierType ?? 'triangle');
      const cycles = dt * frequency;
      const fraction = cycles % 1;
      const step = fraction > 1e-12 ? fraction : 0.6180339887498949;
      b.let('d', 'fmax(0.0, fmin(1.0, duty))');
      b.let('ph', `(primed > 0.5) ? fmod(phase + ${lit(step)}, 1.0) : fmod(time * ${lit(frequency)}, 1.0)`);
      b.let('carrier', pwmCarrier(carrierType, 'ph'));
      b.out('pwm', '(d > carrier) ? 1.0 : 0.0');
      b.nextState('phase', 'ph');
      b.nextState('primed', '1.0');
    },
  },
  THREE_PHASE_PWM: {
    inputs: ['va_ref', 'vb_ref', 'vc_ref'], outputs: ['ga', 'gb', 'gc'], stateRoles: ['phase', 'primed'], usesTime: true,
    build: (b, p, dt) => {
      const frequency = orDefault(p, ['frequency'], 5000);
      const method = String(p.method ?? 'SPWM');
      b.let('ph', `(primed > 0.5) ? fmod(fmod(phase + ${lit(dt * frequency)}, 1.0) + 1.0, 1.0) : fmod(time * ${lit(frequency)}, 1.0)`);
      const centred = method === 'Saddle' || method === 'SVPWM';
      if (centred) b.let('offset', '(fmax(fmax(va_ref, vb_ref), vc_ref) + fmin(fmin(va_ref, vb_ref), vc_ref)) / 2.0');
      (['a', 'b', 'c'] as const).forEach((phaseName) => {
        const reference = `v${phaseName}_ref`;
        b.let(`n${phaseName}`, `fmax(0.0, fmin(1.0, (${centred ? `(${reference} - offset)` : reference} + 1.0) / 2.0))`);
        b.out(`g${phaseName}`, `(n${phaseName} > ph) ? 1.0 : 0.0`);
      });
      b.nextState('phase', 'ph');
      b.nextState('primed', '1.0');
    },
  },

  // ---- Current, speed and flux control ----------------------------------------------------------------
  CURRENT_CONTROLLER_DQ: {
    // Two PI loops, forward-Euler integrators, no output anti-windup (as the host); iMax limits the
    // reference vector length. Output uses the freshly integrated value, which is also the next state.
    inputs: ['id_ref', 'iq_ref', 'id', 'iq'], outputs: ['vd', 'vq'], stateRoles: ['intD', 'intQ'], usesTime: false,
    build: (b, p, dt) => {
      const kpD = definedOrDefault(p, ['Kp_d'], 1);
      const kiD = definedOrDefault(p, ['Ki_d'], 10);
      const kpQ = definedOrDefault(p, ['Kp_q'], 1);
      const kiQ = definedOrDefault(p, ['Ki_q'], 10);
      const iMax = definedOrDefault(p, ['iMax'], 100);
      b.let('mag', 'sqrt((id_ref * id_ref) + (iq_ref * iq_ref))');
      b.let('ratio', `((mag > ${lit(iMax)}) && (mag > 0.0)) ? (${lit(iMax)} / mag) : 1.0`);
      b.let('eD', '(id_ref * ratio) - id');
      b.let('eQ', '(iq_ref * ratio) - iq');
      b.let('nD', `intD + (eD * ${lit(dt)})`);
      b.let('nQ', `intQ + (eQ * ${lit(dt)})`);
      b.out('vd', `(${lit(kpD)} * eD) + (${lit(kiD)} * nD)`);
      b.out('vq', `(${lit(kpQ)} * eQ) + (${lit(kiQ)} * nQ)`);
      b.nextState('intD', 'nD');
      b.nextState('intQ', 'nQ');
    },
  },
  SPEED_CONTROLLER: {
    // PI with output saturation to +-maxIq; the host has no anti-windup, the integrator keeps integrating.
    inputs: ['speed_ref', 'speed_actual'], outputs: ['iq_ref'], stateRoles: ['integral'], usesTime: false,
    build: (b, p, dt) => {
      const kp = orDefault(p, ['Kp'], 0.5);
      const ki = orDefault(p, ['Ki'], 5);
      const maxIq = orDefault(p, ['maxIq'], 10);
      b.let('err', 'speed_ref - speed_actual');
      b.let('nextIntegral', `integral + (err * ${lit(dt)})`);
      b.out('iq_ref', `fmax(${lit(-maxIq)}, fmin(${lit(maxIq)}, (${lit(kp)} * err) + (${lit(ki)} * nextIntegral)))`);
      b.nextState('integral', 'nextIntegral');
    },
  },
  FIELD_ORIENTED_CONTROL: {
    // Clarke -> Park -> dq PI (forward Euler, output from the integrated value) -> inverse Park -> inverse Clarke.
    inputs: ['id_ref', 'iq_ref', 'ia', 'ib', 'theta'],
    outputs: ['vd', 'vq', 'va_ref', 'vb_ref', 'vc_ref'],
    stateRoles: ['integralD', 'integralQ'], usesTime: false,
    build: (b, p, dt) => {
      const kp = definedOrDefault(p, ['Kp'], 1);
      const ki = definedOrDefault(p, ['Ki'], 10);
      b.let('iBeta', `(ia + (2.0 * ib)) / ${SQRT3}`);
      b.let('cosT', 'cos(theta)');
      b.let('sinT', 'sin(theta)');
      b.let('idMeas', '(ia * cosT) + (iBeta * sinT)');
      b.let('iqMeas', '((-ia) * sinT) + (iBeta * cosT)');
      b.let('errD', 'id_ref - idMeas');
      b.let('errQ', 'iq_ref - iqMeas');
      b.let('nextD', `integralD + (errD * ${lit(dt)})`);
      b.let('nextQ', `integralQ + (errQ * ${lit(dt)})`);
      b.let('vdOut', `(${lit(kp)} * errD) + (${lit(ki)} * nextD)`);
      b.let('vqOut', `(${lit(kp)} * errQ) + (${lit(ki)} * nextQ)`);
      b.let('vAlpha', '(vdOut * cosT) - (vqOut * sinT)');
      b.let('vBeta', '(vdOut * sinT) + (vqOut * cosT)');
      b.out('vd', 'vdOut');
      b.out('vq', 'vqOut');
      b.out('va_ref', 'vAlpha');
      b.out('vb_ref', `(-0.5 * vAlpha) + ((${SQRT3} / 2.0) * vBeta)`);
      b.out('vc_ref', `(-0.5 * vAlpha) - ((${SQRT3} / 2.0) * vBeta)`);
      b.nextState('integralD', 'nextD');
      b.nextState('integralQ', 'nextQ');
    },
  },
  FLUX_REFERENCE: {
    // The host outputs the configured value in every mode ('field_weakening' is a placeholder there).
    inputs: [], outputs: ['id_ref'], stateRoles: [], usesTime: false,
    build: (b, p) => b.out('id_ref', lit(orDefault(p, ['value'], 0))),
  },
  FIELD_WEAKENING: {
    // Voltage-limit PI acting on the d-axis current: integrates only while |V| exceeds v_max, recovers
    // toward zero otherwise, and freezes while the output is clamped in the direction of the error.
    inputs: ['v_mag', 'id_base'], outputs: ['id_ref'], stateRoles: ['integral'], usesTime: false,
    build: (b, p, dt) => {
      const vMax = orDefault(p, ['v_max'], 300);
      const kp = orDefault(p, ['Kp'], 0.1);
      const ki = orDefault(p, ['Ki'], 1);
      const idMin = definedOrDefault(p, ['id_min', 'min'], -20);
      const idMax = definedOrDefault(p, ['id_max', 'max'], 10);
      b.let('vErr', `${lit(vMax)} - v_mag`);
      b.let('stepped', `integral + (vErr * ${lit(dt)})`);
      b.let('integrated', '(vErr < 0.0) ? stepped : fmin(0.0, stepped)');
      b.let('delta', `(${lit(kp)} * ((vErr < 0.0) ? vErr : 0.0)) + (${lit(ki)} * integrated)`);
      b.let('unlimited', 'id_base + delta');
      b.out('id_ref', `fmax(${lit(idMin)}, fmin(${lit(idMax)}, unlimited))`);
      b.nextState('integral', ki === 0
        ? 'integrated'
        : `((unlimited < ${lit(idMin)}) && (vErr < 0.0)) ? integral : (((unlimited > ${lit(idMax)}) && (vErr > 0.0)) ? integral : integrated)`);
    },
  },
  MTPA_CONTROLLER: {
    // The host's simplified MTPA: iq = Te / (1.5 * 2 pole pairs * psi_m), id = -0.2 |iq|.
    inputs: ['te_ref'], outputs: ['id_ref', 'iq_ref'], stateRoles: [], usesTime: false,
    build: (b, p) => {
      b.let('iq', `te_ref / ((1.5 * 2.0) * ${lit(orDefault(p, ['psi_m'], 0.1))})`);
      b.out('id_ref', '-fabs(iq * 0.2)');
      b.out('iq_ref', 'iq');
    },
  },
  VOLTAGE_REFERENCE_GENERATOR: {
    inputs: ['f'], outputs: ['va', 'vb', 'vc'], stateRoles: [], usesTime: true,
    build: (b, p) => {
      const amplitude = orDefault(p, ['amplitude'], 1);
      b.let('w', `${TWO_PI} * f`);
      b.out('va', `${lit(amplitude)} * sin(w * time)`);
      b.out('vb', `${lit(amplitude)} * sin((w * time) - (${TWO_PI} / 3.0))`);
      b.out('vc', `${lit(amplitude)} * sin((w * time) - ((4.0 * ${PI}) / 3.0))`);
    },
  },
  ROTOR_POSITION_ESTIMATOR: {
    // Hall_sensor: angle from the sign pattern of the phase voltages against their mean, speed from the
    // wrapped angle difference per dt. Otherwise (SMO-style): back-EMF from the alpha-beta voltage equation
    // with backward-difference current derivative, angle from atan2, speed low-pass filtered 0.9/0.1.
    inputs: ['ia', 'ib', 'ic', 'va', 'vb', 'vc'], outputs: ['theta', 'speed'],
    stateRoles: ['theta', 'speed', 'ia_prev', 'ib_prev'], usesTime: false,
    build: (b, p, dt) => {
      const method = String(p.method ?? 'Sensorless_SMO');
      const dtText = lit(dt);
      const wrapDifference = (angle: string): void => {
        b.let('dRaw', `${angle} - theta`);
        b.let('dHigh', `(dRaw > ${PI}) ? (dRaw - ${TWO_PI}) : dRaw`);
        b.let('dWrap', `(dHigh < ${lit(-Math.PI)}) ? (dHigh + ${TWO_PI}) : dHigh`);
      };
      if (method === 'Hall_sensor') {
        b.let('neutral', '((va + vb) + vc) / 3.0');
        b.let('hall', '(((va > neutral) ? 4.0 : 0.0) + ((vb > neutral) ? 2.0 : 0.0)) + ((vc > neutral) ? 1.0 : 0.0)');
        b.let('deg', '(hall == 2.0) ? 240.0 : ((hall == 3.0) ? 300.0 : ((hall == 4.0) ? 120.0 : ((hall == 5.0) ? 60.0 : ((hall == 6.0) ? 180.0 : 0.0))))');
        b.let('angle', `(deg * ${PI}) / 180.0`);
        wrapDifference('angle');
        b.let('speedNew', `fmax(-500.0, fmin(500.0, dWrap / ${dtText}))`);
        b.out('theta', 'angle');
        b.out('speed', 'speedNew');
        b.nextState('theta', 'angle');
        b.nextState('speed', 'speedNew');
      } else {
        const rs = lit(orDefault(p, ['Rs'], 0.5));
        const ls = lit(orDefault(p, ['Ls'], 0.01));
        const poles = lit(orDefault(p, ['P'], 2));
        const active = '((fabs(eAlpha) > 0.01) || (fabs(eBeta) > 0.01))';
        b.let('iBeta', `(ia + (2.0 * ib)) / ${SQRT3}`);
        b.let('iBetaPrev', `(ia_prev + (2.0 * ib_prev)) / ${SQRT3}`);
        b.let('diAlpha', `(ia - ia_prev) / ${dtText}`);
        b.let('diBeta', `(iBeta - iBetaPrev) / ${dtText}`);
        b.let('vAlpha', '(((2.0 * va) - vb) - vc) / 3.0');
        b.let('vBeta', `(vb - vc) / ${SQRT3}`);
        b.let('eAlpha', `(vAlpha - (${rs} * ia)) - (${ls} * diAlpha)`);
        b.let('eBeta', `(vBeta - (${rs} * iBeta)) - (${ls} * diBeta)`);
        b.let('atanRaw', 'atan2(-eAlpha, eBeta)');
        b.let('atanFix', `(atanRaw < 0.0) ? (atanRaw + ${TWO_PI}) : atanRaw`);
        wrapDifference('atanFix');
        b.let('filtered', `(0.9 * speed) + (0.1 * ((dWrap / ${dtText}) / ${poles}))`);
        b.let('angle', `${active} ? atanFix : theta`);
        b.let('speedNew', `fmax(-500.0, fmin(500.0, ${active} ? filtered : speed))`);
        b.out('theta', 'angle');
        b.out('speed', 'speedNew');
        b.nextState('theta', 'angle');
        b.nextState('speed', 'speedNew');
      }
      b.nextState('ia_prev', 'ia');
      b.nextState('ib_prev', 'ib');
    },
  },
  IM_SCALAR_CONTROL: {
    // Open-loop V/f: |V| = k*f + boost, angle = w*time (the host does not integrate the frequency).
    inputs: ['w_ref'], outputs: ['va', 'vb', 'vc'], stateRoles: [], usesTime: true,
    build: (b, p) => {
      b.let('w', 'fabs(w_ref)');
      b.let('mag', `(${lit(orDefault(p, ['v_f_ratio'], 4))} * (w / ${TWO_PI})) + ${lit(orDefault(p, ['boost'], 10))}`);
      b.out('va', 'mag * sin(w * time)');
      b.out('vb', `mag * sin((w * time) - (${TWO_PI} / 3.0))`);
      b.out('vc', `mag * sin((w * time) + (${TWO_PI} / 3.0))`);
    },
  },
  VF_SLIP_COMP: {
    inputs: ['w_ref', 'iq_actual'], outputs: ['va', 'vb', 'vc', 'w_sync'], stateRoles: [], usesTime: true,
    build: (b, p) => {
      b.let('slip', `((iq_actual / ${lit(orDefault(p, ['rated_iq'], 10))}) * ${lit(orDefault(p, ['rated_slip'], 0.05))}) * (${TWO_PI} * 50.0)`);
      b.let('sync', 'w_ref + slip');
      b.let('mag', `(${lit(orDefault(p, ['v_f_ratio'], 4))} * (fabs(sync) / ${TWO_PI})) + 10.0`);
      b.out('va', 'mag * sin(sync * time)');
      b.out('vb', `mag * sin((sync * time) - (${TWO_PI} / 3.0))`);
      b.out('vc', `mag * sin((sync * time) + (${TWO_PI} / 3.0))`);
      b.out('w_sync', 'sync');
    },
  },
};

export const isXBControlKernelType = (type: string): boolean =>
  Object.prototype.hasOwnProperty.call(KERNELS, type);

export const xbControlKernelTypes = (): readonly string[] => Object.keys(KERNELS);

export const xbControlKernelStateRoles = (type: string): readonly string[] =>
  isXBControlKernelType(type) ? KERNELS[type].stateRoles : [];

export const xbControlKernelUsesTime = (type: string): boolean =>
  isXBControlKernelType(type) && KERNELS[type].usesTime;

export const xbControlKernelInputPorts = (type: string): readonly string[] =>
  isXBControlKernelType(type) ? KERNELS[type].inputs : [];

export const xbControlKernelOutputPorts = (type: string): readonly string[] =>
  isXBControlKernelType(type) ? KERNELS[type].outputs : [];

/** Sample period of a kernel: solver step times the block's schedule period (in solver steps). */
export const xbControlKernelSamplePeriod = (solverStepSeconds: number, periodSubsteps: number): number =>
  solverStepSeconds * periodSubsteps;

export const buildXBControlProgram = (
  type: string,
  parameters: Readonly<Record<string, unknown>>,
  dt: number,
): XBControlProgram => {
  const definition = KERNELS[type];
  if (definition === undefined) throw new Error(`X-Bridges control kernel '${type}' is not defined`);
  const builder = new ProgramBuilder(definition.inputs, definition.outputs, definition.stateRoles, definition.usesTime);
  definition.build(builder, parameters, dt);
  const outputExpressions = definition.outputs.map((port) => {
    const expression = builder.outputs.get(port);
    if (expression === undefined) throw new Error(`X-Bridges control kernel '${type}' defines no output '${port}'`);
    return expression;
  });
  const nextStateExpressions = definition.stateRoles.map((role) => {
    const expression = builder.next.get(role);
    if (expression === undefined) throw new Error(`X-Bridges control kernel '${type}' defines no next state '${role}'`);
    return expression;
  });
  return {
    type,
    inputs: definition.inputs,
    outputs: definition.outputs,
    stateRoles: definition.stateRoles,
    usesTime: definition.usesTime,
    locals: builder.locals,
    outputExpressions,
    nextStateExpressions,
  };
};

export interface XBControlProgramResult {
  readonly outputs: Readonly<Record<string, number>>;
  readonly nextState: Readonly<Record<string, number>>;
}

/** Reference (canonical interpreter) evaluation of a program. */
export const evaluateXBControlProgram = (
  program: XBControlProgram,
  inputs: Readonly<Record<string, number>>,
  state: Readonly<Record<string, number>>,
  time: number,
): XBControlProgramResult => {
  const environment = new Map<string, number>();
  for (const port of program.inputs) environment.set(port, inputs[port] ?? 0);
  for (const role of program.stateRoles) environment.set(role, state[role] ?? 0);
  if (program.usesTime) environment.set('time', time);
  for (const local of program.locals) environment.set(local.name, evaluate(local.expression, environment));
  const outputs: Record<string, number> = {};
  program.outputs.forEach((port, index) => { outputs[port] = evaluate(program.outputExpressions[index], environment); });
  const nextState: Record<string, number> = {};
  program.stateRoles.forEach((role, index) => { nextState[role] = evaluate(program.nextStateExpressions[index], environment); });
  return { outputs, nextState };
};

export interface XBControlProgramCPlan {
  /** Names the generator must bind before the locals (`input`, `state`, or `time`). */
  readonly usedInputs: readonly string[];
  readonly usedState: readonly string[];
  readonly usesTime: boolean;
  /** Local definitions in dependency order: C expression text per local. */
  readonly locals: ReadonlyArray<{ readonly name: string; readonly c: string }>;
  /** C expression per requested result (outputs or next state), parallel to the program arrays. */
  readonly values: readonly string[];
}

/**
 * Plans the C99 rendering of the outputs or the next state. Only the locals the requested results depend on
 * are kept, so the generated block has no unused variable (-Wunused, MISRA 2.2).
 */
export const planXBControlProgramC = (
  program: XBControlProgram,
  want: 'outputs' | 'nextState',
  nameOf: (name: string) => string,
  /** For 'outputs': which output ports exist on the block; the others are not rendered. */
  keep?: readonly boolean[],
): XBControlProgramCPlan => {
  const results = (want === 'outputs' ? program.outputExpressions : program.nextStateExpressions)
    .filter((_, index) => want !== 'outputs' || keep === undefined || keep[index] === true);
  const needed = new Set<string>();
  results.forEach((expression) => freeNames(expression, needed));
  const kept: Array<{ name: string; expression: KExpr }> = [];
  for (let index = program.locals.length - 1; index >= 0; index -= 1) {
    const local = program.locals[index];
    if (needed.has(local.name)) {
      kept.unshift(local);
      freeNames(local.expression, needed);
    }
  }
  return {
    usedInputs: program.inputs.filter((port) => needed.has(port)),
    usedState: program.stateRoles.filter((role) => needed.has(role)),
    usesTime: needed.has('time'),
    locals: kept.map((local) => ({ name: local.name, c: printC(local.expression, nameOf) })),
    values: results.map((expression) => printC(expression, nameOf)),
  };
};
