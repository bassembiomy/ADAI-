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
