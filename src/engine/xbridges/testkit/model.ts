/**
 * Test kit: build a model from a compact spec and run it with the live-canvas solver dispatch (liveStep.ts, shared with
 * XbridgesWorkspace and the worker).
 */
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { liveStep, liveStepAt } from '../liveStep';
import type { ModelDiagnostic, SolverOptions, XModel } from '../types';

export interface ModelSpec {
  blocks: { id: string; type: string; params?: Record<string, unknown> }[];
  wires: string[];
}

export const SOLVER_NAMES = ['euler', 'ode2', 'ode3', 'rk4', 'ode5', 'ode23', 'ode45', 'ode14x', 'ode23tb', 'discrete'] as const;
export type SolverName = (typeof SOLVER_NAMES)[number];

export interface RunOptions {
  solver: string;
  dt: number;
  stopTime: number;
  startTime?: number;
  probes: string[];
  /** Variable-step tolerances passed to the engine like the canvas solver settings (Simulink RelTol / AbsTol). */
  relTol?: number;
  absTol?: number;
}

export interface RunResult {
  t: number[];
  signals: Record<string, unknown[]>;
  diagnostics: ModelDiagnostic[];
}

/** Spec parameters per built model, re-applied before every step (canvas applyParameterUpdates). */
const SPEC_PARAMS = new WeakMap<XModel, Map<string, Record<string, unknown>>>();

/** Fresh blocks from the factories on every call; wires are 'block.port -> block.port'. */
export function buildModel(spec: ModelSpec): XModel {
  const blocks = spec.blocks.map((b) => {
    const factory = BLOCK_LIBRARY[b.type];
    if (typeof factory !== 'function') throw new Error(`buildModel: unknown block type '${b.type}' (block '${b.id}')`);
    const fresh = { ...(b.params ?? {}) };
    const block = factory(b.id, fresh);
    // As the canvas does on Play: spec parameters merged under the factory's own.
    return { ...block, id: b.id, params: { ...fresh, ...block.params } };
  });
  const specParams = new Map<string, Record<string, unknown>>();
  for (const b of spec.blocks) if (b.params && Object.keys(b.params).length > 0) specParams.set(b.id, { ...b.params });
  const byId = new Map(blocks.map((b) => [b.id, b]));
  if (byId.size !== blocks.length) throw new Error('buildModel: duplicate block id');
  const connections = spec.wires.map((w) => {
    const m = /^\s*([^\s.>-]+)\.([^\s>-]+)\s*->\s*([^\s.>-]+)\.([^\s>-]+)\s*$/.exec(w);
    if (!m) throw new Error(`buildModel: malformed wire '${w}' (expected 'a.port -> b.port')`);
    const [, sb, sp, tb, tp] = m;
    const src = byId.get(sb);
    const dst = byId.get(tb);
    if (!src) throw new Error(`buildModel: unknown block '${sb}' in wire '${w}'`);
    if (!dst) throw new Error(`buildModel: unknown block '${tb}' in wire '${w}'`);
    if (!src.outputs.some((p) => p.id === sp)) throw new Error(`buildModel: unknown output port '${sp}' on block '${sb}' (${src.type})`);
    if (!dst.inputs.some((p) => p.id === tp)) throw new Error(`buildModel: unknown input port '${tp}' on block '${tb}' (${dst.type})`);
    return { sourceBlock: sb, sourcePort: sp, targetBlock: tb, targetPort: tp };
  });
  const model: XModel = { blocks, connections };
  SPEC_PARAMS.set(model, specParams);
  return model;
}

export function runModel(model: XModel, options: RunOptions): RunResult {
  if (!(SOLVER_NAMES as readonly string[]).includes(options.solver)) {
    throw new Error(`runModel: unknown solver '${options.solver}'`);
  }
  const solver = options.solver as SolverName;
  const { dt, stopTime } = options;
  const startTime = options.startTime ?? 0;
  if (!(Number.isFinite(dt) && dt > 0)) throw new Error(`runModel: invalid dt ${dt}`);
  if (!Number.isFinite(stopTime) || !Number.isFinite(startTime) || stopTime < startTime) {
    throw new Error(`runModel: invalid time range [${startTime}, ${stopTime}]`);
  }
  const engine = new XbridgesEngine(model);
  engine.options = {
    solver: solver as SolverOptions['solver'], fixedStep: dt, startTime, stopTime,
    ...(options.relTol !== undefined ? { relTol: options.relTol } : {}),
    ...(options.absTol !== undefined ? { absTol: options.absTol } : {}),
  };
  const diagnostics = engine.compile(startTime);
  const signals: Record<string, unknown[]> = {};
  for (const p of options.probes) signals[p] = [];
  if (diagnostics.some((d) => d.severity === 'error')) return { t: [], signals: Object.fromEntries(options.probes.map((p) => [p, []])), diagnostics };

  const probeKeys = options.probes.map((p) => {
    const dot = p.indexOf('.');
    if (dot < 0) throw new Error(`runModel: malformed probe '${p}'`);
    return [p, p.slice(0, dot), p.slice(dot + 1)] as const;
  });
  const t: number[] = [];
  let pendingTime: number | null = null;
  const record = () => {
    t.push(pendingTime as number);
    pendingTime = null;
    for (const [p, b, port] of probeKeys) signals[p].push(engine.getSignalValue(b, port));
  };
  const allDiagnostics = () => [...diagnostics, ...engine.diagnostics.filter((d) => !diagnostics.includes(d))];
  // Sample on the canvas's own top-level computeOutputs call (instance wrapper, production code untouched).
  const original = engine.computeOutputs.bind(engine);
  engine.computeOutputs = ((time: number, temp?: Map<string, any>) => {
    const r = original(time, temp);
    if (temp === undefined && pendingTime !== null) record();
    return r;
  }) as typeof engine.computeOutputs;

  const specParams = SPEC_PARAMS.get(model);
  let time = startTime;
  for (let i = 0; !engine.hasFatalError(); i++) {
    const plan = liveStepAt(startTime, stopTime, dt, i);
    if (plan === null) { time = stopTime; break; }
    time = plan.time;
    const stepNow = plan.stepNow;
    if (specParams) for (const [id, p] of specParams) engine.applyParameterUpdates(id, p);
    pendingTime = time;
    const stepped = liveStep(engine, solver, time, stepNow);
    if (pendingTime !== null) record(); // the stepper made no top-level evaluation
    if (engine.hasFatalError() || !stepped) return { t, signals, diagnostics: allDiagnostics() };
    if (stepNow < dt) { time = stopTime; break; }
  }
  if (!engine.hasFatalError()) {
    pendingTime = time;
    original(time);
    if (pendingTime !== null) record();
  }
  return { t, signals, diagnostics: allDiagnostics() };
}
