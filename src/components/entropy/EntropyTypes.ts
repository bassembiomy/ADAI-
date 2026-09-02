import { Node, Edge } from '@xyflow/react';
import type {
  OpmObjectExecution,
  OpmStateExecution,
  OpmProcessExecution,
  OpmLinkExecution,
} from '../../engine/opm/executableTypes';

export type OPMNodeType = 'object' | 'process' | 'state' | 'requirement';

export type OPMLinkType =
  // Structural Links
  | 'aggregation'
  | 'exhibition'
  | 'generalization'
  // Procedural Links
  | 'agent'
  | 'instrument'
  | 'consumption'
  | 'result'
  | 'effect'
  | 'trigger'
  | 'condition'
  // Requirement traceability (extension to ISO 19450 — see module docs)
  | 'satisfies'
  | 'verifies';

export interface OPMState {
  id: string;
  name: string;
  isActive: boolean;
  isInitial?: boolean;
  value?: string;
}

export interface OPMPort {
  id: string;
  name: string;
  type: 'consumption' | 'result' | 'effect' | 'agent' | 'instrument' | 'trigger' | 'condition' | 'standard';
  direction: 'input' | 'output';
  position: 'left' | 'right' | 'top' | 'bottom';
}

export interface OPMNodeData extends Record<string, unknown> {
  name: string;
  type: OPMNodeType;
  physical: boolean;
  states?: OPMState[];
  attributes?: { key: string; value: string }[];
  // Requirement nodes only: the natural-language requirement statement
  requirementText?: string;
  // State nodes only: true for the first state of an object (ISO initial-state marker)
  isInitial?: boolean;
  parentId?: string | null;
  // For hierarchical refinement:
  zoomedIn?: boolean;
  inputs?: OPMPort[];
  outputs?: OPMPort[];
  // Executable schema (optional, backward compatible): present only after the
  // explicit enable action. Absent means the node is conceptual-only.
  objectExecution?: OpmObjectExecution;
  stateExecution?: OpmStateExecution;
  processExecution?: OpmProcessExecution;
  [key: string]: unknown;
}

export interface OPMEdgeData extends Record<string, unknown> {
  type?: OPMLinkType;
  label?: string;
  // Conditions or specifications
  conditionText?: string;
  isSimulating?: boolean;
  isActiveFlow?: boolean;
  // Executable schema (optional, backward compatible): present only after the
  // explicit enable action. Absent means the link is conceptual-only.
  linkExecution?: OpmLinkExecution;
  [key: string]: unknown;
}

export interface SimulationLog {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface OPMProjectData {
  nodes: AppNode[];
  edges: AppEdge[];
}

export type AppNode = Node<
  OPMNodeData,
  'opmObject' | 'opmProcess' | 'opmState'
>;

export type AppEdge = Edge<OPMEdgeData, OPMLinkType | 'opmEdge'>;
