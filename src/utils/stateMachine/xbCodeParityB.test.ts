/**
 * Gate V7 part B (plan 2026-11-10 §2, §7.1; WP-17b): code parity beyond the float64 per-block cases of xbCodeParity.test.ts.
 *
 *   1. Float32 production profile: every codegen-capable block type with float32 signals, interpreter = generated C.
 *   2. Sanitizers with runtime: the generated C of a representative model set, run for many ticks under ASan / UBSan.
 *   3. Diag blocks (decision D17): MatrixDiag / Diag / DiagExtract / ExtractDiag follow MATLAB diag.
 *
 * ---------------------------------------------------------------------------------------------------------------------
 * FLOAT32 SEMANTICS (read from the code, not assumed)
 *   A signal has numericType float32 when its port carries dataType 'float32' (xbSemanticBuilder numericTypeFrom, 'single' /
 *   'float' / 'float32' strings and { kind: 'float', precision: 'float32' }), or when it inherits it from the driving signal
 *   (resolveNumericType); an unresolved signal defaults to float32 as well.
 *   Interpreter: every signal write goes through convertScalar (xbNumeric.ts:261) = Math.fround(value); the block equation
 *     itself is evaluated in float64 (JS number) on the already rounded inputs, then rounded ONCE per output signal write.
 *     State slots take the numericType of their signal and are rounded with convertValue where the block writes them.
 *     The static matrix helpers (xbStaticMatrix) ignore their numericType argument: no rounding per matrix operation.
 *   Generated C: signal members are `float`; renderSignalWrite (xbCGenerator.ts:~790) computes the expression in `double`,
 *     then `(float)value` once per output write (a non-finite or |v| > FLT_MAX result is published as +-INFINITY and flags a
 *     fault). State slot members have the slot type (`float` for float32) and are written through
 *     renderStateSlotElementAssignment. So both sides round at the same points: once per signal write and once per state
 *     write, equations in float64. Exception found while writing this file: the KALMAN_FILTER interpreter stores its state
 *     (x, P) unrounded in float64 (xbInterpreter.ts:~1750 assigns runtime.stateSlots without convertValue) while C stores
 *     them in float; that is the one kind of disagreement, see the KALMAN_FILTER case below.
 *   Tolerances (derived per kind of computation, never fitted to a result):
 *     - block WITHOUT a libm call of its own (decided per block type from the C it emits: the libm calls of its model minus
 *       those of the baseline models Constant -> GAIN and the WaveformGen stimulus, so a sine stimulus does not make GAIN a
 *       libm block): both sides evaluate the same IEEE double operations in the same order on identical float32-rounded
 *       inputs, so the double result is bit-equal and the single rounding is equal: bound 0 float32 ULP. Measured worst is 0
 *       for every such family; a 1-ULP slack would only hide defects;
 *     - libm call (sin, exp, pow, ...): glibc and V8 may differ by up to 1 double ULP (2^-52 relative). That moves the float32
 *       rounding only when the double result lies within 2^-52 relative of a float32 rounding boundary, a 1 float32 ULP
 *       step. Stated bound for the libm blocks: 1 float32 ULP (even 4 double ULP only flips a float32 rounding by one step; observed 0);
 *     - stateful block: state is rounded identically on both sides, so a 1 ULP step of an output does not feed back unless it
 *       moves a state rounding; the stated bound stays 1 / 4 float32 ULP;
 *     - no absolute floor near zero: the float32 ULP distance of the value itself is used down to the subnormals, because
 *       a floor of maxUlp * 2^-23 would accept thousands of ULP at |v| ~ 1e-3;
 *     - KALMAN_FILTER (state kept in float64 by the interpreter, in float32 by C): x_hat, y_hat and kg carry one float32
 *       rounding of x / P per tick (relative 2^-24 of the LARGEST state component, which couples into the others through A),
 *       damped by the filter, so the bound is vector-wise: |dx_i| <= 8 * 2^-24 * max_j |x_j| (observed 2.5 * 2^-24; the
 *       small component x_hat[1] reaches 5 float32 ULP of itself, which is why a per-element ULP bound is wrong here). The
 *       innovation y - C x is a cancellation of operands that differ by that state rounding, so its relative difference is
 *       unbounded by construction (observed up to 200 ULP, absolute 1.5 * 2^-24); it is NOT reported as equal: the whole
 *       block is checked at 4 ULP in an it.fails FINDING CANDIDATE, and only x_hat / y_hat / kg are asserted as passing.
 *   The difference to a true float32 target (Simulink 'single' rounds every operation) is a separate question, not tested here.
 * ---------------------------------------------------------------------------------------------------------------------
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import {
  buildModel, runModel, buildParityIr, compileAndRunParity, generateParitySources, interpretIr, mapPool, parseParityOutput,
  renderParityHarness, ulpDistance, toEmbeddedModel, EMBEDDED_TARGET, PARITY_STATE_ID, STRICT_PARITY_FLAGS, DEFAULT_PARITY_FLAGS,
  type EmbeddedSolver, type ModelSpec, type ParityBuild, type ParitySources, type PerTick,
} from '../../engine/xbridges/testkit';
import { XB_CAPABILITIES } from './xbCapabilities';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import { hybridXBridgesFixture } from './smFixtures';
import { buildXBSemanticModel } from './xbSemanticBuilder';
import { validateXBModel } from './xbSemanticValidator';
import { generateMISRACCode } from '../stateMachineCodeGenerator';
import type { SemanticModel } from './smSemanticModel';

const DT = 0.05;
const STEPS = 40;
const SOLVERS: EmbeddedSolver[] = ['euler', 'rk4', 'discrete'];
const REPORT: Record<string, unknown> = {};

type Precision = 'float32' | 'float64';

// ------------------------------------------------------------------ build with a chosen signal precision
/** buildParityIr of the testkit with every port of the model typed `precision` (toEmbeddedModel always writes float64). */
function buildTyped(spec: ModelSpec, o: { solver: EmbeddedSolver; dt: number; portDimensions?: Record<string, number[]> }, precision: Precision): ParityBuild {
  try {
    const xb = toEmbeddedModel(spec, o);
    for (const node of xb.nodes as unknown as { parameters: { inputs: { dataType: string }[]; outputs: { dataType: string }[] } }[]) {
      for (const p of [...node.parameters.inputs, ...node.parameters.outputs]) p.dataType = precision;
    }
    (xb as { policy: unknown }).policy = { memory: 'reset', numericFault: 'signal-only' };
    const sm = hybridXBridgesFixture();
    sm.tickMs = Math.round(o.dt * 1000);
    sm.states[0].autostart = false;
    sm.states.find((s) => s.id === PARITY_STATE_ID)!.autostart = true;
    const shell = buildSemanticModel(sm);
    if (!shell.ir) return { ok: false, diagnostics: shell.diagnostics.map((d) => ({ severity: String(d.severity), code: d.code, message: d.message })) };
    const diagnostics: ParityBuild['diagnostics'] = [];
    const push = (ds: readonly { severity?: unknown; code?: string; message?: string }[]) => {
      for (const d of ds) diagnostics.push({ severity: String(d.severity), code: d.code, message: d.message });
    };
    push(validateXBModel(xb, {}, EMBEDDED_TARGET));
    if (diagnostics.some((d) => d.severity === 'error')) return { ok: false, diagnostics };
    const built = buildXBSemanticModel({ stateId: PARITY_STATE_ID, ownerState: shell.stateSymbols?.get(PARITY_STATE_ID), model: xb, variables: {}, target: EMBEDDED_TARGET, baseTickMs: sm.tickMs });
    push(built.diagnostics);
    if (!built.ir || diagnostics.some((d) => d.severity === 'error')) return { ok: false, diagnostics };
    const ir: SemanticModel = { ...shell.ir, states: { ...shell.ir.states, [PARITY_STATE_ID]: { ...shell.ir.states[PARITY_STATE_ID], xBridges: built.ir } } };
    return { ok: true, diagnostics, ir };
  } catch (err) {
    return { ok: false, diagnostics: [{ severity: 'error', code: 'PARITY_THROW', message: err instanceof Error ? err.message : String(err) }] };
  }
}

// ------------------------------------------------------------------ scenarios (the graph definitions of part A)
const isCodegen = (t: string) => XB_CAPABILITIES[t]?.codegen === true;
const SKIP = new Set(['Inport', 'Outport', 'Subsystem']);
const TYPES = Object.keys(XB_CAPABILITIES).filter((t) => isCodegen(t) && !SKIP.has(t) && typeof BLOCK_LIBRARY[t] === 'function').sort();
const hasContinuous = (type: string) => typeof (BLOCK_LIBRARY[type]('b', {}) as { evaluateDerivatives?: unknown }).evaluateDerivatives === 'function';
const familyOf = (t: string) => XB_CAPABILITIES[t]?.cConformanceCaseIds?.[0] ?? XB_CAPABILITIES[t]?.pairedConformanceCaseIds?.[0] ?? 'other';

const SINE_A = { type: 'Sine', amp: 1.3, freq: 0.37, phase: 0.2 };
const SINE_B = { type: 'Sine', amp: 0.8, freq: 0.91, phase: 1.1, offset: 0.1 };
const shapesOf = (t: string, dir: 'in' | 'out') => {
  const c = XB_CAPABILITIES[t];
  return (dir === 'in' ? c.inputShapes : c.outputShapes) ?? c.shapes;
};
interface Scenario { name: string; spec: ModelSpec; probes: string[]; dims?: Record<string, number[]> }

const scenariosFor = (type: string): Scenario[] => {
  const params: Record<string, unknown> = {};
  const proto = BLOCK_LIBRARY[type]('b', {});
  for (const k of ['sampleTime', 'sample_time']) if (k in (proto.params as object)) params[k] = 0.1;
  const ins = proto.inputs.map((p: { id: string }) => p.id);
  const outs = proto.outputs.map((p: { id: string }) => p.id);
  const probes = outs.map((o: string) => `b.${o}`);
  const out: Scenario[] = [];
  const KV = { type: 'Constant', params: { value: [0.5, -1.25] } };
  if (type === 'IdentityMatrix') {
    return [{ name: 'matrix', spec: { blocks: [{ id: 'b', type, params }], wires: [] }, probes, dims: { 'b.out': [3, 3] } }];
  }
  if (type === 'MUX') {
    const spec: ModelSpec = { blocks: [{ id: 'b', type, params }, { id: 's0', type: 'Constant', params: { value: 0.7 } }, { id: 's1', type: 'WaveformGen', params: SINE_A }], wires: ['s0.out -> b.in1', 's1.out -> b.in2'] };
    return [{ name: 'scalar-pair', spec, probes, dims: { 'b.y': [2] } }];
  }
  if (type === 'DEMUX') {
    const spec: ModelSpec = { blocks: [{ id: 'b', type, params }, { id: 's0', ...KV }], wires: ['s0.out -> b.u'] };
    return [{ name: 'vector2', spec, probes, dims: { 's0.out': [2], 'b.u': [2] } }];
  }
  if (type === 'MatrixSolve') {
    const spec: ModelSpec = {
      blocks: [{ id: 'b', type, params }, { id: 's0', type: 'Constant', params: { value: [[2, 1], [1, 3]] } }, { id: 's1', ...KV }],
      wires: ['s0.out -> b.in1', 's1.out -> b.in2'],
    };
    return [{ name: 'A2x2,b2', spec, probes, dims: { 's0.out': [2, 2], 'b.in1': [2, 2], 's1.out': [2], 'b.in2': [2], 'b.out': [2] } }];
  }
  if (ins.length === 0) return [{ name: 'no-input', spec: { blocks: [{ id: 'b', type, params }], wires: [] }, probes }];
  const drive = (srcs: { type: string; params: Record<string, unknown> }[]): ModelSpec => ({
    blocks: [{ id: 'b', type, params }, ...ins.map((_: string, i: number) => ({ id: `s${i}`, ...srcs[Math.min(i, srcs.length - 1)] }))],
    wires: ins.map((p: string, i: number) => `s${i}.out -> b.${p}`),
  });
  const K = { type: 'Constant', params: { value: 0.7 } };
  const WA = { type: 'WaveformGen', params: SINE_A };
  const WB = { type: 'WaveformGen', params: SINE_B };
  const scalarIn = shapesOf(type, 'in').includes('scalar');
  if (scalarIn) out.push({ name: 'const0.7', spec: drive([K]), probes });
  if (scalarIn) out.push({ name: 'sine', spec: drive([WA]), probes });
  if (scalarIn && ins.length >= 2) out.push({ name: 'sine+sine2', spec: drive([WA, WB, K]), probes });
  if (type === 'Sum' || type === 'SUM_JUNCTION') {
    const d = drive([WA, WB]);
    out.push({ name: 'sine+sine2 signs +-', spec: { ...d, blocks: [{ id: 'b', type, params: { ...params, signs: '+-' } }, ...d.blocks.slice(1)] }, probes });
  }
  const dimsFor = (d: number[]) => {
    const m: Record<string, number[]> = {};
    for (const p of ins) m[`b.${p}`] = d;
    const os = shapesOf(type, 'out');
    const same = d.length === 1 ? os.includes('vector') : os.includes('matrix');
    const shaped: Record<string, (x: number[]) => number[] | undefined> = {
      SubMatrix: () => [1, 1],
      MatrixConcat: (x) => [x[0] * 2, x[1]],
      MatrixDiag: (x) => (x.length === 1 ? [x[0], x[0]] : [x[0]]),
    };
    const forced = shaped[type]?.(d);
    for (const o of outs) m[`b.${o}`] = forced ?? (same ? d : []);
    ins.forEach((_: string, i: number) => { m[`s${i}.out`] = d; });
    return m;
  };
  const is = shapesOf(type, 'in');
  if (is.includes('vector')) out.push({ name: 'vector', spec: drive([{ type: 'Constant', params: { value: [0.5, -1.25, 2] } }]), probes, dims: dimsFor([3]) });
  if (is.includes('matrix')) out.push({ name: 'matrix', spec: drive([{ type: 'Constant', params: { value: [[1, 2], [3, 4.5]] } }]), probes, dims: dimsFor([2, 2]) });
  return out;
};

/** Several scenarios in ONE model (one compile): block ids get the prefix `c<i>_`, wires, probes and dimensions follow. */
interface Combined { spec: ModelSpec; probes: string[]; dims: Record<string, number[]>; map: { tag: string; scenario: Scenario; probes: string[] }[] }
const combine = (scs: Scenario[]): Combined => {
  const spec: ModelSpec = { blocks: [], wires: [] };
  const probes: string[] = [];
  const dims: Record<string, number[]> = {};
  const map: Combined['map'] = [];
  scs.forEach((sc, i) => {
    const tag = `c${i}_`;
    const rename = (ref: string) => `${tag}${ref}`;
    for (const b of sc.spec.blocks) spec.blocks.push({ ...b, id: rename(b.id) });
    for (const w of sc.spec.wires) {
      const m = /^\s*([^\s.>-]+)\.([^\s>-]+)\s*->\s*([^\s.>-]+)\.([^\s>-]+)\s*$/.exec(w)!;
      spec.wires.push(`${rename(m[1])}.${m[2]} -> ${rename(m[3])}.${m[4]}`);
    }
    for (const [k, v] of Object.entries(sc.dims ?? {})) dims[rename(k)] = v;
    const ps = sc.probes.map(rename);
    probes.push(...ps);
    map.push({ tag, scenario: sc, probes: ps });
  });
  return { spec, probes, dims, map };
};

// ------------------------------------------------------------------ comparison in float32 ULP
const LIBM_CALL_G = /\b(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log10|log2|log1p|pow|powf|sqrt|sqrtf|cbrt|hypot|sinf|cosf|tanf|expf|logf)\s*\(/g;
const libmCallsOf = (sources: ParitySources): Set<string> =>
  new Set(sources.files.filter((f) => f.name.endsWith('.c')).flatMap((f) => [...f.content.matchAll(LIBM_CALL_G)].map((m) => m[1])));
interface Cmp { detail?: string; values: number; worst: number }
/**
 * Plain float32 ULP distance, no absolute floor: ulpDistance(.., 'float32') is monotone over the whole float32 line including
 * subnormals, so a tiny result near a zero crossing is judged by the ULP of the value itself. (An absolute floor would hide
 * thousands of ULP near 1e-3.) Measured worst on this suite is 0 for every non-Kalman block, so no floor is needed.
 */
const compareF32 = (label: string, a: PerTick, b: PerTick, probes: string[], maxUlp: number, steps = STEPS): Cmp => {
  let values = 0;
  let worst = 0;
  for (let k = 0; k < steps; k++) {
    for (const p of probes) {
      const x = a[p]?.[k] ?? [];
      const y = b[p]?.[k] ?? [];
      if (x.length !== y.length) return { detail: `${label}: tick ${k + 1} ${p}: interpreter ${JSON.stringify(x)} vs C ${JSON.stringify(y)} (length)`, values, worst };
      for (let i = 0; i < x.length; i++) {
        values++;
        if (Number.isNaN(x[i]) && Number.isNaN(y[i])) continue;
        if (x[i] === y[i]) continue;
        const u = ulpDistance(x[i], y[i], 'float32');
        if (!Number.isFinite(u) || u > maxUlp || !Number.isFinite(x[i]) || !Number.isFinite(y[i])) {
          return { detail: `${label}: first difference at tick ${k + 1} ${p}[${i}]: interpreter ${x[i]} vs C ${y[i]} (${u} float32 ULP, allowed ${maxUlp})`, values, worst: Math.max(worst, Number.isFinite(u) ? u : 0) };
        }
        worst = Math.max(worst, u);
      }
    }
  }
  return { values, worst };
};

/** Vector-wise relative bound: |dx_i| <= tol * 2^-24 * max_j |x_j| per probe and tick (error propagated through a coupled state, not a per-element ULP). */
const compareNormwise = (label: string, a: PerTick, b: PerTick, probes: string[], tol: number): Cmp => {
  let values = 0; let worst = 0;
  for (let k = 0; k < STEPS; k++) for (const p of probes) {
    const x = a[p]?.[k] ?? []; const y = b[p]?.[k] ?? [];
    if (x.length !== y.length) return { detail: `${label}: tick ${k + 1} ${p}: length ${x.length} vs ${y.length}`, values, worst };
    const norm = Math.max(...x.map(Math.abs));
    for (let i = 0; i < x.length; i++) {
      values++;
      const d = Math.abs(x[i] - y[i]) / (2 ** -24 * norm);
      if (!(d <= tol)) return { detail: `${label}: tick ${k + 1} ${p}[${i}]: interpreter ${x[i]} vs C ${y[i]}, ${d} x 2^-24 x max|x| (allowed ${tol})`, values, worst };
      worst = Math.max(worst, ulpDistance(x[i], y[i], 'float32'));
    }
  }
  return { values, worst };
};
const firstError = (log: string) => (log.split('\n').find((l) => /error:|warning:/.test(l)) ?? log.split('\n')[0]).trim().slice(0, 240);
const STRICT_O0 = [...STRICT_PARITY_FLAGS, '-O0'];

// ================================================================== 1. float32 production profile
interface F32Outcome {
  kind: 'equal' | 'differ' | 'refused';
  detail: string;
  values: number;
  worst: number;
  scenarios: number;
  /** scenarios that built in float64 (part A) but were refused in float32 */
  refusedOnlyInFloat32: string[];
  /** first diagnostic of the strict (-Wconversion -Wdouble-promotion -Wshadow ...) compile, '' when clean */
  strictIssue: string;
  libm: boolean;
  /** KALMAN_FILTER only: the plain <= 4 ULP check, which fails by the interpreter / C state-rounding difference */
  plainDetail: string;
}

/** Types whose interpreter keeps state unrounded while C stores it as float (derivation in the header comment). */
const STATE_ROUNDING_TYPES = new Set(['KALMAN_FILTER']);
/** The block is itself a libm source (the sine stimulus is subtracted from every model, so it has to be named). */
const LIBM_BLOCKS = new Set(['WaveformGen']);
let baselineCalls: Set<string> | undefined;
const getBaselineCalls = (): Set<string> => {
  if (baselineCalls) return baselineCalls;
  const specs: ModelSpec[] = [
    { blocks: [{ id: 'k', type: 'Constant', params: { value: 0.7 } }, { id: 'g', type: 'GAIN' }], wires: ['k.out -> g.u'] },
    { blocks: [{ id: 'w', type: 'WaveformGen', params: SINE_A }], wires: [] },
  ];
  const calls = new Set<string>();
  for (const solver of SOLVERS) for (const sp of specs) {
    const b = buildTyped(sp, { solver, dt: DT }, 'float32');
    if (b.ok && b.ir) libmCallsOf(generateParitySources(b.ir)).forEach((c) => calls.add(c));
  }
  return (baselineCalls = calls);
};

const runF32 = async (type: string, solver: EmbeddedSolver): Promise<F32Outcome> => {
  const base: F32Outcome = { kind: 'equal', detail: '', values: 0, worst: 0, scenarios: 0, refusedOnlyInFloat32: [], strictIssue: '', libm: false, plainDetail: '' };
  const usable: Scenario[] = [];
  const refused32: string[] = [];
  for (const sc of scenariosFor(type)) {
    const b32 = buildTyped(sc.spec, { solver, dt: DT, portDimensions: sc.dims }, 'float32');
    if (b32.ok) { usable.push(sc); continue; }
    const b64 = buildParityIr(sc.spec, { solver, dt: DT, probes: sc.probes, portDimensions: sc.dims });
    const e = b32.diagnostics.find((d) => d.severity === 'error');
    if (b64.ok) base.refusedOnlyInFloat32.push(`${sc.name}: ${e?.code} ${e?.message}`);
    else refused32.push(`${sc.name}: ${e?.code}`);
  }
  if (usable.length === 0) return { ...base, kind: 'refused', detail: `${type}/${solver}: no scenario builds (${[...refused32, ...base.refusedOnlyInFloat32].join(' | ')})` };
  const comb = combine(usable);
  const built = buildTyped(comb.spec, { solver, dt: DT, portDimensions: comb.dims }, 'float32');
  if (!built.ok || !built.ir) return { ...base, kind: 'differ', detail: `${type}/${solver}: combined float32 model did not build: ${JSON.stringify(built.diagnostics.slice(0, 2))}` };
  const interp = interpretIr(built.ir, STEPS, comb.probes);
  if (interp.error) return { ...base, kind: 'differ', detail: `${type}/${solver}: interpreter stopped: ${interp.error}` };
  let sources: ParitySources;
  let harness: string;
  try {
    sources = generateParitySources(built.ir);
    harness = renderParityHarness(built.ir, sources, STEPS, comb.probes);
  } catch (err) {
    return { ...base, kind: 'differ', detail: `${type}/${solver}: generator threw: ${err instanceof Error ? err.message : String(err)}` };
  }
  let outcome = await compileAndRunParity(sources, harness, { flags: STRICT_O0 });
  if (!outcome.ok && outcome.stage === 'compile') {
    base.strictIssue = firstError(outcome.log);
    outcome = await compileAndRunParity(sources, harness, { flags: [...DEFAULT_PARITY_FLAGS, '-Wno-unused-function'] });
  }
  if (!outcome.ok) return { ...base, kind: 'differ', detail: `${type}/${solver}: C ${outcome.stage} failed: ${outcome.log.slice(0, 500)}` };
  const base0 = getBaselineCalls();
  const libm = LIBM_BLOCKS.has(type) || [...libmCallsOf(sources)].some((c) => !base0.has(c));
  const c = parseParityOutput(built.ir, sources, comb.probes, outcome.stdout);
  let worst = 0;
  let values = 0;
  let plainDetail = '';
  let innovationWorst = 0;
  const maxUlp = libm ? 1 : 0;
  for (const m of comb.map) {
    const label = `${type}/${solver}/${m.scenario.name}`;
    if (STATE_ROUNDING_TYPES.has(type)) {
      const passing = m.probes.filter((p) => !p.endsWith('.innovation'));
      const cmp = compareNormwise(label, interp.signals, c, passing, 8);
      values += cmp.values; worst = Math.max(worst, cmp.worst);
      if (cmp.detail) return { ...base, kind: 'differ', detail: cmp.detail, values, worst, libm };
      const all = compareF32(label, interp.signals, c, m.probes, 4);
      if (all.detail && plainDetail === '') plainDetail = all.detail;
      const inn = m.probes.filter((p) => p.endsWith('.innovation'));
      for (let k = 0; k < STEPS; k++) for (const p of inn) (interp.signals[p][k] ?? []).forEach((x, i) => { const u = ulpDistance(x, c[p][k][i], 'float32'); if (Number.isFinite(u)) innovationWorst = Math.max(innovationWorst, u); });
      continue;
    }
    const cmp = compareF32(label, interp.signals, c, m.probes, maxUlp);
    values += cmp.values; worst = Math.max(worst, cmp.worst);
    if (cmp.detail) return { ...base, kind: 'differ', detail: cmp.detail, values, worst, libm };
  }
  if (innovationWorst > 0) REPORT[`float32KalmanInnovationWorstUlp_${solver}`] = innovationWorst;
  return { ...base, kind: 'equal', values, worst, scenarios: usable.length, libm, plainDetail };
};

/** Pins found by the first run of this file (never edited into the expectations): key type|solver -> finding text. */
const F32_PINS: Record<string, string> = {};
const F32_STRICT_PINS: Record<string, string> = Object.fromEntries(['euler', 'rk4', 'discrete'].map((solver) => [
  `VectorPow|${solver}`,
  'VectorPow float32 emits powf((double)a, (double)b): -Wconversion rejects the implicit double -> float narrowing of both arguments (sm_core.c, xbCGenerator.ts emitVectorElementwisePower); exact only because the inputs are already float32, a float64 input would be silently narrowed',
]));

const F32_CASES = TYPES.flatMap((type) => SOLVERS.filter((s) => !(s === 'discrete' && hasContinuous(type))).map((solver) => ({ type, solver })));
const f32Results = new Map<string, F32Outcome>();

describe('V7B-1 float32 production profile: interpreter = generated C per block (float32 signals, 0 ULP for non-libm blocks, <= 1 ULP for libm blocks)', () => {
  beforeAll(async () => {
    const t0 = Date.now();
    const outs = await mapPool(F32_CASES, 4, (c) => runF32(c.type, c.solver));
    REPORT.float32Seconds = (Date.now() - t0) / 1000;
    F32_CASES.forEach((c, i) => f32Results.set(`${c.type}|${c.solver}`, outs[i]));
    const worstByFamily: Record<string, number> = {};
    F32_CASES.forEach((c, i) => {
      const f = familyOf(c.type);
      worstByFamily[f] = Math.max(worstByFamily[f] ?? 0, outs[i].worst);
    });
    REPORT.float32WorstUlpByFamily = worstByFamily;
    REPORT.float32Cases = outs.map((o, i) => ({ key: `${F32_CASES[i].type}|${F32_CASES[i].solver}`, kind: o.kind, worst: o.worst, values: o.values }));
  }, 900_000);

  it('the float32 model really carries float32 signals on both sides (IR numericType, C member type, interpreter rounding)', async () => {
    const spec: ModelSpec = { blocks: [{ id: 'k', type: 'Constant', params: { value: 0.1 } }, { id: 'g', type: 'GAIN', params: { gain: 3 } }], wires: ['k.out -> g.u'] };
    const b = buildTyped(spec, { solver: 'euler', dt: DT }, 'float32');
    expect(b.ok).toBe(true);
    const sig = b.ir!.states[PARITY_STATE_ID].xBridges!.signals['g:y'];
    expect(sig.numericType.kind).toBe('float32');
    const sources = generateParitySources(b.ir!);
    expect(sources.files.filter((f) => f.name.endsWith('.h')).map((f) => f.content).join('\n')).toMatch(/\bfloat g_y;/);
    const interp = interpretIr(b.ir!, 1, ['g.y']).signals['g.y'][0][0];
    expect(interp).toBe(Math.fround(Math.fround(0.1) * 3));
    expect(interp).not.toBe(0.1 * 3);
    const out = await compileAndRunParity(sources, renderParityHarness(b.ir!, sources, 1, ['g.y']), { flags: DEFAULT_PARITY_FLAGS });
    expect(out.ok).toBe(true);
    expect(Number(out.stdout.trim())).toBe(interp);
  });

  it('lists the types programmatically and covers euler, rk4 and discrete', () => {
    expect(TYPES.length).toBeGreaterThan(90);
    expect(new Set(F32_CASES.map((c) => c.solver))).toEqual(new Set(SOLVERS));
  });

  for (const { type, solver } of F32_CASES) {
    const key = `${type}|${solver}`;
    const title = `${type} ${solver} float32: C = interpreter`;
    const body = () => {
      const o = f32Results.get(key)!;
      if (o.kind === 'refused') return; // refused by generation in float64 as well: nothing to compare, listed in the summary test
      if (o.refusedOnlyInFloat32.length > 0) expect.fail(`refused only with float32: ${o.refusedOnlyInFloat32.join(' | ')}`);
      if (o.kind !== 'equal') expect.fail(o.detail);
      // a sink block (TERMINATOR) has no output signal to compare
      if ((BLOCK_LIBRARY[type]('b', {}).outputs as unknown[]).length > 0) expect(o.values, 'float32 values compared').toBeGreaterThan(0);
    };
    if (F32_PINS[key]) it.fails(`FINDING CANDIDATE: ${F32_PINS[key]} (${title})`, body); else it(title, body);
    if (STATE_ROUNDING_TYPES.has(type)) {
      it.fails(`FINDING CANDIDATE: ${type} float32 interpreter keeps the state x, P in float64 (xbInterpreter.ts ~1750 writes runtime.stateSlots without convertValue) while the generated C stores them as float: the plain <= 4 ULP check fails (${type} ${solver})`, () => {
        const o = f32Results.get(key)!;
        if (o.plainDetail !== '') expect.fail(o.plainDetail);
      });
    }
    const sbody = () => {
      const o = f32Results.get(key)!;
      if (o.strictIssue !== '') expect.fail(`first compiler diagnostic: ${o.strictIssue}`);
    };
    if (F32_STRICT_PINS[key]) it.fails(`FINDING CANDIDATE: ${F32_STRICT_PINS[key]} (${type} ${solver} float32 strict compile)`, sbody);
    else it(`${type} ${solver} float32: generated C compiles with -std=c99 -pedantic -Wall -Wextra -Werror -Wconversion -Wdouble-promotion -Wshadow`, sbody);
  }

  it('summary: types refused by generation in float64 and float32 alike are listed, none is refused only in float32', () => {
    const both = F32_CASES.filter((c) => f32Results.get(`${c.type}|${c.solver}`)!.kind === 'refused').map((c) => `${c.type}|${c.solver}`);
    REPORT.float32RefusedBoth = both;
    const only = F32_CASES.filter((c) => f32Results.get(`${c.type}|${c.solver}`)!.refusedOnlyInFloat32.length > 0).map((c) => `${c.type}|${c.solver}`);
    expect(only).toEqual([]);
  });
});

// ================================================================== 2. sanitizers with runtime
const SAN_TICKS = 400;
const SAN_FLAGS_FULL = ['-std=c99', '-O1', '-g', '-fsanitize=address,undefined', '-fno-sanitize-recover=all'];

const tryToolchain = (compiler: string, flags: string[], program: string, expectFailure: boolean): { works: boolean; log: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'xb-san-probe-'));
  try {
    writeFileSync(join(dir, 'p.c'), program);
    try { execFileSync(compiler, [...flags, 'p.c', '-o', 'p.exe', '-lm'], { cwd: dir, stdio: 'pipe' }); } catch (e) { return { works: false, log: `compile/link failed: ${String((e as { stderr?: Buffer }).stderr ?? e).split('\n').find((l) => /error|cannot find/.test(l)) ?? ''}`.slice(0, 300) }; }
    try {
      execFileSync(join(dir, 'p.exe'), [], { cwd: dir, stdio: 'pipe' });
      return { works: !expectFailure, log: expectFailure ? 'the deliberate out-of-bounds access was NOT reported' : '' };
    } catch (e) {
      const err = String((e as { stderr?: Buffer }).stderr ?? e);
      return { works: expectFailure && /AddressSanitizer|runtime error|Illegal|SIGILL/i.test(err + String((e as { signal?: string }).signal ?? '')), log: err.slice(0, 300) };
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
};
const CANARY = '#include <stdlib.h>\nint main(int argc, char **argv) { volatile int *p = (int *)malloc(4 * sizeof(int)); (void)argv; p[argc + 3] = 1; free((void *)p); return 0; }\n';
const CANARY_UB = '#include <limits.h>\nint main(int argc, char **argv) { volatile int a[2] = {1, 2}; (void)argv; return a[argc + 1]; }\n';
const CLEAN = '#include <stdio.h>\nint main(void) { puts("ok"); return 0; }\n';

const SAN: Record<string, { works: boolean; reason: string }> = {};
const detectSanitizers = () => {
  // gcc: address + undefined. The canary overflows a heap block: a live ASan aborts, a dead one (ptrace / personality / ASLR limits) fails to start or stays silent.
  const gccClean = tryToolchain('gcc', SAN_FLAGS_FULL, CLEAN, false);
  const gccAsan = gccClean.works ? tryToolchain('gcc', SAN_FLAGS_FULL, CANARY, true) : gccClean;
  SAN['gcc address,undefined'] = { works: gccClean.works && gccAsan.works, reason: gccClean.works ? gccAsan.log : gccClean.log };
  // clang: the same flags need libclang_rt.asan / ubsan_standalone, absent from this clang 18 package.
  const clangFull = tryToolchain('clang', SAN_FLAGS_FULL, CLEAN, false);
  SAN['clang address,undefined'] = { works: clangFull.works, reason: clangFull.log };
  const clangMsan = tryToolchain('clang', ['-std=c99', '-O1', '-g', '-fsanitize=memory', '-fno-sanitize-recover=all'], CLEAN, false);
  SAN['clang memory'] = { works: clangMsan.works, reason: clangMsan.log };
  // clang fallback: UBSan in trap mode needs no runtime library.
  const clangTrap = tryToolchain('clang', ['-std=c99', '-O1', '-g', '-fsanitize=undefined,float-divide-by-zero,float-cast-overflow', '-fsanitize-trap=all'], CLEAN, false);
  const clangTrapLive = clangTrap.works ? tryToolchain('clang', ['-std=c99', '-O1', '-g', '-fsanitize=undefined', '-fsanitize-trap=all'], CANARY_UB, true) : clangTrap;
  SAN['clang undefined (trap)'] = { works: clangTrap.works && clangTrapLive.works, reason: clangTrap.works ? clangTrapLive.log : clangTrap.log };
};
detectSanitizers();
REPORT.sanitizerAvailability = SAN;

interface SanModel { name: string; solver: EmbeddedSolver; precision: Precision; scenarios: Scenario[] }
const SAN_MODELS: SanModel[] = [];
{
  // Every codegen block type, all its scenarios, grouped into models of about 60 scenarios. The solver only changes the generated
  // code for blocks with continuous states (rk4 stages) and for discrete-only blocks (sample-time paths): euler = all types,
  // rk4 = the continuous types, discrete = the types without continuous states, plus the float32 profile on euler.
  const GROUP = 60;
  const configs: [EmbeddedSolver, Precision, (t: string) => boolean][] = [
    ['euler', 'float64', () => true],
    ['rk4', 'float64', (t) => hasContinuous(t)],
    ['discrete', 'float64', (t) => !hasContinuous(t)],
    ['euler', 'float32', () => true],
  ];
  for (const [solver, precision, pick] of configs) {
    const scs = TYPES.filter(pick).flatMap((t) => scenariosFor(t).map((s) => ({ ...s, name: `${t}/${s.name}` })));
    for (let i = 0; i < scs.length; i += GROUP) SAN_MODELS.push({ name: `blocks-${solver}-${precision}-${i / GROUP + 1}`, solver, precision, scenarios: scs.slice(i, i + GROUP) });
  }
}
interface SanResult { ok: boolean; stage: string; log: string; exitCode: number | null; dropped: string[]; scenarios: number }
const sanResults = new Map<string, SanResult>();

/** Build only the scenarios that build on their own (the combined model must build), then compile and run with the sanitizer. */
const runSanModel = async (m: SanModel, compiler: string, flags: string[]): Promise<SanResult> => {
  const usable: Scenario[] = [];
  const dropped: string[] = [];
  for (const sc of m.scenarios) {
    const b = buildTyped(sc.spec, { solver: m.solver, dt: DT, portDimensions: sc.dims }, m.precision);
    if (b.ok) usable.push(sc); else dropped.push(sc.name);
  }
  if (usable.length === 0) return { ok: true, stage: 'done', log: '', exitCode: 0, dropped, scenarios: 0 };
  const comb = combine(usable);
  const built = buildTyped(comb.spec, { solver: m.solver, dt: DT, portDimensions: comb.dims }, m.precision);
  if (!built.ok || !built.ir) return { ok: false, stage: 'build', log: JSON.stringify(built.diagnostics.slice(0, 2)), exitCode: null, dropped, scenarios: usable.length };
  const sources = generateParitySources(built.ir);
  const harness = renderParityHarness(built.ir, sources, SAN_TICKS, []);
  const o = await compileAndRunParity(sources, harness, { compiler, flags: [...flags, '-Wno-unused-function'] });
  return { ok: o.ok, stage: o.stage, log: o.log, exitCode: o.exitCode, dropped, scenarios: usable.length };
};

const FIXTURE_AND_HIL: { name: string; build: () => { files: { name: string; content: string }[] } }[] = [];
FIXTURE_AND_HIL.push({
  name: 'hybridXBridgesFixture (state machine with an X-Bridges state)',
  build: () => {
    const b = buildSemanticModel(hybridXBridgesFixture());
    if (!b.ir) throw new Error(`fixture does not build: ${JSON.stringify(b.diagnostics.slice(0, 2))}`);
    return generateCArtifacts(b.ir, { includeTestShims: true });
  },
});
{
  type Ch = { id: string; peripheral: string; direction: 'In' | 'Out'; mapped: boolean };
  // The seven configurations of xbLongIds.test.ts (XBV-318).
  const configs: Record<string, Ch[]> = {
    'DAC only': [{ id: 'dac', peripheral: 'DAC', direction: 'Out', mapped: true }],
    'PWM only': [{ id: 'pwm', peripheral: 'PWM', direction: 'Out', mapped: true }],
    'ADC only': [{ id: 'adc', peripheral: 'ADC', direction: 'In', mapped: true }],
    'GPIO in + UART': [{ id: 'gi', peripheral: 'GPIO', direction: 'In', mapped: true }, { id: 'u', peripheral: 'UART', direction: 'Out', mapped: true }],
    'GPIO out only': [{ id: 'go', peripheral: 'GPIO', direction: 'Out', mapped: true }],
    'unmapped GPIO input': [{ id: 'gi', peripheral: 'GPIO', direction: 'In', mapped: false }],
    'ADC + DAC': [{ id: 'adc', peripheral: 'ADC', direction: 'In', mapped: true }, { id: 'dac', peripheral: 'DAC', direction: 'Out', mapped: true }],
  };
  for (const [label, chans] of Object.entries(configs)) {
    FIXTURE_AND_HIL.push({
      name: `Generic HIL: ${label}`,
      build: () => {
        const vars = chans.map((c) => ({ id: `v_${c.id}`, name: `v_${c.id}`, type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true }));
        return generateMISRACCode({
          tickMs: 10,
          states: [{ id: 'idle', name: 'Idle', x: 0, y: 0, width: 100, height: 60, entry: '', during: '', exit: '', isActive: false, color: '#000', parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: true }],
          junctions: [], transitions: [], variables: vars,
          layers: [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['idle'], transitionIds: [], junctionIds: [] }],
          safetyMode: false,
          hilConfig: { enabled: true, target: 'Generic', clockSpeed: 1, commPort: '', baudRate: 115200,
            channels: chans.map((c, i) => ({ id: c.id, name: c.id, peripheral: c.peripheral, pin: `P${i}`, direction: c.direction, dataType: 'uint16', rangeMin: 0, rangeMax: 1023, scalingFactor: 1, unit: '' })),
            mappings: chans.filter((c) => c.mapped).map((c) => ({ id: `${c.id}_m`, adiaVarId: `v_${c.id}`, channelId: c.id, direction: c.direction === 'In' ? 'read' : 'write', ...(c.direction === 'Out' ? { safeValue: 0 } : {}) })) },
        } as never, { includeTestShims: true } as never) as unknown as { files: { name: string; content: string }[] };
      },
    });
  }
}
const GENERIC_MAIN = [
  '#include "sm_core.h"', '#include <stdio.h>', '',
  'int main(void)', '{', '    ADIA_Instance_t instance;', '    unsigned tick;',
  '    if (SM_Init(&instance) != SM_ERR_NONE) {', '        return 1;', '    }',
  `    for (tick = 0U; tick < ${SAN_TICKS}U; ++tick) {`,
  '        if (SM_Step(&instance, 10U) != SM_ERR_NONE) {', '            return 2;', '        }', '    }',
  '    printf("ticks %u\\n", tick);', '    return 0;', '}', '',
].join('\n');
const fixtureResults = new Map<string, SanResult>();
const runGenericPackage = async (files: { name: string; content: string }[], compiler: string, flags: string[]): Promise<SanResult> => {
  // top-level C and header files only, without the HIL board main (main_hil.c has its own main())
  const picked = files.filter((f) => !f.name.includes('/') && /\.[ch]$/.test(f.name) && f.name !== 'main_hil.c');
  const o = await compileAndRunParity({ files: picked }, GENERIC_MAIN, { compiler, flags: [...flags, '-Wno-unused-function'] });
  return { ok: o.ok && /^ticks /m.test(o.stdout), stage: o.stage, log: o.log, exitCode: o.exitCode, dropped: [], scenarios: 0 };
};

const gccSan = SAN['gcc address,undefined'];
describe('V7B-2 sanitizers with runtime (gcc -fsanitize=address,undefined -fno-sanitize-recover=all -g, 400 ticks)', () => {
  it(`sanitizer availability: ${Object.entries(SAN).map(([k, v]) => `${k}=${v.works ? 'runs' : 'skipped'}`).join(', ')}`, () => {
    REPORT.sanitizerAvailability = SAN;
    // The toolchain facts are reported (REPORT.sanitizerAvailability), the skips below carry the reasons.
    expect(Object.keys(SAN).sort()).toEqual(['clang address,undefined', 'clang memory', 'clang undefined (trap)', 'gcc address,undefined']);
  });

  describe.skipIf(!gccSan.works)('gcc address,undefined', () => {
    beforeAll(async () => {
      const t0 = Date.now();
      const outs = await mapPool(SAN_MODELS, 4, (m) => runSanModel(m, 'gcc', SAN_FLAGS_FULL));
      REPORT.sanGccBlocksSeconds = (Date.now() - t0) / 1000;
      SAN_MODELS.forEach((m, i) => sanResults.set(m.name, outs[i]));
      const fx = await mapPool(FIXTURE_AND_HIL, 4, async (f) => {
        try { return await runGenericPackage(f.build().files, 'gcc', SAN_FLAGS_FULL); } catch (err) { return { ok: false, stage: 'generate', log: String(err), exitCode: null, dropped: [], scenarios: 0 } as SanResult; }
      });
      FIXTURE_AND_HIL.forEach((f, i) => fixtureResults.set(f.name, fx[i]));
      REPORT.sanGccTotalSeconds = (Date.now() - t0) / 1000;
      REPORT.sanitizerDroppedScenarios = SAN_MODELS.flatMap((m) => sanResults.get(m.name)!.dropped.map((d) => `${m.name}: ${d}`));
      REPORT.sanitizerBlockModels = SAN_MODELS.map((m) => ({ name: m.name, scenarios: sanResults.get(m.name)!.scenarios, dropped: sanResults.get(m.name)!.dropped.length, ok: sanResults.get(m.name)!.ok }));
    }, 600_000);

    it('the toolchain is live: a deliberate heap overflow is reported by ASan (canary), so a clean run below means something', () => {
      expect(gccSan.works).toBe(true);
      expect(tryToolchain('gcc', SAN_FLAGS_FULL, CANARY, true).works).toBe(true);
    });
    for (const m of SAN_MODELS) {
      it(`${m.name}: every codegen block of the group runs ${SAN_TICKS} ticks with no sanitizer report`, () => {
        const r = sanResults.get(m.name)!;
        if (!r.ok) expect.fail(`${r.stage} (exit ${r.exitCode}): ${r.log.slice(0, 800)}`);
        expect(r.log).toBe('');
      });
    }
    it('all codegen block types appear in the sanitizer models (types the generator refuses in every scenario are listed)', () => {
      const usableNames = new Set<string>();
      for (const m of SAN_MODELS) {
        const r = sanResults.get(m.name)!;
        for (const sc of m.scenarios) if (!r.dropped.includes(sc.name)) usableNames.add(sc.name.split('/')[0]);
      }
      const never = TYPES.filter((t) => !usableNames.has(t));
      REPORT.sanitizerTypesNeverBuilt = never;
      expect(usableNames.size).toBeGreaterThan(TYPES.length - 12);
    });
    for (const f of FIXTURE_AND_HIL) {
      it(`${f.name}: ${SAN_TICKS} ticks of SM_Step with no sanitizer report`, () => {
        const r = fixtureResults.get(f.name)!;
        if (!r.ok) expect.fail(`${r.stage} (exit ${r.exitCode}): ${r.log.slice(0, 800)}`);
        expect(r.log).toBe('');
      });
    }
  });
  it.skipIf(gccSan.works)(`SKIPPED: gcc -fsanitize=address,undefined cannot run in this container (${gccSan.reason})`, () => { expect(gccSan.works).toBe(false); });

  describe.skipIf(!SAN['clang undefined (trap)'].works)('clang -fsanitize=undefined -fsanitize-trap=all (ASan and the UBSan runtime are not installed for clang 18 here)', () => {
    const trapResults = new Map<string, SanResult>();
    const TRAP_FLAGS = ['-std=c99', '-O1', '-g', '-fsanitize=undefined,float-divide-by-zero,float-cast-overflow', '-fsanitize-trap=all'];
    const TRAP_MODELS = SAN_MODELS.filter((m) => m.precision === 'float64' && m.solver === 'euler');
    beforeAll(async () => {
      const t0 = Date.now();
      const outs = await mapPool(TRAP_MODELS, 4, (m) => runSanModel(m, 'clang', TRAP_FLAGS));
      TRAP_MODELS.forEach((m, i) => trapResults.set(m.name, outs[i]));
      const fx = await mapPool(FIXTURE_AND_HIL, 4, async (f) => {
        try { return await runGenericPackage(f.build().files, 'clang', TRAP_FLAGS); } catch (err) { return { ok: false, stage: 'generate', log: String(err), exitCode: null, dropped: [], scenarios: 0 } as SanResult; }
      });
      FIXTURE_AND_HIL.forEach((f, i) => trapResults.set(`fx:${f.name}`, fx[i]));
      REPORT.sanClangSeconds = (Date.now() - t0) / 1000;
    }, 600_000);
    for (const m of TRAP_MODELS) {
      it(`${m.name}: clang UBSan (trap) runs ${SAN_TICKS} ticks clean`, () => {
        const r = trapResults.get(m.name)!;
        if (!r.ok) expect.fail(`${r.stage} (exit ${r.exitCode}): ${r.log.slice(0, 800)}`);
      });
    }
    for (const f of FIXTURE_AND_HIL) {
      it(`${f.name}: clang UBSan (trap) runs ${SAN_TICKS} ticks clean`, () => {
        const r = trapResults.get(`fx:${f.name}`)!;
        if (!r.ok) expect.fail(`${r.stage} (exit ${r.exitCode}): ${r.log.slice(0, 800)}`);
      });
    }
  });

  it.skipIf(SAN['clang address,undefined'].works)(`SKIPPED: clang -fsanitize=address,undefined (${SAN['clang address,undefined'].reason})`, () => { expect(SAN['clang address,undefined'].works).toBe(false); });
  it.skipIf(SAN['clang memory'].works)(`SKIPPED: clang -fsanitize=memory needs the MSan runtime and an instrumented libc (${SAN['clang memory'].reason})`, () => { expect(SAN['clang memory'].works).toBe(false); });
});

// ================================================================== 3. Diag blocks (D17)
type Shape = { rows: number; cols: number } | { length: number };
// Inputs that are NOT exactly representable in float32 (0.1, 1/3, 2.1e-7, -0.7, 0.1 * k - 0.35), so that a float32 model
// has to round them and an oracle without Math.fround would fail.
const VEC = (n: number) => [0.1, 1 / 3, 2.1e-7, -0.7].slice(0, n);
const MAT = (r: number, c: number) => Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => (i * c + j + 1) * 0.1 - 0.35 + (i === j ? 1 / 3 : 0)));
/** MATLAB diag oracle, written out by hand: vector -> n-by-n matrix (row-major), matrix -> min(m, n) diagonal vector. */
const matlabDiag = (input: number[] | number[][]): { dims: number[]; values: number[] } => {
  if (typeof input[0] === 'number') {
    const v = input as number[];
    const n = v.length;
    const out: number[] = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push(i === j ? v[i] : 0);
    return { dims: [n, n], values: out };
  }
  const m = input as number[][];
  const k = Math.min(m.length, m[0].length);
  return { dims: [k], values: Array.from({ length: k }, (_, i) => m[i][i]) };
};
const DIAG_CASES: { name: string; input: number[] | number[][] }[] = [
  ...[1, 2, 3, 4].map((n) => ({ name: `vector length ${n}`, input: VEC(n) })),
  ...([[2, 2], [3, 3], [2, 3], [3, 2]] as const).map(([r, c]) => ({ name: `matrix ${r}x${c}`, input: MAT(r, c) })),
];
const DIAG_TYPES = ['MatrixDiag', 'Diag', 'DiagExtract', 'ExtractDiag'];
const flatten = (v: unknown): number[] => (Array.isArray(v) ? v.flatMap(flatten) : [typeof v === 'boolean' ? (v ? 1 : 0) : Number(v)]);

describe('V7B-3 Diag blocks follow MATLAB diag (D17): the input shape decides', () => {
  it('the diag inputs are not exact in float32 (the float32 rows test the rounding)', () => {
    const all = DIAG_CASES.flatMap((c) => (c.input as unknown[]).flat() as number[]);
    expect(all.filter((x) => Math.fround(x) !== x).length).toBe(all.length);
  });

  it('the hand oracle itself: diag([a b]) and diag of a 2x3 / 3x2 matrix', () => {
    expect(matlabDiag([7, 8])).toEqual({ dims: [2, 2], values: [7, 0, 0, 8] });
    expect(matlabDiag([[1, 2, 3], [4, 5, 6]])).toEqual({ dims: [2], values: [1, 5] });
    expect(matlabDiag([[1, 2], [3, 4], [5, 6]])).toEqual({ dims: [2], values: [1, 4] });
    expect(matlabDiag([9])).toEqual({ dims: [1, 1], values: [9] });
  });

  // canvas engine (live loop, testkit runModel), value at sample 0
  for (const type of DIAG_TYPES) {
    for (const c of DIAG_CASES) {
      it(`canvas engine ${type}: ${c.name} = MATLAB diag`, () => {
        const spec: ModelSpec = { blocks: [{ id: 'k', type: 'Constant', params: { value: c.input } }, { id: 'b', type }], wires: ['k.out -> b.in'] };
        const r = runModel(buildModel(spec), { solver: 'euler', dt: 0.1, stopTime: 0.1, probes: ['b.out'] });
        const errs = r.diagnostics.filter((d) => d.severity === 'error');
        if (errs.length > 0) expect.fail(`canvas diagnostics: ${JSON.stringify(errs.slice(0, 2))}`);
        const expected = matlabDiag(c.input);
        expect(flatten(r.signals['b.out'][0])).toEqual(expected.values);
      });
    }
  }

  // embedded interpreter and generated C on the same IR, MatrixDiag (the only diag type with embedded conformance coverage)
  const diagSc = (c: (typeof DIAG_CASES)[number], type: string): Scenario => {
    const exp = matlabDiag(c.input);
    const inDims = typeof c.input[0] === 'number' ? [c.input.length] : [c.input.length, (c.input as number[][])[0].length];
    return {
      name: c.name,
      spec: { blocks: [{ id: 'b', type }, { id: 'k', type: 'Constant', params: { value: c.input } }], wires: ['k.out -> b.in'] },
      probes: ['b.out'],
      dims: { 'k.out': inDims, 'b.in': inDims, 'b.out': exp.dims },
    };
  };
  const diagResults = new Map<string, { interp: number[][]; c: number[][]; error?: string }>();
  beforeAll(async () => {
    const scs = DIAG_CASES.map((c) => diagSc(c, 'MatrixDiag'));
    const comb = combine(scs);
    for (const precision of ['float64', 'float32'] as Precision[]) {
      for (const solver of ['euler', 'discrete'] as EmbeddedSolver[]) {
        const key = `${precision}|${solver}`;
        const b = buildTyped(comb.spec, { solver, dt: DT, portDimensions: comb.dims }, precision);
        if (!b.ok || !b.ir) { diagResults.set(key, { interp: [], c: [], error: `build: ${JSON.stringify(b.diagnostics.slice(0, 3))}` }); continue; }
        const interp = interpretIr(b.ir, 3, comb.probes);
        const sources = generateParitySources(b.ir);
        const out = await compileAndRunParity(sources, renderParityHarness(b.ir, sources, 3, comb.probes), { flags: STRICT_O0 });
        const c = out.ok ? parseParityOutput(b.ir, sources, comb.probes, out.stdout) : {};
        comb.map.forEach((m, i) => diagResults.set(`${key}|${DIAG_CASES[i].name}`, {
          interp: interp.signals[m.probes[0]] ?? [], c: c[m.probes[0]] ?? [], error: interp.error ?? (out.ok ? undefined : `C ${out.stage}: ${firstError(out.log)}`),
        }));
        if (interp.error) diagResults.set(key, { interp: [], c: [], error: interp.error });
      }
    }
  }, 300_000);
  for (const precision of ['float64', 'float32'] as Precision[]) {
    for (const solver of ['euler', 'discrete'] as EmbeddedSolver[]) {
      for (const c of DIAG_CASES) {
        it(`embedded interpreter and generated C MatrixDiag ${precision} ${solver}: ${c.name} = MATLAB diag`, () => {
          const r = diagResults.get(`${precision}|${solver}|${c.name}`);
          const whole = diagResults.get(`${precision}|${solver}`);
          if (r === undefined) expect.fail(`no result: ${whole?.error ?? 'model did not run'}`);
          if (r.error) expect.fail(r.error);
          const expected = matlabDiag(c.input).values.map((x) => (precision === 'float32' ? Math.fround(x) : x));
          for (let tick = 0; tick < 3; tick++) {
            expect(r.interp[tick], `interpreter tick ${tick + 1}`).toEqual(expected);
            expect(r.c[tick], `C tick ${tick + 1}`).toEqual(expected);
          }
        });
      }
    }
  }

  // aliases: capability entries and refusal reason for embedded C
  for (const alias of ['Diag', 'DiagExtract', 'ExtractDiag']) {
    it(`${alias}: the embedded profile refuses C generation with the stated reason (alias without an embedded case) and the canvas still computes diag`, () => {
      expect(XB_CAPABILITIES[alias].codegen).toBe(false);
      expect(XB_CAPABILITIES[alias].reason ?? '').toMatch(/MATLAB diag/);
      const b = buildParityIr({ blocks: [{ id: 'b', type: alias }], wires: [] }, { solver: 'euler', dt: DT, probes: [] });
      expect(b.ok).toBe(false);
      expect(b.diagnostics.some((d) => d.code === 'XB_BLOCK_NOT_CODEGEN_CAPABLE')).toBe(true);
    });
  }
  it('MatrixDiag capability declares vector and matrix inputs and matrix and vector outputs (the shapes D17 needs)', () => {
    expect(XB_CAPABILITIES.MatrixDiag.codegen).toBe(true);
    expect([...XB_CAPABILITIES.MatrixDiag.inputShapes!].sort()).toEqual(['matrix', 'vector']);
    expect([...XB_CAPABILITIES.MatrixDiag.outputShapes!].sort()).toEqual(['matrix', 'vector']);
  });
});

afterAll(() => {
  if (process.env.XBCP_REPORT_B) writeFileSync(process.env.XBCP_REPORT_B, JSON.stringify(REPORT, null, 1));
});
