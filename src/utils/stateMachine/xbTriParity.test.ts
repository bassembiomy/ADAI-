/**
 * Gate V6 (plan 2026-11-10 §2): the canvas engine (testkit runModel = the live loop) and the state-machine X-Bridges
 * interpreter (testkit runEmbedded) give the same numbers on the same model. rel 1e-12 / abs 1e-12, NaN equals NaN.
 *
 * Time alignment (analytic case Constant 1 -> Integrator IC 0, y = t; see testkit/embedded.ts): canvas sample k is the
 * value at t_k = k*dt. For sources / feed-through blocks embedded tick k holds the same instant (WaveformGen tick k =
 * A sin(2 pi f k dt + phi)); so embedded tick k <-> canvas sample k. The embedded Integrator, however, reports its
 * state AFTER the tick's update (tick k holds y(t_{k+1})) - that is the pinned parity gap, not part of the mapping.
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import {
  buildModel, runModel, runEmbedded, randomGraph, DEFAULT_RANDOM_GRAPH_TYPES, withinTolerance,
  EMBEDDED_STEP_FOR_CANVAS_SAMPLE,
  type ModelSpec, type EmbeddedSolver,
} from '../../engine/xbridges/testkit';
import { XB_CAPABILITIES } from './xbCapabilities';


/**
 * Pinned parity gaps (it.fails: they flip red when fixed). Provisional ids XBV-083..414; XBV-067 / XBV-068 are existing ledger ids.
 * Each cause was settled against an oracle (closed form / Simulink definition) where one exists; 'unresolved' means none.
 */
const PIN_CAUSE: Record<string, string> = {
  'XBV-095': 'parity gap: the canvas factory default mode \'PID\' makes buildXBSemanticModel throw \'Invalid PID mode: PID\' (xbPidContract.ts:18) instead of returning a diagnostic; invalid parameters must yield a diagnostic, embedded builder wrong',
  'XBV-083': 'embedded Sum ignores the signs parameter and always adds (xbInterpreter.ts:530); Simulink Sum +- subtracts, canvas right',
  'XBV-084': 'mixed time base inside one embedded tick: Clock, WaveformGen and UNIT_DELAY are evaluated at t_k while Integrator/RATE_LIMITER outputs are post-update and Step uses t_(k+1) (the generated C and the state-machine timers share this convention); the canvas uses t_k throughout. The convention is an open decision (D9); this test asserts the t_k convention',
  'XBV-MULTI': 'one or more of XBV-083 (Sum signs) and XBV-084 (mixed time base); the seed is not bisected - the verifier sampled 12 seeds and each passes once all causes are patched',
  'XBV-041': 'canvas Clock is a square wave, Simulink Clock outputs simulation time (embedded outputs t); canvas wrong (BlockDefinitions.ts:2094)',
  'XBV-086': 'out of domain input: IEEE/C99 inverse trig gives NaN, canvas NaN right, embedded emits 0',
  'XBV-087': 'negative input: canvas int32 (-1) vs embedded uint32 (4294967295); no oracle (Simulink bitwise needs integer types, double input not defined), unresolved',
  'XBV-088': 'canvas and embedded use different PRNG streams, not comparable by value; no deterministic oracle, unresolved',
  'XBV-065': 'canvas returns a non-numeric result for a vector input, embedded is element-wise like Simulink; canvas wrong',
  'XBV-068': 'canvas starts with window filled with the first sample (0.7), zero-initial sliding mean is 0.07 = embedded; canvas wrong',
  'XBV-090': 'canvas thresholds Hall inputs at > 0.5, embedded uses nonzero = true (Simulink double to boolean conversion); canvas deviates',
  'XBV-067': 'rk4 stage sees the post-step input (relay switches one step early under rk4 only, euler equal); canvas wrong',
  'XBV-092': 'canvas x_hat/kg non-numeric and y_hat differs from embedded; no closed form computed, unresolved',
  'XBV-093': 'capabilities mismatch: the registry marks the block codegen-capable but the embedded validator refuses the default model (continuous STATE_SPACE: XB_DISCRETE_REPRESENTATION_REQUIRED; DISCRETE_TRANSFER_FUNCTION default state: XB_STATE_INITIAL_VALUE_INVALID) that the canvas runs',
  'XBV-094': 'parity gap: embedded refuses scalar inputs (XB_SHAPE_MISMATCH) while XB_CAPABILITIES lists scalar; canvas runs',
  'XBV-091': 'canvas y(0)=0 then explicit-Euler instability (|y| exceeds the closed-form bound amp=1.3 from step 3), embedded stays bounded but one tick ahead; filter discretisation differs, neither exact, unresolved',
};
const PINS: Record<string, string> = {
  'PID_CONTROLLER|euler': 'XBV-095',
  'PID_CONTROLLER|rk4': 'XBV-095',
  'ACOS|euler': 'XBV-086',
  'ACOS|rk4': 'XBV-086',
  'ACOS|discrete': 'XBV-086',
  'ACOSEC|euler': 'XBV-086',
  'ACOSEC|rk4': 'XBV-086',
  'ACOSEC|discrete': 'XBV-086',
  'ACOSH|euler': 'XBV-086',
  'ACOSH|rk4': 'XBV-086',
  'ACOSH|discrete': 'XBV-086',
  'ACOTH|euler': 'XBV-086',
  'ACOTH|rk4': 'XBV-086',
  'ACOTH|discrete': 'XBV-086',
  'ASEC|euler': 'XBV-086',
  'ASEC|rk4': 'XBV-086',
  'ASEC|discrete': 'XBV-086',
  'ASECH|euler': 'XBV-086',
  'ASECH|rk4': 'XBV-086',
  'ASECH|discrete': 'XBV-086',
  'ASIN|euler': 'XBV-086',
  'ASIN|rk4': 'XBV-086',
  'ASIN|discrete': 'XBV-086',
  'ATANH|euler': 'XBV-086',
  'ATANH|rk4': 'XBV-086',
  'ATANH|discrete': 'XBV-086',
  'BAND_LIMITED_NOISE|euler': 'XBV-088',
  'BAND_LIMITED_NOISE|rk4': 'XBV-088',
  'BAND_LIMITED_NOISE|discrete': 'XBV-088',
  'BitwiseAND|euler': 'XBV-087',
  'BitwiseAND|rk4': 'XBV-087',
  'BitwiseAND|discrete': 'XBV-087',
  'BitwiseNOT|euler': 'XBV-087',
  'BitwiseNOT|rk4': 'XBV-087',
  'BitwiseNOT|discrete': 'XBV-087',
  'BitwiseOR|euler': 'XBV-087',
  'BitwiseOR|rk4': 'XBV-087',
  'BitwiseOR|discrete': 'XBV-087',
  'BitwiseXOR|euler': 'XBV-087',
  'BitwiseXOR|rk4': 'XBV-087',
  'BitwiseXOR|discrete': 'XBV-087',
  'Clock|euler': 'XBV-041',
  'Clock|rk4': 'XBV-041',
  'Clock|discrete': 'XBV-041',
  'DEADZONE|euler': 'XBV-065',
  'DEADZONE|rk4': 'XBV-065',
  'DEADZONE|discrete': 'XBV-065',
  'DISCRETE_TRANSFER_FUNCTION|euler': 'XBV-093',
  'DISCRETE_TRANSFER_FUNCTION|rk4': 'XBV-093',
  'DISCRETE_TRANSFER_FUNCTION|discrete': 'XBV-093',
  'HIGH_PASS_FILTER|euler': 'XBV-091',
  'HIGH_PASS_FILTER|rk4': 'XBV-091',
  'INTEGRATOR_CONTINUOUS|euler': 'XBV-084',
  'INTEGRATOR_CONTINUOUS|rk4': 'XBV-084',
  'Integrator|euler': 'XBV-084',
  'Integrator|rk4': 'XBV-084',
  'KALMAN_FILTER|euler': 'XBV-092',
  'KALMAN_FILTER|rk4': 'XBV-092',
  'KALMAN_FILTER|discrete': 'XBV-092',
  'LOW_PASS_FILTER|euler': 'XBV-091',
  'LOW_PASS_FILTER|rk4': 'XBV-091',
  'MOVING_AVERAGE|euler': 'XBV-068',
  'MOVING_AVERAGE|rk4': 'XBV-068',
  'MOVING_AVERAGE|discrete': 'XBV-068',
  'RATE_LIMITER|euler': 'XBV-084',
  'RATE_LIMITER|rk4': 'XBV-084',
  'RATE_LIMITER|discrete': 'XBV-084',
  'RELAY|rk4': 'XBV-067',
  'SATURATION|euler': 'XBV-065',
  'SATURATION|rk4': 'XBV-065',
  'SATURATION|discrete': 'XBV-065',
  'SIX_STEP_COMMUTATION|euler': 'XBV-090',
  'SIX_STEP_COMMUTATION|rk4': 'XBV-090',
  'SIX_STEP_COMMUTATION|discrete': 'XBV-090',
  'STATE_SPACE|euler': 'XBV-093',
  'STATE_SPACE|rk4': 'XBV-093',
  'ShiftLeft|euler': 'XBV-087',
  'ShiftLeft|rk4': 'XBV-087',
  'ShiftLeft|discrete': 'XBV-087',
  'ShiftRight|euler': 'XBV-087',
  'ShiftRight|rk4': 'XBV-087',
  'ShiftRight|discrete': 'XBV-087',
  'Step|euler': 'XBV-084',
  'Step|rk4': 'XBV-084',
  'Step|discrete': 'XBV-084',
  'Sum|euler': 'XBV-083',
  'Sum|rk4': 'XBV-083',
  'Sum|discrete': 'XBV-083',
  'VectorAdd|euler': 'XBV-094',
  'VectorAdd|rk4': 'XBV-094',
  'VectorAdd|discrete': 'XBV-094',
  'VectorDiv|euler': 'XBV-094',
  'VectorDiv|rk4': 'XBV-094',
  'VectorDiv|discrete': 'XBV-094',
  'VectorMul|euler': 'XBV-094',
  'VectorMul|rk4': 'XBV-094',
  'VectorMul|discrete': 'XBV-094',
  'VectorSub|euler': 'XBV-094',
  'VectorSub|rk4': 'XBV-094',
  'VectorSub|discrete': 'XBV-094',
  'WHITE_NOISE|euler': 'XBV-088',
  'WHITE_NOISE|rk4': 'XBV-088',
  'WHITE_NOISE|discrete': 'XBV-088',
};
const CORPUS_PINS: Record<string, string> = {
  'all|euler|1': 'XBV-MULTI',
  'all|euler|4': 'XBV-MULTI',
  'all|euler|5': 'XBV-MULTI',
  'all|euler|6': 'XBV-MULTI',
  'all|euler|7': 'XBV-MULTI',
  'all|euler|8': 'XBV-MULTI',
  'all|euler|9': 'XBV-MULTI',
  'all|euler|10': 'XBV-MULTI',
  'all|euler|12': 'XBV-MULTI',
  'all|euler|13': 'XBV-MULTI',
  'all|euler|14': 'XBV-MULTI',
  'all|euler|15': 'XBV-MULTI',
  'all|euler|16': 'XBV-MULTI',
  'all|euler|17': 'XBV-MULTI',
  'all|euler|18': 'XBV-MULTI',
  'all|euler|19': 'XBV-MULTI',
  'all|euler|20': 'XBV-MULTI',
  'all|euler|22': 'XBV-MULTI',
  'all|euler|23': 'XBV-MULTI',
  'all|euler|24': 'XBV-MULTI',
  'all|euler|25': 'XBV-MULTI',
  'all|euler|26': 'XBV-MULTI',
  'all|euler|27': 'XBV-MULTI',
  'all|euler|28': 'XBV-MULTI',
  'all|euler|29': 'XBV-MULTI',
  'all|euler|30': 'XBV-MULTI',
  'all|rk4|1': 'XBV-MULTI',
  'all|rk4|4': 'XBV-MULTI',
  'all|rk4|5': 'XBV-MULTI',
  'all|rk4|6': 'XBV-MULTI',
  'all|rk4|7': 'XBV-MULTI',
  'all|rk4|8': 'XBV-MULTI',
  'all|rk4|9': 'XBV-MULTI',
  'all|rk4|10': 'XBV-MULTI',
  'all|rk4|12': 'XBV-MULTI',
  'all|rk4|13': 'XBV-MULTI',
  'all|rk4|14': 'XBV-MULTI',
  'all|rk4|15': 'XBV-MULTI',
  'all|rk4|16': 'XBV-MULTI',
  'all|rk4|17': 'XBV-MULTI',
  'all|rk4|18': 'XBV-MULTI',
  'all|rk4|19': 'XBV-MULTI',
  'all|rk4|20': 'XBV-MULTI',
  'all|rk4|22': 'XBV-MULTI',
  'all|rk4|23': 'XBV-MULTI',
  'all|rk4|24': 'XBV-MULTI',
  'all|rk4|25': 'XBV-MULTI',
  'all|rk4|26': 'XBV-MULTI',
  'all|rk4|27': 'XBV-MULTI',
  'all|rk4|28': 'XBV-MULTI',
  'all|rk4|29': 'XBV-MULTI',
  'all|rk4|30': 'XBV-MULTI',
  'no-step|euler|2': 'XBV-MULTI',
  'no-step|euler|3': 'XBV-MULTI',
  'no-step|euler|5': 'XBV-MULTI',
  'no-step|euler|6': 'XBV-MULTI',
  'no-step|euler|7': 'XBV-MULTI',
  'no-step|euler|8': 'XBV-MULTI',
  'no-step|euler|10': 'XBV-MULTI',
  'no-step|euler|13': 'XBV-MULTI',
  'no-step|euler|15': 'XBV-MULTI',
  'no-step|euler|17': 'XBV-MULTI',
  'no-step|euler|20': 'XBV-MULTI',
  'no-step|euler|21': 'XBV-MULTI',
  'no-step|euler|22': 'XBV-MULTI',
  'no-step|euler|23': 'XBV-MULTI',
  'no-step|euler|24': 'XBV-MULTI',
  'no-step|euler|25': 'XBV-MULTI',
  'no-step|euler|26': 'XBV-MULTI',
  'no-step|euler|27': 'XBV-MULTI',
  'no-step|euler|28': 'XBV-MULTI',
  'no-step|euler|30': 'XBV-MULTI',
  'no-step|rk4|2': 'XBV-MULTI',
  'no-step|rk4|3': 'XBV-MULTI',
  'no-step|rk4|5': 'XBV-MULTI',
  'no-step|rk4|6': 'XBV-MULTI',
  'no-step|rk4|7': 'XBV-MULTI',
  'no-step|rk4|8': 'XBV-MULTI',
  'no-step|rk4|10': 'XBV-MULTI',
  'no-step|rk4|13': 'XBV-MULTI',
  'no-step|rk4|15': 'XBV-MULTI',
  'no-step|rk4|17': 'XBV-MULTI',
  'no-step|rk4|20': 'XBV-MULTI',
  'no-step|rk4|21': 'XBV-MULTI',
  'no-step|rk4|22': 'XBV-MULTI',
  'no-step|rk4|23': 'XBV-MULTI',
  'no-step|rk4|24': 'XBV-MULTI',
  'no-step|rk4|25': 'XBV-MULTI',
  'no-step|rk4|26': 'XBV-MULTI',
  'no-step|rk4|27': 'XBV-MULTI',
  'no-step|rk4|28': 'XBV-MULTI',
  'no-step|rk4|30': 'XBV-MULTI',
  'steady|euler|5': 'XBV-MULTI',
  'steady|euler|6': 'XBV-MULTI',
  'steady|euler|7': 'XBV-MULTI',
  'steady|euler|15': 'XBV-MULTI',
  'steady|euler|20': 'XBV-MULTI',
  'steady|euler|23': 'XBV-MULTI',
  'steady|euler|27': 'XBV-MULTI',
  'steady|rk4|5': 'XBV-MULTI',
  'steady|rk4|6': 'XBV-MULTI',
  'steady|rk4|7': 'XBV-MULTI',
  'steady|rk4|15': 'XBV-MULTI',
  'steady|rk4|20': 'XBV-MULTI',
  'steady|rk4|23': 'XBV-MULTI',
  'steady|rk4|27': 'XBV-MULTI',
};

const pinTitle = (pin: string, title: string) => `${pin.split(' ')[0]}: ${title} - ${PIN_CAUSE[pin.split(' ')[0]]}${pin.includes(' ') ? ` ${pin.slice(pin.indexOf(' ') + 1)}` : ''}`;

const DT = 0.05;
const STEPS = 40;
const TOL = { rel: 1e-12, abs: 1e-12 };
const SOLVERS: EmbeddedSolver[] = ['euler', 'rk4', 'discrete'];

const flat = (v: unknown): number[] => {
  if (typeof v === 'number') return [v];
  if (typeof v === 'boolean') return [v ? 1 : 0];
  if (Array.isArray(v)) return v.flatMap(flat);
  if (v === undefined || v === null) return [];
  return [Number.NaN];
};

type Outcome =
  | { kind: 'equal' }
  | { kind: 'both-refused'; detail: string }
  | { kind: 'gap'; side: 'canvas' | 'embedded'; code: string; detail: string }
  | { kind: 'differ'; detail: string };

const compareSpec = (
  label: string, spec: ModelSpec, solver: EmbeddedSolver, probes: string[], dims?: Record<string, number[]>, steps = STEPS,
): Outcome => {
  const canvas = runModel(buildModel(spec), { solver, dt: DT, stopTime: (steps - 1) * DT, probes });
  const emb = runEmbedded(spec, { solver, dt: DT, steps, probes, portDimensions: dims });
  const cErr = canvas.diagnostics.find((d) => d.severity === 'error');
  const eErr = emb.diagnostics.find((d) => d.severity === 'error');
  if (cErr && eErr) return { kind: 'both-refused', detail: `${label}: canvas ${cErr.code}, embedded ${eErr.code}` };
  if (cErr) return { kind: 'gap', side: 'canvas', code: String(cErr.code), detail: `${label}: canvas refuses (${cErr.code}: ${cErr.message}), embedded runs` };
  if (eErr) return { kind: 'gap', side: 'embedded', code: String(eErr.code), detail: `${label}: embedded refuses (${eErr.stage ?? ''} ${eErr.code}: ${eErr.message}), canvas runs` };
  if (canvas.t.length < steps) return { kind: 'differ', detail: `${label}: canvas stopped after ${canvas.t.length} samples (embedded ${steps})` };
  for (let k = 0; k < steps; k++) {
    const e = EMBEDDED_STEP_FOR_CANVAS_SAMPLE(k);
    for (const p of probes) {
      const a = flat(canvas.signals[p][k]);
      const b = emb.signals[p][e] ?? [];
      if (a.length !== b.length) return { kind: 'differ', detail: `${label}: step ${k} ${p}: canvas ${JSON.stringify(a)} vs embedded ${JSON.stringify(b)} (length)` };
      for (let i = 0; i < a.length; i++) {
        if (!withinTolerance(b[i], a[i], TOL)) return { kind: 'differ', detail: `${label}: step ${k} t=${k * DT} ${p}[${i}]: canvas ${a[i]} vs embedded ${b[i]}` };
      }
    }
  }
  return { kind: 'equal' };
};

// ---------------------------------------------------------------- per-block cases
const isCodegen = (t: string) => XB_CAPABILITIES[t]?.codegen === true;
const SKIP = new Set(['Inport', 'Outport', 'Subsystem']); // Inport: XBV-039 (canvas overrides); Outport/Subsystem need structure
const TYPES = Object.keys(BLOCK_LIBRARY).filter((t) => isCodegen(t) && !SKIP.has(t) && typeof BLOCK_LIBRARY[t] === 'function').sort();

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
  const ins = proto.inputs.map((p: any) => p.id as string);
  const outs = proto.outputs.map((p: any) => p.id as string);
  const probes = outs.map((o: string) => `b.${o}`);
  const out: Scenario[] = [];
  // Blocks whose port shapes differ per port are wired with explicit dimensions (everything else: all ports share one shape).
  const KV = { type: 'Constant', params: { value: [0.5, -1.25] } };
  if (type === 'IdentityMatrix') {
    return [{ name: 'matrix', spec: { blocks: [{ id: 'b', type, params }], wires: [] }, probes, dims: { 'b.out': [3, 3] } }];
  }
  if (type === 'MUX') {
    const W = { type: 'WaveformGen', params: SINE_A };
    const spec: ModelSpec = { blocks: [{ id: 'b', type, params }, { id: 's0', type: 'Constant', params: { value: 0.7 } }, { id: 's1', ...W }], wires: ['s0.out -> b.in1', 's1.out -> b.in2'] };
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
  if (ins.length === 0) {
    out.push({ name: 'no-input', spec: { blocks: [{ id: 'b', type, params }], wires: [] }, probes });
    return out;
  }
  const drive = (srcs: { type: string; params: Record<string, unknown> }[]): ModelSpec => ({
    blocks: [{ id: 'b', type, params }, ...ins.map((_, i) => ({ id: `s${i}`, ...srcs[Math.min(i, srcs.length - 1)] }))],
    wires: ins.map((p, i) => `s${i}.out -> b.${p}`),
  });
  const K = { type: 'Constant', params: { value: 0.7 } };
  const WA = { type: 'WaveformGen', params: SINE_A };
  const WB = { type: 'WaveformGen', params: SINE_B };
  const scalarIn = shapesOf(type, 'in').includes('scalar');
  if (scalarIn) out.push({ name: 'const0.7', spec: drive([K]), probes });
  if (scalarIn) out.push({ name: 'sine', spec: drive([WA]), probes });
  if (scalarIn && ins.length >= 2) out.push({ name: 'sine+sine2', spec: drive([WA, WB, K]), probes });
  if (type === 'Sum' || type === 'SUM_JUNCTION') out.push({ name: 'sine+sine2 signs +-', spec: { ...drive([WA, WB]), blocks: [{ id: 'b', type, params: { ...params, signs: '+-' } }, ...drive([WA, WB]).blocks.slice(1)] }, probes });
  const dimsFor = (d: number[]) => {
    const m: Record<string, number[]> = {};
    for (const p of ins) m[`b.${p}`] = d;
    const os = shapesOf(type, 'out');
    const same = d.length === 1 ? os.includes('vector') : os.includes('matrix');
    // Blocks whose output shape differs from the input shape by definition (defaults of the canvas factory).
    const shaped: Record<string, (x: number[]) => number[] | undefined> = {
      SubMatrix: () => [1, 1], // default rowEnd = colEnd = 0
      MatrixConcat: (x) => [x[0] * 2, x[1]], // axis 0, two inputs
      MatrixDiag: (x) => (x.length === 1 ? [x[0], x[0]] : [x[0]]),
    };
    const forced = shaped[type]?.(d);
    for (const o of outs) m[`b.${o}`] = forced ?? (same ? d : []);
    ins.forEach((_, i) => { m[`s${i}.out`] = d; });
    return m;
  };
  const is = shapesOf(type, 'in');
  if (is.includes('vector')) out.push({ name: 'vector', spec: drive([{ type: 'Constant', params: { value: [0.5, -1.25, 2] } }]), probes, dims: dimsFor([3]) });
  if (is.includes('matrix')) out.push({ name: 'matrix', spec: drive([{ type: 'Constant', params: { value: [[1, 2], [3, 4.5]] } }]), probes, dims: dimsFor([2, 2]) });
  return out;
};

const hasContinuous = (type: string) => typeof (BLOCK_LIBRARY[type]('b', {}) as any).evaluateDerivatives === 'function';

const runBlockCase = (type: string, solver: EmbeddedSolver): Outcome => {
  const results: Outcome[] = [];
  for (const sc of scenariosFor(type)) {
    const r = compareSpec(`${type}/${solver}/${sc.name}`, sc.spec, solver, sc.probes, sc.dims);
    // Sources are Constant / WaveformGen (stateless), so continuous state only comes from the block under test.
    results.push(r);
    if (r.kind === 'differ') return r;
  }
  const gap = results.find((r) => r.kind === 'gap');
  if (gap) return gap;
  const refused = results.find((r) => r.kind === 'both-refused');
  if (refused && results.every((r) => r.kind !== 'equal')) return refused;
  return { kind: 'equal' };
};

export const SUMMARY = { compared: 0, equal: 0, pinned: 0, skippedDiscrete: 0 };
const REPORT: Record<string, string> = {};

const assertOutcome = (o: Outcome) => {
  if (o.kind === 'equal') return;
  expect.fail(o.detail);
};

describe('V6 per-block parity: canvas = embedded, every codegen-capable BLOCK_LIBRARY type', () => {
  it('lists the types programmatically', () => {
    expect(TYPES.length).toBe(Object.keys(XB_CAPABILITIES).filter((t) => isCodegen(t) && !SKIP.has(t) && typeof BLOCK_LIBRARY[t] === 'function').length);
    expect(TYPES.length).toBeGreaterThan(90);
  });
  for (const type of TYPES) {
    for (const solver of SOLVERS) {
      if (solver === 'discrete' && hasContinuous(type)) continue; // continuous state: discrete solver not applicable
      const key = `${type}|${solver}`;
      const title = `${type} ${solver}: canvas = embedded`;
      const pin = PINS[key];
      const body = () => {
        const o = runBlockCase(type, solver);
        SUMMARY.compared++;
        if (process.env.XBTRI_REPORT) REPORT[key] = o.kind === 'equal' ? 'equal' : `${o.kind}: ${o.kind === 'both-refused' || o.kind === 'differ' ? o.detail : `${o.code} ${o.detail}`}`;
        assertOutcome(o);
      };
      if (pin) it.fails(pinTitle(pin, title), body); else it(title, body);
    }
  }
});

// ---------------------------------------------------------------- graph corpus
const scalarCodegen = (types: string[]) => types.filter((t) => isCodegen(t) && typeof BLOCK_LIBRARY[t] === 'function');
const CORPUS_TYPES = scalarCodegen([...DEFAULT_RANDOM_GRAPH_TYPES, 'WaveformGen', 'Step']);
const CORPUS_NO_STEP = CORPUS_TYPES.filter((t) => t !== 'Step');
const CORPUS_NO_STEP_NO_INTEGRATOR = CORPUS_NO_STEP.filter((t) => t !== 'Integrator');

const corpus = (name: string, types: string[]) => {
  describe(`V6 graph corpus ${name}: 30 seeds x {euler, rk4}, 30 steps, every block output`, () => {
    for (const solver of ['euler', 'rk4'] as const) {
      for (let seed = 1; seed <= 30; seed++) {
        const key = `${name}|${solver}|${seed}`;
        const pin = CORPUS_PINS[key];
        const title = `seed ${seed} ${solver}: canvas = embedded`;
        const body = () => {
          const spec = randomGraph(seed, { blocks: 10, types });
          const probes: string[] = [];
          for (const b of spec.blocks) for (const o of BLOCK_LIBRARY[b.type](b.id, b.params ?? {}).outputs) probes.push(`${b.id}.${o.id}`);
          const o = compareSpec(`corpus ${name} seed ${seed}`, spec, solver, probes, undefined, 30);
          if (process.env.XBTRI_REPORT) REPORT[key] = o.kind === 'equal' ? 'equal' : `${o.kind}: ${(o as any).detail}`;
          assertOutcome(o);
        };
        if (pin) it.fails(pinTitle(pin, title), body); else it(title, body);
      }
    }
  });
};
corpus('all', CORPUS_TYPES);
corpus('no-step', CORPUS_NO_STEP);
corpus('steady', CORPUS_NO_STEP_NO_INTEGRATOR);

import { afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
afterAll(() => {
  if (process.env.XBTRI_REPORT) writeFileSync(process.env.XBTRI_REPORT, JSON.stringify(REPORT, null, 1));
});
