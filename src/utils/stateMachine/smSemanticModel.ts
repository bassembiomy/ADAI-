import type { VariableOverflowPolicy, VariableType } from '../../types/sm_types';
import type { ActionNode, ExpressionNode } from './smExpressions';
import type {
  ModelDiagnostic,
  SMCStandard,
  SMInvalidInputPolicy,
  SMTimerPolicy,
  StateDecomposition,
} from './smModel';
import type { XBSemanticModel } from './xbSemanticModel';

export type SemanticType =
  | 'boolean'
  | 'int8'
  | 'uint8'
  | 'int16'
  | 'uint16'
  | 'int32'
  | 'uint32'
  | 'float32'
  | 'float64';

export interface SemanticVariableSymbol {
  readonly id: string;
  readonly modelName: string;
  readonly cIdentifier: string;
  readonly semanticType: SemanticType;
  readonly cType: string;
}

export interface XBOwnerState {
  readonly stateId: string;
  readonly stateName: string;
  readonly cIndexSymbol: string;
  readonly numericIndex: number;
}


export interface SemanticState {
  id: string;
  name: string;
  entrySource: string;
  duringSource: string;
  exitSource: string;
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
  xBridges: XBSemanticModel | null;
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
  guardSource: string;
  actionSource: string;
  sourceStateId: string;
  destinationStateId: string;
  kind: 'outer' | 'inner' | 'internal-action' | 'external-self';
  transitionKind: 'external' | 'internal' | 'local';
  lcaStateId: string | null;
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
  routes: SemanticTransitionRoute[];
}

export interface SemanticTransitionRoute {
  transitionIds: string[];
  destinationKind: 'state' | 'history';
  destinationStateId: string | null;
  destinationJunctionId: string | null;
  exitStateIds: string[];
  entryStateIds: string[];
}

export interface SemanticVariable {
  id: string;
  name: string;
  cName: string;
  type: VariableType;
  overflowPolicy?: VariableOverflowPolicy;
  initialValue: number | boolean;
}

export interface SemanticIOMapping {
  id: string;
  variableId: string;
  channelId: string;
  channelDataType: string;
  direction: 'read' | 'write';
  conversionExpression: ExpressionNode | null;
  safeValue: number | boolean | null;
}

export interface SemanticJunction {
  id: string;
  layerId: string;
  kind: 'junction' | 'history' | 'deep-history';
  outgoingTransitionIds: string[];
}

export interface TraceableElement {
  id: string;
  kind: 'state' | 'transition' | 'guard' | 'entry-action' | 'exit-action' | 'transition-action' | 'event' | 'xbridge';
  requirementIds: string[];
  modelPath: string;
  traceId: string;
}

export interface ResolvedSMVerificationConfig {
  readonly cStandard: SMCStandard;
  readonly tickToleranceMs: number;
  readonly timerPolicy: SMTimerPolicy;
  readonly resetPolicy: 'always-authorized' | 'condition-required';
  readonly watchdogAfterCriticalFault: 'service' | 'do-not-service';
  readonly statementCoverageTarget: number;
  readonly branchCoverageTarget: number;
  readonly requireMcdc: boolean;
  readonly repeatedExecutionCycles: number;
  readonly staticAnalysisToolId: string | null;
  readonly misraToolId: string | null;
  readonly targetId: string | null;
  readonly invalidInputPolicies: Readonly<Record<string, SMInvalidInputPolicy>>;
}

export interface SemanticModel {
  tickMs: number;
  safetyMode: boolean;
  safeStateId: string | null;
  rootLayerId: string;
  states: Record<string, SemanticState>;
  layers: Record<string, SemanticLayer>;
  junctions: Record<string, SemanticJunction>;
  transitions: Record<string, SemanticTransition>;
  transitionsBySource: Record<string, string[]>;
  variables: Record<string, SemanticVariable>;
  ioMappings: SemanticIOMapping[];
  activeSlotCount: number;
  traceableElements: TraceableElement[];
  modelHash?: string;
  verification: ResolvedSMVerificationConfig;
}

export interface SemanticBuildResult {
  ir?: SemanticModel;
  diagnostics: ModelDiagnostic[];
  variableSymbols?: ReadonlyMap<string, SemanticVariableSymbol>;
  stateSymbols?: ReadonlyMap<string, XBOwnerState>;
}

