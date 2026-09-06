/**
 * Executable OPM schema — the persisted contract for typed attributes,
 * assignments, target runtime settings, events, enums, and transitions.
 *
 * These types are additive and optional: a diagram that never enabled
 * execution has none of these fields, and stays a valid conceptual OPM
 * model. Defaults are created only by the explicit enable actions
 * (`withExecutableDefaults` or `withElementExecutableDefaults`).
 */

/** Discriminated scalar types that map to C99 primitives. */
export type OpmScalarType =
  | { kind: 'bool' | 'int32' | 'uint32' | 'float32' }
  | { kind: 'enum'; enumId: string };

export interface OpmEnumMember {
  id: string;
  displayName: string;
  cIdentifier: string;
  value: number;
}

export interface OpmEnumDefinition {
  id: string;
  displayName: string;
  cIdentifier: string;
  members: OpmEnumMember[];
}

export interface OpmEventDefinition {
  id: string;
  displayName: string;
  cIdentifier: string;
}

export interface OpmHardwareMapping {
  direction: 'input' | 'output';
  symbol: string;
}

export type OpmOverflowPolicy = 'diagnostic' | 'wrap' | 'saturate';
export type OpmAccessMode = 'readOnly' | 'readWrite';
export type OpmAssignmentOperator = '=' | '+=' | '-=' | '*=' | '/=';

/** A typed attribute owned by an object. */
export interface OpmAttribute {
  id: string;
  displayName: string;
  cIdentifier: string;
  type: OpmScalarType;
  initialValue: boolean | number | string | null | { enumId: string; memberId: string; cIdentifier: string };
  minimum?: number;
  maximum?: number;
  overflow: OpmOverflowPolicy;
  access: OpmAccessMode;
  persistent: boolean;
  hardwareMapping?: OpmHardwareMapping;
}

/** A single staged write performed by a process, state, or link. */
export interface OpmAssignment {
  id: string;
  targetAttributeId: string;
  /** Legacy alias accepted while loading older persisted diagrams. */
  target?: string;
  operator: OpmAssignmentOperator;
  expression: string;
  enabled: boolean;
}

/** Execution payload for `object` nodes. */
export interface OpmObjectExecution {
  enabled: boolean;
  attributes: OpmAttribute[];
}

/** Execution payload for `state` nodes. */
export interface OpmStateExecution {
  enabled: boolean;
  initial: boolean;
  terminal: boolean;
  entryAssignments: OpmAssignment[];
  exitAssignments: OpmAssignment[];
  timeoutMs?: number;
  timeoutEventId?: string;
}

/** Execution payload for `process` nodes. */
export interface OpmProcessExecution {
  enabled: boolean;
  activation: 'cyclic' | 'triggered' | 'both';
  inputAttributeIds: string[];
  outputAttributeIds: string[];
  guard: string;
  assignments: OpmAssignment[];
  priority: number;
  periodMs?: number;
  debounceMs: number;
  reentrancy: 'reject';
}

/** Explicit state transition request emitted by procedural link execution. */
export interface OpmTransitionRequest {
  ownerObjectId: string;
  sourceStateId?: string;
  targetStateId: string;
}

/** Execution payload for procedural links. */
export interface OpmLinkExecution {
  enabled: boolean;
  guard: string;
  eventId?: string;
  assignments: OpmAssignment[];
  transition?: OpmTransitionRequest;
  priority: number;
  delayMs: number;
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
  maxTicks?: number;
  maxEventsPerTick?: number;
  cStandard?: 'c99' | 'c11';
  misraProfile?: 'MISRA_C_2012_STRICT' | 'MISRA_C_2012_ADVISORY' | 'NONE';
}

/** Global diagram-level execution configuration persisted alongside nodes/edges. */
export interface OpmExecutionConfig {
  version: 1;
  events: OpmEventDefinition[];
  enums: OpmEnumDefinition[];
  settings: OpmTargetSettings;
}

export const DEFAULT_OPM_TARGET_SETTINGS: Readonly<OpmTargetSettings> = Object.freeze({
  tickMs: 10,
  eventQueueCapacity: 16,
  eventOverflow: 'rejectNewest',
  maxStagedWrites: 32,
  maxTransitions: 16,
  traceCapacity: 64,
  integerOverflow: 'diagnostic',
  floatPolicy: 'ieee754-single',
  tracing: true,
  maxTicks: 1000,
  maxEventsPerTick: 16,
  cStandard: 'c99',
  misraProfile: 'MISRA_C_2012_STRICT',
});

export function createDefaultOpmTargetSettings(): OpmTargetSettings {
  return {
    tickMs: 10,
    eventQueueCapacity: 16,
    eventOverflow: 'rejectNewest',
    maxStagedWrites: 32,
    maxTransitions: 16,
    traceCapacity: 64,
    integerOverflow: 'diagnostic',
    floatPolicy: 'ieee754-single',
    tracing: true,
    maxTicks: 1000,
    maxEventsPerTick: 16,
    cStandard: 'c99',
    misraProfile: 'MISRA_C_2012_STRICT',
  };
}

export function createDefaultOpmExecutionConfig(): OpmExecutionConfig {
  return {
    version: 1,
    events: [],
    enums: [],
    settings: createDefaultOpmTargetSettings(),
  };
}

export function createDefaultObjectExecution(): OpmObjectExecution {
  return {
    enabled: true,
    attributes: [],
  };
}

export function createDefaultStateExecution(isInitial = false): OpmStateExecution {
  return {
    enabled: true,
    initial: isInitial,
    terminal: false,
    entryAssignments: [],
    exitAssignments: [],
  };
}

export function createDefaultProcessExecution(): OpmProcessExecution {
  return {
    enabled: true,
    activation: 'cyclic',
    inputAttributeIds: [],
    outputAttributeIds: [],
    guard: '',
    assignments: [],
    priority: 1,
    debounceMs: 0,
    reentrancy: 'reject',
  };
}

export function createDefaultLinkExecution(): OpmLinkExecution {
  return {
    enabled: true,
    guard: '',
    assignments: [],
    priority: 1,
    delayMs: 0,
  };
}

export interface OpmSymbol {
  id: string;
  kind: 'object' | 'state' | 'process' | 'attribute' | 'event' | 'enum' | 'enumMember' | 'link' | string;
  name?: string;
  displayName: string;
  cIdentifier: string;
  source: OpmSourceRef;
}

export interface NormalizedOpmObject {
  id: string;
  name: string;
  cIdentifier: string;
  physical: boolean;
  order: number;
  source: OpmSourceRef;
  execution?: OpmObjectExecution;
  stateIds: readonly string[];
}

export interface NormalizedOpmState {
  id: string;
  name: string;
  cIdentifier: string;
  parentObjectId: string;
  isInitial: boolean;
  order: number;
  source: OpmSourceRef;
  execution?: OpmStateExecution;
}

export interface NormalizedOpmProcess {
  id: string;
  name: string;
  cIdentifier: string;
  physical: boolean;
  order: number;
  source: OpmSourceRef;
  execution?: OpmProcessExecution;
}

export interface NormalizedOpmLink {
  id: string;
  type: string;
  sourceId: string;
  targetId: string;
  order: number;
  source: OpmSourceRef;
  execution?: OpmLinkExecution;
}

export interface OpmCompilationInput {
  executionEnabled: boolean;
  settings: OpmTargetSettings;
  objects: readonly NormalizedOpmObject[];
  states: readonly NormalizedOpmState[];
  processes: readonly NormalizedOpmProcess[];
  links: readonly NormalizedOpmLink[];
  events: readonly OpmEventDefinition[];
  enums: readonly OpmEnumDefinition[];
  symbols: Readonly<Record<string, OpmSymbol>>;
  sourceByNormalizedId: Readonly<Record<string, OpmSourceRef>>;
}

export interface NormalizeOpmResult {
  input?: OpmCompilationInput;
  diagnostics: OpmDiagnostic[];
}

export type CanonicalOpmValue = boolean | number | { enumId: string; memberId: string; cIdentifier: string };
export type OpmRuntimeLifecycle = 'ready' | 'running' | 'finished' | 'waiting' | 'faulted';
export type OpmRuntimeStatus = 'idle' | 'running' | 'error' | 'stopped' | 'complete' | 'ok';

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
  finished?: boolean;
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

