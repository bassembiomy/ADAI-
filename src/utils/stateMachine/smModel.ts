import type { HILConfig } from '../../engine/hil/hilTypes';
export type { XBPersistedModelV1 } from './xbModel';
import type {
  JunctionData,
  Layer,
  StateData,
  TransitionData,
  VariableDef,
} from '../../types/sm_types';

export const CURRENT_SM_SCHEMA_VERSION = 5 as const;

export type StateDecomposition = 'OR' | 'AND';

export interface StateMachineLayerV4 extends Layer {
  decomposition: StateDecomposition;
}

export type SMCStandard = 'c90' | 'c99' | 'c11';
export type SMTimerPolicy = 'logical-tick' | 'actual-delta';
export type SMInvalidInputPolicy = 'clamp' | 'reject' | 'default' | 'diagnostic-fault';

export interface SMVerificationConfig {
  cStandard: SMCStandard;
  tickToleranceMs: number;
  timerPolicy: SMTimerPolicy;
  resetPolicy: 'always-authorized' | 'condition-required';
  watchdogAfterCriticalFault: 'service' | 'do-not-service';
  statementCoverageTarget: number;
  branchCoverageTarget: number;
  requireMcdc: boolean;
  repeatedExecutionCycles: number;
  staticAnalysisToolId: string | null;
  misraToolId: string | null;
  targetId: string | null;
  invalidInputPolicies?: Record<string, SMInvalidInputPolicy>;
}

export const defaultSMVerificationConfig = (): SMVerificationConfig => ({
  cStandard: 'c11',
  tickToleranceMs: 0,
  timerPolicy: 'logical-tick',
  resetPolicy: 'always-authorized',
  watchdogAfterCriticalFault: 'do-not-service',
  statementCoverageTarget: 100,
  branchCoverageTarget: 100,
  requireMcdc: false,
  repeatedExecutionCycles: 100_000,
  staticAnalysisToolId: null,
  misraToolId: null,
  targetId: null,
});

export interface StateMachineModelV4 {
  schemaVersion: 4;
  tickMs: number;
  states: StateData[];
  junctions: JunctionData[];
  transitions: TransitionData[];
  variables: VariableDef[];
  layers: StateMachineLayerV4[];
  safetyMode: boolean;
  hilConfig?: HILConfig;
}

export interface StateMachineModelV5 {
  schemaVersion: typeof CURRENT_SM_SCHEMA_VERSION;
  tickMs: number;
  states: StateData[];
  junctions: JunctionData[];
  transitions: TransitionData[];
  variables: VariableDef[];
  layers: StateMachineLayerV4[];
  safetyMode: boolean;
  hilConfig?: HILConfig;
  verification: SMVerificationConfig;
}

export type StateMachineModel = StateMachineModelV5;
export type AnyStateMachineModel = StateMachineModelV4 | StateMachineModelV5;

export interface LegacyStateMachineModel {
  schemaVersion?: number;
  tickMs: number;
  states: StateData[];
  junctions: JunctionData[];
  transitions: TransitionData[];
  variables: VariableDef[];
  layers: Layer[];
  safetyMode?: boolean;
  hilConfig?: HILConfig;
  verification?: Partial<SMVerificationConfig>;
}

export interface ModelDiagnostic {
  code: string;
  message: string;
  elementId?: string;
  severity: 'error' | 'warning';
}

export interface MigrationResult {
  model: StateMachineModelV5;
  diagnostics: ModelDiagnostic[];
}
