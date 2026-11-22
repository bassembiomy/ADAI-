/**
 * WP-14b — worker part B (plan section 5.2 "Worker"; part A is xbWorker.test.ts).
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md.
 *
 *  1. Snapshot round trip of every stateful block: N steps uninterrupted versus k steps, engineSnapshot, JSON (or structured
 *     clone) round trip, reset, compile with the snapshot at the resume time, the remaining steps. Oracle: the uninterrupted
 *     run, step by step (block states and outputs). Math.random is a counter-based sequence so both runs see the same draws.
 *  2. Cancel mid-batch, and a block fault mid-batch: the engine is left with an integer number of committed steps (oracle:
 *     the analytic integral of a constant, x = c n dt) and stays usable.
 *  3. Hybrid PT blocks with a gear-shift stimulus: the worker through the real client equals the main-thread liveStep run.
 *  4. Full node parameters (every factory parameter, as the canvas sends them) and times far from 0 (start 1e6 s): worker
 *     versus main thread, and an analytic oracle for the time accumulation.
 *
 * Verification only: a defect is pinned with it.fails under a provisional finding id (XBV-4xx; PIN_CAUSE) and the id's block
 * list is a ratchet: a fixed block must be removed from its list, a new failure fails the generic test.
 * Print the actual failure lists (triage only): XBB_PRINT=1 npx vitest run src/engine/xbridges/verification/xbWorkerB.test.ts
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { liveStep } from '../liveStep';
import { handleXbridgesWorkerMessage } from '../xbridgesWorker';
import type { XbridgesEngineSnapshot, XbridgesWorkerRequest, XbridgesWorkerResponse } from '../xbridgesWorkerProtocol';
import { XbridgesWorkerClient } from '../../../services/xbridgesWorkerClient';
import { buildModel } from '../testkit';
import type { XModel } from '../types';

type Spec = Parameters<typeof buildModel>[0];

/** Provisional finding ids of this batch (the planner renumbers when it records them). One root cause each. */
export const PIN_CAUSE: Record<string, string> = {
  'XBV-400': 'S4 (no product code sends engineSnapshot to the worker today) snapshot: engineSnapshot (xbridgesWorker.ts serializeEngineSnapshot) carries block states and sample grid but not the published outputs of sample-and-hold blocks (signalValues is declared in the protocol, never filled): a resume between hits publishes the initial output until the next hit; xbridgesWorker.ts / xbridgesWorkerProtocol.ts',
  'XBV-403': 'S4 fault: ode2, ode3 and rk4 commit the output step in which a block faulted (state advanced by the whole step) while the response reports the time before it: state and simulationTime disagree by one step; Solvers.ts / xbridgesWorker.ts',
  'XBV-404': 'S3 fault: ode5, ode23 and ode45 leave a partly integrated state when a stage / internal step faults (x = 2 * 0.277 s, not a whole number of steps), so the engine is not at any reported time; Solvers.ts / AdaptiveSolver.ts',
  'XBV-405': 'S1 hybrid: serializeModelForWorker (xbridgesWorkerClient.ts) strips updateDiscrete (the XBV-047 fix) and the XbridgesEngine constructor (XbridgesEngine.ts ~line 146) re-creates only execute / evaluateDerivatives / ZeroCrossingFn, so PT_AUTOMATED_MANUAL_TRANSMISSION, PT_DUAL_CLUTCH_TRANSMISSION and PT_DISC_CLUTCH never run their discrete update in the worker (no clutch lock, no gear bookkeeping): the canvas worker differs from the main thread from step 0',
  'XBV-406': 'S1 hybrid: consequence of XBV-405 only: without updateDiscrete the hybrid PT blocks (AMT, DCT under ode23 / ode23tb; the disc clutch under ode23tb) never settle their mode and the worker call never returns; with updateDiscrete re-attached the models finish in under 60 ms. Fixing 405 fixes 406',
  'XBV-408': 'S1 solver, main thread, library blocks only: Integrator (initialCondition 0.0123) feeding SWITCH (x >= 0 ? -1 : +1), a chattering sliding mode, never returns under ode23 / ode45 / ode23tb (killed at 25 s; rk4 takes 5 ms): locateEvent (AdaptiveSolver.ts:216) and StiffSolver.ts:532 have no cap on events or steps; Simulink stops with an error on its consecutive zero-crossings limit',
  'XBV-407': 'S1 library: BLOCK_LIBRARY has two keys equal up to case (Integrator and INTEGRATOR); the engine constructor re-creates execute for a worker model by a case-insensitive type lookup that finds Integrator first, so the worker runs the wrong block for every INTEGRATOR (other state, limits and reset ignored); XbridgesEngine.ts ~line 140',
};

const PRINT = process.env.XBB_PRINT === '1';

// ---------------------------------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------------------------------

/** Counter-based Math.random: a pure function of the number of draws, so a run can be resumed at a known draw position. */
let draws = 0;
const draw = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const seedRandom = () => { draws = 0; vi.spyOn(Math, 'random').mockImplementation(() => draw(draws++)); };
afterEach(() => vi.restoreAllMocks());

/** First difference between two values, or null. NaN equals NaN, Map / Set / typed arrays / plain objects are told apart. */
function firstDiff(a: unknown, b: unknown, path = ''): string | null {
  if (typeof a === 'number' && typeof b === 'number') return a === b || (Number.isNaN(a) && Number.isNaN(b)) ? null : `${path}: ${a} vs ${b}`;
  if (a === b) return null;
  if (a === undefined || b === undefined || a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return `${path}: ${describe0(a)} vs ${describe0(b)}`;
  }
  const ta = Object.prototype.toString.call(a);
  const tb = Object.prototype.toString.call(b);
  if (ta !== tb) return `${path}: ${ta} vs ${tb}`;
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return `${path}: Map size ${a.size} vs ${b.size}`;
    for (const [k, v] of a) { const d = firstDiff(v, b.get(k), `${path}.get(${String(k)})`); if (d) return d; }
    return null;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return `${path}: Set size ${a.size} vs ${b.size}`;
    for (const v of a) if (!b.has(v)) return `${path}: Set member ${String(v)} missing`;
    return null;
  }
  if (Array.isArray(a) || ArrayBuffer.isView(a)) {
    const x = a as unknown as ArrayLike<unknown>;
    const y = b as unknown as ArrayLike<unknown>;
    if (x.length !== y.length) return `${path}: length ${x.length} vs ${y.length}`;
    for (let i = 0; i < x.length; i++) { const d = firstDiff(x[i], y[i], `${path}[${i}]`); if (d) return d; }
    return null;
  }
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return `${path}: keys ${ka.length} vs ${kb.length} (${ka.filter((k) => !kb.includes(k)).concat(kb.filter((k) => !ka.includes(k))).slice(0, 3).join(',')})`;
  for (const k of ka) { const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`); if (d) return d; }
  return null;
}
const describe0 = (v: unknown) => (v === undefined ? 'undefined' : v === null ? 'null' : typeof v === 'object' ? Object.prototype.toString.call(v) : String(v));

/** A Worker stand-in: postMessage structure-clones the request (DataCloneError on functions), the handler answers (as part A). */
const fakeWorker = () => {
  const w: { onmessage: ((e: { data: XbridgesWorkerResponse }) => void) | null; onerror: unknown; postMessage: (m: unknown) => void; terminate: () => void } = {
    onmessage: null,
    onerror: null,
    postMessage(message: unknown) {
      const cloned = structuredClone(message) as XbridgesWorkerRequest;
      const response = handleXbridgesWorkerMessage(cloned);
      queueMicrotask(() => w.onmessage?.({ data: structuredClone(response) }));
    },
    terminate() {},
  };
  return w as unknown as Worker;
};
const newClient = () => new XbridgesWorkerClient(fakeWorker);
const resetWorker = () => handleXbridgesWorkerMessage({ type: 'reset', requestId: 0, time: 0, dt: 0 });

/** What the real client sends as the model: execute / evaluateDerivatives / updateDiscrete / ZeroCrossingFn removed. */
const stripModel = (m: XModel): XModel => ({
  connections: m.connections.map((c) => ({ ...c })),
  blocks: m.blocks.map((b) => {
    const { execute: _e, evaluateDerivatives: _d, updateDiscrete: _u, ZeroCrossingFn: _z, ...rest } = b as unknown as Record<string, unknown>;
    return rest as unknown as XModel['blocks'][number];
  }),
});

/** Compile-without-model returns the current worker engine snapshot and outputs and takes no step. */
const peek = () => handleXbridgesWorkerMessage({ type: 'compile', requestId: -1, time: 0, dt: 0 });

const stateIds = (e: XbridgesEngine) => e.executionOrder.filter((b) => b.state !== undefined);
/** Block states and published outputs of the main-thread engine, cloned (as the worker response is). */
const mainView = (e: XbridgesEngine) => ({
  states: structuredClone(Object.fromEntries(stateIds(e).map((b) => [b.id, b.state]))) as Record<string, unknown>,
  outputs: structuredClone(Object.fromEntries(e.executionOrder.flatMap((b) => b.outputs.map((o) => [`${b.id}.${o.id}`, e.getSignalValue(b.id, o.id)])).filter(([, v]) => v !== undefined))) as Record<string, unknown>,
});

// ---------------------------------------------------------------------------------------------------------------------
// Part 1: snapshot round trip of every stateful block
// ---------------------------------------------------------------------------------------------------------------------

const N = 20;
const DT = 0.05;
const OPTS = { solver: 'rk4', startTime: 0, stopTime: N * DT, fixedStep: DT };

const isNonEmptyState = (s: unknown) => s !== undefined && s !== null && !(typeof s === 'object' && Object.keys(s as object).length === 0);
/** Every BLOCK_LIBRARY type that is stateful: isStateful, evaluateDerivatives, or a non-empty initial state. */
const STATEFUL_TYPES = Object.keys(BLOCK_LIBRARY).sort().filter((t) => {
  const b = BLOCK_LIBRARY[t]('probe', {}) as { isStateful?: boolean; evaluateDerivatives?: unknown; state?: unknown };
  return b.isStateful === true || typeof b.evaluateDerivatives === 'function' || isNonEmptyState(b.state);
});

/** The block alone, every input driven by its own sine (so the state moves); wired = false leaves the inputs at their defaults. */
const specFor = (type: string, wired: boolean): Spec => {
  const b = BLOCK_LIBRARY[type]('u', {}) as { inputs: { id: string }[] };
  if (!wired) return { blocks: [{ id: 'u', type }], wires: [] };
  const blocks: Spec['blocks'] = [{ id: 'u', type }];
  const wires: string[] = [];
  b.inputs.forEach((p, i) => {
    blocks.push({ id: `w${i}`, type: 'WaveformGen', params: { type: 'Sine', amp: 1 + i * 0.5, freq: 0.7 + 0.3 * i, offset: 0.5, phase: 0 } });
    wires.push(`w${i}.out -> u.${p.id}`);
  });
  return { blocks, wires };
};
/** Hand-made stimuli for blocks whose sine-driven or default inputs are invalid for them (the block rejects the input). */
type Drive = number | { amp: number; offset: number; freq: number; type?: string };
const custom = (type: string, params: Record<string, unknown>, inputs: Record<string, Drive | 'sine'>): Spec => {
  const blocks: Spec['blocks'] = [{ id: 'u', type, params }];
  const wires: string[] = [];
  Object.entries(inputs).forEach(([port, v], i) => {
    const sine = v === 'sine' ? { amp: 0.5, offset: 1, freq: 0.7 + 0.3 * i } : typeof v === 'object' ? v : null;
    blocks.push(sine
      ? { id: `w${i}`, type: 'WaveformGen', params: { type: sine.type ?? 'Sine', amp: sine.amp, freq: sine.freq, offset: sine.offset, phase: 0 } }
      : { id: `w${i}`, type: 'Constant', params: { value: v } });
    wires.push(`w${i}.out -> u.${port}`);
  });
  return { blocks, wires };
};
const clk = { amp: 0.5, offset: 0.5, freq: 2, type: 'Square' };
const CUSTOM: Record<string, Spec> = {
  Counter: custom('Counter', {}, { clk, en: 1, rst: 0 }),
  DFlipFlop: custom('DFlipFlop', {}, { d: { amp: 0.5, offset: 0.5, freq: 0.7, type: 'Square' }, clk, rst: 0 }),
  JKFlipFlop: custom('JKFlipFlop', {}, { j: { amp: 0.5, offset: 0.5, freq: 0.7, type: 'Square' }, k: { amp: 0.5, offset: 0.5, freq: 1.3, type: 'Square' }, clk, rst: 0 }),
  Register: custom('Register', {}, { in: 'sine', clk, en: 1, rst: 0 }),
  RELAY: custom('RELAY', {}, { u: { amp: 5, offset: 0, freq: 1 } }),
  PT_AMT_CONTROLLER: custom('PT_AMT_CONTROLLER', {}, { AccelPdl: { amp: 40, offset: 50, freq: 1 }, VehSpd: { amp: 15, offset: 15, freq: 0.7 } }),
  PT_DCT_CONTROLLER: custom('PT_DCT_CONTROLLER', {}, { AccelPdl: { amp: 40, offset: 50, freq: 1 }, VehSpd: { amp: 15, offset: 15, freq: 0.7 } }),
  PT_CONTROL_VOLUME: custom('PT_CONTROL_VOLUME', {}, { Flw1: { amp: 1e-4, offset: 1e-4, freq: 1 }, Flw2: { amp: 1e-4, offset: 0, freq: 0.7 } }),
  INTEGRATOR_DISCRETE: custom('INTEGRATOR_DISCRETE', { sample_time: 0.1 }, { u: 'sine' }),
  PT_AUTOMATED_MANUAL_TRANSMISSION: custom('PT_AUTOMATED_MANUAL_TRANSMISSION', {}, { GearCmd: 2, EngTrq: 'sine', DiffSpd: 'sine' }),
  PT_DUAL_CLUTCH_TRANSMISSION: custom('PT_DUAL_CLUTCH_TRANSMISSION', {}, { GearCmd: 2, EngTrq: 'sine', DiffSpd: 'sine' }),
  PT_INTAKE_MANIFOLD: custom('PT_INTAKE_MANIFOLD', {}, { mdot_in: 'sine', N: 200, mdot_egr: 0, T_in: 300, T_egr: 300 }),
  PT_MAPPED_MOTOR: custom('PT_MAPPED_MOTOR', {}, { TrqCmd: 'sine', Spd: 100, BattVolt: 400 }),
  PT_TURBOCHARGER: custom('PT_TURBOCHARGER', {}, { mdot_comp: 0.05, mdot_exh: 0.05, T_exh: 800, VgtPos: 0.5, P_amb: 101325, T_amb: 300 }),
  PT_VEHICLE_BODY_1DOF: custom('PT_VEHICLE_BODY_1DOF', {}, { FwF: 'sine', FwR: 'sine', Grade: 0, WindXYZ: 0, Temp: 300 }),
};
const driven = new Map<string, Spec | null>();

interface Row { states: Record<string, unknown>; outputs: Record<string, unknown>; draws: number }

/** Steps from..to-1 through the client, the last one with finalOutputs when `final`. */
async function stepRange(client: XbridgesWorkerClient, from: number, to: number, final: boolean): Promise<{ rows: Row[]; last: XbridgesWorkerResponse }> {
  const rows: Row[] = [];
  let last!: XbridgesWorkerResponse;
  for (let k = from; k < to; k++) {
    last = await client.step({ time: k * DT, dt: DT, solverType: 'rk4', ...(final && k === to - 1 ? { finalOutputs: true } : {}) });
    rows.push({ states: last.engineSnapshot!.blockStates, outputs: last.outputValues ?? {}, draws });
  }
  return { rows, last };
}

async function uninterrupted(spec: Spec): Promise<Row[]> {
  resetWorker();
  seedRandom();
  const client = newClient();
  await client.compile(buildModel(spec), 0, OPTS as never);
  return (await stepRange(client, 0, N, true)).rows;
}

async function firstHalf(spec: Spec, k: number): Promise<XbridgesEngineSnapshot> {
  resetWorker();
  seedRandom();
  const client = newClient();
  await client.compile(buildModel(spec), 0, OPTS as never);
  return (await stepRange(client, 0, k, false)).last.engineSnapshot!;
}

async function resumed(spec: Spec, k: number, snap: XbridgesEngineSnapshot, drawsAtK: number): Promise<Row[]> {
  resetWorker();
  seedRandom();
  const client = newClient();
  await client.step({ type: 'compile' as never, model: stripModel(buildModel(spec)), time: k * DT, dt: 0, solverOptions: OPTS as never, engineSnapshot: snap });
  draws = drawsAtK;
  return (await stepRange(client, k, N, true)).rows;
}

type Transport = 'json' | 'clone';
const transport = (s: XbridgesEngineSnapshot, how: Transport): XbridgesEngineSnapshot => (how === 'json' ? JSON.parse(JSON.stringify(s)) : structuredClone(s));

/** Types the harness could not drive at all (compile error alone, even with no inputs wired). */
const UNDRIVABLE: string[] = [];

/** First stimulus under which the uninterrupted run completes: custom, sine-driven inputs, then default inputs. */
const lastErr: Record<string, string> = {};
const refCache = new Map<string, { spec: Spec; ref: Row[] } | null>();
async function drive(type: string): Promise<{ spec: Spec; ref: Row[] } | null> {
  if (refCache.has(type)) return refCache.get(type)!;
  let found: { spec: Spec; ref: Row[] } | null = null;
  for (const spec of [CUSTOM[type], specFor(type, true), specFor(type, false)].filter((x): x is Spec => !!x)) {
    try { found = { spec, ref: await uninterrupted(spec) }; break; } catch (e) { lastErr[type] = (e as Error).message; }
  }
  refCache.set(type, found);
  return found;
}

async function roundTrip(type: string, k: number, how: Transport): Promise<string | null> {
  const d = await drive(type);
  if (!d) { if (!UNDRIVABLE.includes(type)) UNDRIVABLE.push(type); return null; }
  const { spec, ref } = d;
  try {
    const snap = transport(await firstHalf(spec, k), how);
    const run = await resumed(spec, k, snap, ref[k - 1].draws);
    for (let j = 0; j < run.length; j++) {
      const ds = firstDiff(run[j].states, ref[k + j].states, 'state');
      if (ds) return `step ${k + j}: ${ds}`;
      const dout = firstDiff(run[j].outputs, ref[k + j].outputs, 'out');
      if (dout) return `step ${k + j}: ${dout}`;
    }
    return null;
  } catch (e) {
    return `threw: ${(e as Error).message}`;
  }
}

const roundTripAll = async (k: number, how: Transport) => {
  const bad: Record<string, string> = {};
  for (const t of STATEFUL_TYPES) { const r = await roundTrip(t, k, how); if (r) bad[t] = r; }
  return bad;
};
const printed = (name: string, v: unknown) => { if (PRINT) console.log(`XBB ${name} ${JSON.stringify(v)}`); };

/** Failure lists of the four round-trip variants, computed once. */
type Variant = 'json10' | 'json7' | 'clone10' | 'clone7';
let variants: Promise<Record<Variant, Record<string, string>>> | null = null;
const allVariants = () => (variants ??= (async () => ({
  json10: await roundTripAll(10, 'json'),
  json7: await roundTripAll(7, 'json'),
  clone10: await roundTripAll(10, 'clone'),
  clone7: await roundTripAll(7, 'clone'),
}))());

/** Blocks pinned per provisional finding (ratchet: the list must equal the actual failures). */
const PIN_BLOCKS: Record<string, string[]> = {
  'XBV-400': ['AIR_FRYER_LEARNING_MODEL', 'DISCRETE_TRANSFER_FUNCTION', 'INTEGRATOR_DISCRETE', 'UNIT_DELAY'],
};
// The json10 / json7 lists are a documented characterisation, not a pin: the real client and worker use structured clone (clone10 / clone7),
// which keeps -Infinity / NaN; only a JSON round trip turns the sentinels of AC_INDUCTION_MOTOR and AC_MOTOR_PID_CONTROL into null.
const EXPECTED: Record<Variant, string[]> = {
  json10: ['AC_INDUCTION_MOTOR', 'AC_MOTOR_PID_CONTROL'],
  json7: ['AC_MOTOR_PID_CONTROL', 'AIR_FRYER_LEARNING_MODEL', 'DISCRETE_TRANSFER_FUNCTION', 'INTEGRATOR_DISCRETE', 'UNIT_DELAY'],
  clone10: [],
  clone7: ['AIR_FRYER_LEARNING_MODEL', 'DISCRETE_TRANSFER_FUNCTION', 'INTEGRATOR_DISCRETE', 'UNIT_DELAY'],
};

describe('part 1: snapshot round trip of every stateful block (uninterrupted run is the oracle)', () => {
  it('lists the stateful blocks programmatically (sanity: the known classes are in)', () => {
    expect(STATEFUL_TYPES.length).toBeGreaterThan(100);
    for (const t of ['ROBOT_VACUUM_COMM', 'Integrator', 'DELAY', 'Scope', 'PT_DISC_CLUTCH', 'WHITE_NOISE']) expect(STATEFUL_TYPES, t).toContain(t);
  });

  it('every stateful block is driven except those that cannot compile alone', async () => {
    await allVariants();
    // FUZZY_SURFACE_VIEWER needs a linked FIS (compile error alone, as in part A).
    expect(UNDRIVABLE).toEqual(['FUZZY_SURFACE_VIEWER']);
  }, 120_000);

  it('resume at a sample hit (step 10, t = 0.5) and between hits (step 7, t = 0.35), JSON and structured clone: failures are exactly the pinned lists', async () => {
    const v = await allVariants();
    printed('variants', v);
    for (const k of Object.keys(EXPECTED) as Variant[]) expect(Object.keys(v[k]).sort(), k).toEqual(EXPECTED[k]);
  }, 120_000);

  it('the stimulus moves the state of most blocks (coverage of the round trip is not vacuous)', async () => {
    await allVariants();
    const evolves = STATEFUL_TYPES.filter((t) => { const d = refCache.get(t); return d && d.ref.some((r) => firstDiff(d.ref[0].states, r.states) !== null); });
    printed('static', STATEFUL_TYPES.filter((t) => !evolves.includes(t)));
    expect(evolves.length).toBeGreaterThanOrEqual(90);
    for (const t of ['ROBOT_VACUUM_COMM', 'Integrator', 'DELAY', 'Scope', 'PT_DISC_CLUTCH', 'WHITE_NOISE', 'Counter', 'Register', 'AC_MOTOR_PID_CONTROL', 'RELAY']) expect(evolves, t).toContain(t);
  }, 120_000);
});

describe('part 1 pins', () => {
  const none = async (id: string) => {
    const v = await allVariants();
    const mine = new Set(PIN_BLOCKS[id]);
    const hit = (Object.keys(v) as Variant[]).flatMap((k) => Object.keys(v[k]).filter((t) => mine.has(t)).map((t) => `${k}/${t}`));
    expect(hit, PIN_CAUSE[id]).toEqual([]);
  };
  it.fails('XBV-400: a resume between sample hits publishes the held output of UNIT_DELAY, INTEGRATOR_DISCRETE, DISCRETE_TRANSFER_FUNCTION, AIR_FRYER (the snapshot has no signal values)', () => none('XBV-400'), 120_000);

  // Consequence of XBV-400 in a model: the held value feeds a downstream integrator, so the resumed run diverges.
  it.fails('XBV-400: Sine -> UNIT_DELAY(0.2 s) -> Integrator resumed at t = 0.35 ends with the same integrator state as the uninterrupted run', async () => {
    const spec: Spec = {
      blocks: [{ id: 'w', type: 'WaveformGen', params: { type: 'Sine', amp: 1, freq: 0.7, offset: 1, phase: 0 } },
        { id: 'd', type: 'UNIT_DELAY', params: { sampleTime: 0.2, initialCondition: 0 } }, { id: 'x', type: 'Integrator', params: { initialCondition: 0 } }],
      wires: ['w.out -> d.u', 'd.y -> x.in'],
    };
    const ref = await uninterrupted(spec);
    const snap = transport(await firstHalf(spec, 7), 'clone');
    const run = await resumed(spec, 7, snap, ref[6].draws);
    expect(firstDiff(run[run.length - 1].states, ref[N - 1].states)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Part 2: cancel mid-batch and a block fault mid-batch
// ---------------------------------------------------------------------------------------------------------------------

/** x' = 2: after n whole steps of DT the state is exactly 2 n DT (analytic oracle, rk4 integrates a constant exactly). */
const RAMP: Spec = { blocks: [{ id: 'c', type: 'Constant', params: { value: 2 } }, { id: 'x', type: 'Integrator', params: { initialCondition: 0 } }], wires: ['c.out -> x.in'] };
const stepsCommitted = (x: number) => { const j = Math.round(x / (2 * DT)); return Math.abs(x - 2 * j * DT) < 1e-9 ? j : NaN; };
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

describe('part 2: cancel mid-batch', () => {
  const BATCH = 2000;
  const cancelled = async () => {
    resetWorker();
    const client = newClient();
    await client.compile(buildModel(RAMP), 0, { solver: 'rk4', startTime: 0, stopTime: 1e4, fixedStep: DT } as never);
    const batch = client.step({ type: 'batch', time: 0, dt: DT, batchSize: BATCH, solverType: 'rk4' });
    const queued = client.step({ time: BATCH * DT, dt: DT, solverType: 'rk4' });
    client.cancel();
    return { client, batch, queued };
  };

  it('the cancelled batch and the request queued behind it are rejected, the client is idle and the worker answers', async () => {
    const { client, batch, queued } = await cancelled();
    await expect(batch).rejects.toThrow(/cancel/i);
    await expect(queued).rejects.toThrow(/cancel/i);
    await flush();
    expect(client.inFlight).toBe(false);
    expect(peek().ok).toBe(true);
  });

  it('the engine holds a whole number of committed steps (never a half step) and a following compile and step work', async () => {
    const { client, batch, queued } = await cancelled();
    await Promise.allSettled([batch, queued]);
    await flush();
    const j = stepsCommitted(Number(peek().engineSnapshot!.blockStates.x));
    expect(Number.isNaN(j), 'state is x = 2 j dt for an integer j').toBe(false);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(j).toBeLessThanOrEqual(BATCH);
    // a following compile and step on the same client
    const c = await client.compile(buildModel(RAMP), 0, { solver: 'rk4', startTime: 0, stopTime: 10, fixedStep: DT } as never);
    expect(c.ok).toBe(true);
    const r = await client.step({ time: 0, dt: DT, solverType: 'rk4' });
    expect(r.ok).toBe(true);
    expect(Math.abs(Number(r.engineSnapshot!.blockStates.x) - 2 * DT)).toBeLessThan(1e-12);
  });

});

describe('part 2: a block fault in the middle of a batch leaves a whole number of steps', () => {
  const THROW_AT = 0.27;
  const withThrower = async <T>(fn: () => Promise<T> | T): Promise<T> => {
    const lib = BLOCK_LIBRARY as Record<string, (id: string, p?: Record<string, unknown>) => unknown>;
    lib.__TEST_THROWS_LATE__ = (id: string) => ({
      id, type: '__TEST_THROWS_LATE__', params: {}, state: null,
      inputs: [{ id: 'u', label: 'u', type: 'input' }], outputs: [{ id: 'y', label: 'y', type: 'output' }],
      execute: (_i: unknown, _p: unknown, _s: unknown, time: number) => { if (time >= THROW_AT) throw new Error('test-only late fault'); return { outputs: [0] }; },
    });
    try { return await fn(); } finally { delete lib.__TEST_THROWS_LATE__; }
  };
  const FAULT: Spec = { blocks: [...RAMP.blocks, { id: 'm', type: '__TEST_THROWS_LATE__' }], wires: [...RAMP.wires, 'c.out -> m.u'] };

  const FAULT_PINS: Record<string, string> = { ode2: 'XBV-403', ode3: 'XBV-403', rk4: 'XBV-403', ode5: 'XBV-404', ode23: 'XBV-404', ode45: 'XBV-404' };
  for (const solver of ['euler', 'ode2', 'ode3', 'rk4', 'ode5', 'ode23', 'ode45', 'ode14x', 'ode23tb']) {
    const body = async () => {
      await withThrower(() => {
        resetWorker();
        const model = buildModel(FAULT);
        const compile = handleXbridgesWorkerMessage({ type: 'compile', requestId: 1, model: stripModel(model), time: 0, dt: DT, solverType: solver, solverOptions: { solver, startTime: 0, stopTime: 1, fixedStep: DT } as never });
        expect(compile.ok).toBe(true);
        const r = handleXbridgesWorkerMessage({ type: 'batch', requestId: 2, time: 0, dt: DT, batchSize: 10, solverType: solver });
        if (PRINT) console.log('XBB fault', JSON.stringify({ r: { ...r, engineSnapshot: undefined } }));
        expect(r.ok).toBe(false);
        expect((r.diagnostics ?? []).map((d) => d.code)).toContain('BLOCK_RUNTIME_FAULT');
        // The fault lies in the step that starts at 0.25 (a stage at 0.275, or the end point 0.30) or at 0.30 (euler evaluates at the step start).
        const j = r.simulationTime / DT;
        expect(Math.abs(j - Math.round(j)), `simulationTime ${r.simulationTime} is a whole number of steps`).toBeLessThan(1e-9);
        expect(r.simulationTime, 'steps reported done').toBeGreaterThan(0.25 - 1e-9);
        expect(r.simulationTime, 'steps reported done').toBeLessThan(0.30 + 1e-9);
        const x = Number(peek().engineSnapshot!.blockStates.x);
        expect(Math.abs(x - 2 * r.simulationTime), `integral over ${r.simulationTime} s, got ${x}`).toBeLessThan(1e-9);
        // the worker stays usable
        expect(handleXbridgesWorkerMessage({ type: 'compile', requestId: 3, model: stripModel(buildModel(RAMP)), time: 0, dt: DT, solverType: 'rk4' }).ok).toBe(true);
        expect(handleXbridgesWorkerMessage({ type: 'step', requestId: 4, time: 0, dt: DT, solverType: 'rk4' }).ok).toBe(true);
      });
    };
    const title = (id: string) => `${id ? `${id} ` : ''}${solver}: the fault at t = ${THROW_AT} fails the batch, the state equals the integral over the steps reported done (x = 2 t), a new model compiles`;
    FAULT_PINS[solver] ? it.fails(title(FAULT_PINS[solver]), body) : it(title(''), body);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Part 3: hybrid PT blocks across a gear shift, worker (real client, structured clone) = main-thread liveStep
// ---------------------------------------------------------------------------------------------------------------------

/** Parameters of every block of a model as the canvas sends them each frame (all factory parameters). */
const allParams = (m: XModel) => Object.fromEntries(m.blocks.filter((b) => b.params && Object.keys(b.params).length > 0).map((b) => [b.id, structuredClone(b.params) as Record<string, unknown>]));

interface Pair { main: ReturnType<typeof mainView>; worker: { states: Record<string, unknown>; outputs: Record<string, unknown> } }

/** Main thread (applyParameterUpdates + liveStep, as the canvas) versus the real worker client, per step. */
async function parity(spec: Spec, solver: string, dt: number, n: number, start: number, opts: Record<string, unknown> = {}): Promise<Pair[]> {
  const options = { solver, fixedStep: dt, startTime: start, stopTime: start + n * dt, ...opts };
  seedRandom();
  const main = new XbridgesEngine(buildModel(spec));
  main.options = options as never;
  main.compile(start);
  const drawsAfterCompile = draws;
  const params = allParams(buildModel(spec));
  const mainRows: ReturnType<typeof mainView>[] = [];
  for (let k = 0; k < n; k++) {
    for (const [id, p] of Object.entries(params)) main.applyParameterUpdates(id, structuredClone(p));
    liveStep(main, solver, start + k * dt, dt);
    mainRows.push(mainView(main));
  }
  resetWorker();
  seedRandom();
  const client = newClient();
  await client.compile(buildModel(spec), start, options as never);
  draws = drawsAfterCompile; // the worker's compile draws once for its run id
  const rows: Pair[] = [];
  for (let k = 0; k < n; k++) {
    const r = await client.step({ time: start + k * dt, dt, solverType: solver, paramUpdates: structuredClone(params) as never });
    rows.push({ main: mainRows[k], worker: { states: r.engineSnapshot!.blockStates, outputs: r.outputValues ?? {} } });
  }
  return rows;
}
const firstMismatch = (rows: Pair[]) => {
  for (let k = 0; k < rows.length; k++) {
    const ds = firstDiff(rows[k].worker.states, rows[k].main.states, 'state');
    if (ds) return `step ${k}: ${ds}`;
    const dout = firstDiff(rows[k].worker.outputs, rows[k].main.outputs, 'out');
    if (dout) return `step ${k}: ${dout}`;
  }
  return null;
};

const shiftStep = (id: string, t: number, from: number, to: number): Spec['blocks'][number] => ({ id, type: 'Step', params: { stepTime: t, initialValue: from, finalValue: to } });
// XBV-405: the client strips updateDiscrete and the engine constructor does not re-create it (execute, evaluateDerivatives and
// ZeroCrossingFn only), so the worker never runs the discrete update of a hybrid block. XBV-406: with a variable-step solver that
// leaves the worker in an endless event-location loop (checked in a child process below, a hang cannot be an in-process test).
const HANGS = ['PT_AUTOMATED_MANUAL_TRANSMISSION/ode23', 'PT_DUAL_CLUTCH_TRANSMISSION/ode23', 'PT_AUTOMATED_MANUAL_TRANSMISSION/ode23tb', 'PT_DUAL_CLUTCH_TRANSMISSION/ode23tb', 'PT_DISC_CLUTCH/ode23tb'];
const SHIFT_PINS: Record<string, string> = Object.fromEntries([
  ...['PT_AUTOMATED_MANUAL_TRANSMISSION', 'PT_DUAL_CLUTCH_TRANSMISSION'].flatMap((n) => ['rk4', 'ode45', 'ode14x'].map((s) => [`${n}/${s}`, 'XBV-405'])),
  ...['rk4', 'ode23', 'ode45', 'ode14x'].map((s) => [`PT_DISC_CLUTCH/${s}`, 'XBV-405']),
]);
const SHIFT_MODELS: Record<string, { spec: Spec; shifted: (states: Record<string, any>) => boolean }> = {
  PT_AUTOMATED_MANUAL_TRANSMISSION: {
    spec: {
      blocks: [{ id: 'u', type: 'PT_AUTOMATED_MANUAL_TRANSMISSION' }, shiftStep('g', 0.3, 1, 3),
        { id: 'tq', type: 'Constant', params: { value: 100 } }, { id: 'sp', type: 'WaveformGen', params: { type: 'Sine', amp: 20, freq: 0.5, offset: 100, phase: 0 } }],
      wires: ['g.out -> u.GearCmd', 'tq.out -> u.EngTrq', 'sp.out -> u.DiffSpd'],
    },
    shifted: (s) => s.u.gT === 3 || s.u.lkG === 3,
  },
  PT_DUAL_CLUTCH_TRANSMISSION: {
    spec: {
      blocks: [{ id: 'u', type: 'PT_DUAL_CLUTCH_TRANSMISSION' }, shiftStep('g', 0.3, 1, 3),
        { id: 'tq', type: 'Constant', params: { value: 100 } }, { id: 'sp', type: 'WaveformGen', params: { type: 'Sine', amp: 20, freq: 0.5, offset: 100, phase: 0 } }],
      wires: ['g.out -> u.GearCmd', 'tq.out -> u.EngTrq', 'sp.out -> u.DiffSpd'],
    },
    shifted: (s) => s.u.gT === 3 || s.u.lkG === 3,
  },
  PT_DISC_CLUTCH: {
    spec: {
      blocks: [{ id: 'u', type: 'PT_DISC_CLUTCH' }, shiftStep('p', 0.3, 0, 5e5),
        { id: 'tq', type: 'Constant', params: { value: 50 } }, { id: 'ld', type: 'Constant', params: { value: 10 } }],
      wires: ['p.out -> u.P', 'tq.out -> u.InTrq', 'ld.out -> u.LoadTrq'],
    },
    shifted: (s) => s.u.lk === 1 || s.u.sp !== 0 || s.u.hs !== 0,
  },
  PT_CONTINUOUSLY_VARIABLE_TRANSMISSION: {
    spec: {
      blocks: [{ id: 'u', type: 'PT_CONTINUOUSLY_VARIABLE_TRANSMISSION' }, shiftStep('r', 0.3, 1, 2),
        { id: 'tq', type: 'Constant', params: { value: 100 } }, { id: 'sp', type: 'Constant', params: { value: 100 } }],
      wires: ['r.out -> u.RatioCmd', 'tq.out -> u.InTrq', 'sp.out -> u.OutSpd'],
    },
    shifted: (s) => s.u.N > 1.2,
  },
};

describe('part 3: hybrid PT blocks across a gear shift: worker steps = main-thread liveStep, sample for sample', () => {
  for (const [name, { spec, shifted }] of Object.entries(SHIFT_MODELS)) {
    for (const solver of ['rk4', 'ode23', 'ode45', 'ode14x', 'ode23tb']) {
      const pinned = SHIFT_PINS[`${name}/${solver}`];
      const body = async () => {
        const rows = await parity(spec, solver, 0.01, 100, 0);
        // the stimulus really shifts: the block state differs before and after the shift (not a vacuous comparison)
        expect(shifted(rows[99].main.states as Record<string, any>), `${name} ${solver} shifted`).toBe(true);
        expect(firstDiff(rows[10].main.states, rows[99].main.states)).not.toBeNull();
        expect(firstMismatch(rows)).toBeNull();
      };
      if (HANGS.includes(`${name}/${solver}`)) it.skip(`XBV-406 ${name} ${solver}: the worker never returns (see the child-process test below)`, body);
      else (pinned ? it.fails : it)(`${pinned ? `${pinned} ` : ''}${name} ${solver}`, body, 60_000);
    }
  }
});

const root = resolve(__dirname, '..');
const repo = resolve(root, '../../..');
/** True when the child script does not print FINISHED in 25 s (a synchronous loop cannot be interrupted in-process). */
const childHangs = (body: string): Promise<boolean> => {
  const dir = mkdtempSync(join(tmpdir(), 'xbb-'));
  const file = join(dir, 'child.mts');
  writeFileSync(file, `
import { handleXbridgesWorkerMessage } from ${JSON.stringify(join(root, 'xbridgesWorker.ts'))};
import { XbridgesEngine } from ${JSON.stringify(join(root, 'XbridgesEngine.ts'))};
import { liveStep } from ${JSON.stringify(join(root, 'liveStep.ts'))};
import { buildModel } from ${JSON.stringify(join(root, 'testkit/index.ts'))};
${body}
console.log('FINISHED');
`);
  return new Promise((done) => {
    // node --import tsx runs in this one process (the tsx CLI would leave a hung grandchild behind when killed)
    execFile(process.execPath, ['--import', 'tsx', file], { timeout: 25_000, killSignal: 'SIGKILL', cwd: repo }, (_err, stdout) => {
      rmSync(dir, { recursive: true, force: true });
      done(!String(stdout).includes('FINISHED'));
    });
  });
};
/** 100 worker steps of the shift model. */
const hangs = (name: string, solver: string): Promise<boolean> => childHangs(`
const model = buildModel(${JSON.stringify(SHIFT_MODELS[name].spec)});
const strip = (m: any) => ({ connections: m.connections, blocks: m.blocks.map(({ execute, evaluateDerivatives, updateDiscrete, ZeroCrossingFn, ...r }: any) => r) });
const solver = ${JSON.stringify(solver)};
handleXbridgesWorkerMessage({ type: 'compile', requestId: 1, model: strip(model), time: 0, dt: 0.01, solverType: solver, solverOptions: { solver, fixedStep: 0.01, startTime: 0, stopTime: 1 } } as any);
for (let k = 0; k < 100; k++) handleXbridgesWorkerMessage({ type: 'step', requestId: 2 + k, time: k * 0.01, dt: 0.01, solverType: solver } as any);
`);
/** 100 main-thread live steps of Integrator (IC 0.0123) -> SWITCH (x >= 0 ? -1 : +1) -> Integrator. */
const slidingHangs = (solver: string): Promise<boolean> => childHangs(`
const model = buildModel({ blocks: [{ id: 'x', type: 'Integrator', params: { initialCondition: 0.0123 } }, { id: 'a', type: 'Constant', params: { value: -1 } },
  { id: 'b', type: 'Constant', params: { value: 1 } }, { id: 's', type: 'SWITCH', params: { threshold: 0, criteria: '>=' } }],
  wires: ['a.out -> s.u1', 'b.out -> s.u2', 'x.out -> s.ctrl', 's.y -> x.in'] });
const solver = ${JSON.stringify(solver)};
const e = new XbridgesEngine(model);
e.options = { solver, fixedStep: 0.01, startTime: 0, stopTime: 1 } as any;
e.compile(0);
for (let k = 0; k < 100; k++) liveStep(e, solver, k * 0.01, 0.01);
`);
const hangsControl = () => hangs('PT_DISC_CLUTCH', 'ode23');

describe('part 3: hang check in a child process', () => {
  it.fails('XBV-406: the worker returns for 100 steps of ode23 / ode23tb on the hybrid PT blocks (it never does: 25 s kill)', async () => {
    const hung = await Promise.all(HANGS.map((h) => { const [n, s] = h.split('/'); return hangs(n, s); }));
    expect(hung, PIN_CAUSE['XBV-406']).toEqual(HANGS.map(() => false));
  }, 60_000);

  it('the sliding-mode model finishes under rk4 (control for XBV-408)', async () => {
    expect(await slidingHangs('rk4')).toBe(false);
  }, 60_000);

  it.fails('XBV-408: Integrator -> SWITCH chattering sliding mode returns (or stops with a diagnostic) under ode23, ode45 and ode23tb', async () => {
    const hung = await Promise.all(['ode23', 'ode45', 'ode23tb'].map(slidingHangs));
    expect(hung, PIN_CAUSE['XBV-408']).toEqual([false, false, false]);
  }, 60_000);
});

// ---------------------------------------------------------------------------------------------------------------------
// Part 4: every factory parameter on the node, times far from 0
// ---------------------------------------------------------------------------------------------------------------------

const START = 1e6;
const ALL_TYPES = Object.keys(BLOCK_LIBRARY).sort();

/** The first stimulus (custom, sine-driven, default inputs) under which the main-thread run has no block fault. */
const mainClean = (spec: Spec, start: number): boolean => {
  const e = new XbridgesEngine(buildModel(spec));
  e.options = { solver: 'rk4', fixedStep: DT, startTime: start, stopTime: start + 6 * DT } as never;
  if (e.compile(start).some((d) => d.severity === 'error')) return false;
  for (let k = 0; k < 6; k++) if (!liveStep(e, 'rk4', start + k * DT, DT)) return false;
  return true;
};

async function farParityAll(): Promise<{ bad: Record<string, string>; skipped: string[] }> {
  const bad: Record<string, string> = {};
  const skipped: string[] = [];
  for (const type of ALL_TYPES) {
    const spec = [CUSTOM[type], specFor(type, true), specFor(type, false)].filter((x): x is Spec => !!x).find((x) => { try { return mainClean(x, START); } catch { return false; } });
    if (!spec) { skipped.push(type); continue; }
    try {
      const m = firstMismatch(await parity(spec, 'rk4', DT, 6, START));
      if (m) bad[type] = m;
    } catch (e) {
      bad[type] = `threw: ${(e as Error).message}`;
    }
  }
  return { bad, skipped };
}

/** Blocks pinned for the full-parameter / far-time parity (ratchet). */
const FAR_EXPECTED = ['INTEGRATOR', 'PT_AUTOMATED_MANUAL_TRANSMISSION', 'PT_DISC_CLUTCH', 'PT_DUAL_CLUTCH_TRANSMISSION'];
const FAR_PINS: Record<string, string[]> = { 'XBV-405': ['PT_AUTOMATED_MANUAL_TRANSMISSION', 'PT_DISC_CLUTCH', 'PT_DUAL_CLUTCH_TRANSMISSION'], 'XBV-407': ['INTEGRATOR'] };
/** Blocks whose factory defaults fault on the main thread under every stimulus of the harness (nothing to compare; coverage gap, not a result). */
const FAR_SKIPPED = ['BUS_SELECTOR', 'DEMUX', 'DOE_MODEL', 'FUZZY_DEFUZZIFY', 'FUZZY_SURFACE_VIEWER', 'MatrixSolve', 'PT_CI_CORE_ENGINE', 'PT_COMPRESSOR', 'PT_FLOW_RESTRICTION', 'PT_HEAT_EXCHANGER', 'PT_TURBINE', 'PT_VVT_VALVETRAIN', 'SWITCH_CASE', 'SubMatrix'];

describe('part 4: full node parameters at start time 1e6 s: worker = main thread', () => {
  let far: Promise<{ bad: Record<string, string>; skipped: string[] }> | null = null;
  const farAll = () => (far ??= farParityAll());

  it('the child-process control: a non-hanging hybrid case finishes', async () => {
    // guards the XBV-406 check against a child that fails for another reason (import error)
    expect(await (async () => { try { return await hangsControl(); } catch { return true; } })()).toBe(false);
  }, 60_000);

  it('every library block (all factory parameters sent every step, rk4, 6 steps from t = 1e6): states and outputs equal', async () => {
    const { bad, skipped } = await farAll();
    printed('far', bad);
    printed('farSkipped', skipped);
    expect(skipped).toEqual(FAR_SKIPPED);
    expect(Object.keys(bad).sort()).toEqual(FAR_EXPECTED);
  }, 120_000);

  for (const [id, types] of Object.entries(FAR_PINS)) {
    it.fails(`${id}: ${types.join(', ')} with all factory parameters from t = 1e6: worker = main thread`, async () => {
      const { bad } = await farAll();
      expect(types.filter((t) => t in bad), PIN_CAUSE[id]).toEqual([]);
    }, 120_000);
  }

  // XBV-407 consequence in a model: the limit of INTEGRATOR is ignored by the worker.
  it.fails('XBV-407: INTEGRATOR with limitOutput (upper limit 0.2) integrating 1: worker = main thread, state stays at 0.2', async () => {
    const spec: Spec = { blocks: [{ id: 'c', type: 'Constant', params: { value: 1 } }, { id: 'i', type: 'INTEGRATOR', params: { limitOutput: true, upperLimit: 0.2, lowerLimit: -1 } }], wires: ['c.out -> i.u'] };
    const rows = await parity(spec, 'rk4', 0.05, 10, 0);
    expect(Number((rows[9].main.states as Record<string, { x: number }>).i.x)).toBeCloseTo(0.2, 9);
    if (PRINT) console.log('XBB integ', JSON.stringify(rows[9].worker.states), JSON.stringify(rows[9].main.states));
    expect(Number((rows[9].worker.states as Record<string, { x: number }>).i.x), 'worker state x').toBeCloseTo(0.2, 9);
    expect(firstMismatch(rows)).toBeNull();
  }, 60_000);

  const SINE: Spec = {
    blocks: [{ id: 'w', type: 'WaveformGen', params: { type: 'Sine', amp: 1, freq: 0.5, offset: 0, phase: 0 } }, { id: 'x', type: 'Integrator', params: { initialCondition: 0 } }],
    wires: ['w.out -> x.in'],
  };
  const N4 = 500;
  const DT4 = 0.01;

  it('a model with a time-dependent source from t = 1e6, 500 single steps: worker = main thread at every step', async () => {
    const rows = await parity(SINE, 'rk4', DT4, N4, START);
    expect(firstMismatch(rows)).toBeNull();
  }, 60_000);

  it('the integral of sin(2 pi 0.5 t) from t = 1e6 over 5 s is 2 / pi (analytic): single steps and one batch agree with it and with each other', async () => {
    const oracle = (Math.cos(2 * Math.PI * 0.5 * START) - Math.cos(2 * Math.PI * 0.5 * (START + N4 * DT4))) / (2 * Math.PI * 0.5);
    expect(Math.abs(oracle - 2 / Math.PI)).toBeLessThan(1e-12);
    const opts = { solver: 'rk4', fixedStep: DT4, startTime: START, stopTime: START + N4 * DT4 };
    resetWorker();
    const client = newClient();
    await client.compile(buildModel(SINE), START, opts as never);
    let single!: XbridgesWorkerResponse;
    for (let k = 0; k < N4; k++) single = await client.step({ time: START + k * DT4, dt: DT4, solverType: 'rk4' });
    await client.compile(buildModel(SINE), START, opts as never);
    const batch = await client.step({ type: 'batch', time: START, dt: DT4, batchSize: N4, solverType: 'rk4' });
    for (const [name, r] of [['single', single], ['batch', batch]] as const) {
      expect(Math.abs(Number(r.engineSnapshot!.blockStates.x) - oracle), `${name} integral`).toBeLessThan(1e-6);
      expect(Math.abs(r.simulationTime - (START + 5)), `${name} reported time`).toBeLessThan(1e-9);
    }
    expect(firstDiff(batch.engineSnapshot!.blockStates, single.engineSnapshot!.blockStates)).toBeNull();
    expect(firstDiff(batch.outputValues, single.outputValues)).toBeNull();
  }, 60_000);

  it('a discrete block samples on the n Ts grid at t = 1e6: a UNIT_DELAY Ts 0.1 steps at 0.05 s: worker = main', async () => {
    const spec: Spec = {
      blocks: [{ id: 'w', type: 'WaveformGen', params: { type: 'Sine', amp: 1, freq: 0.7, offset: 0, phase: 0 } }, { id: 'd', type: 'UNIT_DELAY', params: { sampleTime: 0.1, initialCondition: 0 } }],
      wires: ['w.out -> d.u'],
    };
    const rows = await parity(spec, 'rk4', 0.05, 40, START);
    expect(firstMismatch(rows)).toBeNull();
  }, 60_000);
});
