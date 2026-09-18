export type DiagnosticCategory =
  | 'SCHEMA'
  | 'TOPOLOGY'
  | 'PARAMETER'
  | 'ENGINEERING'
  | 'COMPILE'
  | 'SIMULATION';

export interface Diagnostic {
  readonly category?: DiagnosticCategory;
  readonly code: string;
  readonly severity: 'ERROR' | 'WARNING' | 'INFO';
  readonly message: string;
  readonly actionId?: string;
  readonly entityId?: string;
  readonly portId?: string;
  readonly fieldPath?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly remediation?: string;
}

