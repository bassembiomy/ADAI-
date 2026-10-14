// WP-16: steppable engine sessions. Contract: plan §7.4
import { createAppSimulationSession, setSessionVariableValue, stepAppSimulationSession } from '../../utils/stateMachine/smAppAdapter';
import type { AppSimulationSession } from '../../utils/stateMachine/smAppAdapter';
import { XbridgesEngine } from '../xbridges/XbridgesEngine';
import { Solvers } from '../xbridges/Solvers';
import { BLOCK_LIBRARY } from '../xbridges/BlockDefinitions';
import { VLabPhysicsEngine } from '../vlab/vlabPhysics';
import { scalarSample } from '../vlab/vlabScopeRead';
import { parseSimTarget } from './simTarget';
import { extractXbInterface } from './xbInterface';
import { extractVlabInterface } from './vlabInterface';

export type SimEngine = 'sm' | 'xb' | 'vlab';
export interface SimDiagnostic { code: string; message: string; target?: string; /** one entry per underlying error when a single diagnostic summarises several */ details?: SimDiagnostic[] }
export interface SimSignalInfo { unit?: string; discrete: boolean }
export interface SimEngineSession {
  readonly engine: SimEngine;
  readonly hasInitialSample: boolean;
  initialize(): SimDiagnostic | null;
  read(target: string): number | null;
  write(target: string, value: number): SimDiagnostic | null;
  step(t: number, dt: number): SimDiagnostic | null;
  signalInfo(target: string): SimSignalInfo;
}
export interface SimSessionRequest { observe: string[]; drive: string[]; step: number }
/** Source of one engine: the state machine model, or a canvas of nodes and edges. */
export type SimSessionSource = any;

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export function engineOfSimTarget(target: string): SimEngine {
  const p = parseSimTarget(target);
  return p && (p.domain === 'xb' || p.domain === 'vlab') ? p.domain : 'sm';
}

export function engineModelOf(project: any, engine: SimEngine): unknown {
  if (engine === 'sm') {
    return {
      states: arr(project?.states), junctions: arr(project?.junctions), transitions: arr(project?.transitions),
      variables: arr(project?.variables), layers: project?.layers, tickMs: project?.tickMs,
      hilConfig: project?.hilConfig, safetyMode: project?.safetyMode,
    };
  }
  if (engine === 'xb') return { globalXBridgesNodes: arr(project?.globalXBridgesNodes), globalXBridgesEdges: arr(project?.globalXBridgesEdges) };
  return { vlabNodes: arr(project?.vlabNodes), vlabEdges: arr(project?.vlabEdges) };
}

const clone = <T,>(v: T): T => {
  try {
    return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
  } catch {
    return JSON.parse(JSON.stringify(v));
  }
};

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const dedupe = (list: string[]): string[] => [...new Set(list)];


// ---------------------------------------------------------------------------------------------- state machine

const DISCRETE_VAR = /^(bool|u?int\d*)$/;

function createSmSession(model: any, request: SimSessionRequest): { session: SimEngineSession | null; diagnostics: SimDiagnostic[] } {
  const varType = new Map<string, string>((model?.variables ?? []).map((v: any) => [v.id, String(v.type)]));
  const stateIds = new Set<string>((model?.states ?? []).map((s: any) => s.id));
  const diagnostics: SimDiagnostic[] = [];
  const driveIds = new Map<string, string>();
  const observed = new Map<string, { kind: 'var' | 'state'; id: string }>();

  for (const raw of dedupe(request.drive)) {
    const p = parseSimTarget(raw);
    if (!p || p.domain !== 'sm' || p.kind !== 'variable') {
      diagnostics.push({ code: 'UNSUPPORTED_TARGET', message: `stimulus target "${raw}" is not a state machine variable`, target: raw });
    } else if (!varType.has(p.id)) {
      diagnostics.push({ code: 'UNKNOWN_TARGET', message: `variable "${p.id}" is not in the model`, target: raw });
    } else driveIds.set(raw, p.id);
  }
  for (const raw of dedupe(request.observe)) {
    const parsed = parseSimTarget(raw);
    if (parsed) {
      if (parsed.domain !== 'sm' || parsed.kind !== 'variable') {
        diagnostics.push({ code: 'UNSUPPORTED_TARGET', message: `observe target "${raw}" is not supported`, target: raw });
      } else if (!varType.has(parsed.id)) {
        diagnostics.push({ code: 'UNKNOWN_TARGET', message: `variable "${parsed.id}" is not in the model`, target: raw });
      } else observed.set(raw, { kind: 'var', id: parsed.id });
    } else if (raw.startsWith('sim:')) {
      diagnostics.push({ code: 'UNSUPPORTED_TARGET', message: `observe target "${raw}" is not supported`, target: raw });
    } else if (stateIds.has(raw)) {
      observed.set(raw, { kind: 'state', id: raw });
    } else {
      diagnostics.push({ code: 'UNKNOWN_TARGET', message: `state "${raw}" is not in the model`, target: raw });
    }
  }
  if (diagnostics.length > 0) return { session: null, diagnostics };

  let app: AppSimulationSession;
  try {
    app = createAppSimulationSession(model);
  } catch (e) {
    return { session: null, diagnostics: [{ code: 'RUNTIME_ERROR', message: errMsg(e) }] };
  }
  const tickMs = app.ir.tickMs;
  const ticks = Math.round(request.step * 1000 / tickMs);
  if (!(ticks >= 1) || Math.abs(ticks * tickMs - request.step * 1000) > 1e-6) {
    return {
      session: null,
      diagnostics: [{ code: 'STEP_NOT_TICK_MULTIPLE', message: `step ${request.step}s is not a whole multiple of the model tick (${tickMs} ms)` }],
    };
  }

  let initialized = false;
  let frame = app.initialFrame;
  const session: SimEngineSession = {
    engine: 'sm',
    hasInitialSample: true,
    initialize() {
      initialized = true;
      return app.initialFrame.error ? { code: 'RUNTIME_ERROR', message: app.initialFrame.error } : null;
    },
    read(target) {
      const o = observed.get(target);
      if (!o || !initialized) return null;
      if (o.kind === 'state') return frame.activeStateIds.includes(o.id) ? 1 : 0;
      const raw = app.runtime.data[o.id];
      return typeof raw === 'boolean' ? (raw ? 1 : 0) : Number(raw);
    },
    write(target, value) {
      const id = driveIds.get(target);
      if (id === undefined) return { code: 'NOT_STIMULABLE', message: `"${target}" is not a drive target of this session`, target };
      setSessionVariableValue(app, id, value);
      return null;
    },
    step() {
      try {
        for (let i = 0; i < ticks; i++) {
          frame = stepAppSimulationSession(app, tickMs);
          if (frame.error) return { code: 'RUNTIME_ERROR', message: frame.error };
        }
      } catch (e) {
        return { code: 'RUNTIME_ERROR', message: errMsg(e) };
      }
      return null;
    },
    signalInfo(target) {
      const o = observed.get(target);
      if (o?.kind === 'state') return { discrete: true };
      const id = o?.id ?? driveIds.get(target);
      return { discrete: id !== undefined && DISCRETE_VAR.test(varType.get(id) ?? '') };
    },
  };
  return { session, diagnostics: [] };
}

// ------------------------------------------------------------------------------------------------ X-Bridges

type XbDrive = { kind: 'param'; blockId: string; name: string } | { kind: 'input'; blockId: string; portId: string };

function createXbSession(source: { canvas: string; nodes: any[]; edges?: any[] }, request: SimSessionRequest): { session: SimEngineSession | null; diagnostics: SimDiagnostic[] } {
  const nodes: any[] = Array.isArray(source.nodes) ? source.nodes : [];
  const edges: any[] = Array.isArray(source.edges) ? source.edges : [];
  const blocks: any[] = [];
  const unknownBlocks: string[] = [];
  for (const n of nodes) {
    const d = (n && typeof n.data === 'object' && n.data) ? n.data : {};
    const type: string = typeof d.type === 'string' ? d.type : n?.type;
    const id: string = typeof d.id === 'string' ? d.id : n?.id;
    if (typeof id !== 'string') { unknownBlocks.push('(no id)'); continue; }
    if (!BLOCK_LIBRARY[type]) { unknownBlocks.push(`${id} (type "${String(type)}")`); continue; }
    const params = clone(d.params ?? {});
    try {
      const fresh = BLOCK_LIBRARY[type](id, params);
      blocks.push({ ...fresh, id, params: { ...params, ...fresh.params } });
    } catch {
      unknownBlocks.push(`${id} (type "${String(type)}", rebuild failed)`);
    }
  }
  const connections = edges.map(e => ({
    sourceBlock: e.source, sourcePort: e.sourceHandle, targetBlock: e.target, targetPort: e.targetHandle,
  }));
  const blockById = new Map<string, any>(blocks.map(b => [b.id, b]));

  const diagnostics: SimDiagnostic[] = [];
  const bad = (code: string, message: string, target: string) => diagnostics.push({ code, message, target });
  const checkCanvas = (t: Exclude<ReturnType<typeof parseSimTarget>, null>, raw: string): boolean => {
    if (t.domain !== 'xb') { bad('UNSUPPORTED_TARGET', 'target belongs to another engine', raw); return false; }
    if (t.canvas.startsWith('state:') || source.canvas.startsWith('state:')) {
      bad('UNSUPPORTED_TARGET', 'models inside a state run in the state machine runner', raw); return false;
    }
    if (t.canvas !== source.canvas) { bad('UNKNOWN_TARGET', `canvas "${t.canvas}" is not the source canvas`, raw); return false; }
    return true;
  };

  for (const b of unknownBlocks) bad('UNKNOWN_BLOCK', `block ${b} cannot be rebuilt; refusing to run a different model than the canvas`, b.split(' ')[0]);

  const observed = new Map<string, { blockId: string; portId: string }>();
  for (const raw of dedupe(request.observe)) {
    const obs = parseSimTarget(raw);
    if (!obs) { bad('UNKNOWN_TARGET', 'observe is not a valid sim target', raw); continue; }
    if (!checkCanvas(obs, raw)) continue;
    if (obs.domain === 'xb' && obs.kind === 'port') {
      const b = blockById.get(obs.blockId);
      if (!b) bad('UNKNOWN_TARGET', `block "${obs.blockId}" not found`, raw);
      else if (![...(b.outputs ?? []), ...(b.inputs ?? [])].some((p: any) => p.id === obs.portId)) {
        bad('UNKNOWN_TARGET', `port "${obs.portId}" not found on block "${obs.blockId}"`, raw);
      } else observed.set(raw, { blockId: obs.blockId, portId: obs.portId });
    } else bad('UNKNOWN_TARGET', 'observe must name a block port', raw);
  }

  const drives = new Map<string, XbDrive>();
  for (const raw of dedupe(request.drive)) {
    const t = parseSimTarget(raw);
    if (!t) { bad('UNKNOWN_TARGET', 'stimulus is not a valid sim target', raw); continue; }
    if (!checkCanvas(t, raw)) continue;
    if (t.domain !== 'xb') continue;
    if (t.kind === 'param') {
      const b = blockById.get(t.blockId);
      if (!b) bad('UNKNOWN_TARGET', `block "${t.blockId}" not found`, raw);
      else if (!b.params || !(t.name in b.params)) bad('UNKNOWN_TARGET', `parameter "${t.name}" not found on block "${t.blockId}"`, raw);
      else drives.set(raw, { kind: 'param', blockId: t.blockId, name: t.name });
    } else if (t.kind === 'port') {
      const b = blockById.get(t.blockId);
      if (!b) { bad('UNKNOWN_TARGET', `block "${t.blockId}" not found`, raw); continue; }
      const isInput = (b.inputs ?? []).some((p: any) => p.id === t.portId);
      const isOutput = (b.outputs ?? []).some((p: any) => p.id === t.portId);
      if (!isInput && !isOutput) bad('UNKNOWN_TARGET', `port "${t.portId}" not found on block "${t.blockId}"`, raw);
      else if (!isInput || connections.some(c => c.targetBlock === t.blockId && c.targetPort === t.portId)) {
        bad('NOT_STIMULABLE', 'only unconnected input ports and block parameters can be driven', raw);
      } else drives.set(raw, { kind: 'input', blockId: t.blockId, portId: t.portId });
    } else bad('NOT_STIMULABLE', 'stimulus must be a block parameter or an unconnected input port', raw);
  }
  if (diagnostics.length > 0) return { session: null, diagnostics };

  let engine: XbridgesEngine;
  try {
    engine = new XbridgesEngine({ blocks, connections } as any);
  } catch (e) {
    return { session: null, diagnostics: [{ code: 'RUNTIME_ERROR', message: errMsg(e) }] };
  }
  let interfaceSignals: ReturnType<typeof extractXbInterface>['signals'] | null = null;
  const held = new Map<string, number>();
  let initialized = false;

  const apply = (target: string, d: XbDrive, v: number) => {
    if (d.kind === 'param') {
      engine.patchBlockParams(d.blockId, { [d.name]: v });
      // patching a block rebuilds its ports: put the held input values of that block back
      for (const [t2, v2] of held) {
        const d2 = drives.get(t2);
        if (d2 && d2.kind === 'input' && d2.blockId === d.blockId) apply(t2, d2, v2);
      }
    } else {
      const port = engine.getBlock(d.blockId)?.inputs.find(p => p.id === d.portId);
      if (port) port.value = v;
    }
  };

  const session: SimEngineSession = {
    engine: 'xb',
    hasInitialSample: true,
    initialize() {
      try {
        const compileDiags = engine.compile(0);
        const errors = compileDiags.filter(d => d.severity === 'error');
        if (errors.length > 0) {
          const details = errors.map(d => ({ code: 'RUNTIME_ERROR', message: `${d.code}: ${d.message}` }));
          return { code: 'RUNTIME_ERROR', message: details.map(d => d.message).join('; '), details };
        }
        initialized = true;
        for (const [target, v] of held) {
          const d = drives.get(target)!;
          if (d.kind === 'param') apply(target, d, v);
        }
        for (const [target, v] of held) {
          const d = drives.get(target)!;
          if (d.kind === 'input') apply(target, d, v);
        }
        engine.computeOutputs(0);
      } catch (e) {
        return { code: 'RUNTIME_ERROR', message: errMsg(e) };
      }
      return null;
    },
    read(target) {
      const o = observed.get(target);
      if (!o || !initialized) return null;
      const v = engine.getSignalValue(o.blockId, o.portId);
      return typeof v === 'number' ? v : null;
    },
    write(target, value) {
      const d = drives.get(target);
      if (!d) return { code: 'NOT_STIMULABLE', message: `"${target}" is not a drive target of this session`, target };
      held.set(target, value);
      try {
        if (initialized) apply(target, d, value);
      } catch (e) {
        return { code: 'RUNTIME_ERROR', message: errMsg(e), target };
      }
      return null;
    },
    step(t, dt) {
      try {
        Solvers.stepRK4(engine, t, dt);
        engine.computeOutputs(t + dt);
      } catch (e) {
        return { code: 'RUNTIME_ERROR', message: errMsg(e) };
      }
      return null;
    },
    signalInfo(target) {
      const o = observed.get(target);
      if (!o) return { discrete: false };
      interfaceSignals ??= extractXbInterface({ canvas: source.canvas, nodes, edges }).signals;
      const sig = interfaceSignals.find(x => x.blockId === o.blockId && x.portId === o.portId);
      return sig?.unit !== undefined ? { unit: sig.unit, discrete: false } : { discrete: false };
    },
  };
  return { session, diagnostics: [] };
}

// -------------------------------------------------------------------------------------------------- V-Lab

const VLAB_PROBE = '__trm_probe';

function createVlabSession(source: { canvas: string; nodes: any[]; edges?: any[] }, request: SimSessionRequest): { session: SimEngineSession | null; diagnostics: SimDiagnostic[] } {
  const srcNodes: any[] = Array.isArray(source.nodes) ? source.nodes : [];
  const srcEdges: any[] = Array.isArray(source.edges) ? source.edges : [];
  const iface = extractVlabInterface({ canvas: source.canvas, nodes: srcNodes, edges: srcEdges });
  const canvasOk = (t: { canvas: string }) => t.canvas === source.canvas;
  const diagnostics: SimDiagnostic[] = [];
  const bad = (code: string, message: string, target: string) => { diagnostics.push({ code, message, target }); };

  const probes: { target: string; probeId: string; blockId: string; portId: string }[] = [];
  const vars: { target: string; name: string }[] = [];
  const units = new Map<string, string | undefined>();
  for (const raw of dedupe(request.observe)) {
    const obs = parseSimTarget(raw);
    if (!obs) { bad('UNKNOWN_TARGET', `Cannot parse observe target "${raw}"`, raw); continue; }
    if (obs.domain !== 'vlab') { bad('UNSUPPORTED_TARGET', `Target "${raw}" is not a V-Lab target`, raw); continue; }
    if (!canvasOk(obs)) { bad('UNKNOWN_TARGET', `Canvas "${obs.canvas}" is not "${source.canvas}"`, raw); continue; }
    if (obs.kind === 'solverVariable') {
      vars.push({ target: raw, name: obs.name });
    } else if (obs.kind === 'port') {
      const sig = iface.signals.find(s => s.blockId === obs.blockId && s.portId === obs.portId);
      if (!sig) { bad('UNKNOWN_TARGET', `Unknown port "${raw}"`, raw); continue; }
      if (sig.kind === 'conserving') { bad('NOT_OBSERVABLE', `Port "${raw}" is conserving; observe it through a sensor block`, raw); continue; }
      if (sig.direction !== 'observe') { bad('NOT_OBSERVABLE', `Port "${raw}" is an input`, raw); continue; }
      probes.push({ target: raw, probeId: `${VLAB_PROBE}_${probes.length}`, blockId: obs.blockId, portId: obs.portId });
      units.set(raw, sig.unit);
    } else {
      bad('UNKNOWN_TARGET', `Target "${raw}" is not an observable signal or solver variable`, raw);
    }
  }

  const drives = new Map<string, { blockId: string; name: string; spec: (typeof iface.parameters)[number] }>();
  for (const raw of dedupe(request.drive)) {
    const t = parseSimTarget(raw);
    if (!t) { bad('UNKNOWN_TARGET', `Cannot parse stimulus target "${raw}"`, raw); continue; }
    if (t.domain !== 'vlab') { bad('UNSUPPORTED_TARGET', `Target "${raw}" is not a V-Lab target`, raw); continue; }
    if (!canvasOk(t)) { bad('UNKNOWN_TARGET', `Canvas "${t.canvas}" is not "${source.canvas}"`, raw); continue; }
    if (t.kind === 'port') {
      if (!iface.signals.some(x => x.blockId === t.blockId && x.portId === t.portId)) bad('UNKNOWN_TARGET', `Unknown port "${raw}"`, raw);
      else bad('NOT_STIMULABLE', `Port "${raw}" cannot be driven; drive a parameter instead`, raw);
      continue;
    }
    if (t.kind !== 'param') { bad('NOT_STIMULABLE', `Target "${raw}" cannot be driven`, raw); continue; }
    const p = iface.parameters.find(x => x.blockId === t.blockId && x.key === t.name);
    if (!p) { bad('UNKNOWN_TARGET', `Unknown parameter "${raw}"`, raw); continue; }
    drives.set(raw, { blockId: t.blockId, name: t.name, spec: p });
  }
  if (diagnostics.length > 0) return { session: null, diagnostics };

  const engine = new VLabPhysicsEngine();
  const probeEdges = probes.map((p, i) => ({
    id: `__trm_probe_e_${i}`, source: p.blockId, sourceHandle: p.portId + '_s', target: p.probeId, targetHandle: 'in1_t',
  }));
  const edges = [...srcEdges, ...probeEdges];
  const held = new Map<string, Record<string, number>>();
  const values = new Map<string, number>();
  let state: any = undefined;

  const session: SimEngineSession = {
    engine: 'vlab',
    hasInitialSample: false,
    initialize() { return null; },
    read(target) { return values.has(target) ? values.get(target)! : null; },
    write(target, value) {
      const d = drives.get(target);
      if (!d) return { code: 'NOT_STIMULABLE', message: `"${target}" is not a drive target of this session`, target };
      const p = d.spec;
      const violates = !Number.isFinite(value)
        || (p.min !== undefined && (p.exclusiveMin ? value <= p.min : value < p.min))
        || (p.max !== undefined && (p.exclusiveMax ? value >= p.max : value > p.max))
        || (p.nonZero === true && value === 0);
      if (violates) return { code: 'OUT_OF_BOUNDS', message: `Value ${value} violates the bounds of "${target}"`, target };
      held.set(d.blockId, { ...(held.get(d.blockId) ?? {}), [d.name]: value });
      return null;
    },
    step(_t, dt) {
      try {
        const nodes: any[] = srcNodes.map(n => {
          const mine = n ? held.get(n.id) : undefined;
          if (!mine) return n;
          return { ...n, data: { ...n.data, params: { ...(n.data?.params ?? {}), ...mine } } };
        });
        for (const p of probes) {
          nodes.push({ id: p.probeId, type: 'default', position: { x: 0, y: 0 }, data: { type: 'scope', params: { numSignals: 1 } } });
        }
        state = engine.simulateStep(nodes, edges, state, dt);
        const next = new Map<string, number>();
        for (const v of vars) {
          const idx = (state.variableNames ?? []).indexOf(v.name);
          if (idx < 0) return { code: 'UNKNOWN_TARGET', message: `Unknown solver variable "${v.name}"`, target: v.target };
          next.set(v.target, scalarSample(state.x[idx], { scopeId: VLAB_PROBE, channel: 0, variable: v.name }));
        }
        for (const p of probes) {
          const pv = state.perScopeValues?.[p.probeId];
          const raw = pv !== null && typeof pv === 'object' && !Array.isArray(pv) && 'value' in pv ? (pv as any).value : pv;
          next.set(p.target, scalarSample(raw, { scopeId: p.probeId, channel: 0, variable: undefined }));
        }
        for (const [k, v] of next) values.set(k, v);
      } catch (e) {
        return { code: 'RUNTIME_ERROR', message: errMsg(e) };
      }
      return null;
    },
    signalInfo(target) {
      const unit = units.get(target);
      return unit !== undefined ? { unit, discrete: false } : { discrete: false };
    },
  };
  return { session, diagnostics: [] };
}

// ------------------------------------------------------------------------------------------------- factory

/**
 * Session over an engine source: the state machine model for `sm`, `{ canvas, nodes, edges }` for `xb` / `vlab`.
 * Used by the WP-08 runners, which work on one canvas; `createSimSession` is the project-level entry point.
 */
export function createSimSessionFromSource(engine: SimEngine, source: SimSessionSource, request: SimSessionRequest): { session: SimEngineSession | null; diagnostics: SimDiagnostic[] } {
  if (engine === 'sm') return createSmSession(source, request);
  if (engine === 'xb') return createXbSession(source, request);
  return createVlabSession(source, request);
}

export function createSimSession(engine: SimEngine, project: any, request: SimSessionRequest): { session: SimEngineSession | null; diagnostics: SimDiagnostic[] } {
  const model: any = engineModelOf(project, engine);
  if (engine === 'sm') return createSmSession(model, request);
  if (engine === 'xb') return createXbSession({ canvas: 'global', nodes: model.globalXBridgesNodes, edges: model.globalXBridgesEdges }, request);
  return createVlabSession({ canvas: 'global', nodes: model.vlabNodes, edges: model.vlabEdges }, request);
}
