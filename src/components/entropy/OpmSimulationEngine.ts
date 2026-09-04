/**
 * ENTROPY OPM Simulation Engine (pure TypeScript, no React).
 *
 * Execution semantics per ISO 19450:
 *  - Objects hold exactly one active state (or none).
 *  - A process fires when ALL of its enablers hold:
 *      consumption  → the source state is currently active (and gets consumed)
 *      condition    → the source state is currently active (object unaffected)
 *      agent/instrument → the source object has an active state if it has any states
 *      trigger      → the source state entered (a pending event exists for it) AND is active
 *  - Firing applies postconditions:
 *      result  → target state becomes active (state created)
 *      effect  → target state becomes active (state changed)
 *      consumption → the source state is deactivated (state destroyed)
 *  - Every state entry emits an event usable by trigger links on the NEXT tick.
 *  - If several eligible processes consume the same state, the process whose name
 *    sorts first wins; the others are blocked that tick (deterministic conflict resolution).
 */
import type { AppNode, AppEdge } from './EntropyTypes';
import { compileExecutableOpm, type ExecutableOpmModel } from '../../engine/opm/pipeline';
import { createOpmRuntime, stepOpmRuntime, type OpmStepResult, type OpmRuntime } from '../../engine/opm/runtime';
import { createDefaultOpmExecutionConfig, type OpmDiagnostic, type OpmExecutionConfig, type OpmTargetSettings } from '../../engine/opm/executableTypes';

export interface OpmEvent {
  stateId: string;
  objectId: string;
  tick: number;
}

export interface OpmTraceStateChange {
  objectId: string;
  fromStateId: string | null;
  toStateId: string | null;
}

export interface OpmTraceEntry {
  tick: number;
  processId: string;
  processName: string;
  kind: 'fired' | 'blocked';
  reason?: string;
  stateChanges: OpmTraceStateChange[];
}

export interface OpmSimLog {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface OpmSimulationState {
  tick: number;
  /** objectId -> active stateId, or null when the object has no active state */
  objectActiveState: Record<string, string | null>;
  pendingEvents: OpmEvent[];
  trace: OpmTraceEntry[];
  /** processId -> last tick at which the process changed any state (animation detection) */
  lastChangeTick: Record<string, number>;
  /** processId -> last blocked-reason that was logged (prevents log spam) */
  lastLoggedBlock: Record<string, string>;
  finished: boolean;
}

export function createSimulationState(): OpmSimulationState {
  return {
    tick: 0,
    objectActiveState: {},
    pendingEvents: [],
    trace: [],
    lastChangeTick: {},
    lastLoggedBlock: {},
    finished: false,
  };
}

export function initializeSimulation(nodes: AppNode[]): OpmSimulationState {
  const state = createSimulationState();
  nodes
    .filter(n => n.data.type === 'object')
    .forEach(obj => {
      const childStates = nodes.filter(
        n => n.data.type === 'state' && (n.parentId === obj.id || n.data.parentId === obj.id)
      );
      if (childStates.length > 0) {
        state.objectActiveState[obj.id] = childStates[0].id;
      }
    });
  return state;
}

export interface ProcessEligibility {
  eligible: string[];
  /** processId -> human-readable reason it is blocked this tick */
  blocked: Record<string, string>;
}

function childStatesOf(nodes: AppNode[], objectId: string): AppNode[] {
  return nodes.filter(
    n => n.data.type === 'state' && (n.parentId === objectId || n.data.parentId === objectId)
  );
}

export function evaluateProcessEligibility(
  nodes: AppNode[],
  edges: AppEdge[],
  objectActiveState: Record<string, string | null>,
  pendingEvents: OpmEvent[]
): ProcessEligibility {
  const nodeById = new Map(nodes.map(n => [n.id, n] as const));
  const eligible: string[] = [];
  const blocked: Record<string, string> = {};

  nodes
    .filter(n => n.data.type === 'process')
    .forEach(proc => {
      let reason: string | null = null;

      const checkStateLink = (
        linkType: string,
        predicate: (stateNode: AppNode, isActive: boolean) => boolean,
        describe: (stateNode: AppNode) => string
      ): void => {
        if (reason) return;
        const links = edges.filter(e => e.target === proc.id && e.data?.type === linkType);
        for (const link of links) {
          const src = nodeById.get(link.source);
          if (!src || src.data.type !== 'state') continue; // object-level source: not checkable per-state
          const parentId = src.parentId || src.data.parentId || null;
          const isActive = parentId != null && objectActiveState[parentId] === src.id;
          if (!predicate(src, isActive)) {
            reason = describe(src);
            return;
          }
        }
      };

      // consumption: state must be active; it will be destroyed when the process fires
      checkStateLink(
        'consumption',
        (_s, isActive) => isActive,
        s => `consumed state [${s.data.name}] is not active`
      );

      // condition: state must be active
      checkStateLink(
        'condition',
        (_s, isActive) => isActive,
        s => `condition [${s.data.name}] is not met`
      );

      // trigger: a pending event for this state must exist AND the state must be active
      checkStateLink(
        'trigger',
        (s, isActive) =>
          isActive && pendingEvents.some(ev => ev.stateId === s.id),
        s => `waiting for trigger event [${s.data.name}]`
      );

      // agent / instrument: enabler — if the object has states, one must be active
      (['agent', 'instrument'] as const).forEach(linkType => {
        if (reason) return;
        const links = edges.filter(e => e.target === proc.id && e.data?.type === linkType);
        for (const link of links) {
          const src = nodeById.get(link.source);
          if (!src) continue;
          const states = childStatesOf(nodes, src.id);
          if (states.length === 0) continue; // stateless enabler is always available
          const active = objectActiveState[src.id] ?? null;
          if (!active) {
            reason = `enabler [${src.data.name}] has no active state`;
            return;
          }
        }
      });

      if (reason) blocked[proc.id] = reason;
      else eligible.push(proc.id);
    });

  return { eligible, blocked };
}

const ANIMATION_TICK_LIMIT = 5;

export interface OpmSimTickResult {
  state: OpmSimulationState;
  firingProcessIds: string[];
  logs: OpmSimLog[];
}

function stateNodeName(nodes: AppNode[], stateId: string): string {
  const s = nodes.find(n => n.id === stateId);
  return s ? s.data.name : stateId;
}

export function stepSimulation(
  nodes: AppNode[],
  edges: AppEdge[],
  prev: OpmSimulationState
): OpmSimTickResult {
  const tick = prev.tick + 1;
  const logs: OpmSimLog[] = [];
  const nodeById = new Map(nodes.map(n => [n.id, n] as const));
  const objectActiveState: Record<string, string | null> = { ...prev.objectActiveState };
  const processes = nodes.filter(n => n.data.type === 'process');
  const processById = new Map(processes.map(n => [n.id, n] as const));

  // 1. Eligibility
  const eligibility = evaluateProcessEligibility(nodes, edges, objectActiveState, prev.pendingEvents);

  // 2. Deterministic conflict resolution over consumed states
  const consumerOfState = new Map<string, string>(); // stateId -> winning processId
  const fired = new Set<string>();
  const blocked: Record<string, string> = { ...eligibility.blocked };

  const sortedEligible = [...eligibility.eligible].sort((a, b) => {
    const na = processById.get(a)?.data.name ?? '';
    const nb = processById.get(b)?.data.name ?? '';
    return na.localeCompare(nb) || a.localeCompare(b);
  });

  for (const procId of sortedEligible) {
    const conflict = edges.find(
      e => e.target === procId && e.data?.type === 'consumption' && consumerOfState.has(e.source)
    );
    if (conflict) {
      const winner = processById.get(consumerOfState.get(conflict.source)!);
      blocked[procId] = `lost conflict: state already consumed by [${winner?.data.name ?? '?'}]`;
    } else {
      fired.add(procId);
      edges
        .filter(e => e.target === procId && e.data?.type === 'consumption')
        .forEach(e => consumerOfState.set(e.source, procId));
    }
  }

  // 3. Postconditions of firing processes
  const nextActive = new Map<string, string>(); // objectId -> stateId
  const toDeactivate = new Set<string>();

  fired.forEach(procId => {
    edges
      .filter(e => e.source === procId && (e.data?.type === 'result' || e.data?.type === 'effect'))
      .forEach(e => {
        const tgt = nodeById.get(e.target);
        const parentId = tgt ? tgt.parentId || tgt.data.parentId : null;
        if (tgt && tgt.data.type === 'state' && parentId) {
          nextActive.set(parentId, tgt.id);
        }
      });
    edges
      .filter(e => e.target === procId && e.data?.type === 'consumption')
      .forEach(e => {
        const src = nodeById.get(e.source);
        if (src && src.data.type === 'state') toDeactivate.add(src.id);
      });
  });

  // 4. Apply state changes, emit events
  const stateChanges: OpmTraceStateChange[] = [];
  const newEvents: OpmEvent[] = [];

  nodes
    .filter(n => n.data.type === 'object')
    .forEach(obj => {
      const before = objectActiveState[obj.id] ?? null;
      let after = before;
      if (nextActive.has(obj.id)) after = nextActive.get(obj.id)!;
      else if (before && toDeactivate.has(before)) after = null;
      objectActiveState[obj.id] = after;

      if (before !== after) {
        stateChanges.push({ objectId: obj.id, fromStateId: before, toStateId: after });
        if (after) newEvents.push({ stateId: after, objectId: obj.id, tick });
        const fromName = before ? stateNodeName(nodes, before) : 'none';
        const toName = after ? stateNodeName(nodes, after) : 'none';
        logs.push({ type: 'success', message: `Object [${obj.data.name}]: ${fromName} → ${toName}` });
      }
    });

  // 5. Trace + logs (blocked reasons only logged when the reason changes — no spam)
  fired.forEach(procId => {
    logs.push({ type: 'info', message: `Process [${processById.get(procId)!.data.name}] fired.` });
  });
  Object.entries(blocked).forEach(([procId, reason]) => {
    const proc = processById.get(procId);
    if (proc && prev.lastLoggedBlock[procId] !== reason) {
      logs.push({ type: 'info', message: `Process [${proc.data.name}] blocked: ${reason}.` });
    }
  });

  // 6. Animation detection (process firing without changing anything = endless loop)
  const lastChangeTick = { ...prev.lastChangeTick };
  fired.forEach(procId => {
    if (stateChanges.length > 0) lastChangeTick[procId] = tick;
  });
  fired.forEach(procId => {
    const lastChange = lastChangeTick[procId] ?? tick;
    if (tick - lastChange >= ANIMATION_TICK_LIMIT) {
      logs.push({
        type: 'warning',
        message: `Process [${processById.get(procId)!.data.name}] is animating: fired ${
          tick - lastChange
        } ticks without changing any state.`,
      });
    }
  });

  const trace: OpmTraceEntry[] = [
    ...prev.trace,
    ...[...fired].map(procId => ({
      tick,
      processId: procId,
      processName: processById.get(procId)!.data.name,
      kind: 'fired' as const,
      stateChanges,
    })),
    ...Object.entries(blocked).map(([procId, reason]) => ({
      tick,
      processId: procId,
      processName: processById.get(procId)?.data.name ?? procId,
      kind: 'blocked' as const,
      reason,
      stateChanges: [] as OpmTraceStateChange[],
    })),
  ];

  const state: OpmSimulationState = {
    tick,
    objectActiveState,
    pendingEvents: newEvents,
    trace,
    lastChangeTick,
    lastLoggedBlock: { ...prev.lastLoggedBlock, ...blocked },
    finished: fired.size === 0 && newEvents.length === 0,
  };

  return { state, firingProcessIds: [...fired], logs };
}

export function applySimResultToNodes(
  nodes: AppNode[],
  sim: OpmSimulationState,
  firingProcessIds: string[]
): AppNode[] {
  return nodes.map(n => {
    if (n.data.type === 'process') {
      const isFiring = firingProcessIds.includes(n.id);
      return isFiring !== Boolean((n.data as any).isFiring)
        ? { ...n, data: { ...n.data, isFiring } }
        : n;
    }
    if (n.data.type === 'state') {
      const parentId = n.parentId || n.data.parentId || null;
      const isActive = parentId != null && sim.objectActiveState[parentId] === n.id;
      return isActive !== Boolean((n.data as any).isActive)
        ? { ...n, data: { ...n.data, isActive } }
        : n;
    }
    if (n.data.type === 'object') {
      const activeId = sim.objectActiveState[n.id] ?? null;
      const states = (n.data.states || []).map(s => ({ ...s, isActive: s.id === activeId }));
      return { ...n, data: { ...n.data, states } };
    }
    return n;
  });
}

export interface OpmSimulationController {
  compile(nodes: AppNode[], edges: AppEdge[], config?: OpmExecutionConfig | OpmTargetSettings): {
    ok: boolean;
    diagnostics: OpmDiagnostic[];
  };
  step(
    input?:
      | number
      | {
          deltaMs?: number;
          events?: string[];
          inputs?: Record<string, boolean | number | string>;
        },
  ): OpmStepResult | null;
  getSnapshot(): OpmStepResult | null;
}

export function createOpmSimulationController(): OpmSimulationController {
  let runtime: OpmRuntime | null = null;
  let snapshot: OpmStepResult | null = null;

  return {
    compile(nodes, edges, config = createDefaultOpmExecutionConfig()) {
      const result = compileExecutableOpm(nodes as any, edges as any, config);
      if (!result.model) {
        runtime = null;
        snapshot = null;
        return { ok: false, diagnostics: result.diagnostics };
      }
      runtime = createOpmRuntime(result.model as ExecutableOpmModel);
      snapshot = null;
      return { ok: true, diagnostics: result.diagnostics };
    },
    step(input = 10) {
      if (!runtime) return snapshot;
      snapshot = stepOpmRuntime(runtime, input as any);
      return snapshot;
    },
    getSnapshot() {
      return snapshot;
    },
  };
}
