import type { VariableType } from '../../types/sm_types';
import type { ActionNode, ExpressionNode } from './smExpressions';
import type { ModelDiagnostic, StateDecomposition } from './smModel';

export interface SemanticState {
  id: string;
  enumName: string;
  parentStateId: string | null;
  layerId: string;
  depth: number;
  priority: number;
  activeSlot: number;
  activityIndex: number;
  terminal: boolean;
  ancestorStateIds: string[];
  childLayerIds: string[];
  internalTransitionIds: string[];
  entryActions: ActionNode[];
  duringActions: ActionNode[];
  exitActions: ActionNode[];
}

export interface SemanticLayer {
  id: string;
  name: string;
  parentStateId: string | null;
  decomposition: StateDecomposition;
  children: string[];
  transitionIds: string[];
  junctionIds: string[];
  activeSlot: number | null;
  defaultEntryId: string | null;
  defaultEntryKind: 'state' | 'junction' | null;
}

export interface SemanticTransition {
  id: string;
  sourceStateId: string;
  destinationStateId: string;
  kind: 'outer' | 'inner' | 'internal-action' | 'external-self';
  priority: number;
  triggerMode: 'condition' | 'after' | 'and' | 'or';
  afterTicks: number | null;
  temporalThresholdMs: number | null;
  sourceKind: 'state' | 'junction';
  destinationKind: 'state' | 'junction';
  guard: ExpressionNode;
  actions: ActionNode[];
  exitStateIds: string[];
  entryStateIds: string[];
}

export interface SemanticVariable {
  id: string;
  name: string;
  cName: string;
  type: VariableType;
  initialValue: number | boolean;
}

export interface SemanticIOMapping {
  id: string;
  variableId: string;
  channelId: string;
  direction: 'read' | 'write';
  conversionExpression: ExpressionNode | null;
}

export interface SemanticJunction {
  id: string;
  layerId: string;
  kind: 'junction' | 'history' | 'deep-history';
  outgoingTransitionIds: string[];
}

export interface SemanticModel {
  tickMs: number;
  rootLayerId: string;
  states: Record<string, SemanticState>;
  layers: Record<string, SemanticLayer>;
  junctions: Record<string, SemanticJunction>;
  transitions: Record<string, SemanticTransition>;
  transitionsBySource: Record<string, string[]>;
  variables: Record<string, SemanticVariable>;
  ioMappings: SemanticIOMapping[];
  activeSlotCount: number;
}

export interface SemanticBuildResult {
  ir?: SemanticModel;
  diagnostics: ModelDiagnostic[];
}
