/**
 * Canonical OPM runtime semantics shared by the TypeScript runtime and C parity.
 * Centralizes phase names, status/lifecycle vocabulary, diagnostic codes,
 * deterministic ordering helpers, bounded-queue helpers, and typed numeric coercion.
 */

import type { OpmDiagnostic, OpmSourceRef } from './executableTypes';

export const OPM_RUNTIME_PHASES = [
  'sampleInputs',
  'advanceTimers',
  'activate',
  'evaluate',
  'stage',
  'resolveConflicts',
  'commit',
  'stateActions',
  'publishOutputs',
] as const;

export type OpmRuntimePhase = (typeof OPM_RUNTIME_PHASES)[number];

export type OpmRuntimeStatus = 'ok' | 'error';

export type OpmRuntimeLifecycle = 'ready' | 'running' | 'waiting' | 'finished' | 'faulted';

/** Canonical diagnostic codes emitted by the runtime. */
export const OPM_DIAGNOSTIC_CODES = {
  EXPR_DIV_ZERO: 'OPM_EXPR_DIV_ZERO',
  UNBOUND_VARIABLE: 'OPM_RUNTIME_UNBOUND_VARIABLE',
  INVALID_DELTA: 'OPM_RUNTIME_INVALID_DELTA',
  WRITE_CONFLICT: 'OPM_WRITE_CONFLICT',
  TRANSITION_CONFLICT: 'OPM_TRANSITION_CONFLICT',
  STAGED_WRITES_OVERFLOW: 'OPM_STAGED_WRITES_OVERFLOW',
  TRANSITIONS_OVERFLOW: 'OPM_TRANSITIONS_OVERFLOW',
  TRACE_OVERFLOW: 'OPM_TRACE_OVERFLOW',
  EVENT_QUEUE_OVERFLOW: 'OPM_EVENT_QUEUE_OVERFLOW',
  TRANSITION_STALE: 'OPM_TRANSITION_STALE',
  NUMERIC_OVERFLOW: 'OPM_NUMERIC_OVERFLOW',
  INVALID_INITIAL_STATE: 'OPM_RUNTIME_INVALID_INITIAL_STATE',
  MAX_TICKS_EXCEEDED: 'OPM_RUNTIME_MAX_TICKS_EXCEEDED',
} as const;

export type OpmDiagnosticCode =
  (typeof OPM_DIAGNOSTIC_CODES)[keyof typeof OPM_DIAGNOSTIC_CODES];

/** Legacy alias retained for compat: runtime division failures are OPM_EXPR_DIV_ZERO. */
export const OPM_RUNTIME_DIV_ZERO_LEGACY = 'OPM_RUNTIME_DIV_ZERO';

export function makeOpmDiagnostic(
  code: string,
  message: string,
  source: OpmSourceRef,
  severity: 'error' | 'warning' = 'error',
): OpmDiagnostic {
  return { code, severity, message, source };
}

export interface PriorityOrdered {
  priority: number;
  order: number;
}

/**
 * Deterministic ordering: descending priority, then ascending normalized order.
 * Never mutates the input; returns a new sorted array (stable in V8).
 */
export function sortByPriorityThenOrder<T extends PriorityOrdered>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.order - b.order;
  });
}

export interface StagedWriteOrdered {
  priority: number;
  attributeId: string;
  sourceProcessId?: string;
  id?: string;
}

/** Deterministic write ordering: priority desc, then attributeId, source, id. */
export function sortStagedWritesDeterministic<T extends StagedWriteOrdered>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.attributeId !== b.attributeId) {
      return a.attributeId < b.attributeId ? -1 : 1;
    }
    const sa = a.sourceProcessId ?? '';
    const sb = b.sourceProcessId ?? '';
    if (sa !== sb) return sa < sb ? -1 : 1;
    const ia = a.id ?? '';
    const ib = b.id ?? '';
    if (ia !== ib) return ia < ib ? -1 : 1;
    return 0;
  });
}

/**
 * Bounded push: appends only while under capacity.
 * Returns true when accepted, false when the container is already full.
 */
export function boundedPush<T>(arr: T[], item: T, capacity: number): boolean {
  if (arr.length >= capacity) return false;
  arr.push(item);
  return true;
}

export interface OpmNumericAttr {
  type: { kind: string };
  minimum?: number;
  maximum?: number;
  overflow: 'diagnostic' | 'wrap' | 'saturate';
}

export interface CoercedNumeric {
  value: number;
  overflowed: boolean;
  saturated: boolean;
}

/**
 * Typed numeric coercion for int32/uint32/float32 with wrap/saturate/diagnostic policy.
 * Diagnostic policy never alters the rounded value; it only flags overflowed=true.
 */
export function coerceOpmNumeric(raw: number, attr: OpmNumericAttr): CoercedNumeric {
  const kind = attr.type.kind;
  if (kind === 'int32') {
    const effMin = attr.minimum ?? -2147483648;
    const effMax = attr.maximum ?? 2147483647;
    const rounded = Math.round(raw);
    if (attr.overflow === 'saturate') {
      const clamped = Math.max(effMin, Math.min(effMax, rounded));
      return { value: clamped, overflowed: rounded !== clamped, saturated: rounded !== clamped };
    }
    if (attr.overflow === 'wrap') {
      return { value: rounded | 0, overflowed: rounded < -2147483648 || rounded > 2147483647, saturated: false };
    }
    return {
      value: rounded,
      overflowed: rounded < effMin || rounded > effMax,
      saturated: false,
    };
  }
  if (kind === 'uint32') {
    const effMin = attr.minimum ?? 0;
    const effMax = attr.maximum ?? 4294967295;
    const rounded = Math.round(raw);
    if (attr.overflow === 'saturate') {
      const clamped = Math.max(effMin, Math.min(effMax, rounded));
      return { value: clamped, overflowed: rounded !== clamped, saturated: rounded !== clamped };
    }
    if (attr.overflow === 'wrap') {
      return { value: rounded >>> 0, overflowed: rounded < 0 || rounded > 4294967295, saturated: false };
    }
    return {
      value: rounded,
      overflowed: rounded < effMin || rounded > effMax,
      saturated: false,
    };
  }
  if (kind === 'float32') {
    if (attr.overflow === 'saturate' && (attr.minimum !== undefined || attr.maximum !== undefined)) {
      const lo = attr.minimum ?? -Infinity;
      const hi = attr.maximum ?? Infinity;
      const clamped = Math.max(lo, Math.min(hi, raw));
      return { value: Math.fround(clamped), overflowed: clamped !== raw, saturated: clamped !== raw };
    }
    return { value: Math.fround(raw), overflowed: false, saturated: false };
  }
  return { value: raw, overflowed: false, saturated: false };
}

export function computeStepStatus(diagnostics: readonly OpmDiagnostic[]): OpmRuntimeStatus {
  return diagnostics.some(d => d.severity === 'error') ? 'error' : 'ok';
}

export interface LifecycleInput {
  hasError: boolean;
  finished: boolean;
  firedCount: number;
  hasWaitingTriggered: boolean;
}

export function computeStepLifecycle(input: LifecycleInput): OpmRuntimeLifecycle {
  if (input.hasError) return 'faulted';
  if (input.finished) return 'finished';
  if (input.firedCount > 0) return 'running';
  if (input.hasWaitingTriggered) return 'waiting';
  return 'ready';
}

/** True when every state-owning object rests in a terminal state. */
export function computeFinished(
  activeStates: Readonly<Record<string, string>>,
  isTerminalByStateId: Readonly<Record<string, boolean>>,
  objectIdsWithStates: readonly string[],
): boolean {
  if (objectIdsWithStates.length === 0) return false;
  for (const objId of objectIdsWithStates) {
    const active = activeStates[objId];
    if (!active) return false;
    if (!isTerminalByStateId[active]) return false;
  }
  return true;
}
