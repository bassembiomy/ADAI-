import type {
  XBLegacyXBridgesModel,
  XBPersistedModelV1,
} from '../utils/stateMachine/xbModel';

export type VariableType = 'bool' | 'int' | 'uint' | 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'int64' | 'uint64' | 'float' | 'single' | 'double';
export type VariableOverflowPolicy = 'saturate' | 'error';

export interface VariableDef {
  id: string;
  name: string;
  type: VariableType;
  overflowPolicy?: VariableOverflowPolicy;
  initialValue: string;
  currentValue: number | boolean;
  visibleInScope: boolean;
}

export interface ErrorItem {
  id: string;
  type: 'error' | 'warning' | 'info';
  message: string;
  timestamp: Date;
  source?: string;
  elementId?: string;
  canAutoFix?: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface StateData {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  entry: string;
  during: string;
  exit: string;
  isActive: boolean;
  color: string;
  parentId: string | null;
  children: string[];
  priority: number;
  /** @deprecated Migration-only legacy decomposition metadata. */
  isParallel: boolean;
  regionId: string | null;
  autostart: boolean;
  historyType?: 'none' | 'shallow' | 'deep';
  internalTransitions?: string;
  isSafeState?: boolean;
  isTerminalState?: boolean;
  isTerminal?: boolean;
  isXBridges?: boolean;
  /**
   * Legacy UI data is accepted only at the persistence boundary. Task 3 must
   * normalize it to `XBPersistedModelV1` before semantic validation or codegen.
   */
  xBridgesModel?: XBPersistedModelV1 | XBLegacyXBridgesModel;
}

export type PseudostateKind =
  | 'initial'
  | 'final'
  | 'junction'
  | 'choice'
  | 'fork'
  | 'join'
  | 'history'
  | 'deep-history'
  | 'entry-point'
  | 'exit-point'
  | 'terminate';

export interface StateMachineDiagramData {
  id: string;
  name: string;
  ownerId: string;
  contextRegionId: string;
}

export interface JunctionData {
  id: string;
  x: number;
  y: number;
  name: string;
  color: string;
  parentId: string | null;
  type?: PseudostateKind;
  autostart?: boolean;
}

export interface TransitionData {
  id: string;
  sourceId: string;
  targetId: string;
  condition: string;
  action: string;
  afterTicks: number | null;
  type: 'condition' | 'after' | 'and' | 'or' | 'internal';
  controlPoint?: Point;
  hasControlPoint: boolean;
  order: number;
  isInternal?: boolean;
}

export interface Layer {
  id: string;
  name: string;
  parentStateId: string | null;
  stateIds: string[];
  transitionIds: string[];
  junctionIds: string[];
}
