/**
 * Canonical TypeScript runtime for executable OPM models.
 * Implements deterministic snapshot evaluation, FIFO event queues,
 * priority conflict resolution, state transitions, debounce, cyclic timers,
 * and step tracing.
 *
 * Canonical step semantics (fail-closed):
 * - Gating links (targeting a process, or sourced outside any process) are
 *   evaluated against an immutable snapshot. Failed guard/expression
 *   evaluation deactivates the link instead of fabricating a value.
 * - A process fires only from gating links, timers, debounce, and guards.
 * - Process-originating result links (process -> non-process) activate only
 *   when their source process fired this step AND their own guard/event
 *   checks pass on the immutable snapshot.
 * - Failed assignment expressions stage nothing; prior committed values are
 *   preserved and a diagnostic is emitted.
 * - All configured capacities (maxStagedWrites, maxTransitions,
 *   traceCapacity, eventQueueCapacity) are enforced deterministically.
 * - Only accepted (queued) events are consumed, one FIFO occurrence per step.
 * - Every step returns a complete machine-readable snapshot.
 */

import type {
  ExecutableOpmModel,
  CompiledOpmAssignment,
} from './pipeline';
import type {
  OpmDiagnostic,
  OpmSourceRef,
  OpmRuntimeLifecycle,
  OpmRuntimeStatus,
  OpmCommittedTransition,
} from './executableTypes';
import type { TypedExpressionIr } from './expressionCompiler';
import {
  OPM_RUNTIME_PHASES,
  OPM_DIAGNOSTIC_CODES,
  sortByPriorityThenOrder,
  sortStagedWritesDeterministic,
  boundedPush,
  coerceOpmNumeric,
  computeStepStatus,
  computeStepLifecycle,
  computeFinished,
  type OpmRuntimePhase,
} from './runtimeSemantics';

const UINT32_MAX = 4294967295;

export interface StagedWrite {
  attributeId: string;
  targetCIdentifier: string;
  operator: string;
  value: boolean | number | string;
  sourceProcessId?: string;
  priority: number;
}

/** Canonical committed transition (alias of OpmCommittedTransition). */
export type CommittedTransition = OpmCommittedTransition;

export interface OpmTraceRecord {
  phase: OpmRuntimePhase;
  description: string;
  elementId?: string;
  data?: Record<string, unknown>;
}

export interface OpmStepResult {
  stepIndex: number;
  timeMs: number;
  status: OpmRuntimeStatus;
  lifecycle: OpmRuntimeLifecycle;
  finished: boolean;
  values: Record<string, boolean | number | string>;
  activeStates: Record<string, string>;
  queuedEventIds: string[];
  stateTimersMs: Record<string, number>;
  processTimersMs: Record<string, number>;
  consumedEventIds: string[];
  firedProcessIds: string[];
  blockedProcessIds: string[];
  traversedLinkIds: string[];
  stagedWrites: StagedWrite[];
  committedWrites: StagedWrite[];
  committedWriteIds: string[];
  transitions: CommittedTransition[];
  diagnostics: OpmDiagnostic[];
  trace: OpmTraceRecord[];
}

interface DelayedTransitionRecord {
  linkId: string;
  ownerObjectId: string;
  sourceStateId?: string;
  targetStateId: string;
  remainingMs: number;
  priority: number;
}

export interface OpmRuntime {
  readonly modelFingerprint: string;
  readonly model: ExecutableOpmModel;
  stepIndex: number;
  timeMs: number;
  values: Record<string, boolean | number | string>;
  activeStates: Record<string, string>; // ownerObjectId -> activeStateId
  stateTimeouts: Record<string, number>; // stateId -> elapsedMs
  processTimers: Record<string, number>; // processId -> accumulated elapsedMs for cyclic activation
  processLastFiredTime: Record<string, number>; // processId -> timeMs when it last fired (for debounce)
  eventQueue: string[];
  delayedTransitions: DelayedTransitionRecord[];
  ioInputs: Record<string, boolean | number | string>;
  ioOutputs: Record<string, boolean | number | string>;
}

export function evaluateExpression(
  ir: TypedExpressionIr,
  snapshot: Record<string, boolean | number | string>,
  diagnostics?: OpmDiagnostic[],
  source?: OpmSourceRef,
): boolean | number | string {
  if (ir.kind === 'literal') {
    return ir.value;
  }
  if (ir.kind === 'reference') {
    if (snapshot[ir.symbolId] !== undefined) {
      return snapshot[ir.symbolId];
    }
    if (snapshot[ir.cIdentifier] !== undefined) {
      return snapshot[ir.cIdentifier];
    }
    if (snapshot[ir.name] !== undefined) {
      return snapshot[ir.name];
    }
    if (diagnostics && source) {
      diagnostics.push({
        code: OPM_DIAGNOSTIC_CODES.UNBOUND_VARIABLE,
        severity: 'error',
        message: `Variable "${ir.name}" (${ir.symbolId}) is unbound in runtime snapshot.`,
        source,
      });
    }
    return 0;
  }
  if (ir.kind === 'unary') {
    const val = evaluateExpression(ir.operand, snapshot, diagnostics, source);
    if (ir.op === 'not') return !val;
    if (ir.op === 'negate') return -Number(val);
    return +Number(val);
  }
  if (ir.kind === 'binary') {
    const left = evaluateExpression(ir.left, snapshot, diagnostics, source);
    const right = evaluateExpression(ir.right, snapshot, diagnostics, source);

    switch (ir.op) {
      case 'add': return Number(left) + Number(right);
      case 'subtract': return Number(left) - Number(right);
      case 'multiply': return Number(left) * Number(right);
      case 'divide': {
        const rNum = Number(right);
        if (rNum === 0) {
          if (diagnostics && source) {
            diagnostics.push({
              code: OPM_DIAGNOSTIC_CODES.EXPR_DIV_ZERO,
              severity: 'error',
              message: 'Division by zero in runtime expression.',
              source,
            });
          }
          return 0;
        }
        return Number(left) / rNum;
      }
      case 'modulo': {
        const rNum = Number(right);
        if (rNum === 0) {
          if (diagnostics && source) {
            diagnostics.push({
              code: OPM_DIAGNOSTIC_CODES.EXPR_DIV_ZERO,
              severity: 'error',
              message: 'Modulo by zero in runtime expression.',
              source,
            });
          }
          return 0;
        }
        return Number(left) % rNum;
      }
      case 'and': return Boolean(left) && Boolean(right);
      case 'or': return Boolean(left) || Boolean(right);
      case 'equal': return left === right;
      case 'notEqual': return left !== right;
      case 'lessThan': return Number(left) < Number(right);
      case 'lessEqual': return Number(left) <= Number(right);
      case 'greaterThan': return Number(left) > Number(right);
      case 'greaterEqual': return Number(left) >= Number(right);
    }
  }
  if (ir.kind === 'intrinsic') {
    const args = ir.args.map(a => Number(evaluateExpression(a, snapshot, diagnostics, source)));
    if (ir.name === 'abs') return Math.abs(args[0]);
    if (ir.name === 'min') return Math.min(args[0], args[1]);
    if (ir.name === 'max') return Math.max(args[0], args[1]);
    if (ir.name === 'clamp') return Math.max(args[1], Math.min(args[2], args[0]));
  }
  return 0;
}

/**
 * Fail-closed expression evaluation: returns ok=false when evaluation
 * emitted a new error diagnostic. Callers must stage nothing on failure.
 */
export function tryEvaluateExpression(
  ir: TypedExpressionIr,
  snapshot: Record<string, boolean | number | string>,
  diagnostics: OpmDiagnostic[],
  source: OpmSourceRef,
): { ok: boolean; value: boolean | number | string } {
  const before = diagnostics.length;
  const value = evaluateExpression(ir, snapshot, diagnostics, source);
  for (let i = before; i < diagnostics.length; i++) {
    if (diagnostics[i].severity === 'error') {
      return { ok: false, value };
    }
  }
  return { ok: true, value };
}

export function createOpmRuntime(model: ExecutableOpmModel): OpmRuntime {
  const values: Record<string, boolean | number | string> = {};
  const activeStates: Record<string, string> = {};

  // Initialize object attribute values and aliases
  for (const obj of model.objects) {
    for (const attr of obj.attributes) {
      const initial = attr.initialValue;
      let runtimeValue: boolean | number | string;
      if (typeof initial === 'object' && initial !== null && 'memberId' in initial) {
        runtimeValue = (initial as { memberId: string }).memberId;
      } else if (typeof initial === 'boolean' || typeof initial === 'number' || typeof initial === 'string') {
        runtimeValue = initial;
      } else {
        runtimeValue = 0;
      }
      values[attr.id] = runtimeValue;
      values[attr.cIdentifier] = runtimeValue;
    }
    if (obj.initialStateId) {
      activeStates[obj.id] = obj.initialStateId;
    }
  }

  const runtime: OpmRuntime = {
    modelFingerprint: model.fingerprint,
    model,
    stepIndex: 0,
    timeMs: 0,
    values,
    activeStates,
    stateTimeouts: {},
    processTimers: {},
    processLastFiredTime: {},
    eventQueue: [],
    delayedTransitions: [],
    ioInputs: {},
    ioOutputs: {},
  };

  return runtime;
}

export function resetOpmRuntime(runtime: OpmRuntime): void {
  const fresh = createOpmRuntime(runtime.model);
  runtime.stepIndex = 0;
  runtime.timeMs = 0;
  runtime.values = fresh.values;
  runtime.activeStates = fresh.activeStates;
  runtime.stateTimeouts = {};
  runtime.processTimers = {};
  runtime.processLastFiredTime = {};
  runtime.eventQueue = [];
  runtime.delayedTransitions = [];
  runtime.ioInputs = {};
  runtime.ioOutputs = {};
}

export function dispatchOpmEvent(
  runtime: OpmRuntime,
  eventId: string,
  diagnostics?: OpmDiagnostic[],
): 'accepted' | 'overflow' | 'unknownEvent' {
  const eventExists = runtime.model.events.some(e => e.id === eventId);
  if (!eventExists) {
    return 'unknownEvent';
  }

  const capacity = runtime.model.settings.eventQueueCapacity;
  if (runtime.eventQueue.length >= capacity) {
    diagnostics?.push({
      code: OPM_DIAGNOSTIC_CODES.EVENT_QUEUE_OVERFLOW,
      severity: 'error',
      message: `Event queue exceeds eventQueueCapacity (${capacity}); overflow policy "${runtime.model.settings.eventOverflow}" applied for event "${eventId}".`,
      source: { elementId: 'settings', propertyPath: 'settings.eventQueueCapacity' },
    });
    if (runtime.model.settings.eventOverflow === 'rejectNewest') {
      return 'overflow';
    }
    // dropOldest: remove the oldest event
    runtime.eventQueue.shift();
  }

  runtime.eventQueue.push(eventId);
  return 'accepted';
}

function buildFaultedResult(
  runtime: OpmRuntime,
  diagnostics: OpmDiagnostic[],
  trace: OpmTraceRecord[],
): OpmStepResult {
  return {
    stepIndex: runtime.stepIndex,
    timeMs: runtime.timeMs,
    status: computeStepStatus(diagnostics),
    lifecycle: 'faulted',
    finished: false,
    values: { ...runtime.values },
    activeStates: { ...runtime.activeStates },
    queuedEventIds: [...runtime.eventQueue],
    stateTimersMs: { ...runtime.stateTimeouts },
    processTimersMs: { ...runtime.processTimers },
    consumedEventIds: [],
    firedProcessIds: [],
    blockedProcessIds: [],
    traversedLinkIds: [],
    stagedWrites: [],
    committedWrites: [],
    committedWriteIds: [],
    transitions: [],
    diagnostics,
    trace,
  };
}

export function stepOpmRuntime(runtime: OpmRuntime, deltaMs: number): OpmStepResult {
  const diagnostics: OpmDiagnostic[] = [];
  const trace: OpmTraceRecord[] = [];
  const model = runtime.model;
  const traceCapacity = model.settings.traceCapacity;
  let traceOverflowed = false;

  const pushTrace = (record: OpmTraceRecord): void => {
    if (!boundedPush(trace, record, traceCapacity)) {
      traceOverflowed = true;
    }
  };

  // Validate deltaMs
  if (
    typeof deltaMs !== 'number' ||
    isNaN(deltaMs) ||
    !isFinite(deltaMs) ||
    deltaMs < 0
  ) {
    diagnostics.push({
      code: OPM_DIAGNOSTIC_CODES.INVALID_DELTA,
      severity: 'error',
      message: `Invalid deltaMs: ${deltaMs}. Must be a finite non-negative number.`,
      source: { elementId: 'runtime', propertyPath: 'deltaMs' },
    });
    return buildFaultedResult(runtime, diagnostics, trace);
  }

  const currentStepTime = Math.min(UINT32_MAX, runtime.timeMs + deltaMs);

  // Phase 1: sampleInputs
  pushTrace({
    phase: 'sampleInputs',
    description: `Sample inputs for step ${runtime.stepIndex + 1}`,
    data: { ...runtime.ioInputs },
  });
  for (const [key, val] of Object.entries(runtime.ioInputs)) {
    runtime.values[key] = val;
  }

  // Phase 2: advanceTimers
  pushTrace({
    phase: 'advanceTimers',
    description: `Advance timers by ${deltaMs}ms`,
    data: { deltaMs },
  });

  // Advance state timeouts
  for (const [objId, stId] of Object.entries(runtime.activeStates)) {
    void objId;
    const st = model.states.find(s => s.id === stId);
    if (st && st.timeoutMs && st.timeoutEventId) {
      const currentElapsed = Math.min(UINT32_MAX, (runtime.stateTimeouts[stId] ?? 0) + deltaMs);
      runtime.stateTimeouts[stId] = currentElapsed;
      if (currentElapsed >= st.timeoutMs) {
        dispatchOpmEvent(runtime, st.timeoutEventId, diagnostics);
        runtime.stateTimeouts[stId] = 0; // reset after firing timeout
      }
    }
  }

  // Advance delayed transitions and check ready
  const readyTransitions: DelayedTransitionRecord[] = [];
  const remainingDelayed: DelayedTransitionRecord[] = [];
  for (const dt of runtime.delayedTransitions) {
    const remaining = dt.remainingMs - deltaMs;
    if (remaining <= 0) {
      // Check staleness: if owner current state != sourceStateId, it is stale and dropped
      if (!dt.sourceStateId || runtime.activeStates[dt.ownerObjectId] === dt.sourceStateId) {
        readyTransitions.push(dt);
      } else {
        diagnostics.push({
          code: OPM_DIAGNOSTIC_CODES.TRANSITION_STALE,
          severity: 'warning',
          message: `Delayed transition on link "${dt.linkId}" is stale: owner "${dt.ownerObjectId}" left source state "${dt.sourceStateId}".`,
          source: { elementId: dt.linkId, propertyPath: 'transition' },
        });
      }
    } else {
      remainingDelayed.push({ ...dt, remainingMs: remaining });
    }
  }
  runtime.delayedTransitions = remainingDelayed;

  // Phase 3: activate
  pushTrace({
    phase: 'activate',
    description: 'Determine active processes and links',
  });

  // Immutable snapshot for evaluation: frozen so staged writes cannot leak
  // into guard/expression evaluation within this step.
  const snapshot: Record<string, boolean | number | string> = Object.freeze({
    ...runtime.values,
  });
  const queuedEvents = [...runtime.eventQueue];
  const consumedEvents: string[] = [];
  const eligibleProcessSet = new Set<string>();
  const blockedProcessIds: string[] = [];

  const processIds = new Set(model.processes.map(p => p.id));

  // Map state to parent object
  const stateToOwner = new Map<string, string>();
  for (const st of model.states) {
    stateToOwner.set(st.id, st.parentObjectId);
  }

  const markConsumed = (eventId: string): void => {
    // Consume only accepted (actually queued) events.
    if (queuedEvents.includes(eventId) && !consumedEvents.includes(eventId)) {
      consumedEvents.push(eventId);
    }
  };

  /**
   * Shared gate check for non-result links: source-state active (when the
   * link starts from a state), accepted-event trigger present, and guard
   * passing on the immutable snapshot. Failed guard evaluation deactivates
   * the link (fail-closed).
   */
  const gateChecksPass = (link: (typeof model.links)[number]): boolean => {
    const sourceOwner = stateToOwner.get(link.sourceId);
    if (sourceOwner) {
      const activeState = runtime.activeStates[sourceOwner];
      if (activeState !== link.sourceId) {
        return false;
      }
    }
    if (link.eventId) {
      if (!queuedEvents.includes(link.eventId)) {
        return false;
      }
    }
    if (link.guardIr) {
      const res = tryEvaluateExpression(link.guardIr, snapshot, diagnostics, link.source);
      if (!res.ok || !res.value) {
        return false;
      }
    }
    return true;
  };

  // Pass 1: gating links — links that target a process, or that are not
  // sourced from any process. These may gate process activation.
  const traversedGating: typeof model.links[number][] = [];
  for (const link of model.links) {
    const targetsProcess = processIds.has(link.targetId);
    const sourcedFromProcess = processIds.has(link.sourceId);
    if (sourcedFromProcess && !targetsProcess) {
      continue; // result link: decided in pass 2 after processes fire
    }
    if (gateChecksPass(link)) {
      traversedGating.push(link);
      if (link.eventId) markConsumed(link.eventId);
    }
  }
  const traversedGateIds = new Set(traversedGating.map(l => l.id));

  // Evaluate processes (gated only by pass-1 links, timers, debounce, guards)
  let hasWaitingTriggered = false;
  for (const proc of model.processes) {
    let eligible = true;
    let blockedReason = '';

    // 1. Debounce check
    if (proc.debounceMs > 0 && runtime.processLastFiredTime[proc.id] !== undefined) {
      const timeSinceLastFire = runtime.timeMs - runtime.processLastFiredTime[proc.id];
      if (timeSinceLastFire < proc.debounceMs) {
        eligible = false;
        blockedReason = `debounce: ${timeSinceLastFire}ms < ${proc.debounceMs}ms`;
      }
    }

    // 2. Condition links gating
    // An incoming condition link targeting this process must be active
    const conditionLinks = model.links.filter(
      l => l.targetId === proc.id && l.type === 'condition',
    );
    for (const cl of conditionLinks) {
      if (!traversedGateIds.has(cl.id)) {
        eligible = false;
        blockedReason = `condition link [${cl.id}] not met`;
        break;
      }
    }

    // 3. Activation check
    if (eligible) {
      const incomingTriggerLinks = model.links.filter(
        l => l.targetId === proc.id && l.type === 'trigger',
      );

      const hasActiveTrigger = incomingTriggerLinks.some(tl => traversedGateIds.has(tl.id));

      // Cyclic schedule check
      const currentAccum = (runtime.processTimers[proc.id] ?? 0) + deltaMs;
      const isCyclicDue =
        proc.periodMs !== undefined && proc.periodMs > 0
          ? currentAccum >= proc.periodMs
          : true;

      if (proc.activation === 'triggered') {
        if (!hasActiveTrigger) {
          eligible = false;
          blockedReason = 'triggered: awaiting trigger event/link';
        }
      } else if (proc.activation === 'cyclic') {
        if (!isCyclicDue) {
          eligible = false;
          blockedReason = 'cyclic: period not due';
        }
      } else if (proc.activation === 'both') {
        if (!hasActiveTrigger && !isCyclicDue) {
          eligible = false;
          blockedReason = 'both: neither trigger nor cyclic period due';
        }
      }
    }

    // 4. Guard check (fail-closed: failed evaluation blocks the process)
    if (eligible && proc.guardIr) {
      const res = tryEvaluateExpression(proc.guardIr, snapshot, diagnostics, proc.source);
      if (!res.ok || !res.value) {
        eligible = false;
        blockedReason = 'guard evaluated to false';
      }
    }

    if (eligible) {
      eligibleProcessSet.add(proc.id);
      // Advance process timer: reset accumulated timer on fire
      runtime.processTimers[proc.id] = 0;
      runtime.processLastFiredTime[proc.id] = runtime.timeMs;
    } else {
      // Accumulate cyclic timer when not firing
      runtime.processTimers[proc.id] = Math.min(
        UINT32_MAX,
        (runtime.processTimers[proc.id] ?? 0) + deltaMs,
      );
      blockedProcessIds.push(proc.id);
      if (proc.activation === 'triggered' || proc.activation === 'both') {
        if (blockedReason.includes('trigger')) {
          hasWaitingTriggered = true;
        }
      }
    }
  }

  // Filter and sort fired processes by descending priority, then normalized order
  const firedProcesses = sortByPriorityThenOrder(
    model.processes
      .filter(p => eligibleProcessSet.has(p.id))
      .map(p => ({ ...p, order: p.order })),
  );
  const firedSet = new Set(firedProcesses.map(p => p.id));

  // Pass 2: process-originating result links (process -> non-process).
  // Require the source process to have fired this step (causality), plus the
  // shared gate checks on the immutable snapshot.
  const traversedResult: typeof model.links[number][] = [];
  for (const link of model.links) {
    const targetsProcess = processIds.has(link.targetId);
    const sourcedFromProcess = processIds.has(link.sourceId);
    if (!(sourcedFromProcess && !targetsProcess)) {
      continue;
    }
    if (!firedSet.has(link.sourceId)) {
      continue;
    }
    if (gateChecksPass(link)) {
      traversedResult.push(link);
      if (link.eventId) markConsumed(link.eventId);
    }
  }

  const traversedLinks: typeof model.links[number][] = [...traversedGating, ...traversedResult];

  // Phase 4: evaluate
  pushTrace({
    phase: 'evaluate',
    description: 'Evaluate assignments and transitions against frozen snapshot',
  });

  // Phase 5: stage
  pushTrace({
    phase: 'stage',
    description: 'Stage evaluated writes and transitions',
  });

  let stagedWrites: StagedWrite[] = [];

  // Stage process assignments. The resolved C identifier is the primary
  // write key (raw editor ids never drive codegen/runtime); attributeId is
  // kept as the resolved key for grouping, with raw id mirrored in values.
  // Failed expressions stage nothing (fail-closed).
  const resolvedKeyOf = (a: CompiledOpmAssignment): string =>
    a.resolvedTargetCIdentifier || a.targetAttributeId;
  for (const proc of firedProcesses) {
    for (const a of proc.assignments) {
      if (!a.enabled) continue;
      const res = tryEvaluateExpression(a.expressionIr, snapshot, diagnostics, a.source);
      if (!res.ok) continue;
      const key = resolvedKeyOf(a);
      stagedWrites.push({
        attributeId: key,
        targetCIdentifier: key,
        operator: a.operator,
        value: res.value,
        sourceProcessId: proc.id,
        priority: proc.priority,
      });
    }
  }

  // Stage link assignments (only traversed links; failed expressions stage nothing)
  for (const link of traversedLinks) {
    for (const a of link.assignments) {
      if (!a.enabled) continue;
      const res = tryEvaluateExpression(a.expressionIr, snapshot, diagnostics, a.source);
      if (!res.ok) continue;
      const key = resolvedKeyOf(a);
      stagedWrites.push({
        attributeId: key,
        targetCIdentifier: key,
        operator: a.operator,
        value: res.value,
        priority: link.priority,
      });
    }
  }

  // Enforce maxStagedWrites capacity deterministically (priority-first keep).
  const maxStagedWrites = model.settings.maxStagedWrites;
  if (stagedWrites.length > maxStagedWrites) {
    stagedWrites = sortStagedWritesDeterministic(stagedWrites).slice(0, maxStagedWrites);
    diagnostics.push({
      code: OPM_DIAGNOSTIC_CODES.STAGED_WRITES_OVERFLOW,
      severity: 'error',
      message: `Staged writes exceed maxStagedWrites (${maxStagedWrites}); lowest-priority writes dropped.`,
      source: { elementId: 'settings', propertyPath: 'settings.maxStagedWrites' },
    });
  }

  // Phase 6: resolveConflicts
  pushTrace({
    phase: 'resolveConflicts',
    description: 'Resolve write and transition conflicts',
  });

  // Group staged writes by attribute ID
  const writesByAttr = new Map<string, StagedWrite[]>();
  for (const w of stagedWrites) {
    const list = writesByAttr.get(w.attributeId) || [];
    list.push(w);
    writesByAttr.set(w.attributeId, list);
  }

  const committedWrites: StagedWrite[] = [];
  for (const [attrId, writes] of writesByAttr.entries()) {
    writes.sort((a, b) => b.priority - a.priority);

    // If there is an equal priority conflict at top priority
    if (writes.length > 1 && writes[0].priority === writes[1].priority) {
      diagnostics.push({
        code: OPM_DIAGNOSTIC_CODES.WRITE_CONFLICT,
        severity: 'error',
        message: `Write conflict on attribute "${attrId}": multiple staged writes with equal priority ${writes[0].priority}.`,
        source: { elementId: attrId, propertyPath: 'priority' },
      });
      // Neither write committed
    } else {
      // Highest priority wins
      committedWrites.push(writes[0]);
    }
  }

  // Stage candidate transitions
  interface CandidateTransition {
    ownerObjectId: string;
    fromStateId?: string;
    toStateId: string;
    linkId?: string;
    priority: number;
    order: number;
    source: OpmSourceRef;
  }

  let candidateTransitions: CandidateTransition[] = [];

  for (const link of traversedLinks) {
    if (link.transition) {
      if (link.delayMs > 0) {
        // Enqueue delayed transition if not already queued
        const alreadyQueued = runtime.delayedTransitions.some(
          d => d.linkId === link.id && d.ownerObjectId === link.transition!.ownerObjectId,
        );
        if (!alreadyQueued) {
          runtime.delayedTransitions.push({
            linkId: link.id,
            ownerObjectId: link.transition.ownerObjectId,
            sourceStateId: link.transition.sourceStateId,
            targetStateId: link.transition.targetStateId,
            remainingMs: link.delayMs,
            priority: link.priority,
          });
        }
      } else {
        // Immediate transition: only valid if current state matches sourceStateId
        const currentActive = runtime.activeStates[link.transition.ownerObjectId];
        if (!link.transition.sourceStateId || currentActive === link.transition.sourceStateId) {
          candidateTransitions.push({
            ownerObjectId: link.transition.ownerObjectId,
            fromStateId: link.transition.sourceStateId,
            toStateId: link.transition.targetStateId,
            linkId: link.id,
            priority: link.priority,
            order: link.order,
            source: link.source,
          });
        }
      }
    }
  }

  for (const rt of readyTransitions) {
    candidateTransitions.push({
      ownerObjectId: rt.ownerObjectId,
      fromStateId: rt.sourceStateId,
      toStateId: rt.targetStateId,
      linkId: rt.linkId,
      priority: rt.priority,
      order: 0,
      source: { elementId: rt.linkId, propertyPath: 'transition' },
    });
  }

  // Enforce maxTransitions capacity deterministically (priority-first keep).
  const maxTransitions = model.settings.maxTransitions;
  if (candidateTransitions.length > maxTransitions) {
    candidateTransitions = sortByPriorityThenOrder(candidateTransitions).slice(0, maxTransitions);
    diagnostics.push({
      code: OPM_DIAGNOSTIC_CODES.TRANSITIONS_OVERFLOW,
      severity: 'error',
      message: `Candidate transitions exceed maxTransitions (${maxTransitions}); lowest-priority transitions dropped.`,
      source: { elementId: 'settings', propertyPath: 'settings.maxTransitions' },
    });
  }

  // Resolve simultaneous transitions per owning object (at most 1 transition per object per step)
  const transitionsByOwner = new Map<string, CandidateTransition[]>();
  for (const ct of candidateTransitions) {
    const list = transitionsByOwner.get(ct.ownerObjectId) || [];
    list.push(ct);
    transitionsByOwner.set(ct.ownerObjectId, list);
  }

  const stagedTransitions: CommittedTransition[] = [];
  for (const [ownerId, candidates] of transitionsByOwner.entries()) {
    candidates.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.order - b.order;
    });

    // Check equal-priority transition conflict
    if (
      candidates.length > 1 &&
      candidates[0].priority === candidates[1].priority &&
      candidates[0].toStateId !== candidates[1].toStateId
    ) {
      diagnostics.push({
        code: OPM_DIAGNOSTIC_CODES.TRANSITION_CONFLICT,
        severity: 'error',
        message: `Transition conflict on object "${ownerId}": multiple transitions targeting different states with equal priority ${candidates[0].priority}.`,
        source: candidates[0].source,
      });
    } else {
      const winner = candidates[0];
      stagedTransitions.push({
        ownerObjectId: winner.ownerObjectId,
        fromStateId: winner.fromStateId,
        toStateId: winner.toStateId,
        linkId: winner.linkId,
      });
    }
  }

  // Phase 7: commit
  pushTrace({
    phase: 'commit',
    description: 'Commit winning writes and state transitions',
  });

  // Commit writes and update aliases. Resolved C identifier is primary;
  // raw editor ids are mirrored for compat only. Typed numeric coercion
  // applies the attribute overflow policy; diagnostic policy reports
  // overflow without altering the rounded value.
  const findAttr = (key: string) =>
    model.objects
      .flatMap(o => [...o.attributes])
      .find(a => a.id === key || a.cIdentifier === key);
  const appliedWrites: StagedWrite[] = [];
  for (const cw of committedWrites) {
    const key = cw.targetCIdentifier || cw.attributeId;
    const attr = findAttr(key) ?? model.objects.flatMap(o => o.attributes).find(a => a.id === cw.attributeId);
    let finalVal = cw.value;

    if (attr && typeof finalVal === 'number') {
      if (cw.operator === '+=') {
        finalVal = Number(runtime.values[key] ?? 0) + finalVal;
      } else if (cw.operator === '-=') {
        finalVal = Number(runtime.values[key] ?? 0) - finalVal;
      } else if (cw.operator === '*=') {
        finalVal = Number(runtime.values[key] ?? 0) * finalVal;
      } else if (cw.operator === '/=') {
        // Fail-closed like divide/modulo: emit OPM_EXPR_DIV_ZERO and apply nothing.
        if (finalVal === 0) {
          diagnostics.push({
            code: OPM_DIAGNOSTIC_CODES.EXPR_DIV_ZERO,
            severity: 'error',
            message: `Division by zero in compound assignment on attribute "${attr.id}".`,
            source: { elementId: attr.id, propertyPath: 'operator' },
          });
          continue;
        }
        finalVal = Number(runtime.values[key] ?? 0) / finalVal;
      }
      const coerced = coerceOpmNumeric(finalVal, {
        type: attr.type,
        minimum: attr.minimum,
        maximum: attr.maximum,
        overflow: attr.overflow,
      });
      if (coerced.overflowed && attr.overflow === 'diagnostic') {
        diagnostics.push({
          code: OPM_DIAGNOSTIC_CODES.NUMERIC_OVERFLOW,
          severity: 'warning',
          message: `Numeric overflow on attribute "${attr.id}": value ${finalVal} outside [${attr.minimum ?? '-'}, ${attr.maximum ?? '-'}].`,
          source: { elementId: attr.id, propertyPath: 'overflow' },
        });
      }
      finalVal = coerced.value;
    }

    runtime.values[key] = finalVal;
    runtime.values[cw.attributeId] = finalVal;
    runtime.values[cw.targetCIdentifier] = finalVal;
    if (attr) {
      runtime.values[attr.id] = finalVal;
      runtime.values[attr.cIdentifier] = finalVal;
    }
    appliedWrites.push(cw);
  }

  // Commit transitions
  const committedTransitions: CommittedTransition[] = [];
  const exitingStates: typeof model.states[number][] = [];
  const enteringStates: typeof model.states[number][] = [];

  for (const tr of stagedTransitions) {
    const currentState = runtime.activeStates[tr.ownerObjectId];
    if (currentState && currentState !== tr.toStateId) {
      const fromSt = model.states.find(s => s.id === currentState);
      if (fromSt) exitingStates.push(fromSt);
    }
    runtime.activeStates[tr.ownerObjectId] = tr.toStateId;
    runtime.stateTimeouts[tr.toStateId] = 0;
    const toSt = model.states.find(s => s.id === tr.toStateId);
    if (toSt) enteringStates.push(toSt);
    committedTransitions.push(tr);
  }

  // Phase 8: stateActions
  pushTrace({
    phase: 'stateActions',
    description: 'Execute state exit and entry assignments',
  });

  // Execute exit assignments before entry assignments (exit-before-entry
  // order). Failed expressions stage nothing and preserve prior values.
  // Exit actions observe post-commit values.
  for (const st of exitingStates) {
    for (const a of st.exitAssignments) {
      if (!a.enabled) continue;
      const res = tryEvaluateExpression(a.expressionIr, runtime.values, diagnostics, a.source);
      if (!res.ok) continue;
      const val = res.value;
      const key = a.resolvedTargetCIdentifier || a.targetAttributeId;
      runtime.values[key] = val;
      runtime.values[a.targetAttributeId] = val;
      const attr = model.objects.flatMap(o => o.attributes).find(attrItem => attrItem.id === key || attrItem.cIdentifier === key || attrItem.id === a.targetAttributeId);
      if (attr) {
        runtime.values[attr.id] = val;
        runtime.values[attr.cIdentifier] = val;
      }
    }
  }

  // Execute entry assignments (resolved C identifier primary, raw id mirrored).
  for (const st of enteringStates) {
    for (const a of st.entryAssignments) {
      if (!a.enabled) continue;
      const res = tryEvaluateExpression(a.expressionIr, runtime.values, diagnostics, a.source);
      if (!res.ok) continue;
      const val = res.value;
      const key = a.resolvedTargetCIdentifier || a.targetAttributeId;
      runtime.values[key] = val;
      runtime.values[a.targetAttributeId] = val;
      const attr = model.objects.flatMap(o => o.attributes).find(attrItem => attrItem.id === key || attrItem.cIdentifier === key || attrItem.id === a.targetAttributeId);
      if (attr) {
        runtime.values[attr.id] = val;
        runtime.values[attr.cIdentifier] = val;
      }
    }
  }

  // Phase 9: publishOutputs
  pushTrace({
    phase: 'publishOutputs',
    description: 'Publish hardware mapped outputs and consume events',
  });

  // Publish outputs
  for (const obj of model.objects) {
    for (const attr of obj.attributes) {
      if (attr.hardwareMapping?.direction === 'output') {
        runtime.ioOutputs[attr.hardwareMapping.symbol] = runtime.values[attr.id];
      }
    }
  }

  // Consume events one FIFO occurrence at a time (only accepted events).
  for (const evId of consumedEvents) {
    const idx = runtime.eventQueue.indexOf(evId);
    if (idx !== -1) {
      runtime.eventQueue.splice(idx, 1);
    }
  }

  if (traceOverflowed) {
    diagnostics.push({
      code: OPM_DIAGNOSTIC_CODES.TRACE_OVERFLOW,
      severity: 'warning',
      message: `Trace exceeds traceCapacity (${traceCapacity}); trailing phases dropped.`,
      source: { elementId: 'settings', propertyPath: 'settings.traceCapacity' },
    });
  }

  runtime.stepIndex++;
  runtime.timeMs = currentStepTime;

  const hasError = diagnostics.some(d => d.severity === 'error');
  const isTerminalByStateId: Record<string, boolean> = {};
  for (const st of model.states) {
    isTerminalByStateId[st.id] = Boolean(st.isTerminal);
  }
  const objectIdsWithStates = model.objects
    .filter(o => (o.stateIds?.length ?? 0) > 0)
    .map(o => o.id);
  const finished = computeFinished(runtime.activeStates, isTerminalByStateId, objectIdsWithStates);
  const lifecycle = computeStepLifecycle({
    hasError,
    finished,
    firedCount: firedProcesses.length,
    hasWaitingTriggered,
  });

  // Reference phase vocabulary so renames stay coupled to runtimeSemantics.
  void OPM_RUNTIME_PHASES;

  return {
    stepIndex: runtime.stepIndex,
    timeMs: runtime.timeMs,
    status: computeStepStatus(diagnostics),
    lifecycle,
    finished,
    values: { ...runtime.values },
    activeStates: { ...runtime.activeStates },
    queuedEventIds: [...runtime.eventQueue],
    stateTimersMs: { ...runtime.stateTimeouts },
    processTimersMs: { ...runtime.processTimers },
    consumedEventIds: consumedEvents,
    firedProcessIds: firedProcesses.map(p => p.id),
    blockedProcessIds,
    traversedLinkIds: traversedLinks.map(l => l.id),
    stagedWrites,
    committedWrites: appliedWrites,
    committedWriteIds: appliedWrites.map(w => w.attributeId),
    transitions: committedTransitions,
    diagnostics,
    trace,
  };
}
