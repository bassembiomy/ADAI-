import type {
  XBLegacyXBridgesModel,
  XBPersistedModelV1,
} from '../utils/stateMachine/xbModel';

export type VariableType = 'bool' | 'int' | 'uint' | 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'int64' | 'uint64' | 'float' | 'single' | 'double' | 'fixdt';
export type VariableOverflowPolicy = 'saturate' | 'error';

/** Fixed-point format of a 'fixdt' variable: real-world value = stored integer * 2^-fractionLength. */
export interface FixedPointFormat {
  signed: boolean;
  wordLength: 8 | 16 | 32;
  fractionLength: number;
}

/** Chart option: how fixed-point conversions and divisions round (Simulink Floor / Nearest). */
export type FixedPointRounding = 'floor' | 'nearest';

export interface VariableDef {
  id: string;
  name: string;
  type: VariableType;
  overflowPolicy?: VariableOverflowPolicy;
  /** Required when type is 'fixdt'. */
  fixedPoint?: FixedPointFormat;
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

/**
 * A chart event. `input` events are posted from outside (SM_PostEvent / simulation stimulus);
 * `local` events are queued by `send(NAME);` actions and processed within the same tick.
 */
export interface EventDef {
  id: string;
  name: string;
  scope: 'input' | 'local';
}

/**
 * A hand-written C function the chart may call from guards and actions (Stateflow custom code).
 * The simulation evaluates `simulation` (an action-language expression over the parameters)
 * in place of the C code; the generated C includes `header` and calls `name` directly.
 */
export interface ExternalFunctionDef {
  id: string;
  /** C identifier of the function. */
  name: string;
  /** Plain relative header file name, e.g. "motor_api.h". */
  header: string;
  returnType: VariableType;
  params: { name: string; type: VariableType }[];
  /** Expression over the parameters that models the function in the simulation. */
  simulation: string;
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
  /** Id of the event (EventDef.id) that triggers this transition; null or absent: enabled in every execution. */
  event?: string | null;
}

export interface Layer {
  id: string;
  name: string;
  parentStateId: string | null;
  stateIds: string[];
  transitionIds: string[];
  junctionIds: string[];
}
