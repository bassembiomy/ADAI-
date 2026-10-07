import type { Node, Edge } from '@xyflow/react';
import type { SolverConfiguration } from './kernel/types';
import type { VLabDiagnostic } from './vlabDiagnostics';
import type { VLabStepProgress } from './vlabPhysics';

export type { VLabDiagnostic, VLabDiagnosticItem, VLabDiagnosticCode } from './vlabDiagnostics';
export type { VLabStepProgress } from './vlabPhysics';

export type VLabWorkerRequest = {
  requestId: number;
  nodes: Node[];
  edges: Edge[];
  configuration: SolverConfiguration;
  previousState: any;
  dt: number;
  /**
   * WP-31c: shared cancel flag (Int32Array over a SharedArrayBuffer; absent where SharedArrayBuffer is unavailable). A worker blocked in a
   * synchronous step cannot read messages, so the client writes the id of the cancelled request into element 0 and the engine polls it.
   */
  cancelFlag?: Int32Array;
};

export type VLabWorkerControl = { type: 'cancel' | 'reset'; requestId?: number };

/**
 * Worker -> client message. A response carries exactly one of `state`, `error` / `diagnostic`, or (type 'progress') `progress`.
 * `error` stays the plain message (pre-WP-31c clients); `diagnostic` is the typed, structured-clone-safe record of the failure.
 */
export type VLabWorkerResponse = {
  requestId: number;
  type?: 'progress';
  state?: any;
  error?: string;
  diagnostic?: VLabDiagnostic;
  progress?: VLabStepProgress;
};
