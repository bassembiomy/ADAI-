
export type VariableType = 'bool' | 'int' | 'uint' | 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'int64' | 'uint64' | 'float' | 'single' | 'double';

export interface VariableDef {
  id: string;
  name: string;
  type: VariableType;
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
  isParallel: boolean;
  regionId: string | null;
  autostart: boolean;
  historyType?: 'none' | 'shallow' | 'deep';
  internalTransitions?: string;
  isSafeState?: boolean;
  isTerminalState?: boolean;
  isTerminal?: boolean;
  isXBridges?: boolean;
  xBridgesModel?: {
    nodes: any[];
    edges: any[];
    mappings?: {
      smVarId: string;
      blockId: string;
      portId: string;
      direction: 'in' | 'out';
    }[];
  };
}

export interface JunctionData {
  id: string;
  x: number;
  y: number;
  name: string;
  color: string;
  parentId: string | null;
  type?: 'junction' | 'history' | 'deep-history';
  autostart?: boolean;
}

export interface TransitionData {
  id: string;
  sourceId: string;
  targetId: string;
  condition: string;
  action: string;
  afterTicks: number | null;
  type: 'condition' | 'after' | 'and' | 'or';
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
