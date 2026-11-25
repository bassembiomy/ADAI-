// WP-A0 of docs/superpowers/plans/2026-11-24-xbridges-open-findings.md (XBV-434 / D20).
// Reads src/utils/stateMachine/xbInterpreter.ts and xbCGenerator.ts and classifies every codegen-capable block type as
// multi-op / libm / single-op / no-arithmetic for the float32 per-operation-rounding question. Writes the tables of
// docs/xbridges-verification/float32-inventory.md to scratch/tables.json (plus a summary on stderr).
// Run: npx tsx scripts/xbridges-verification/float32Inventory.ts
//
// The classification is mechanical (operator / libm counts over the interpreter case span and the C emitter span), and
// OVERRIDE records the rows where the count is misleading. Keep OVERRIDE in sync with the doc: every entry says WHY.
import { readFileSync, writeFileSync } from 'node:fs';
import { XB_CAPABILITIES } from '../../src/utils/stateMachine/xbCapabilities';

const I = readFileSync('src/utils/stateMachine/xbInterpreter.ts', 'utf8').split('\n');
const G = readFileSync('src/utils/stateMachine/xbCGenerator.ts', 'utf8').split('\n');

const braceEnd = (lines: string[], start: number) => {
  let depth = 0;
  for (let j = start; j < lines.length; j++) {
    for (const ch of lines[j]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (j > start && depth <= 0) return j;
  }
  return start;
};
const defSpan = (lines: string[], name: string) => {
  const start = lines.findIndex((l) => new RegExp(`^const ${name}\\b`).test(l));
  if (start < 0) return undefined;
  let depth = 0, end = start;
  for (let j = start; j < lines.length; j++) {
    for (const ch of lines[j]) { if ('{(['.includes(ch)) depth++; else if ('})]'.includes(ch)) depth--; }
    if (depth <= 0 && /;\s*$/.test(lines[j])) { end = j; break; }
  }
  return { start, end, text: lines.slice(start, end + 1).join('\n') };
};

// ---------- interpreter: fallthrough groups at indent 4
const iGroups = new Map<string, { start: number; end: number }>();
{
  const labels: { name: string; start: number; inline: boolean }[] = [];
  for (let i = 0; i < I.length; i++) {
    const m = /^\s{4}case '([^']+)':(.*)$/.exec(I[i]);
    if (m) { const r = m[2].trim(); labels.push({ name: m[1], start: i, inline: Boolean(r && !r.startsWith('{') && !r.startsWith('//')) }); }
  }
  let group: typeof labels = [];
  const flush = () => {
    if (!group.length) return;
    const last = group[group.length - 1];
    const end = last.inline ? last.start : braceEnd(I, last.start);
    for (const l of group) iGroups.set(l.name, { start: group[0].start, end });
    group = [];
  };
  for (const cur of labels) {
    if (group.length) {
      const prev = group[group.length - 1];
      // a label continues the group when only blank lines / other labels sit between the previous label and it
      const between = I.slice(prev.start + 1, cur.start);
      const prevEmptyBody = /^\s{4}case '[^']+':\s*$/.test(I[prev.start]);
      const onlyLabels = between.every((l) => l.trim() === '' || /^\s{4}case '/.test(l));
      if (!prevEmptyBody || !onlyLabels) flush();
    }
    group.push(cur);
  }
  flush();
}

// ---------- generator: emitter map
const MAP_START = G.findIndex((l) => /^const OPERATION_EMITTERS/.test(l));
const MAP_END = G.findIndex((l) => /^const renderEKFExpression/.test(l));
const mapBody = G.slice(MAP_START, MAP_END);
const emitterOf = new Map<string, string>();
for (const m of mapBody.join('\n').matchAll(/^\s{2}([A-Za-z0-9_']+):\s*([A-Za-z0-9_']+)/gm)) emitterOf.set(m[1], m[2]);

// ---------- generator: the residual renderer (renderStateOutputs, 2611..3498)
const RES_START = G.findIndex((l) => /^const renderStateOutputs/.test(l));
const RES_END = G.findIndex((l, i) => i > RES_START && /^};$/.test(l));
const residual = G.slice(RES_START, RES_END + 1);

// top-level if-chains in the residual: collect `if (operation.type === 'X' || ...)` and their braces
const resGroups = new Map<string, { start: number; end: number }>();
for (let i = 0; i < residual.length; i++) {
  const m = /^  if \((.*operation\.type.*)\) \{$/.exec(residual[i]);
  if (!m) continue;
  const names = [...m[1].matchAll(/operation\.type === '([A-Z0-9_]+)'/g)].map((x) => x[1]);
  const end = braceEnd(residual, i);
  const span = { start: RES_START + i, end: RES_START + end };
  // keep the chain with the most arithmetic: the residual emits the real computation, an earlier chain is a guard
  const weight = (sp: { start: number; end: number }) => (strip(globalThis.__G.slice(sp.start, sp.end + 1).join('\n')).match(/[+*/]/g) ?? []).length;
  for (const n of names) {
    const cur = resGroups.get(n);
    if (!cur || weight(span) > weight(cur)) resGroups.set(n, span);
  }
}

// ---------- generator: state-update switch at indent 6
const stateGroups = new Map<string, { start: number; end: number }>();
for (let i = 0; i < G.length; i++) {
  const m = /^\s{6}case '([^']+)':(.*)$/.exec(G[i]);
  if (!m) continue;
  const r = m[2].trim();
  const end = r && !r.startsWith('{') ? i : braceEnd(G, i);
  if (!stateGroups.has(m[1])) stateGroups.set(m[1], { start: i, end });
}

const GLOBAL_G = G;
(globalThis as any).__G = G;
const strip = (s: string) => s.split('\n').map((l) => l.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/\/\/.*$/, '')).join('\n');
const LIBMFN = /\b(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|log|log2|log10|sqrt|cbrt|hypot|pow)\s*\(/g;
const libmOf = (s: string) => [...new Set([...strip(s).matchAll(LIBMFN)].map((m) => m[1]))];
const opsOf = (s: string) => (strip(s).match(/(?<![-+*/=<>!&|])\s*[+*/]\s*(?![=/])|(?<![-+*/=<>!&|])\s*-\s*(?![=>/])/g) ?? []).length;


// ---------------- classification by data flow (hand-checked against the source, see the doc's "how to re-check")
type Klass = 'multi-op' | 'libm' | 'single-op' | 'no-arithmetic';
/**
 * Rows where the operator count is misleading, each verified by reading the span:
 *  - data movement: the arithmetic in the span is index bookkeeping, not a float operation on the data;
 *  - op-count by port count: n-1 additions / multiplications round per operation only when n >= 3;
 *  - reductions: a loop whose accumulator is the data.
 */
const OVERRIDE: Record<string, { klass: Klass; why: string }> = {
  MUX: { klass: 'no-arithmetic', why: 'concatenates the inputs; index arithmetic only' },
  DEMUX: { klass: 'no-arithmetic', why: 'slices the input; index arithmetic only' },
  Transpose: { klass: 'no-arithmetic', why: 'permutes elements; index arithmetic only' },
  MatrixConcat: { klass: 'no-arithmetic', why: 'copies elements; index arithmetic only' },
  SubMatrix: { klass: 'no-arithmetic', why: 'copies an index window; index arithmetic only' },
  MatrixDiag: { klass: 'no-arithmetic', why: 'copies or zero-fills; index arithmetic only' },
  DiagExtract: { klass: 'no-arithmetic', why: 'copies the diagonal; index arithmetic only' },
  ExtractDiag: { klass: 'no-arithmetic', why: 'copies the diagonal; index arithmetic only' },
  Diag: { klass: 'no-arithmetic', why: 'copies the diagonal / builds from a vector; index arithmetic only' },
  IdentityMatrix: { klass: 'no-arithmetic', why: 'writes 1.0 / 0.0 constants; index arithmetic only' },
  XOR: { klass: 'no-arithmetic', why: 'boolean XOR; no float arithmetic' },
  Abs: { klass: 'no-arithmetic', why: 'fabs is exact; no rounding step of its own' },
  DEADZONE: { klass: 'single-op', why: 'u - limit (one subtraction) after the region test' },
  Sum: { klass: 'multi-op', why: 'n-1 additions left to right in port order; a 2-input Sum is a single op' },
  SUM_JUNCTION: { klass: 'multi-op', why: 'alias of Sum' },
  VectorAdd: { klass: 'multi-op', why: 'n-1 additions left to right; a 2-input add is a single op' },
  PRODUCT: { klass: 'multi-op', why: 'n-1 multiplications (or divisions) left to right; a 2-factor product is a single op' },
  VectorMul: { klass: 'multi-op', why: 'alias of PRODUCT' },
  MatrixMul: { klass: 'multi-op', why: 'the inner accumulation loop of each output element' },
  MatrixSolve: { klass: 'multi-op', why: 'Gaussian elimination: division, multiply-subtract per pivot' },
  SumElements: { klass: 'multi-op', why: 'reduction accumulator over the vector' },
  Mean: { klass: 'multi-op', why: 'reduction accumulator, then a division' },
  Max: { klass: 'multi-op', why: 'comparison chain; a comparison result is exact but a NaN/signed-zero path copies the operand' },
  PID_CONTROLLER: { klass: 'multi-op', why: 'Kp*e + Ki*e*dt + I accumulated per tick' },
  INTEGRATOR_DISCRETE: { klass: 'multi-op', why: 'x + dt*u (trapezoidal: two products and two adds)' },
  RATE_LIMITER: { klass: 'multi-op', why: 'prev + rate*dt, and the difference (u - prev) test' },
  DELAY: { klass: 'no-arithmetic', why: 'stores and returns the previous input' },
  UNIT_DELAY: { klass: 'no-arithmetic', why: 'stores and returns the previous input' },
  MEMORY: { klass: 'no-arithmetic', why: 'stores and returns the previous input' },
  Step: { klass: 'no-arithmetic', why: 'selects the before/after constant; no arithmetic on the time' },
  Counter: { klass: 'no-arithmetic', why: 'integer counter' },
  Register: { klass: 'no-arithmetic', why: 'copies the input' },
  DFlipFlop: { klass: 'no-arithmetic', why: 'boolean state' },
  JKFlipFlop: { klass: 'no-arithmetic', why: 'boolean state' },
  SIX_STEP_COMMUTATION: { klass: 'no-arithmetic', why: 'sector lookup, integer only' },
  LOW_PASS_FILTER: { klass: 'multi-op', why: 'y = (1-alpha)*prev_y + alpha*u, and alpha = dt/(tau+dt) with tau = 1/(2*pi*fc): 3 products, 3 adds, 1 division' },
  HIGH_PASS_FILTER: { klass: 'multi-op', why: 'the low-pass recursion plus (u - prev_u): one more subtraction' },
  MOVING_AVERAGE: { klass: 'multi-op', why: 'running window sum (n adds and n-1 subtracts) then a division by the window size' },
  DISCRETE_TRANSFER_FUNCTION: { klass: 'multi-op', why: 'direct-form II transposed: per tick a dot product of the b taps, a dot product of the a taps and one divide by a0' },
  STATE_SPACE: { klass: 'multi-op', why: 'per state element a dot product A*x + B*u; the output C*x + D*u' },
  KALMAN_FILTER: { klass: 'multi-op', why: 'x = A x + B u, P = A P A^T + Q, K = P C^T (C P C^T + R)^-1, x = x + K (y - C x): matrix products and a solve' },
  GAIN: { klass: 'single-op', why: 'one product' },
  UnaryNeg: { klass: 'single-op', why: 'sign flip, exact' },
  VectorSub: { klass: 'single-op', why: 'one subtraction' },
  VectorDiv: { klass: 'single-op', why: 'one division' },
  SATURATION: { klass: 'single-op', why: 'selects the input or a limit; no arithmetic' },
  SWITCH: { klass: 'single-op', why: 'selects one of two inputs; no arithmetic' },
  RELAY: { klass: 'single-op', why: 'threshold comparison, then writes 1.0 / 0.0' },
  Abs: { klass: 'single-op', why: 'fabs is exact (clears the sign bit); a rounding is a no-op' },
  XOR: { klass: 'single-op', why: 'boolean, no float arithmetic' },
  ACOS: { why: 'one libm call' }, ASIN: { why: 'one libm call' }, ATAN: { why: 'one libm call' },
  COS: { why: 'one libm call' }, SIN: { why: 'one libm call' }, TAN: { why: 'one libm call' },
  COSH: { why: 'one libm call' }, SINH: { why: 'one libm call' }, TANH: { why: 'one libm call' },
  ACOSH: { why: 'one libm call' }, ASINH: { why: 'one libm call' }, ATANH: { why: 'one libm call' },
  ACOT: { why: 'atan(1/x): one libm call plus a division' },
  ACOTH: { why: 'atanh(1/x): one libm call plus a division' },
  SEC: { why: '1/cos(x): one libm call plus a division' },
  SECH: { why: '1/cosh(x): one libm call plus a division' },
  COSEC: { why: '1/sin(x): one libm call plus a division' },
  COSECH: { why: '1/sinh(x): one libm call plus a division' },
  ASEC: { why: 'acos(1/x): one libm call plus a division' },
  ASECH: { why: 'acosh(1/x): one libm call plus a division' },
  ACOSEC: { why: 'asin(1/x): one libm call plus a division' },
  ACOSECH: { why: 'asinh(1/x): one libm call plus a division' },
  VectorPow: { why: 'pow(x, p) per element' },
  PARK_TRANSFORM: { why: 'sin and cos of theta, then the two products and the sums of the dq rotation' },
  INVERSE_PARK: { why: 'sin and cos of theta, then the two products and the sums of the inverse rotation' },
  CLARKE_TRANSFORM: { why: 'sqrt(2/3) scaling: one libm call, then products' },
  INVERSE_CLARKE: { why: 'sqrt(2/3) scaling: one libm call, then products' },
  WaveformGen: { why: 'sin of the phase argument; the triangle wave adds asin' },
  WHITE_NOISE: { why: 'sqrt(-2 ln u) cos(2 pi v): sqrt, log, sin' },
  BAND_LIMITED_NOISE: { why: 'the white-noise transform, then the band-limiting filter' },
  TERMINATOR: { klass: 'no-arithmetic', why: 'sink, no output' },
};


const types = Object.keys(XB_CAPABILITIES).filter((t) => XB_CAPABILITIES[t].codegen && t !== 'Subsystem').sort();
const rows: any[] = [];
const missing: string[] = [];

for (const type of types) {
  const ig = iGroups.get(type);
  const itext = ig ? I.slice(ig.start, ig.end + 1).join('\n') : '';
  const emitter = emitterOf.get(type);
  const def = emitter ? defSpan(G, emitter) : undefined;
  const res = resGroups.get(type);
  const st = stateGroups.get(type);
  if (!ig) missing.push(`interp:${type}`);
  if (!def && !res && !st) missing.push(`c:${type}`);
  const ctext = [def?.text ?? '', res ? G.slice(res.start, res.end + 1).join('\n') : '', st ? G.slice(st.start, Math.min(st.end, st.start + 120)).join('\n') : ''].join('\n');
  const iLibm = libmOf(itext), cLibm = libmOf(ctext);
  const iOps = opsOf(itext), cOps = opsOf(ctext);
  const loop = /\.reduce\(|\bfor\s*\(|\bwhile\s*\(/.test(strip(ctext + itext));
  let klass: Klass;
  if (iLibm.length || cLibm.length) klass = 'libm';
  else if (iOps === 0 && cOps === 0) klass = 'no-arithmetic';
  else if (loop || iOps > 1 || cOps > 1) klass = 'multi-op';
  else klass = 'single-op';
  if (OVERRIDE[type]?.klass) klass = OVERRIDE[type].klass;
  rows.push({
    why: OVERRIDE[type]?.why ?? '',
    type, klass,
    interp: ig ? `xbInterpreter.ts:${ig.start + 1}` : null, iOps, iLibm,
    emitter: (() => {
      const w = (sp?: { start: number; end: number }) => (sp ? (strip(G.slice(sp.start, sp.end + 1).join('\n')).match(/[+*/]/g) ?? []).length : -1);
      if (res && w(res) > w(def)) return { name: `if (operation.type === '${type}')` + (def ? ` (dispatch emitter \`${emitter}\` is a stub)` : ''), line: res.start + 1 };
      if (def) return { name: emitter!, line: def.start + 1 };
      if (res) return { name: `if (operation.type === '${type}')`, line: res.start + 1 };
      if (st) return { name: 'state-update switch', line: st.start + 1 };
      return null;
    })(),
    cOps, cLibm, loop,
  });
}

const k = (c: Klass) => rows.filter((r) => r.klass === c);
writeFileSync('scratch/inventory-rows.json', JSON.stringify(rows, null, 1));
console.error(`codegen types=${types.length}  multi-op=${k('multi-op').length} libm=${k('libm').length} single-op=${k('single-op').length} no-arith=${k('no-arithmetic').length}`);
// The rows with no interpreter switch case are handled by the shared paths below (verified by reading the code):
const SHARED_INTERPRETER: Record<string, string> = {
  DATA_TYPE_CONVERSION: 'no switch case: the operation only sets conversion.destinationType, applied by writeSignal',
  NUMERIC_REPRESENTATION: 'no switch case: conversion operation, applied by writeSignal',
  UNIT_DELAY: 'the generic stateful path (state slot read/write), not the switch',
  MEMORY: 'the generic stateful path (state slot read/write)',
  INTEGRATOR_CONTINUOUS: 'the derivative path (evaluateDerivatives / solver), not the switch',
  Integrator: 'the derivative path (evaluateDerivatives / solver)',
  WHITE_NOISE: 'no switch case: written through the noise path (listed as out of the parity matrix)',
  BAND_LIMITED_NOISE: 'no switch case: written through the noise path (listed as out of the parity matrix)',
};
const unexpected = missing.filter((m) => m.startsWith('interp:') && !SHARED_INTERPRETER[m.slice(7)]);
console.error(`missing=${missing.join(',') || 'none'}`);
if (unexpected.length > 0) console.error(`UNEXPLAINED missing interpreter rows: ${unexpected.join(', ')}`);
else console.error('every row without an interpreter switch case is covered by SHARED_INTERPRETER');
for (const c of ['multi-op', 'libm', 'single-op', 'no-arithmetic']) {
  console.error(`\n[${c}] ${k(c).length}`);
  for (const r of k(c)) console.error(`  ${r.type.padEnd(26)} i=${String(r.iOps).padEnd(3)} c=${String(r.cOps).padEnd(3)} ${r.emitter?.name ?? '—'}${r.loop ? ' LOOP' : ''} ${[...new Set([...r.iLibm, ...r.cLibm])].join(',')}`);
}

// ---------------- markdown
const fmtRef = (r: any) => {
  const parts: string[] = [];
  if (r.interp) parts.push(`\`${r.interp.replace('xbInterpreter.ts:', 'xbInterpreter.ts:')}\``);
  if (r.emitter) parts.push(`\`${r.emitter.name}\`${r.emitter.line ? ` :${r.emitter.line}` : ''}`);
  return parts.join('<br>') || '—';
};
const md: string[] = [];
const table = (klass: Klass, cols: string, third: (r: any) => string = (r) => r.why || '') => {
  md.push(cols);
  for (const r of rows.filter((x) => x.klass === klass).sort((a: any, b: any) => a.type.localeCompare(b.type))) {
    md.push(`| \`${r.type}\` | ${fmtRef(r)} | ${third(r)} |`);
  }
};
table('multi-op', '| Block | Interpreter span / C emitter | Where the float rounding has to go |\n|---|---|---|');
const out: Record<string, string> = { 'multi-op': md.join('\n') };
md.length = 0;
table('libm', '| Block | Interpreter span / C emitter | Math function the interpreter uses |\n|---|---|---|', (r) => `\`${[...new Set([...r.iLibm, ...r.cLibm])].map((f: string) => f + 'f').join('`, `')}\``);
out.libm = md.join('\n'); md.length = 0;
md.length = 0;
table('single-op', '| Block | Interpreter span / C emitter | Why one rounding at the write is enough |\n|---|---|---|');
out['single-op'] = md.join('\n'); md.length = 0;
table('no-arithmetic', '| Block | Interpreter span / C emitter | Why there is nothing to round |\n|---|---|---|');
out['no-arithmetic'] = md.join('\n');
writeFileSync('scratch/tables.json', JSON.stringify(out, null, 1));
