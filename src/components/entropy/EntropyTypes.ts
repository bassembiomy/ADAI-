import { Node, Edge } from '@xyflow/react';
import type {
  OpmObjectExecution,
  OpmStateExecution,
  OpmProcessExecution,
  OpmLinkExecution,
  OpmExecutionConfig,
} from '../../engine/opm/executableTypes';
import type {
  OpmEditorNodeType,
  OpmEditorLinkType,
  OpmEditorState,
  OpmEditorPort,
} from '../../engine/opm/editorBoundaryTypes';

export type OPMNodeType = OpmEditorNodeType;
export type OPMLinkType = OpmEditorLinkType;
export type OPMState = OpmEditorState;
export type OPMPort = OpmEditorPort;
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
  executionConfig?: OpmExecutionConfig;
}

export type AppNode = Node<
  OPMNodeData,
  'opmObject' | 'opmProcess' | 'opmState'
>;

export type AppEdge = Edge<OPMEdgeData, OPMLinkType | 'opmEdge'>;
