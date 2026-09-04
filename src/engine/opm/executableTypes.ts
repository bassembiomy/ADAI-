/**
 * Executable OPM schema — the persisted contract for typed attributes,
 * assignments and target runtime settings.
 *
 * These types are additive and optional: a diagram that never enabled
 * execution has none of these fields, and stays a valid conceptual OPM
 * model. Defaults are created only by the explicit enable action
 * (`withExecutableDefaults` in ./schemaAdapter).
 */

/** Discriminated scalar types that map to C99 primitives. */
export type OpmScalarType =
  | { kind: 'bool' | 'int32' | 'uint32' | 'float32' }
  | { kind: 'enum'; enumId: string };

/** Runtime value tagged with its scalar type. */
export interface OpmTypedValue {
  type: OpmScalarType;
  value: boolean | number | string | null;
}

export type OpmAssignmentOperator = '=' | '+=' | '-=' | '*=' | '/=';

/** A single staged write performed by a process on an attribute. */
export interface OpmAssignment {
  id: string;
  target: string;
  operator: OpmAssignmentOperator;
  expression: string;
  enabled: boolean;
}

/** Where a diagnostic came from, in terms of the OPM diagram. */
export interface OpmSourceRef {
  elementId: string;
  propertyPath: string;
  start?: number;
  end?: number;
}

export interface OpmDiagnostic {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  source: OpmSourceRef;
}

/** A typed attribute owned by an object. */
export interface OpmAttribute {
  id: string;
  displayName: string;
  cIdentifier: string;
  type: OpmScalarType;
  initialValue: number | boolean | string | null;
  access: 'readOnly' | 'readWrite';
  persistent: boolean;
}

/** Execution payload for `object` nodes. */
export interface OpmObjectExecution {
  enabled: boolean;
  attributes: OpmAttribute[];
}

/** Execution payload for `state` nodes. */
export interface OpmStateExecution {
  enabled: boolean;
  /** Expression evaluated when the state becomes active; empty when unused. */
  valueExpression: string;
}

/** Execution payload for `process` nodes. */
export interface OpmProcessExecution {
  enabled: boolean;
  assignments: OpmAssignment[];
}

/** Execution payload for procedural links. */
export interface OpmLinkExecution {
  enabled: boolean;
  /** Guard expression evaluated before the link allows flow; empty when unused. */
  conditionExpression: string;
}

/** Codegen/runtime target settings for the embedded execution engine. */
export interface OpmTargetSettings {
  tickMs: number;
  eventQueueCapacity: number;
  eventOverflow: 'rejectNewest' | 'dropOldest';
  maxStagedWrites: number;
  maxTransitions: number;
  traceCapacity: number;
  integerOverflow: 'diagnostic' | 'wrap' | 'saturate';
  floatPolicy: 'ieee754-single';
  tracing: boolean;
}

export const DEFAULT_OPM_TARGET_SETTINGS: OpmTargetSettings = {
  tickMs: 10,
  eventQueueCapacity: 16,
  eventOverflow: 'rejectNewest',
  maxStagedWrites: 32,
  maxTransitions: 16,
  traceCapacity: 64,
  integerOverflow: 'diagnostic',
  floatPolicy: 'ieee754-single',
  tracing: true,
};

export interface OpmEventDefinition {
  id: string;
  displayName: string;
  cIdentifier: string;
}

export interface OpmEnumDefinition {
  id: string;
  name: string;
  cIdentifier: string;
  literals: string[];
}

export interface OpmExecutionConfig {
  settings: OpmTargetSettings;
  events: OpmEventDefinition[];
  enums: OpmEnumDefinition[];
}

export function createDefaultOpmExecutionConfig(): OpmExecutionConfig {
  return {
    settings: { ...DEFAULT_OPM_TARGET_SETTINGS },
    events: [],
    enums: [],
  };
}

export type CanonicalOpmValue = boolean | number | { enumId: string; memberId: string; cIdentifier: string };

export type OpmSymbol = {
  id: string;
  name: string;
  cIdentifier: string;
  kind?: string;
  [key: string]: any;
};

export type OpmTransitionRequest = {
  ownerObjectId: string;
  targetStateId: string;
  sourceStateId?: string;
  delayMs?: number;
  priority?: number;
};

export type OpmRuntimeLifecycle = 'ready' | 'running' | 'waiting' | 'finished' | 'faulted';
export type OpmRuntimeStatus = 'idle' | 'running' | 'error' | 'stopped' | 'complete';

export interface OpmCommittedTransition {
  ownerObjectId: string;
  fromStateId?: string;
  toStateId: string;
  linkId?: string;
}

export interface OpmStepSnapshot {
  stepIndex: number;
  timeMs: number;
  status: OpmRuntimeStatus;
  lifecycle: OpmRuntimeLifecycle;
  values: Readonly<Record<string, boolean | number | string>>;
  activeStates: Readonly<Record<string, string>>;
  queuedEventIds: readonly string[];
  stateTimersMs: Readonly<Record<string, number>>;
  processTimersMs: Readonly<Record<string, number>>;
  firedProcessIds: readonly string[];
  blockedProcessIds: readonly string[];
  traversedLinkIds: readonly string[];
  committedWriteIds: readonly string[];
  transitions: readonly OpmCommittedTransition[];
  diagnostics: readonly OpmDiagnostic[];
}

export interface CompiledOpmAssignment {
  id: string;
  targetAttributeId: string;
  resolvedTargetCIdentifier: string;
  operator: OpmAssignmentOperator;
  expressionText: string;
  expressionIr: any;
  enabled: boolean;
  source: OpmSourceRef;
}

export interface CompiledOpmProcess {
  enabled: boolean;
  id: string;
  name: string;
  cIdentifier: string;
  physical: boolean;
  order: number;
  source: OpmSourceRef;
  activation: 'cyclic' | 'triggered' | 'both';
  inputAttributeIds: readonly string[];
  outputAttributeIds: readonly string[];
  guardText: string;
  guardIr?: any;
  assignments: readonly CompiledOpmAssignment[];
  priority: number;
  periodMs?: number;
  debounceMs: number;
  reentrancy: 'reject';
}

export interface CompiledOpmLink {
  enabled: boolean;
  id: string;
  type: string;
  sourceId: string;
  targetId: string;
  order: number;
  source: OpmSourceRef;
  guardText: string;
  guardIr?: any;
  eventId?: string;
  assignments: readonly CompiledOpmAssignment[];
  transition?: OpmTransitionRequest;
  priority: number;
  delayMs: number;
}
