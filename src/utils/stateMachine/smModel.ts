import type { HILConfig } from '../../engine/hil/hilTypes';
export type { XBPersistedModelV1 } from './xbModel';
import type {
  JunctionData,
  Layer,
  StateData,
  TransitionData,
  VariableDef,
} from '../../types/sm_types';

export const CURRENT_SM_SCHEMA_VERSION = 4 as const;

export type StateDecomposition = 'OR' | 'AND';

export interface StateMachineLayerV4 extends Layer {
  decomposition: StateDecomposition;
}

export interface StateMachineModelV4 {
  schemaVersion: typeof CURRENT_SM_SCHEMA_VERSION;
  tickMs: number;
  states: StateData[];
  junctions: JunctionData[];
  transitions: TransitionData[];
  variables: VariableDef[];
  layers: StateMachineLayerV4[];
  safetyMode: boolean;
  hilConfig?: HILConfig;
}

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
}

export interface ModelDiagnostic {
  code: string;
  message: string;
  elementId?: string;
  severity: 'error' | 'warning';
}

export interface MigrationResult {
  model: StateMachineModelV4;
  diagnostics: ModelDiagnostic[];
}
