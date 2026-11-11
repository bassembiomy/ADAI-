/**
 * Gate V7 (plan 2026-11-10 §2, §7.1): the generated C99 equals the state-machine X-Bridges interpreter per tick for every
 * codegen-capable block, and the generator refuses everything else with the stated reason.
 *
 * Both sides run the SAME IR: a one-state machine ('controller') owning the persisted model that runEmbedded builds
 * (testkit/cParity.ts). Interpreter = createRuntime/stepRuntime, C = gcc -O0 of generateCArtifacts + a harness that calls
 * SM_Step per tick and prints every probed signal with "%.17g".
 * Tolerances (§2): integer/boolean bit-exact, float64 elementary arithmetic <= 1 ULP, libm results <= 4 ULP, NaN = NaN.
 * Out of scope: the tick time base (D9, XBV-084): both sides share it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import {
  buildParityIr, compileAndRunParity, generateParitySources, interpretIr, mapPool, parseParityOutput, renderParityHarness,
  runCParity, ulpDistance, STRICT_PARITY_FLAGS, DEFAULT_PARITY_FLAGS, toEmbeddedModel,
  type CParityResult, type EmbeddedSolver, type ModelSpec, type PerTick,
} from '../../engine/xbridges/testkit';
import { XB_CAPABILITIES } from './xbCapabilities';
import { buildSemanticModel } from './smSemanticBuilder';
import { hybridXBridgesFixture } from './smFixtures';

const DT = 0.05;
const STEPS = 40;
const SOLVERS: EmbeddedSolver[] = ['euler', 'rk4', 'discrete'];
const REPORT: Record<string, unknown> = {};

const isCodegen = (t: string) => XB_CAPABILITIES[t]?.codegen === true;
const SKIP = new Set(['Inport', 'Outport', 'Subsystem']); // same exclusions as xbTriParity: need structure / mapping context
const TYPES = Object.keys(XB_CAPABILITIES).filter((t) => isCodegen(t) && !SKIP.has(t) && typeof BLOCK_LIBRARY[t] === 'function').sort();
const hasContinuous = (type: string) => typeof (BLOCK_LIBRARY[type]('b', {}) as { evaluateDerivatives?: unknown }).evaluateDerivatives === 'function';

// ------------------------------------------------------------------ graph definitions (copied from xbTriParity.test.ts, not the expectations)
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

// ------------------------------------------------------------------ comparison
const ULP_ONE = 2 ** -52;
const LIBM_CALL = /\b(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log10|log2|log1p|pow|sqrt|cbrt|hypot)\s*\(/;

/** LOOSE_ABS: when set, values within this absolute distance pass (secondary check for whole-class XBV-098 pins). */
let LOOSE_ABS = 0;
const compareTraces = (label: string, a: PerTick, b: PerTick, probes: string[], maxUlp: number): { detail?: string; values: number; worst: number } => {
  let values = 0;
  let worst = 0;
  for (let k = 0; k < STEPS; k++) {
    for (const p of probes) {
      const x = a[p]?.[k] ?? [];
      const y = b[p]?.[k] ?? [];
      if (x.length !== y.length) return { detail: `${label}: tick ${k + 1} ${p}: interpreter ${JSON.stringify(x)} vs C ${JSON.stringify(y)} (length)`, values, worst };
      for (let i = 0; i < x.length; i++) {
        values++;
        if (Number.isNaN(x[i]) && Number.isNaN(y[i])) continue;
        if (x[i] === y[i]) continue;
        if (LOOSE_ABS > 0 && Math.abs(x[i] - y[i]) <= LOOSE_ABS) continue;
        const u = ulpDistance(x[i], y[i]);
        // Absolute floor of maxUlp ULP of 1.0, only near a zero crossing (|value| < 1e-3): there the ULP of the tiny result
        // is meaningless (sin(pi) = 1.2e-16 in both, 1 ULP of the argument apart). Elsewhere the plain ULP bound applies.
        if (Number.isFinite(x[i]) && Number.isFinite(y[i]) && Math.min(Math.abs(x[i]), Math.abs(y[i])) < 1e-3
          && Math.abs(x[i] - y[i]) <= maxUlp * ULP_ONE) { worst = Math.max(worst, Math.min(u, maxUlp)); continue; }
        if (!Number.isFinite(u) || u > maxUlp || !Number.isFinite(x[i]) || !Number.isFinite(y[i])) {
          return { detail: `${label}: first difference at tick ${k + 1} ${p}[${i}]: interpreter ${x[i]} vs C ${y[i]} (${u} ULP, allowed ${maxUlp})`, values, worst };
        }
        worst = Math.max(worst, u);
      }
    }
  }
  return { values, worst };
};

interface ScenarioResult {
  kind: 'refused' | 'fail' | 'ok';
  detail: string;
  values: number;
  worst: number;
  /** First compiler error of the strict (-Wall -Wextra -Werror -pedantic) compile, '' when it compiled clean. */
  compileIssue: string;
  /** Workarounds that were needed to get a running binary (never applied to the expectation). */
  workarounds: string[];
}

const firstError = (log: string) => (log.split('\n').find((l) => /error:|warning:/.test(l)) ?? log.split('\n')[0]).trim().slice(0, 240);

/**
 * Runs one scenario. If the strict compile fails, the cause is recorded and the scenario is rerun with a documented
 * workaround so the numbers can still be compared: an unused `sim_time` field is added through an unconnected Clock block
 * (WaveformGen reads instance->xb_controller.sim_time but the struct only declares it for Clock), and unused-function is
 * demoted for the unused shift helpers.
 */
const runScenario = async (label: string, sc: Scenario, solver: EmbeddedSolver): Promise<ScenarioResult> => {
  const base: ScenarioResult = { kind: 'ok', detail: '', values: 0, worst: 0, compileIssue: '', workarounds: [] };
  let spec = sc.spec;
  let flags: string[] | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r: CParityResult = await runCParity(spec, { solver, dt: DT, steps: STEPS, probes: sc.probes, portDimensions: sc.dims, flags });
    if (!r.build.ok) {
      const e = r.build.diagnostics.find((d) => d.severity === 'error');
      return { ...base, kind: 'refused', detail: `${label}: ${e?.code} ${e?.message}` };
    }
    if (r.generateError) return { ...base, kind: 'fail', detail: `${label}: generator threw: ${r.generateError}` };
    if (r.outcome && !r.outcome.ok && r.outcome.stage === 'compile') {
      if (base.compileIssue === '') base.compileIssue = firstError(r.outcome.log);
      // gcc quotes identifiers with ASCII quotes in the C locale and with ‘ ’ in a UTF-8 locale (GitHub runners).
      if (/no member named [‘'`]sim_time[’'`]/.test(r.outcome.log) && !base.workarounds.includes('clock')) {
        base.workarounds.push('clock');
        spec = { ...spec, blocks: [...spec.blocks, { id: 'a_clk', type: 'Clock' }] };
        continue;
      }
      if (/\[-Werror=unused-function\]/.test(r.outcome.log) && !base.workarounds.includes('unused-function')) {
        base.workarounds.push('unused-function');
        flags = [...DEFAULT_PARITY_FLAGS, '-Wno-unused-function'];
        continue;
      }
    }
    if (r.interpreterError) return { ...base, kind: 'fail', detail: `${label}: interpreter stopped: ${r.interpreterError}` };
    if (!r.outcome?.ok) return { ...base, kind: 'fail', detail: `${label}: C ${r.outcome?.stage} failed: ${r.outcome?.log.slice(0, 600)}` };
    const libm = r.sources!.files.some((f) => f.name.endsWith('.c') && LIBM_CALL.test(f.content));
    const c = compareTraces(label, r.interpreter, r.c, sc.probes, libm ? 4 : 1);
    return c.detail ? { ...base, kind: 'fail', detail: c.detail } : { ...base, kind: 'ok', values: c.values, worst: c.worst };
  }
  return { ...base, kind: 'fail', detail: `${label}: C compile failed after workarounds` };
};

/** static = Constant / vector / matrix sources only; sine = WaveformGen sources; signs = the Sum '+-' scenario (XBV-083). */
type ScenarioClass = 'static' | 'sine' | 'signs';
const classOf = (sc: Scenario): ScenarioClass =>
  sc.name.includes('signs') ? 'signs' : sc.spec.blocks.some((b) => b.type === 'WaveformGen') ? 'sine' : 'static';

type Outcome =
  | { kind: 'equal'; ticks: number; values: number; ulp: number; scenarios: number; refusedScenarios: string[]; compileIssue: string; workarounds: string[] }
  | { kind: 'differ'; detail: string; compileIssue: string; workarounds: string[] }
  | { kind: 'unrunnable'; detail: string; compileIssue: string; workarounds: string[] };

const runClass = async (type: string, solver: EmbeddedSolver, cls: ScenarioClass, scenarios: Scenario[]): Promise<Outcome> => {
  const refused: string[] = [];
  const issues: string[] = [];
  const workarounds = new Set<string>();
  let values = 0;
  let worst = 0;
  let ok = 0;
  const meta = () => ({ compileIssue: issues[0] ?? '', workarounds: [...workarounds] });
  for (const sc of scenarios) {
    const r = await runScenario(`${type}/${solver}/${sc.name}`, sc, solver);
    if (r.compileIssue) issues.push(r.compileIssue);
    r.workarounds.forEach((w) => workarounds.add(w));
    if (r.kind === 'fail') return { kind: 'differ', detail: r.detail, ...meta() };
    if (r.kind === 'refused') { refused.push(r.detail); continue; }
    ok++; values += r.values; worst = Math.max(worst, r.worst);
  }
  if (ok === 0) return { kind: 'unrunnable', detail: `${cls}: ${refused.join(' | ')}`, ...meta() };
  return { kind: 'equal', ticks: STEPS, values, ulp: worst, scenarios: ok, refusedScenarios: refused, ...meta() };
};

// ------------------------------------------------------------------ pins
const PIN_CAUSE: Record<string, string> = {
  'XBV-083': 'Sum signs: the interpreter ignores the signs parameter and always adds (xbInterpreter.ts:530); Simulink Sum +- subtracts and the generated C applies the signs (xbCGenerator.ts:~1030), interpreter wrong',
  'XBV-086': 'out-of-domain input under the signal-only fault policy: the generated C raises the error flag and publishes the deterministic fallback 0 (documented contract, XBRIDGES_EMBEDDED_CODEGEN.md "Numeric faults"); the interpreter publishes NaN and records no fault (xbInterpreter.ts ~307), interpreter wrong. Whether the fallback should be NaN or 0 is a separate convention question',
  'XBV-093': 'capabilities mismatch: the registry marks the block codegen-capable but generation refuses the default model (continuous STATE_SPACE: XB_DISCRETE_REPRESENTATION_REQUIRED; DISCRETE_TRANSFER_FUNCTION: XB_STATE_INITIAL_VALUE_INVALID on the vector scenario)',
  'XBV-094': 'registry lists scalar for the Vector* blocks but generation refuses scalar inputs (XB_SHAPE_UNRESOLVED), the block cannot be generated for a scalar graph',
  'XBV-095': 'the factory default mode PID makes buildSemanticModel throw \'Invalid PID mode: PID\' (xbPidContract.ts:18) instead of returning a diagnostic; builder wrong',
  'XBV-096': 'WaveformGen reads instance->xb_controller.sim_time, a struct member that is declared only when the model contains a Clock block (xbCGenerator.ts:~161, :1001): a model with a WaveformGen and no Clock does not compile; with a Clock the waveform time depends on the Clock having run earlier in the tick (t = sim_time - dt)',
  'XBV-097': 'Clock/WaveformGen are emitted twice into SolverSubstep when the model has continuous states (sm_core.c: sim_time += dt appears in both passes, xbCGenerator.ts:~986 and :~2500); time runs at 2x in C (observed: C waveform at tick k = interpreter at tick 2k), interpreter right',
  'XBV-098': 'C waveform time is t = (sim_time + dt) - dt (xbCGenerator.ts:~1001) which adds one rounding of t; both sides stay within 1.8e-15 of the closed form 1.3 sin(2 pi 0.37 k dt + 0.2) for a lone WaveformGen, but the sine-driven block results then differ by more than 4 ULP (about 1e-15 absolute); neither side exact (time accumulates by addition on both sides)',
  'XBV-099': 'registry declares vector for this block but the C generator throws a raw Error (\'X-Bridges Task 8 emitter requires scalar signal\') instead of returning a diagnostic; generator wrong',
  'XBV-100': 'sm_core.c defines static SM_XB_ShiftLeft32 / SM_XB_ShiftRight32 even when unused, so -Wall -Werror (-Wunused-function) fails; generator wrong',
  'XBV-101': 'bitwise/shift on double inputs: the interpreter computes in uint32, the generated C in int32 (interpreter 4294967295 vs C -1, 2147483648 vs -2147483648); Simulink bitwise operators need integer types, no oracle for double input, unresolved',
  'XBV-102': 'Kalman x_hat: interpreter 0.35195 vs C 0.66873 at tick 1 for u = y = 0.7 with the factory A, B, C, Q, R, P0; the block equation (predict, K = P- C^T (C P- C^T + R)^-1, x = x- + K (y - C x-)) gives 0.63694, so neither side matches it, unresolved (see XBV-092)',
  'XBV-104': 'generated C declares xb_value_<op>_<port> in an inner block while the same name exists in the enclosing scope of SolverSubstep (sm_core.c:78 for the Sum/Integrator loop), so -Wshadow (gcc and clang) fails; generator wrong',
  'XBV-105': 'generated C mixes float and double in a conditional expression (RATE_LIMITER / RELAY path), so -Wdouble-promotion fails (gcc sm_core.c:143, clang sm_core.c:100); generator wrong',
  'XBV-103': 'BAND_LIMITED_NOISE tick 1: interpreter -1.03300 vs C -1.00272 while WHITE_NOISE agrees on both sides; the filter step differs, no closed form for a pseudo-random stream, unresolved',
};
const PINS: Record<string, string> = {
  // Revealed when the absolute ULP floor was restricted to |x| < 1e-3 (WP-17 verifier): sub-1e-15 differences from
  // the XBV-098 time rounding; each has a 1e-13 secondary check below.
  'ACOSEC|discrete|sine': 'XBV-086',
  'ACOSEC|discrete|static': 'XBV-086',
  'ACOSEC|euler|sine': 'XBV-086',
  'ACOSEC|euler|static': 'XBV-086',
  'ACOSEC|rk4|sine': 'XBV-086',
  'ACOSEC|rk4|static': 'XBV-086',
  'ACOSH|discrete|sine': 'XBV-086',
  'ACOSH|discrete|static': 'XBV-086',
  'ACOSH|euler|sine': 'XBV-086',
  'ACOSH|euler|static': 'XBV-086',
  'ACOSH|rk4|sine': 'XBV-086',
  'ACOSH|rk4|static': 'XBV-086',
  'ACOS|discrete|sine': 'XBV-086',
  'ACOS|euler|sine': 'XBV-086',
  'ACOS|rk4|sine': 'XBV-086',
  'ACOTH|discrete|sine': 'XBV-086',
  'ACOTH|discrete|static': 'XBV-086',
  'ACOTH|euler|sine': 'XBV-086',
  'ACOTH|euler|static': 'XBV-086',
  'ACOTH|rk4|sine': 'XBV-086',
  'ACOTH|rk4|static': 'XBV-086',
  'ASECH|discrete|sine': 'XBV-086',
  'ASECH|euler|sine': 'XBV-086',
  'ASECH|rk4|sine': 'XBV-086',
  'ASEC|discrete|sine': 'XBV-086',
  'ASEC|discrete|static': 'XBV-086',
  'ASEC|euler|sine': 'XBV-086',
  'ASEC|euler|static': 'XBV-086',
  'ASEC|rk4|sine': 'XBV-086',
  'ASEC|rk4|static': 'XBV-086',
  'ASIN|discrete|sine': 'XBV-086',
  'ASIN|euler|sine': 'XBV-086',
  'ASIN|rk4|sine': 'XBV-086',
  'BAND_LIMITED_NOISE|discrete|static': 'XBV-103',
  'BAND_LIMITED_NOISE|euler|static': 'XBV-103',
  'BAND_LIMITED_NOISE|rk4|static': 'XBV-103',
  'BitwiseAND|discrete|sine': 'XBV-101',
  'BitwiseAND|euler|sine': 'XBV-101',
  'BitwiseAND|rk4|sine': 'XBV-101',
  'BitwiseNOT|discrete|sine': 'XBV-101',
  'BitwiseNOT|discrete|static': 'XBV-101',
  'BitwiseNOT|euler|sine': 'XBV-101',
  'BitwiseNOT|euler|static': 'XBV-101',
  'BitwiseNOT|rk4|sine': 'XBV-101',
  'BitwiseNOT|rk4|static': 'XBV-101',
  'BitwiseOR|discrete|sine': 'XBV-101',
  'BitwiseOR|euler|sine': 'XBV-101',
  'BitwiseOR|rk4|sine': 'XBV-101',
  'BitwiseXOR|discrete|sine': 'XBV-101',
  'BitwiseXOR|euler|sine': 'XBV-101',
  'BitwiseXOR|rk4|sine': 'XBV-101',
  'DISCRETE_TRANSFER_FUNCTION|discrete|static': 'XBV-093',
  'DISCRETE_TRANSFER_FUNCTION|euler|static': 'XBV-093',
  'DISCRETE_TRANSFER_FUNCTION|rk4|static': 'XBV-093',
  'KALMAN_FILTER|discrete|sine': 'XBV-102',
  'KALMAN_FILTER|discrete|static': 'XBV-102',
  'KALMAN_FILTER|euler|sine': 'XBV-102',
  'KALMAN_FILTER|euler|static': 'XBV-102',
  'KALMAN_FILTER|rk4|sine': 'XBV-102',
  'KALMAN_FILTER|rk4|static': 'XBV-102',
  'STATE_SPACE|euler|static': 'XBV-093',
  'STATE_SPACE|rk4|static': 'XBV-093',
  'ShiftLeft|discrete|sine': 'XBV-101',
  'ShiftLeft|euler|sine': 'XBV-101',
  'ShiftLeft|rk4|sine': 'XBV-101',
  'ShiftRight|discrete|sine': 'XBV-101',
  'ShiftRight|euler|sine': 'XBV-101',
  'ShiftRight|rk4|sine': 'XBV-101',
  'VectorAdd|discrete|sine': 'XBV-094',
  'VectorAdd|euler|sine': 'XBV-094',
  'VectorAdd|rk4|sine': 'XBV-094',
  'VectorDiv|discrete|sine': 'XBV-094',
  'VectorDiv|euler|sine': 'XBV-094',
  'VectorDiv|rk4|sine': 'XBV-094',
  'VectorMul|discrete|sine': 'XBV-094',
  'VectorMul|euler|sine': 'XBV-094',
  'VectorMul|rk4|sine': 'XBV-094',
  'VectorPow|discrete|sine': 'XBV-086',
  'VectorPow|discrete|static': 'XBV-086',
  'VectorPow|euler|sine': 'XBV-086',
  'VectorPow|euler|static': 'XBV-086',
  'VectorPow|rk4|sine': 'XBV-086',
  'VectorPow|rk4|static': 'XBV-086',
  'VectorSub|discrete|sine': 'XBV-094',
  'VectorSub|euler|sine': 'XBV-094',
  'VectorSub|rk4|sine': 'XBV-094',
};
const COMPILE_PINS: Record<string, string> = {
};
const pinTitle = (pin: string, title: string) => `${pin}: ${title}${PIN_CAUSE[pin] ? ` (${PIN_CAUSE[pin]})` : ''}`;

const CASES = TYPES.flatMap((type) => SOLVERS.filter((s) => !(s === 'discrete' && hasContinuous(type))).flatMap((solver) => {
  const byClass = new Map<ScenarioClass, Scenario[]>();
  for (const sc of scenariosFor(type)) byClass.set(classOf(sc), [...(byClass.get(classOf(sc)) ?? []), sc]);
  return [...byClass.entries()].map(([cls, scenarios]) => ({ type, solver, cls, scenarios }));
}));
const results = new Map<string, Outcome>();

describe('V7 per-block parity: interpreter = generated C, every codegen-capable BLOCK_LIBRARY type', () => {
  beforeAll(async () => {
    const outs = await mapPool(CASES, 4, (c) => runClass(c.type, c.solver, c.cls, c.scenarios));
    CASES.forEach((c, i) => results.set(`${c.type}|${c.solver}|${c.cls}`, outs[i]));
  }, 1_200_000);
  it('lists the types programmatically', () => {
    expect(TYPES.length).toBeGreaterThan(90);
    expect(TYPES.length).toBe(Object.entries(XB_CAPABILITIES).filter(([t, c]) => c.codegen && !SKIP.has(t) && typeof BLOCK_LIBRARY[t] === 'function').length);
  });
  for (const { type, solver, cls } of CASES) {
    const key = `${type}|${solver}|${cls}`;
    const title = `${type} ${solver} (${cls} inputs): C = interpreter`;
    const body = () => {
      const o = results.get(key)!;
      REPORT[key] = o;
      if (o.kind !== 'equal') expect.fail(o.detail);
    };
    const pin = PINS[key];
    if (pin) it.fails(pinTitle(pin, title), body); else it(title, body);
    // A whole-class XBV-098 pin (1e-15 time rounding) must not hide another C defect on sine inputs: re-run the class
    // with an absolute tolerance of 1e-13 (two orders above the rounding, far below any real defect).
    if (pin === 'XBV-098') {
      const stitle = `${type} ${solver} (sine inputs): C = interpreter within 1e-13 (secondary check under the XBV-098 pin)`;
      // ATANH sees sin inputs of amplitude 1.3, i.e. out of domain: the remaining difference is XBV-086.
      (type === 'ATANH' ? (t: string, f: () => Promise<void>, ms: number) => it.fails(pinTitle('XBV-086', t), f, ms) : it)(stitle, async () => {
        LOOSE_ABS = 1e-13;
        try {
          const o = await runClass(type, solver, cls, CASES.find((c) => c.type === type && c.solver === solver && c.cls === cls)!.scenarios);
          if (o.kind !== 'equal') expect.fail(o.detail);
        } finally { LOOSE_ABS = 0; }
      }, 300_000);
    }
    if (cls === 'static') {
      const ctitle = `${type} ${solver}: generated C compiles with -std=c99 -pedantic -Wall -Wextra -Werror`;
      const cbody = () => {
        const o = results.get(key)!;
        if (o.compileIssue) expect.fail(`first compiler diagnostic: ${o.compileIssue} (workarounds needed to run: ${o.workarounds.join(', ')})`);
      };
      const cpin = COMPILE_PINS[key];
      if (cpin) it.fails(pinTitle(cpin, ctitle), cbody); else it(ctitle, cbody);
    }
  }
});


// ================================================================== 1. registry closure (no C compile)
const GENERATION_REFUSED = 'XB_BLOCK_NOT_CODEGEN_CAPABLE';
const NON_CODEGEN_SAMPLE = ['Scope', 'LMS_ADAPTIVE_FILTER', 'INTEGRATOR', 'DERIVATIVE', 'TRANSFER_FUNCTION', 'ZERO_POLE_GAIN', 'PWM_GENERATOR', 'EXTENDED_KALMAN_FILTER', 'AC_INDUCTION_MOTOR', 'ROBOT_VACUUM_NAV'];

/** Generation of a model holding one block of `type`: diagnostics and whether an IR (hence C) could be produced. */
const generationOf = (type: string) => {
  const spec: ModelSpec = { blocks: [{ id: 'b', type }], wires: [] };
  const embedded = buildParityIr(spec, { solver: 'euler', dt: DT, probes: [] });
  return { embedded, spec };
};

describe('V7 registry closure', () => {
  const entries = Object.entries(XB_CAPABILITIES);
  const codegenTrue = entries.filter(([, c]) => c.codegen).map(([t]) => t).sort();
  const codegenFalse = entries.filter(([, c]) => !c.codegen).map(([t]) => t).sort();

  it('the registry holds codegen true and false entries', () => {
    expect(codegenTrue.length).toBe(100);
    expect(codegenFalse.length).toBeGreaterThan(150);
    REPORT.registry = { codegenTrue: codegenTrue.length, codegenFalse: codegenFalse.length };
  });

  it.fails('XBV-006: every codegen true capability entry has a BLOCK_LIBRARY factory (SUM_JUNCTION has none)', () => {
    expect(codegenTrue.filter((t) => typeof BLOCK_LIBRARY[t] !== 'function')).toEqual([]);
  });
  it('the only codegen true entry without a factory is SUM_JUNCTION', () => {
    expect(codegenTrue.filter((t) => typeof BLOCK_LIBRARY[t] !== 'function')).toEqual(['SUM_JUNCTION']);
  });

  it('every codegen false entry has a non-empty reason', () => {
    expect(codegenFalse.filter((t) => (XB_CAPABILITIES[t].reason ?? '').trim().length === 0)).toEqual([]);
  });

  for (const type of NON_CODEGEN_SAMPLE) {
    it(`${type}: generation stops with ${GENERATION_REFUSED} and the stated reason, no C is produced`, () => {
      expect(XB_CAPABILITIES[type]?.codegen).toBe(false);
      expect(typeof BLOCK_LIBRARY[type]).toBe('function');
      const reason = XB_CAPABILITIES[type].reason!;
      const { embedded, spec } = generationOf(type);
      expect(embedded.ok).toBe(false);
      expect(embedded.ir).toBeUndefined();
      const d = embedded.diagnostics.find((x) => x.code === GENERATION_REFUSED);
      expect(d?.message).toBe(reason);
      // production state-machine path (buildSemanticModel -> generateCArtifacts input)
      const sm = hybridXBridgesFixture();
      sm.states.find((st) => st.id === 'controller')!.xBridgesModel = toEmbeddedModelForSm(spec);
      const built = buildSemanticModel(sm);
      expect(built.ir).toBeUndefined();
      const sd = built.diagnostics.find((x) => x.code === GENERATION_REFUSED);
      expect(sd?.message).toContain(reason);
    });
  }

  it('every codegen false entry that has a factory is refused with the code and its reason (all types)', () => {
    let checked = 0;
    const wrong: string[] = [];
    for (const type of codegenFalse) {
      if (typeof BLOCK_LIBRARY[type] !== 'function') continue;
      let g: ReturnType<typeof generationOf>;
      try { g = generationOf(type); } catch (err) { wrong.push(`${type}: threw ${String(err)}`); continue; }
      checked++;
      const d = g.embedded.diagnostics.find((x) => x.code === GENERATION_REFUSED);
      if (g.embedded.ok || d === undefined || d.message !== XB_CAPABILITIES[type].reason) wrong.push(`${type}: ${JSON.stringify(g.embedded.diagnostics.slice(0, 2))}`);
    }
    REPORT.refusedAllTypes = { checked, wrong: wrong.length };
    expect(wrong).toEqual([]);
  });

  it.fails('XBV-009: docs/XBRIDGES_EMBEDDED_CODEGEN.md lists exactly the codegen true types (it lists about 40; the registry has 100)', () => {
    const doc = readFileSync(join(process.cwd(), 'docs', 'XBRIDGES_EMBEDDED_CODEGEN.md'), 'utf8');
    const section = doc.slice(doc.indexOf('| Family | Embedded-capable block types |'), doc.indexOf('Support is conditional'));
    const listed = [...section.matchAll(/`([A-Za-z_0-9]+)`/g)].map((m) => m[1]).sort();
    REPORT.docTable = { listed: listed.length, registry: codegenTrue.length };
    expect(listed).toEqual(codegenTrue);
  });
});

function toEmbeddedModelForSm(spec: ModelSpec) {
  const m = toEmbeddedModel(spec, { solver: 'euler', dt: DT });
  return m;
}

// ================================================================== 2b. WaveformGen needs a Clock in C (XBV-096)
describe('V7 WaveformGen in C', () => {
  it(pinTitle('XBV-096', 'a model with a WaveformGen and no Clock compiles with -std=c99 -pedantic -Wall -Wextra -Werror'), async () => {
    const r = await runCParity({ blocks: [{ id: 'b', type: 'WaveformGen', params: SINE_A }], wires: [] }, { solver: 'euler', dt: DT, steps: 4, probes: ['b.out'], flags: DEFAULT_PARITY_FLAGS });
    expect(r.generateError).toBeUndefined();
    expect(r.outcome?.log.slice(0, 300) ?? '').toBe('');
    expect(r.outcome?.ok).toBe(true);
  });
});

// ================================================================== 4-5. compile matrix and static properties on six representative models
interface MatrixModel { spec: ModelSpec; probes: string[]; solver: EmbeddedSolver; dims?: Record<string, number[]> }
const MODELS: Record<string, MatrixModel> = {
  'sum-gain-chain': {
    solver: 'euler', probes: ['s.out', 'g2.y'],
    spec: {
      blocks: [{ id: 'c', type: 'Constant', params: { value: 0.7 } }, { id: 'd', type: 'Constant', params: { value: -1.3 } }, { id: 'g', type: 'GAIN', params: { gain: 2.5 } }, { id: 's', type: 'Sum' }, { id: 'g2', type: 'GAIN', params: { gain: -0.5 } }],
      wires: ['c.out -> g.u', 'g.y -> s.in1', 'd.out -> s.in2', 's.out -> g2.u'],
    },
  },
  'integrator-loop': {
    solver: 'euler', probes: ['i.out', 's.out'],
    spec: {
      blocks: [{ id: 'k', type: 'Constant', params: { value: 1 } }, { id: 's', type: 'Sum', params: { signs: '+-' } }, { id: 'i', type: 'Integrator' }],
      wires: ['k.out -> s.in1', 'i.out -> s.in2', 's.out -> i.in'],
    },
  },
  'pid-basic-discrete': {
    solver: 'discrete', probes: ['p.u'],
    spec: {
      blocks: [{ id: 'e', type: 'Constant', params: { value: 0.7 } }, { id: 'en', type: 'Constant', params: { value: 1 } }, { id: 'rs', type: 'Constant', params: { value: 0 } }, { id: 'p', type: 'PID_BASIC', params: { sampleTime: 0.1 } }],
      wires: ['e.out -> p.e', 'en.out -> p.enable', 'rs.out -> p.reset'],
    },
  },
  trig: {
    solver: 'euler', probes: ['a.y', 'b.y', 'c.y', 'd.y'],
    spec: {
      blocks: [{ id: 'k', type: 'Constant', params: { value: 0.7 } }, { id: 'a', type: 'SIN' }, { id: 'b', type: 'COS' }, { id: 'c', type: 'TANH' }, { id: 'd', type: 'ATAN' }],
      wires: ['k.out -> a.u', 'a.y -> b.u', 'b.y -> c.u', 'c.y -> d.u'],
    },
  },
  'matrix-ops': {
    solver: 'euler', probes: ['m.out', 'sv.out'],
    spec: {
      blocks: [{ id: 'A', type: 'Constant', params: { value: [[2, 1], [1, 3]] } }, { id: 't', type: 'Transpose' }, { id: 'm', type: 'MatrixMul' }, { id: 'v', type: 'Constant', params: { value: [0.5, -1.25] } }, { id: 'sv', type: 'MatrixSolve' }],
      wires: ['A.out -> t.in', 'A.out -> m.in1', 't.out -> m.in2', 'm.out -> sv.in1', 'v.out -> sv.in2'],
    },
    dims: { 'A.out': [2, 2], 't.in': [2, 2], 't.out': [2, 2], 'm.in1': [2, 2], 'm.in2': [2, 2], 'm.out': [2, 2], 'sv.in1': [2, 2], 'v.out': [2], 'sv.in2': [2], 'sv.out': [2] },
  },
  discontinuities: {
    solver: 'euler', probes: ['sat.y', 'dz.y', 'rl.y', 'ry.y'],
    spec: {
      blocks: [{ id: 'k', type: 'Constant', params: { value: 0.7 } }, { id: 'sat', type: 'SATURATION', params: { lowerLimit: -0.5, upperLimit: 0.5 } }, { id: 'dz', type: 'DEADZONE', params: { lowerLimit: -0.1, upperLimit: 0.1 } }, { id: 'rl', type: 'RATE_LIMITER', params: { sampleTime: 0.1 } }, { id: 'ry', type: 'RELAY' }],
      wires: ['k.out -> sat.u', 'sat.y -> dz.u', 'dz.y -> rl.u', 'rl.y -> ry.u'],
    },
  },
};
const MODEL_NAMES = Object.keys(MODELS);
const COMPILERS = ['gcc', 'clang'] as const;
const OPTS = ['-O0', '-O2'] as const;
const SANITIZE_FLAGS = ['-std=c99', '-O1', '-g', '-fsanitize=undefined,address', '-fno-sanitize-recover=all'];

interface BuiltModel { ir: NonNullable<ReturnType<typeof buildParityIr>['ir']>; sources: ReturnType<typeof generateParitySources>; harness: string; interpreter: PerTick }
const built = new Map<string, BuiltModel>();
const SANITIZER_SCOPE: Record<string, string> = {};
const compiled = new Map<string, Awaited<ReturnType<typeof compileAndRunParity>>>();

/** Compile-matrix pins: first compiler diagnostic of each failing flag/model pair. */
const MATRIX_PINS: Record<string, string> = {
};
/** Interpreter-vs-C pins on the matrix models (the integrator loop uses Sum signs +-). */
const MATRIX_INTERP_PINS: Record<string, string> = {};

describe('V7 compile matrix, sanitizers, O0 = O2 and static properties on six representative models', () => {
  beforeAll(async () => {
    for (const name of MODEL_NAMES) {
      const m = MODELS[name];
      const b = buildParityIr(m.spec, { solver: m.solver, dt: DT, probes: m.probes, portDimensions: m.dims });
      if (!b.ok || !b.ir) throw new Error(`model ${name} did not build: ${JSON.stringify(b.diagnostics)}`);
      const sources = generateParitySources(b.ir);
      built.set(name, { ir: b.ir, sources, harness: renderParityHarness(b.ir, sources, STEPS, m.probes), interpreter: interpretIr(b.ir, STEPS, m.probes).signals });
    }
    const jobs: { key: string; name: string; compiler: string; flags: string[] }[] = [];
    for (const name of MODEL_NAMES) {
      for (const compiler of COMPILERS) {
        for (const opt of OPTS) {
          jobs.push({ key: `${name}|${compiler}|${opt}|strict`, name, compiler, flags: [...STRICT_PARITY_FLAGS, opt] });
          jobs.push({ key: `${name}|${compiler}|${opt}|plain`, name, compiler, flags: ['-std=c99', '-Wvla', '-Werror', opt] });
        }
        jobs.push({ key: `${name}|${compiler}|sanitize`, name, compiler, flags: SANITIZE_FLAGS });
      }
    }
    const outs = await mapPool(jobs, 4, async (j) => {
      const b = built.get(j.name)!;
      const first = await compileAndRunParity(b.sources, b.harness, { compiler: j.compiler, flags: j.flags });
      // clang without the asan runtime library installed (libclang_rt.asan): fall back to UBSan only and say so in the report.
      if (j.key.endsWith('|sanitize') && !first.ok && first.stage === 'compile' && /libclang_rt|cannot find .*asan/.test(first.log)) {
        SANITIZER_SCOPE[j.compiler] = 'undefined with -fsanitize-trap=undefined (the sanitizer runtime libraries of this clang are not installed, so address is not available)';
        return compileAndRunParity(b.sources, b.harness, { compiler: j.compiler, flags: ['-std=c99', '-O1', '-g', '-fsanitize=undefined', '-fsanitize-trap=undefined', '-fno-sanitize-recover=all'] });
      }
      return first;
    });
    jobs.forEach((j, i) => compiled.set(j.key, outs[i]));
    REPORT.sanitizerScope = SANITIZER_SCOPE;
  }, 600_000);

  for (const name of MODEL_NAMES) {
    for (const compiler of COMPILERS) {
      for (const opt of OPTS) {
        const key = `${name}|${compiler}|${opt}|strict`;
        const title = `${name}: ${compiler} ${opt} -std=c99 -Wall -Wextra -Werror -pedantic -Wconversion -Wdouble-promotion -Wshadow compiles with zero diagnostics`;
        const body = () => {
          const o = compiled.get(key)!;
          if (!o.ok || o.log !== '') expect.fail(`${o.stage} failed, first diagnostic: ${firstError(o.log)}`);
        };
        const pin = MATRIX_PINS[`${name}|${compiler}|${opt}`];
        if (pin) it.fails(pinTitle(pin, title), body); else it(title, body);
      }
      it(`${name}: ${compiler} -fsanitize=undefined,address -fno-sanitize-recover=all runs ${STEPS} ticks clean`, () => {
        const o = compiled.get(`${name}|${compiler}|sanitize`)!;
        if (!o.ok || o.log !== '') expect.fail(`${o.stage} failed (exit ${o.exitCode}): ${o.log.slice(0, 400)}`);
      });
      it(`${name}: ${compiler} -O0 and -O2 outputs equal (<= 1 ULP float64)`, () => {
        const b = built.get(name)!;
        const o0 = compiled.get(`${name}|${compiler}|-O0|plain`)!;
        const o2 = compiled.get(`${name}|${compiler}|-O2|plain`)!;
        if (!o0.ok || !o2.ok) expect.fail(`plain compile/run failed: ${firstError(o0.log || o2.log)}`);
        const c0 = parseParityOutput(b.ir, b.sources, MODELS[name].probes, o0.stdout);
        const c2 = parseParityOutput(b.ir, b.sources, MODELS[name].probes, o2.stdout);
        const d = compareTraces(`${name} ${compiler} O0 vs O2`, c0, c2, MODELS[name].probes, 1);
        if (d.detail) expect.fail(d.detail);
      });
      {
        const title = `${name}: ${compiler} -O2 output equals the interpreter (<= 1 ULP, libm <= 4 ULP)`;
        const body = () => {
          const b = built.get(name)!;
          const o2 = compiled.get(`${name}|${compiler}|-O2|plain`)!;
          if (!o2.ok) expect.fail(`plain compile/run failed: ${firstError(o2.log)}`);
          const c2 = parseParityOutput(b.ir, b.sources, MODELS[name].probes, o2.stdout);
          const libm = b.sources.files.some((f) => f.name.endsWith('.c') && LIBM_CALL.test(f.content));
          const di = compareTraces(`${name} ${compiler} O2 vs interpreter`, b.interpreter, c2, MODELS[name].probes, libm ? 4 : 1);
          if (di.detail) expect.fail(di.detail);
        };
        const pin = MATRIX_INTERP_PINS[name];
        if (pin) it.fails(pinTitle(pin, title), body); else it(title, body);
      }
    }
  }

  for (const name of MODEL_NAMES) {
    describe(`static properties: ${name}`, () => {
      const files = () => built.get(name)!.sources.files;
      it('no malloc/calloc/realloc/free/alloca', () => {
        const hits = files().flatMap((f) => [...stripC(f.content).matchAll(/\b(malloc|calloc|realloc|free|alloca)\s*\(/g)].map((m) => `${f.name}: ${m[1]}`));
        expect(hits).toEqual([]);
      });
      it('no variable-length arrays (gcc and clang -Wvla -Werror compile)', () => {
        for (const compiler of COMPILERS) {
          const o = compiled.get(`${name}|${compiler}|-O0|plain`)!;
          if (!o.ok) expect.fail(`${compiler} -Wvla -Werror: ${firstError(o.log)}`);
        }
      });
      it('no recursion (call-graph scan over every generated .c file)', () => {
        const cycles = findRecursion(files().filter((f) => f.name.endsWith('.c')).map((f) => f.content).join('\n'));
        expect(cycles).toEqual([]);
      });
      it('generating twice gives byte-identical files (same IR, and a freshly built IR)', () => {
        const b = built.get(name)!;
        const again = generateParitySources(b.ir);
        expect(again.files.map((f) => f.name)).toEqual(b.sources.files.map((f) => f.name));
        again.files.forEach((f, i) => expect(f.content).toBe(b.sources.files[i].content));
        const m = MODELS[name];
        const fresh = buildParityIr(m.spec, { solver: m.solver, dt: DT, probes: m.probes, portDimensions: m.dims });
        const third = generateParitySources(fresh.ir!);
        third.files.forEach((f, i) => expect(f.content).toBe(b.sources.files[i].content));
      });
    });
  }
  it('the call-graph scan detects a recursive function (scanner self-check)', () => {
    expect(findRecursion('static int f(int x)\n{\n    return g(x);\n}\nstatic int g(int x)\n{\n    return f(x);\n}\nstatic int h(void)\n{\n    return 1;\n}')).toEqual(['f -> g -> f']);
    expect(findRecursion('static int h(int x)\n{\n    return h(x);\n}')).toEqual(['h -> h']);
    expect(findRecursion('static int a(void)\n{\n    return b();\n}\nstatic int b(void)\n{\n    return 1;\n}')).toEqual([]);
  });
});

/** Remove comments, string/char literals and preprocessor lines. */
function stripC(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])'/g, "''")
    .replace(/^[ \t]*#[^\n]*(?:\\\n[^\n]*)*/gm, ' ');
}

/** Function definitions (name -> body) by brace matching at depth 0, and the cycles of their call graph. */
function findRecursion(source: string): string[] {
  const src = stripC(source);
  const bodies = new Map<string, string>();
  let depth = 0;
  let header = '';
  let bodyStart = -1;
  let name = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      if (depth === 0) {
        const m = /([A-Za-z_]\w*)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*$/.exec(header);
        name = m && !/\b(typedef|struct|enum|union)\b/.test(header) && !header.includes('=') ? m[1] : '';
        bodyStart = i;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        if (name !== '') bodies.set(name, src.slice(bodyStart, i + 1));
        header = '';
        name = '';
      }
    } else if (depth === 0) {
      if (ch === ';') header = ''; else header += ch;
    }
  }
  const names = [...bodies.keys()];
  const calls = new Map<string, string[]>();
  for (const [fn, body] of bodies) calls.set(fn, names.filter((n) => new RegExp(`\\b${n}\\s*\\(`).test(body)));
  const cycles: string[] = [];
  const visit = (fn: string, path: string[]) => {
    const at = path.indexOf(fn);
    if (at >= 0) { cycles.push([...path.slice(at), fn].join(' -> ')); return; }
    if (path.length > names.length) return;
    for (const callee of calls.get(fn) ?? []) visit(callee, [...path, fn]);
  };
  const seen = new Set<string>();
  for (const fn of names) {
    const before = cycles.length;
    visit(fn, []);
    for (const c of cycles.slice(before)) {
      const key = [...new Set(c.split(' -> '))].sort().join(',');
      if (seen.has(key)) cycles.splice(cycles.indexOf(c), 1); else seen.add(key);
    }
  }
  return cycles;
}

const allHeaders = (src: { files: { name: string; content: string }[] }) => src.files.filter((f) => f.name.endsWith('.h')).map((f) => f.content).join('\n');

// ================================================================== 6. limits on both sides (F10)
const REFUSED = (spec: ModelSpec, o: { solver?: EmbeddedSolver; dims?: Record<string, number[]> } = {}) =>
  buildParityIr(spec, { solver: o.solver ?? 'euler', dt: DT, probes: [], portDimensions: o.dims });
const codesOf = (b: ReturnType<typeof buildParityIr>) => [...new Set(b.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code))];

const vectorAdd = (n: number): { spec: ModelSpec; dims: Record<string, number[]> } => ({
  spec: { blocks: [{ id: 'k', type: 'Constant', params: { value: Array.from({ length: n }, (_, i) => i * 0.25 - 1) } }, { id: 'b', type: 'VectorAdd' }], wires: ['k.out -> b.in1', 'k.out -> b.in2'] },
  dims: { 'k.out': [n], 'b.in1': [n], 'b.in2': [n], 'b.out': [n] },
});
const matrixT = (n: number): { spec: ModelSpec; dims: Record<string, number[]> } => ({
  spec: { blocks: [{ id: 'k', type: 'Constant', params: { value: Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => r * 0.5 - c * 0.25 + 1)) } }, { id: 'b', type: 'Transpose' }], wires: ['k.out -> b.in'] },
  dims: { 'k.out': [n, n], 'b.in': [n, n], 'b.out': [n, n] },
});
const solveSpec = (n: number, bound: unknown): { spec: ModelSpec; dims: Record<string, number[]> } => ({
  spec: {
    blocks: [
      { id: 'A', type: 'Constant', params: { value: Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (r === c ? 4 : 0.5))) } },
      { id: 'v', type: 'Constant', params: { value: Array.from({ length: n }, (_, i) => i + 1) } },
      { id: 'b', type: 'MatrixSolve', params: { maxDimension: bound } },
    ],
    wires: ['A.out -> b.in1', 'v.out -> b.in2'],
  },
  dims: { 'A.out': [n, n], 'b.in1': [n, n], 'v.out': [n], 'b.in2': [n], 'b.out': [n] },
});

describe('V7 limits on both sides (F10): exact diagnostic code, never truncated', () => {
  it('vector length 16 is accepted and generated with a [16] field and equal values', async () => {
    const { spec, dims } = vectorAdd(16);
    const r = await runCParity(spec, { solver: 'euler', dt: DT, steps: 4, probes: ['b.out'], portDimensions: dims });
    expect(r.build.ok).toBe(true);
    expect(allHeaders(r.sources!)).toMatch(/\bdouble b_out\[16\];/);
    expect(r.outcome?.ok).toBe(true);
    expect(compareTraces('vector16', r.interpreter, r.c, ['b.out'], 1).detail).toBeUndefined();
    expect(r.c['b.out'][0]).toHaveLength(16);
  });
  it('vector length 17 is refused with XB_TARGET_CAPABILITY_MISSING and no code', () => {
    const { spec, dims } = vectorAdd(17);
    const b = REFUSED(spec, { dims });
    expect(b.ok).toBe(false);
    expect(b.ir).toBeUndefined();
    expect(codesOf(b)).toEqual(['XB_TARGET_CAPABILITY_MISSING']);
  });
  it('matrix dimension 8 is accepted and generated with an [8][8] field and equal values', async () => {
    const { spec, dims } = matrixT(8);
    const r = await runCParity(spec, { solver: 'euler', dt: DT, steps: 4, probes: ['b.out'], portDimensions: dims });
    expect(r.build.ok).toBe(true);
    expect(allHeaders(r.sources!)).toMatch(/\bdouble b_out\[8\]\[8\];/);
    expect(r.outcome?.ok).toBe(true);
    expect(compareTraces('matrix8', r.interpreter, r.c, ['b.out'], 1).detail).toBeUndefined();
    expect(r.c['b.out'][0]).toHaveLength(64);
  });
  it('matrix dimension 9 is refused with XB_TARGET_CAPABILITY_MISSING and no code', () => {
    const { spec, dims } = matrixT(9);
    const b = REFUSED(spec, { dims });
    expect(b.ok).toBe(false);
    expect(b.ir).toBeUndefined();
    expect(codesOf(b)).toEqual(['XB_TARGET_CAPABILITY_MISSING']);
  });
  for (const bound of [1, 4, 8]) {
    it(`MatrixSolve maxDimension ${bound} is accepted (${bound}x${bound} system) and generated`, async () => {
      const { spec, dims } = solveSpec(bound, bound);
      const r = await runCParity(spec, { solver: 'euler', dt: DT, steps: 3, probes: ['b.out'], portDimensions: dims });
      expect(r.build.ok).toBe(true);
      expect(r.outcome?.ok).toBe(true);
      expect(compareTraces(`solve${bound}`, r.interpreter, r.c, ['b.out'], 4).detail).toBeUndefined();
      expect(r.sources!.files.find((f) => f.name === 'sm_core.c')!.content).toContain('#define SM_XB_MAX_SOLVE_DIMENSION 8U');
    });
  }
  for (const bound of [0, 9, -1, 2.5, 'x']) {
    it(`MatrixSolve maxDimension ${String(bound)} is refused with XB_MATRIX_SOLVE_BOUND_INVALID`, () => {
      const { spec, dims } = solveSpec(2, bound);
      const b = REFUSED(spec, { dims });
      expect(b.ok).toBe(false);
      expect(b.ir).toBeUndefined();
      expect(codesOf(b)).toContain('XB_MATRIX_SOLVE_BOUND_INVALID');
    });
  }
  it('continuous STATE_SPACE is refused with XB_DISCRETE_REPRESENTATION_REQUIRED (euler and rk4)', () => {
    for (const solver of ['euler', 'rk4'] as const) {
      const b = REFUSED({ blocks: [{ id: 'k', type: 'Constant', params: { value: 0.7 } }, { id: 'b', type: 'STATE_SPACE' }], wires: ['k.out -> b.u'] }, { solver });
      expect(b.ok).toBe(false);
      expect(b.ir).toBeUndefined();
      expect(codesOf(b)).toContain('XB_DISCRETE_REPRESENTATION_REQUIRED');
    }
  });
  it('a variable-step solver is refused with XB_SAMPLE_TIME_INVALID', () => {
    for (const kind of ['ode45', 'ode23', 'ode15s'] as const) {
      const b = REFUSED({ blocks: [{ id: 'k', type: 'Constant', params: { value: 0.7 } }, { id: 'g', type: 'GAIN' }], wires: ['k.out -> g.u'] }, { solver: kind as unknown as EmbeddedSolver });
      expect(b.ok).toBe(false);
      expect(b.ir).toBeUndefined();
      expect(codesOf(b)).toContain('XB_SAMPLE_TIME_INVALID');
    }
  });
  it('an algebraic loop is refused with XB_ALGEBRAIC_LOOP_UNSUPPORTED', () => {
    const b = REFUSED({
      blocks: [{ id: 'k', type: 'Constant', params: { value: 1 } }, { id: 's', type: 'Sum' }, { id: 'g', type: 'GAIN', params: { gain: 0.5 } }],
      wires: ['k.out -> s.in1', 's.out -> g.u', 'g.y -> s.in2'],
    });
    expect(b.ok).toBe(false);
    expect(b.ir).toBeUndefined();
    expect(codesOf(b)).toContain('XB_ALGEBRAIC_LOOP_UNSUPPORTED');
  });
  it('the same loop broken by a UNIT_DELAY is accepted', () => {
    const b = REFUSED({
      blocks: [{ id: 'k', type: 'Constant', params: { value: 1 } }, { id: 's', type: 'Sum' }, { id: 'g', type: 'GAIN', params: { gain: 0.5 } }, { id: 'z', type: 'UNIT_DELAY', params: { sampleTime: 0.05 } }],
      wires: ['k.out -> s.in1', 's.out -> g.u', 'g.y -> z.u', 'z.y -> s.in2'],
    });
    expect(codesOf(b)).toEqual([]);
    expect(b.ok).toBe(true);
  });
  it('continuous states with the discrete solver are refused with XB_DISCRETE_SOLVER_CONTINUOUS_STATE', () => {
    const b = REFUSED({ blocks: [{ id: 'k', type: 'Constant', params: { value: 1 } }, { id: 'b', type: 'Integrator' }], wires: ['k.out -> b.in'] }, { solver: 'discrete' });
    expect(b.ok).toBe(false);
    expect(b.ir).toBeUndefined();
    expect(codesOf(b)).toContain('XB_DISCRETE_SOLVER_CONTINUOUS_STATE');
  });
  it('PID_BASIC without a positive sample time is refused with XB_DISCRETE_SAMPLE_TIME_REQUIRED', () => {
    for (const sampleTime of [-1, 0, 'x']) {
      const b = REFUSED({
        blocks: [{ id: 'e', type: 'Constant', params: { value: 0.7 } }, { id: 'en', type: 'Constant', params: { value: 1 } }, { id: 'rs', type: 'Constant', params: { value: 0 } }, { id: 'b', type: 'PID_BASIC', params: { sampleTime } }],
        wires: ['e.out -> b.e', 'en.out -> b.enable', 'rs.out -> b.reset'],
      }, { solver: 'discrete' });
      expect(b.ok).toBe(false);
      expect(b.ir).toBeUndefined();
      expect(codesOf(b)).toContain('XB_DISCRETE_SAMPLE_TIME_REQUIRED');
    }
  });
  it('float64 is refused on the production state-machine profile with XB_TARGET_CAPABILITY_MISSING (embedded host target accepts it)', () => {
    const spec: ModelSpec = { blocks: [{ id: 'k', type: 'Constant', params: { value: 0.7 } }, { id: 'g', type: 'GAIN' }], wires: ['k.out -> g.u'] };
    const sm = hybridXBridgesFixture();
    sm.states.find((st) => st.id === 'controller')!.xBridgesModel = toEmbeddedModelForSm(spec);
    const built = buildSemanticModel(sm);
    expect(built.ir).toBeUndefined();
    expect([...new Set(built.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code))]).toEqual(['XB_TARGET_CAPABILITY_MISSING']);
    expect(REFUSED(spec).ok).toBe(true);
  });
});

afterAll(() => {
  if (process.env.XBCP_REPORT) writeFileSync(process.env.XBCP_REPORT, JSON.stringify(REPORT, null, 1));
});
