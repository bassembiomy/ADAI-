/**
 * WP-03b — universal corner-case battery, part B (plan section 4.1): U6 shapes, U8 enums, U12 reset, U13 long runs,
 * U15 dynamic ports and U16 names, run on every block of BLOCK_LIBRARY (same type list as xbUniversal.test.ts).
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md.
 *
 * Verification only: a failed check is pinned as a ratchet list in tests/fixtures/xbridges/universal-gaps-b.json under a
 * provisional finding id (XBV-3xx, one per root cause; PIN_CAUSE below). A new failure fails the test, and a fixed block
 * must be removed from its list. Print the actual lists (triage only, never to update the fixture blindly):
 *   XBV_PRINT=<file> npx vitest run src/engine/xbridges/verification/xbUniversalB.test.ts
 *
 * Oracles (never the code under test): U6 the declared shape contract (xbCapabilities shapes, element-wise broadcast of
 * the T10 vector blocks); U8 the declared option lists (parameterSchema, powertrain specs) and the documented
 * "unknown option is a parameter error" rule; U12 a pristine instance run before any other run; U13 the integer tick
 * k*h (the hit schedule is n*Ts, a hit happens on tick k = n*Ts/h) and closed forms; U15 the documented port rules
 * (MUX concatenates, DEMUX splits in near-equal chunks, SWITCH_CASE y = in_k with k = floor(sel), Sum adds with the list
 * of signs); U16 the C99 identifier grammar and the C keyword list.
 */
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import type { XBlock } from '../types';
import { buildModel, mulberry32, runModel } from '../testkit';
import { generateParitySources, PARITY_STATE_ID } from '../testkit/cParity';
import { EMBEDDED_TARGET, toEmbeddedModel } from '../testkit/embedded';
import { buildSemanticModel } from '../../../utils/stateMachine/smSemanticBuilder';
import { hybridXBridgesFixture } from '../../../utils/stateMachine/smFixtures';
import { buildXBSemanticModel } from '../../../utils/stateMachine/xbSemanticBuilder';
import { validateXBModel } from '../../../utils/stateMachine/xbSemanticValidator';
import type { XBPersistedModelV1 } from '../../../utils/stateMachine/xbModel';
import { XB_PARAMETER_SCHEMA } from '../parameterSchema';
import { POWERTRAIN_SPECS } from '../powertrain';
import { liveStep, liveStepAt } from '../liveStep';
import { handleXbridgesWorkerMessage } from '../xbridgesWorker';
import { buildCanvasRunModel } from '../../../components/xbridges/canvasRunModel';
import { getXBBlockCapability } from '../../../utils/stateMachine/xbCapabilities';

const TYPES = Object.keys(BLOCK_LIBRARY).sort();
const make = (type: string, params: Record<string, unknown> = {}): XBlock => BLOCK_LIBRARY[type]('u', params);

/** Provisional finding ids of this batch: one root cause each (the planner renumbers when it records them). */
export const PIN_CAUSE: Record<string, string> = {
  'XBV-300': 'S2 U6: 44 blocks (field-oriented control, Park/Clarke, fuzzy MFs, robot vacuum, DEM, adaptive filters) coerce a vector, matrix or ragged input with Number() and emit a silent NaN, no dimension diagnostic; BlockDefinitions.ts per-block execute',
  'XBV-301': 'S3 U6: Mean (declared vector/matrix input) turns the empty vector [] into a silent NaN (0/0) instead of a block error; BlockDefinitions.ts Mean',
  'XBV-302': 'S3 U6: Determinant (non-square input) and Transpose (ragged input) throw instead of reporting a dimension error; BlockDefinitions.ts / VectorUtils.ts',
  'XBV-303': 'S3 U8: schema declares representation continuous|discrete for TRANSFER_FUNCTION, ZERO_POLE_GAIN, LAPLACE_TRANSFORM and DISCRETE_TRANSFER_FUNCTION but the factory hard-codes the domain and silently replaces the other value; BlockDefinitions.ts factories',
  'XBV-304': 'S3 U8: output_type float16 and float64 of DATA_TYPE_CONVERSION and NUMERIC_REPRESENTATION are declared options but fault at run unless the hidden params supportsFloat16/supportsFloat64 are true; BlockDefinitions.ts',
  'XBV-305': 'S3 U8: FLUX_REFERENCE.mode = field_weakening is declared but identical to constant (code comment: not implemented); BlockDefinitions.ts FLUX_REFERENCE',
  'XBV-306': 'S3 U8: MatrixDiag.diagMode (create | extract) is ignored, the block decides from the input shape (VectorUtils.diag); BlockDefinitions.ts MatrixDiag',
  'XBV-307': 'S2 U13: sample hits are scheduled by accumulating nextTick + Ts, so after about 5e5 ticks of h = 0.01 s the rounding error exceeds the 1e-9 tolerance and a hit moves one tick late (integer tick n*Ts expected); XbridgesEngine.ts updateDiscreteStates',
  'XBV-308': 'S4 U16: generated C member names are not shortened or hashed, so ids that differ only after the 63rd character give names equal in the first 63 (C99 5.2.4.1); smCIdentifierPolicy is not applied to members; xbCGenerator.ts',
};

const PINNED = JSON.parse(readFileSync(join(__dirname, '../../../../tests/fixtures/xbridges/universal-gaps-b.json'), 'utf8')) as Record<string, string[]>;
const pin = (key: string, actual: string[]) => {
  const sorted = [...new Set(actual)].sort();
  if (process.env.XBV_PRINT) appendFileSync(process.env.XBV_PRINT, `${JSON.stringify({ [key]: sorted })}\n`);
  if (process.env.XBV_PRINT_ONLY) return;
  expect(PINNED[key], `missing pinned list '${key}'`).toBeDefined();
  expect(sorted).toEqual(PINNED[key]);
};

const numbersIn = (v: unknown, out: number[] = []): number[] => {
  if (typeof v === 'number') out.push(v);
  else if (typeof v === 'boolean') out.push(v ? 1 : 0);
  else if (Array.isArray(v)) v.forEach((x) => numbersIn(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => numbersIn(x, out));
  return out;
};
const sameValue = (a: unknown, b: unknown): boolean => {
  if (typeof a === 'function' && typeof b === 'function') return true;
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)) || a === b;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).filter((k) => typeof (a as any)[k] !== 'function').sort();
    const kb = Object.keys(b).filter((k) => typeof (b as any)[k] !== 'function').sort();
    return sameValue(ka, kb) && ka.every((k) => sameValue((a as any)[k], (b as any)[k]));
  }
  return a === b;
};
interface Exec { threw: string | null; outputs: unknown[]; nextState: unknown; error?: string; diagnostic?: string }
const exec = (b: XBlock, inputs: unknown[], state: unknown, t: number): Exec => {
  try {
    const r = b.execute(inputs as never, b.params, state, t);
    return { threw: null, outputs: r?.outputs ?? [], nextState: r?.nextState === undefined ? state : r.nextState, error: r?.error, diagnostic: r?.diagnostic?.code };
  } catch (e) {
    return { threw: String((e as Error)?.message ?? e), outputs: [], nextState: state };
  }
};
const seeded = <T>(fn: () => T, seed = 12345): T => {
  const spy = vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
  try { return fn(); } finally { spy.mockRestore(); }
};
const isErrorDiag = (d: { severity: string; blockIds?: string[] }, id = 'u') => d.severity === 'error' && (d.blockIds === undefined || d.blockIds.length === 0 || d.blockIds.includes(id));

// ------------------------------------------------------------------------------------------------------------------
// U6 shapes
// ------------------------------------------------------------------------------------------------------------------
type ShapeClass = 'scalar' | 'vector' | 'matrix' | 'invalid';
const mat = (r: number, c: number) => Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => 0.5 + 0.1 * (i * c + j)));
const vec = (n: number) => Array.from({ length: n }, (_, i) => 0.5 + 0.1 * i);
const SHAPES: { name: string; value: unknown; cls: ShapeClass; dims: number[] }[] = [
  { name: 'scalar', value: 0.5, cls: 'scalar', dims: [] },
  ...[1, 2, 3, 16, 17].map((n) => ({ name: `vec${n}`, value: vec(n), cls: 'vector' as const, dims: [n] })),
  { name: 'mat1x1', value: mat(1, 1), cls: 'matrix', dims: [1, 1] },
  { name: 'mat1x3', value: mat(1, 3), cls: 'matrix', dims: [1, 3] },
  { name: 'mat3x1', value: mat(3, 1), cls: 'matrix', dims: [3, 1] },
  { name: 'mat8x8', value: mat(8, 8), cls: 'matrix', dims: [8, 8] },
  { name: 'mat9x9', value: mat(9, 9), cls: 'matrix', dims: [9, 9] },
  { name: 'empty', value: [], cls: 'invalid', dims: [] },
  { name: 'ragged', value: [[1, 2], [3]], cls: 'invalid', dims: [] },
];
const dimsOf = (v: unknown): number[] | null => {
  if (!Array.isArray(v)) return typeof v === 'number' ? [] : null;
  if (v.every((x) => typeof x === 'number')) return [v.length];
  if (v.every((x) => Array.isArray(x) && x.length === (v[0] as unknown[]).length && x.every((y: unknown) => typeof y === 'number'))) return [v.length, (v[0] as unknown[]).length];
  return null;
};
/** Element-wise blocks of the T10 conformance case: output dimensions equal the broadcast of the input dimensions. */
const ELEMENTWISE = TYPES.filter((t) => (getXBBlockCapability(t)?.interpreterConformanceCaseIds ?? []).includes('T10-INT-VECTOR-ELEMENTWISE'));
const acceptedBy = (type: string, shape: ShapeClass): boolean => {
  const cap = getXBBlockCapability(type);
  if (!cap) return false;
  return (cap.inputShapes ?? cap.shapes).includes(shape as 'scalar');
};

describe('U6: shapes fed to each input', () => {
  const failures: Record<'throw' | 'nan' | 'dims' | 'undef', string[]> = { throw: [], nan: [], dims: [], undef: [] };
  for (const type of TYPES) {
    const nIn = make(type).inputs.length;
    for (let port = 0; port < nIn; port++) {
      const base = (() => { const b = make(type); const r = exec(b, b.inputs.map(() => 0.5), b.state, 0); return r.threw === null && !r.error && !r.diagnostic && numbersIn(r.outputs).every((x) => !Number.isNaN(x)); })();
      for (const s of SHAPES) {
        const key = `${type}.${make(type).inputs[port].id}:${s.name}`;
        const b = make(type);
        const r = exec(b, b.inputs.map((_, i) => (i === port ? s.value : 0.5)), b.state, 0);
        if (r.threw !== null) { failures.throw.push(key); continue; }
        const reported = !!r.error || !!r.diagnostic;
        if (base && !reported && numbersIn(r.outputs).some(Number.isNaN)) failures.nan.push(key);
        if (!reported && r.outputs.some((o) => o === undefined)) failures.undef.push(key);
        if (!reported && s.cls !== 'invalid' && ELEMENTWISE.includes(type) && acceptedBy(type, s.cls)) {
          const d = dimsOf(r.outputs[0]);
          if (d === null || JSON.stringify(d) !== JSON.stringify(s.dims)) failures.dims.push(key);
        }
      }
    }
  }
  it('no exception from execute for any shape', () => pin('XBV-302', failures.throw), 120_000);
  // Mean declares vector and matrix input: its failure (the empty vector) is a different cause from the Number() coercion of the others.
  it('no block turns a vector, matrix or ragged input into a silent NaN (the block reports a dimension error instead)', () => pin('XBV-300', failures.nan.filter((k) => !k.startsWith('Mean.'))));
  it('a block with declared vector input does not turn the empty vector into a silent NaN', () => pin('XBV-301', failures.nan.filter((k) => k.startsWith('Mean.'))));
  it('no undefined output for any shape', () => pin('U6 undef', failures.undef));
  it('element-wise blocks broadcast to the input dimensions', () => pin('U6 dims', failures.dims));
});

// ------------------------------------------------------------------------------------------------------------------
// U8 enums
// ------------------------------------------------------------------------------------------------------------------
interface EnumParam { type: string; param: string; options: string[] }
const ENUMS: EnumParam[] = [];
for (const [type, params] of Object.entries(XB_PARAMETER_SCHEMA)) {
  if (!BLOCK_LIBRARY[type]) continue;
  for (const [param, kind] of Object.entries(params)) if (kind.kind === 'option') ENUMS.push({ type, param, options: [...kind.options] });
}
for (const spec of POWERTRAIN_SPECS) {
  if (!BLOCK_LIBRARY[spec.type]) continue;
  for (const p of spec.params) if (p.kind === 'enum' && p.options) ENUMS.push({ type: spec.type, param: p.name, options: [...p.options] });
}
/** Companion parameters that make an option observable in a lone block (for example a rounding mode needs an integer type). */
const CONTEXT: Record<string, Record<string, unknown>> = {
  'DATA_TYPE_CONVERSION.rounding': { output_type: 'int8' },
  'DATA_TYPE_CONVERSION.overflow': { output_type: 'int8' },
  'Constant.output_type': { value: 2.6 },
  'PID_BASIC.mode': { Kd: 0.5 }, 'PID_BASIC.method': { sampleTime: 0.01 }, 'PID_CONTROLLER.method': { sampleTime: 0.01 },
  'PT_DOE_SWEEPER.ccdAlpha': { designType: 'Central Composite' },
};
/** Options that act only outside a lone block's execute: not observable here, with the reason. */
const NOT_OBSERVABLE: Record<string, string> = {
  'LAPLACE_TRANSFORM.mappingType': 'acts only through the DOE_MODEL link read by the engine constructor',
  'Scope.timeRange': 'display window of the viewer, execute has no output',
  'PT_DOE_SWEEPER.objective': 'ranks the rows of the Responses bus; a lone block has no Responses input',
};
/** Companion parameters that depend on the option value (a numeric type needs the matching mode). */
const ctxOf = (key: string, v: string): Record<string, unknown> => (key === 'NUMERIC_REPRESENTATION.output_type'
  ? { mode: /^(float|boolean)/.test(v) ? 'floating_point' : 'fixed_point' } : CONTEXT[key] ?? {});
/** Documented, intentional refusals: the data is not shipped (rule: no third-party data in the repository). */
const isNotShipped = (message: string) => message.includes('is not shipped');
// A lone block has no sources: the step is 1 ms so that a default sample time of 1 ms is an integer multiple.
const oneStep = (type: string, params: Record<string, unknown>) => {
  try {
    const r = runModel(buildModel({ blocks: [{ id: 'u', type, params }], wires: [] }), { solver: 'rk4', dt: 0.001, stopTime: 0.002, probes: [] });
    return { errors: r.diagnostics.filter((d) => isErrorDiag(d)).filter((d) => !isNotShipped(d.message)), threw: null as string | null };
  } catch (e) { return { errors: [], threw: String((e as Error).message) }; }
};
type Stim = (k: number, i: number) => unknown;
const baseStim = (k: number, i: number) => [-2.5, 0.1, 1.5, 2.5, 3.7, -0.75, 300, -300, 70000, 0.3][(k * 3 + i) % 10];
const STIMULI: Stim[] = [
  baseStim,
  (k) => 0.5 + 0.04 * k, // inside the domain of ASIN / ACOS
  (k) => 1.5 + 0.1 * k, // inside the domain of ASEC / ACOSEC
  (k, i) => [baseStim(k, i), baseStim(k, i) + 1, baseStim(k, i) + 2],
  (k, i) => mat(3, 3).map((row) => row.map((x) => x + baseStim(k, i))),
];
const TIME_SCALES = [0.01, 7, 300];
const trace = (type: string, params: Record<string, unknown>, stim: Stim, dt: number) => seeded(() => {
  const b = make(type, params);
  let state = b.state;
  const outs: unknown[] = [];
  for (let k = 0; k < 14; k++) {
    const r = exec(b, b.inputs.map((_, i) => stim(k, i)), state, k * dt);
    if (r.threw || r.error || r.diagnostic) return null; // inconclusive context: the block refused the stimulus
    outs.push(r.outputs);
    state = r.nextState;
  }
  return JSON.stringify(outs, (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x));
});
/** Engine context for blocks with continuous or hybrid states: every input fed by a constant 0.7, 2 s of rk4. */
const engineTrace = (type: string, params: Record<string, unknown>): string | null => seeded(() => {
  try {
    const ins = make(type, params).inputs;
    const blocks = [{ id: 'u', type, params }, ...ins.map((_, i) => ({ id: `k${i}`, type: 'Constant', params: { value: 0.7 } }))];
    const probes = make(type, params).outputs.map((p) => `u.${p.id}`);
    const r = runModel(buildModel({ blocks, wires: ins.map((p, i) => `k${i}.out -> u.${p.id}`) }), { solver: 'rk4', dt: 0.01, stopTime: 2, probes });
    if (r.diagnostics.some((d) => d.severity === 'error')) return null;
    return JSON.stringify(probes.map((p) => r.signals[p]), (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x));
  } catch { return null; }
});
const wrongCase = (v: string): string | null => (v.toUpperCase() !== v ? v.toUpperCase() : v.toLowerCase() !== v ? v.toLowerCase() : null);
/** The representation option of the transfer-function family is pinned as one cause through the factory check. */
const TF_FAMILY = new Set(['TRANSFER_FUNCTION', 'DISCRETE_TRANSFER_FUNCTION', 'ZERO_POLE_GAIN', 'LAPLACE_TRANSFORM']);

describe('U8: enumerated parameters', () => {
  const rejected: string[] = [];
  const replaced: string[] = [];
  const noEffect: string[] = [];
  const unknownOk: string[] = [];
  const wrongCaseOk: string[] = [];
  const undecided: string[] = [];
  for (const e of ENUMS) {
    const key = `${e.type}.${e.param}`;
    const ctx = ctxOf(key, e.options[0]);
    // A lone block that already reports an error with its default parameters cannot show an option error.
    const baselineFails = oneStep(e.type, { ...ctx }).errors.length > 0;
    for (const v of e.options) {
      const id = `${key}=${v}`;
      let kept: unknown;
      try { kept = make(e.type, { ...ctxOf(key, v), [e.param]: v }).params?.[e.param]; } catch { kept = 'threw'; }
      if (kept !== v) replaced.push(id);
      if (!baselineFails) {
        const r = oneStep(e.type, { ...ctxOf(key, v), [e.param]: v });
        if (r.threw !== null || r.errors.length > 0) rejected.push(id);
      }
    }
    // Behaviour: at least two values differ in some context (stimulus kind x time scale) in which no value is refused.
    if (e.options.length > 1 && !NOT_OBSERVABLE[key] && !(TF_FAMILY.has(e.type) && e.param === 'representation')) {
      let conclusive = false;
      let effect = false;
      const consider = (traces: (string | null)[]) => {
        // A refusal is an outcome too (overflow = 'error' refuses an out-of-range value); a context in which every value is
        // refused tells nothing.
        if (traces.every((t) => t === null)) return;
        conclusive = true;
        if (new Set(traces).size > 1) effect = true;
      };
      for (const stim of STIMULI) for (const dt of TIME_SCALES) consider(e.options.map((v) => trace(e.type, { ...ctxOf(key, v), [e.param]: v }, stim, dt)));
      consider(e.options.map((v) => engineTrace(e.type, { ...ctxOf(key, v), [e.param]: v })));
      if (conclusive && !effect) noEffect.push(key);
      if (!conclusive) undecided.push(key);
    }
    const mentions = (m: string, bad: string) => m.includes(bad) || m.includes(e.param);
    if (!baselineFails) {
      const bad = oneStep(e.type, { ...ctx, [e.param]: 'zz_unknown' });
      if (bad.threw !== null || !bad.errors.some((d) => mentions(d.message, 'zz_unknown'))) unknownOk.push(key);
      for (const v of e.options) {
        const w = wrongCase(v);
        if (w === null || e.options.includes(w)) continue;
        const r = oneStep(e.type, { ...ctx, [e.param]: w });
        if (r.threw !== null || !r.errors.some((d) => mentions(d.message, w))) wrongCaseOk.push(`${key}=${w}`);
      }
    }
  }
  it('there are enumerated parameters to check', () => {
    expect(ENUMS.length).toBeGreaterThan(40);
    if (process.env.XBV_PRINT) appendFileSync(process.env.XBV_PRINT, `${JSON.stringify({ 'U8 undecided (no conclusive context)': undecided.sort() })}\n`);
  });
  it('every declared value runs without an error', () => pin('XBV-304', rejected));
  it('the factory keeps every declared value', () => pin('XBV-303', replaced));
  it('at least two declared values of a parameter change the behaviour', () => {
    pin('XBV-305', noEffect.filter((k) => k.startsWith('FLUX_REFERENCE')));
    pin('XBV-306', noEffect.filter((k) => k.startsWith('MatrixDiag')));
    pin('U8 option has no effect (other blocks)', noEffect.filter((k) => !k.startsWith('FLUX_REFERENCE') && !k.startsWith('MatrixDiag')));
  });
  it('an unknown value gives an error diagnostic that names it', () => pin('U8 unknown value accepted', unknownOk));
  it('a wrong-case value gives an error diagnostic that names it', () => pin('U8 wrong case accepted', wrongCaseOk));
});

// ------------------------------------------------------------------------------------------------------------------
// U12 reset
// ------------------------------------------------------------------------------------------------------------------
describe('U12: after the reset path a run equals a pristine instance', () => {
  // The canvas path of a new run: worker 'reset' message, then the run model is rebuilt from the node data by
  // buildCanvasRunModel (fresh factory blocks) and compiled. The node data objects are reused by every run.
  const nodesFor = (type: string) => [{ id: 'u', type: 'xblock', position: { x: 0, y: 0 }, data: { id: 'u', type, params: { ...make(type).params } } }];
  const run = (nodes: ReturnType<typeof nodesFor>, stopTime: number) => {
    const model = buildCanvasRunModel(nodes as never, [] as never);
    const probes = (model.blocks[0] as XBlock).outputs.map((p) => `u.${p.id}`);
    return { probes, ...seeded(() => runModel(model as never, { solver: 'rk4', dt: 0.01, stopTime, probes })) };
  };
  it('outputs of the first 20 ticks equal the pristine run, and the node parameters are unchanged', () => {
    const offenders: string[] = [];
    const paramsChanged: string[] = [];
    let compared = 0;
    for (const type of TYPES) {
      try {
        const nodes = nodesFor(type);
        const pristineParams = JSON.stringify(nodes[0].data.params);
        const reference = run(nodes, 0.19); // before any other run in this process state for these nodes
        run(nodes, 2); // a longer run that dirties every state it can
        handleXbridgesWorkerMessage({ requestId: 1, type: 'reset' } as never);
        const again = run(nodes, 0.19);
        if (JSON.stringify(nodes[0].data.params) !== pristineParams) paramsChanged.push(type);
        const same = reference.probes.every((p) => sameValue(reference.signals[p], again.signals[p]));
        if (reference.probes.length > 0 && reference.probes.every((p) => reference.signals[p].length >= 15)) compared++;
        if (!same) offenders.push(type);
      } catch { offenders.push(type); }
    }
    expect(compared, 'the comparison must actually cover the blocks that have outputs').toBeGreaterThan(250);
    pin('U12 run after reset differs from pristine', offenders);
    pin('U12 run changes the node parameters', paramsChanged);
  }, 300_000);
});

// ------------------------------------------------------------------------------------------------------------------
// U13 long runs
// ------------------------------------------------------------------------------------------------------------------
/** Structural size of a state: number of values, array entries and object keys (independent of how many digits a number has). */
const sizeOf = (v: unknown): number => (Array.isArray(v) ? 1 + v.reduce((a: number, x) => a + sizeOf(x), 0)
  : v && typeof v === 'object' ? 1 + Object.values(v).reduce((a: number, x) => a + sizeOf(x), 0) : 1);

describe('U13: long runs, non-zero start time, t near 1e6 s', () => {
  // Representative set (runtime budget < 60 s): INTEGRATOR_DISCRETE and UNIT_DELAY (sample time 0.1 s, hits on n*Ts),
  // Integrator (continuous state), Clock and Step (time sources), PWM_GENERATOR (carrier phase), DELAY (history
  // buffer) and Scope (recording buffer). They cover the three mechanisms the engine has for time: sample-hit
  // scheduling (nextSampleTime), state integration and time-driven sources. Each engine step is one liveStep with euler.
  const H = 0.01;
  const spec = {
    blocks: [
      { id: 'one', type: 'Constant', params: { value: 1 } },
      { id: 'clk', type: 'Clock' },
      { id: 'dacc', type: 'INTEGRATOR_DISCRETE', params: { sample_time: 0.1 } },
      { id: 'ud', type: 'UNIT_DELAY', params: { sampleTime: 0.1 } },
      { id: 'int', type: 'Integrator' },
      { id: 'pwmduty', type: 'Constant', params: { value: 0.25 } },
      { id: 'pwm', type: 'PWM_GENERATOR', params: { frequency: 5 } },
      { id: 'dly', type: 'DELAY', params: { delay_length: 5 } },
      { id: 'scope', type: 'Scope', params: { bufferSize: 1000 } },
    ],
    wires: ['one.out -> dacc.u', 'clk.clk -> ud.u', 'one.out -> int.in', 'pwmduty.out -> pwm.duty', 'clk.clk -> dly.u', 'clk.clk -> scope.in1'],
  };
  const stepBlock = (startTime: number) => ({ id: 'st', type: 'Step', params: { stepTime: startTime + 5 * H, initialValue: 0, finalValue: 1 } });
  const runLong = (start: number, ticks: number) => {
    const model = buildModel({ blocks: [...spec.blocks, stepBlock(start)], wires: spec.wires });
    const engine = new XbridgesEngine(model);
    engine.options = { solver: 'euler', fixedStep: H, startTime: start, stopTime: 1e12 } as never;
    const diag = engine.compile(start);
    const bad: Record<string, string[]> = { hits: [], delay: [], clock: [], integrator: [], step: [], pwm: [], growth: [] };
    const sizes: Record<number, Record<string, number>> = {};
    const pwmHigh = new Map<number, number>();
    const marks = new Set([Math.floor(ticks / 100), Math.floor(ticks / 10), ticks - 1]);
    const reportOnce = (kind: string, k: number) => { if (bad[kind].length < 3) bad[kind].push(`tick ${k}`); };
    for (let k = 0; k < ticks; k++) {
      const plan = liveStepAt(start, 1e12, H, k)!;
      liveStep(engine, 'euler', plan.time, plan.stepNow);
      // The signals hold the outputs of tick k (evaluated at plan.time before the states advance).
      const sig = (b: string, p: string) => Number(engine.getSignalValue(b, p));
      // Oracle: hits at ticks 0, 10, 20, ... (n*Ts = 10 n h). Forward-Euler discrete integrator (Simulink): y(n) = y(n-1) + Ts*u(n-1)
      // at hit n with y(0) = IC, held between hits, so with u = 1 the output at tick k is Ts * floor(k / 10).
      if (Math.abs(sig('dacc', 'y') - 0.1 * Math.floor(k / 10)) > 0.05) reportOnce('hits', k);
      const nDelay = Math.floor(k / 10); // unit delay of the clock: holds the clock value of the previous hit
      if (Math.abs(sig('ud', 'y') - (nDelay === 0 ? 0 : start + 0.1 * (nDelay - 1))) > 0.05) reportOnce('delay', k);
      if (Math.abs(sig('clk', 'clk') - (start + k * H)) > 1e-6) reportOnce('clock', k);
      if (Math.abs(sig('int', 'y') - k * H) > 1e-6 + k * 1e-12 * 100) reportOnce('integrator', k);
      if (sig('st', 'out') !== (k >= 5 ? 1 : 0)) reportOnce('step', k);
      const period = Math.floor(k / 20);
      pwmHigh.set(period, (pwmHigh.get(period) ?? 0) + (sig('pwm', 'pwm') > 0.5 ? 1 : 0));
      if (marks.has(k)) {
        sizes[k] = {};
        for (const id of ['dly', 'scope', 'dacc', 'ud']) sizes[k][id] = sizeOf(engine.getBlock(id)?.state);
      }
    }
    // PWM: duty 0.25 over a period of 20 ticks (f = 5 Hz, h = 0.01 s) gives 5 high ticks, give or take one tick of phase.
    for (const [period, high] of pwmHigh) if (period < Math.floor(ticks / 20) - 1 && Math.abs(high - 5) > 1) { reportOnce('pwm', period * 20); }
    const ks = [...marks].sort((a, b) => a - b);
    for (const id of ['dly', 'scope', 'dacc', 'ud']) if (sizes[ks[2]][id] > 1.05 * sizes[ks[1]][id] + 8) bad.growth.push(`${id}: ${sizes[ks[1]][id]} -> ${sizes[ks[2]][id]}`);
    return { diag, bad };
  };
  it('start 0, 1e6 consecutive steps', () => {
    const { diag, bad } = runLong(0, 1e6);
    expect(diag.filter((d) => d.severity === 'error')).toEqual([]);
    pin('XBV-307', Object.entries(bad).filter(([, v]) => v.length > 0).map(([k, v]) => `${k}: ${v[0]}`));
  }, 120_000);
  it('start 1e6 s, 2e5 consecutive steps', () => {
    const { diag, bad } = runLong(1e6, 2e5);
    expect(diag.filter((d) => d.severity === 'error')).toEqual([]);
    pin('U13 start 1e6 clean', Object.entries(bad).filter(([, v]) => v.length > 0).map(([k, v]) => `${k}: ${v[0]}`));
  }, 120_000);
});

// ------------------------------------------------------------------------------------------------------------------
// U15 dynamic ports
// ------------------------------------------------------------------------------------------------------------------
describe('U15: blocks whose port count follows a parameter', () => {
  const DYNAMIC: { type: string; param: string }[] = [];
  for (const type of TYPES) {
    const b0 = make(type);
    for (const [p, v] of Object.entries(b0.params ?? {})) {
      if (typeof v !== 'number' || !Number.isInteger(v)) continue;
      try {
        const differs = [1, 2, 16].some((n) => { const b = make(type, { [p]: n }); return b.inputs.length !== b0.inputs.length || b.outputs.length !== b0.outputs.length; });
        if (differs) DYNAMIC.push({ type, param: p });
      } catch { /* the factory throwing is caught by the structural check below */ }
    }
  }
  const SIZES = [1, 2, 16];
  it('port ids are unique, stable between sizes, and execute returns one output per output port', () => {
    const offenders: string[] = [];
    for (const { type, param } of DYNAMIC) {
      let prevIn: string[] = [];
      let prevOut: string[] = [];
      for (const n of SIZES) {
        const id = `${type}.${param}=${n}`;
        try {
          const b = make(type, { [param]: n });
          const ins = b.inputs.map((p) => p.id);
          const outs = b.outputs.map((p) => p.id);
          if (new Set(ins).size !== ins.length || new Set(outs).size !== outs.length) offenders.push(`${id} duplicate port ids`);
          if (!prevIn.every((x) => ins.includes(x) || n < SIZES[SIZES.indexOf(n) - 1]) && n > 1) offenders.push(`${id} input ids not stable`);
          if (n > 2 && !prevOut.every((x) => outs.includes(x)) && outs.length >= prevOut.length) offenders.push(`${id} output ids not stable`);
          prevIn = ins; prevOut = outs;
          const r = exec(b, b.inputs.map(() => 0.5), b.state, 0);
          if (r.threw !== null) offenders.push(`${id} throws`);
          else if (!r.error && !r.diagnostic && r.outputs.length !== b.outputs.length) offenders.push(`${id} ${r.outputs.length} outputs for ${b.outputs.length} ports`);
        } catch { offenders.push(`${id} factory throws`); }
      }
    }
    pin('U15 port structure', offenders);
  });

  // Documented semantics (BlockDefinitions equation table): Sum adds with its list of signs, MUX concatenates, DEMUX splits
  // into near-equal chunks (first n mod q one longer), SWITCH_CASE y = in_k with k = floor(sel).
  it('Sum, MUX, DEMUX and SWITCH_CASE give the documented result for 1, 2 and 16 ports', () => {
    const offenders: string[] = [];
    for (const n of SIZES) {
      const signs = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? '+' : '-')).join('');
      const u = Array.from({ length: n }, (_, i) => 1 + i);
      const sumB = make('Sum', { numInputs: n, signs });
      const expectSum = u.reduce((a, x, i) => a + (signs[i] === '+' ? x : -x), 0);
      const r = exec(sumB, u, sumB.state, 0);
      if (sumB.inputs.length !== n || r.threw !== null || Math.abs(Number(r.outputs[0]) - expectSum) > 1e-12) offenders.push(`Sum n=${n}`);
      const mux = make('MUX', { numInputs: n });
      const rm = exec(mux, u, mux.state, 0);
      if (mux.inputs.length !== n || rm.threw !== null || JSON.stringify(rm.outputs[0]) !== JSON.stringify(n === 1 ? u : u)) offenders.push(`MUX n=${n}`);
      const demux = make('DEMUX', { numOutputs: n });
      const input = Array.from({ length: 16 }, (_, i) => i + 1);
      const rd = exec(demux, [input], demux.state, 0);
      const q = Math.floor(16 / n), rem = 16 % n;
      let at = 0;
      const chunks = Array.from({ length: n }, (_, i) => { const len = q + (i < rem ? 1 : 0); const c = input.slice(at, at + len); at += len; return c.length === 1 ? c[0] : c; });
      if (demux.outputs.length !== n || rd.threw !== null || JSON.stringify(rd.outputs) !== JSON.stringify(chunks)) offenders.push(`DEMUX n=${n}`);
      const sc = make('SWITCH_CASE', { numCases: n });
      for (let k = 1; k <= n; k++) {
        const ins = [k, ...Array.from({ length: n }, (_, i) => 10 * (i + 1))];
        const rs = exec(sc, ins, sc.state, 0);
        if (sc.inputs.length !== n + 1 || rs.threw !== null || Number(rs.outputs[0]) !== 10 * k) { offenders.push(`SWITCH_CASE n=${n} sel=${k}`); break; }
      }
    }
    pin('U15 documented semantics', offenders);
  });

  const sumModel = (n: number, signs: string, order: number[]) => {
    const blocks = [{ id: 's', type: 'Sum', params: { numInputs: n, signs } },
      ...Array.from({ length: Math.max(n, 3) }, (_, i) => ({ id: `c${i + 1}`, type: 'Constant', params: { value: 10 ** i } }))];
    return buildModel({ blocks, wires: order.map((src, i) => `c${src}.out -> s.in${i + 1}`) });
  };
  const outOf = (engine: XbridgesEngine) => { engine.computeOutputs(0); return Number(engine.getSignalValue('s', 'out')); };
  it('removing a connected port: the remaining ports keep their sign and value, or the model is refused', () => {
    const offenders: string[] = [];
    // Three connected inputs 1, 10, 100 with signs +-+ ; the canvas then lowers numInputs to 2 (live parameter edit).
    const engine = new XbridgesEngine(sumModel(3, '+-+', [1, 2, 3]));
    engine.options = { solver: 'euler', fixedStep: 0.01, startTime: 0, stopTime: 1 } as never;
    engine.compile(0);
    if (outOf(engine) !== 1 - 10 + 100) offenders.push('3-input sum wrong before the edit');
    try {
      engine.applyParameterUpdates('s', { numInputs: 2, signs: '+-' });
      const v = outOf(engine);
      if (v !== 1 - 10 && !engine.diagnostics.some((d) => d.severity === 'error')) offenders.push(`after removing in3: ${v}, expected ${1 - 10} or an error`);
    } catch { offenders.push('live edit throws'); }
    // A model whose connection targets a port the block no longer has must be refused or ignore it, never crash.
    try {
      const m = sumModel(2, '+-', [1, 2]);
      m.connections.push({ sourceBlock: 'c3', sourcePort: 'out', targetBlock: 's', targetPort: 'in3' });
      const e2 = new XbridgesEngine(m);
      e2.options = engine.options;
      const d = e2.compile(0);
      const refused = d.some((x) => x.severity === 'error' || x.code.includes('PORT') || x.code.includes('CONNECTION'));
      if (!refused) { const v = outOf(e2); if (v !== 1 - 10) offenders.push(`dangling connection changes the result: ${v}`); else offenders.push('dangling connection to a removed port gives no diagnostic'); }
    } catch { offenders.push('dangling connection throws'); }
    pin('U15 remove connected port', offenders);
  });
  it('reordering the wires: the sign belongs to the port, not to the source', () => {
    const offenders: string[] = [];
    for (const order of [[2, 1], [1, 2]]) {
      const engine = new XbridgesEngine(sumModel(2, '+-', order));
      engine.options = { solver: 'euler', fixedStep: 0.01, startTime: 0, stopTime: 1 } as never;
      engine.compile(0);
      const expected = (order[0] === 1 ? 1 : 10) - (order[1] === 1 ? 1 : 10);
      if (outOf(engine) !== expected) offenders.push(`order ${order.join(',')}`);
    }
    pin('U15 reorder', offenders);
  });
});

// ------------------------------------------------------------------------------------------------------------------
// U16 names
// ------------------------------------------------------------------------------------------------------------------
const C_KEYWORDS = new Set(['auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'inline', 'int', 'long', 'register', 'restrict', 'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while', '_Bool', '_Complex', '_Imaginary']);
const NAME_CLASSES: { cls: string; id: string }[] = [
  { cls: 'space', id: 'my block 1' },
  { cls: 'unicode', id: 'bloc_é_π_模块' },
  { cls: 'quotes', id: `q"u'o\`te` },
  { cls: 'keyword-int', id: 'int' },
  { cls: 'keyword-while', id: 'while' },
  { cls: 'long200', id: 'L'.repeat(200) },
  { cls: 'digit-first', id: '9lives' },
];
describe('U16: ids with spaces, unicode, quotes, C keywords and 200 characters', () => {
  it('the canvas run is unaffected by the block id', () => {
    const offenders: string[] = [];
    // buildModel's wire syntax cannot carry such ids: build with a plain id, then rename the block and its connections.
    const gin = make('GAIN').inputs[0].id, gout = make('GAIN').outputs[0].id;
    const probe = (id: string) => {
      const model = buildModel({ blocks: [{ id: 'k', type: 'Constant', params: { value: 3 } }, { id: 'g', type: 'GAIN', params: { gain: 2 } }, { id: 'i', type: 'Integrator' }], wires: [`k.out -> g.${gin}`, `g.${gout} -> i.in`] });
      model.blocks.forEach((b) => { if (b.id === 'g') b.id = id; });
      model.connections.forEach((c) => { if (c.sourceBlock === 'g') c.sourceBlock = id; if (c.targetBlock === 'g') c.targetBlock = id; });
      return runModel(model, { solver: 'rk4', dt: 0.01, stopTime: 0.1, probes: ['i.out', `${id}.${gout}`] });
    };
    const ref = probe('g');
    for (const { cls, id } of NAME_CLASSES) {
      try {
        const r = probe(id);
        if (!sameValue(r.signals['i.out'], ref.signals['i.out']) || !sameValue(r.signals[`${id}.${gout}`], ref.signals[`g.${gout}`])) offenders.push(cls);
      } catch { offenders.push(cls); }
    }
    pin('U16 canvas run depends on the id', offenders);
  });
  it('a label, and string and numeric parameter values with the same names do not break a run', () => {
    const offenders: string[] = [];
    for (const { cls, id } of NAME_CLASSES) {
      for (const type of ['Constant', 'GAIN', 'Scope', 'Subsystem', 'Inport']) {
        try {
          const b = make(type, { label: id, name: id, description: id });
          const model = buildModel({ blocks: [{ id: 'u', type, params: { label: id, name: id, value: id, gain: id } }], wires: [] });
          model.blocks[0].label = id;
          const r = runModel(model, { solver: 'rk4', dt: 0.01, stopTime: 0.05, probes: [] });
          if (r.diagnostics.some((d) => d.code === 'EXECUTION_EXCEPTION') || b === undefined) offenders.push(`${type}:${cls}`);
        } catch { offenders.push(`${type}:${cls}`); }
      }
    }
    pin('U16 label or parameter text breaks a run', offenders);
  });

  const CODEGEN = TYPES.filter((t) => getXBBlockCapability(t)?.codegen === true);
  /** The embedded model of one block with every input fed by a Constant; the block under test is then renamed to `id`. */
  const embeddedWith = (types: { type: string; id: string }[]): XBPersistedModelV1 => {
    const blocks: { id: string; type: string; params?: Record<string, unknown> }[] = [];
    const wires: string[] = [];
    types.forEach(({ type }, n) => {
      blocks.push({ id: `b${n}`, type });
      make(type).inputs.forEach((p, i) => { blocks.push({ id: `k${n}_${i}`, type: 'Constant', params: { value: 1 } }); wires.push(`k${n}_${i}.out -> b${n}.${p.id}`); });
    });
    const xb = toEmbeddedModel({ blocks, wires }, { solver: 'euler', dt: 0.01 });
    (xb as { policy: unknown }).policy = { memory: 'reset', numericFault: 'signal-only' };
    const rename = new Map(types.map(({ id }, n) => [`b${n}`, id]));
    xb.nodes.forEach((node) => { node.id = rename.get(node.id) ?? node.id; });
    xb.edges.forEach((e) => { e.sourceNodeId = rename.get(e.sourceNodeId) ?? e.sourceNodeId; e.targetNodeId = rename.get(e.targetNodeId) ?? e.targetNodeId; });
    return xb;
  };
  /** Same pipeline as buildParityIr (one-state machine owning the model), from an already built persisted model. */
  const generateFor = (xb: XBPersistedModelV1): { ok: boolean; files: { name: string; content: string }[]; why: string } => {
    try {
      const sm = hybridXBridgesFixture();
      sm.tickMs = 10;
      sm.states[0].autostart = false;
      sm.states.find((s) => s.id === PARITY_STATE_ID)!.autostart = true;
      const shell = buildSemanticModel(sm);
      if (!shell.ir) return { ok: false, files: [], why: 'shell' };
      const vd = validateXBModel(xb, {}, EMBEDDED_TARGET);
      if (vd.some((d) => d.severity === 'error')) return { ok: false, files: [], why: `validate ${vd.find((d) => d.severity === 'error')?.code}` };
      const built = buildXBSemanticModel({ stateId: PARITY_STATE_ID, ownerState: shell.stateSymbols?.get(PARITY_STATE_ID), model: xb, variables: {}, target: EMBEDDED_TARGET, baseTickMs: 10 });
      if (!built.ir || built.diagnostics.some((d) => d.severity === 'error')) return { ok: false, files: [], why: `build ${built.diagnostics.find((d) => d.severity === 'error')?.code}` };
      const ir = { ...shell.ir, states: { ...shell.ir.states, [PARITY_STATE_ID]: { ...shell.ir.states[PARITY_STATE_ID], xBridges: built.ir } } };
      return { ok: true, files: generateParitySources(ir as never).files, why: '' };
    } catch (err) { return { ok: false, files: [], why: `throws ${(err as Error).message}`.slice(0, 80) }; }
  };
  /** Declared C object names of the generated header: `type name;` / `type name[n];` lines of structs. */
  const declared = (header: string): { struct: string; name: string }[] => {
    const out: { struct: string; name: string }[] = [];
    let current = '';
    for (const line of header.split('\n')) {
      if (/^typedef struct/.test(line)) current = line;
      if (line.includes('(')) continue; // prototypes and macros are not objects
      const m = /^\s+(?:const\s+)?(?:double|float|bool|u?int(?:8|16|32|64)_t|size_t|SM_\w+_t)\s+([^\s;[\]*()]+)(?:\[[^\]]*\])*\s*;/.exec(line);
      if (m) out.push({ struct: current + out.length, name: m[1] });
      if (/^\}\s*\w+;/.test(line)) { current = ''; }
    }
    return out;
  };
  const stripCommentsAndStrings = (c: string) => c.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)+'/g, '""');

  it('generated C identifiers are legal and unique for every codegen-capable block under every name class', () => {
    const illegal: string[] = [];
    const leaked: string[] = [];
    const generationFails: string[] = [];
    let buildable = 0;
    const plain = new Set<string>();
    for (const type of CODEGEN) if (generateFor(embeddedWith([{ type, id: 'plain' }])).ok) plain.add(type);
    buildable = plain.size;
    for (const { cls, id } of NAME_CLASSES) {
      for (const type of plain) {
        const g = generateFor(embeddedWith([{ type, id }]));
        if (!g.ok) { generationFails.push(`${type}:${cls} (${g.why})`); continue; }
        const header = g.files.filter((f) => f.name.endsWith('.h')).map((f) => f.content).join('\n');
        const names = declared(header).map((d) => d.name);
        if (names.some((n) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(n) || C_KEYWORDS.has(n))) illegal.push(`${type}:${cls} ${names.filter((n) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(n) || C_KEYWORDS.has(n)).join('|').slice(0, 80)}`);
        // The raw id must not appear in code (outside comments and string literals) when it is not itself a legal identifier.
        const code = stripCommentsAndStrings(g.files.map((f) => f.content).join('\n'));
        if (/[^A-Za-z0-9_]/.test(id) && (code.includes(id) || /[^\x00-\x7F]/.test(code))) leaked.push(`${type}:${cls}`);
      }
    }
    expect(buildable, 'the check must cover a meaningful part of the 100 codegen-capable types').toBeGreaterThan(30);
    pin('U16 illegal C identifier', illegal);
    pin('U16 raw id in generated C', leaked);
    pin('U16 generation fails only for a plain id too', generationFails);
  }, 300_000);

  it('the generated C of one model per name class compiles as C99, with unique members', () => {
    const offenders: string[] = [];
    const compilable = CODEGEN.filter((t) => generateFor(embeddedWith([{ type: t, id: 'plain' }])).ok);
    for (const { cls, id } of [...NAME_CLASSES, { cls: 'collision', id: 'a b' }, { cls: 'long-collision', id: 'L' }]) {
      const types = (cls === 'collision' ? ['Constant', 'Constant', 'Constant', 'Constant'] : cls === 'long-collision' ? ['Constant', 'Constant'] : compilable).map((type, n) => ({
        type,
        // Distinct ids that normalise to the same text in the collision class; one id per block otherwise.
        id: cls === 'collision' ? ['a b', 'a_b', 'a-b', 'a.b'][n] : cls === 'long-collision' ? `${'L'.repeat(100)}${'ab'[n]}` : n === 0 ? id : `${id}${n}`,
      }));
      const g = generateFor(embeddedWith(types));
      if (!g.ok) { offenders.push(`${cls}: not generated (${g.why})`); continue; }
      const dir = mkdtempSync(join(tmpdir(), 'xb-u16-'));
      try {
        for (const f of g.files) writeFileSync(join(dir, f.name), f.content);
        try {
          execFileSync('gcc', ['-std=c99', '-fsyntax-only', '-Wall', '-Wextra', '-I', dir, ...g.files.filter((f) => f.name.endsWith('.c')).map((f) => join(dir, f.name))], { stdio: 'pipe' });
        } catch (e) { offenders.push(`${cls}: ${String((e as { stderr?: Buffer }).stderr ?? e).split('\n').find((l) => l.includes('error')) ?? 'gcc failed'}`.replace(dir, '').slice(0, 140)); }
        const dup = declared(g.files.filter((f) => f.name.endsWith('.h')).map((f) => f.content).join('\n')).map((d) => d.name);
        // Members of different structs may share a name; a duplicate inside the instance struct is caught by gcc above.
        void dup;
        // C99 5.2.4.1 / 6.4.2.1: at least the first 63 characters of an internal identifier are significant, so two names
        // that differ only after the 63rd character may denote the same object.
        const names = declared(g.files.filter((f) => f.name.endsWith('.h')).map((f) => f.content).join('\n')).map((d) => d.name);
        if (cls === 'long-collision' && new Set(names.map((n) => n.slice(0, 63))).size < new Set(names).size) offenders.push(`${cls}: names equal in the first 63 characters`);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    pin('XBV-308', offenders.filter((o) => o.includes('first 63')));
    pin('U16 generated C does not compile', offenders.filter((o) => !o.includes('first 63')));
  }, 300_000);
});
