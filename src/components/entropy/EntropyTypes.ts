import { Node, Edge } from 'reactflow';

export type OPMNodeType = 'object' | 'process' | 'state';

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
  | 'condition';

export interface OPMState {
  id: string;
  name: string;
  isActive: boolean;
  value?: string;
}

export interface OPMNodeData {
  name: string;
  type: OPMNodeType;
  physical: boolean;
  states?: OPMState[];
  attributes?: { key: string; value: string }[];
  parentId?: string | null;
  // For hierarchical refinement:
  zoomedIn?: boolean;
}

export interface OPMEdgeData {
  type: OPMLinkType;
  label?: string;
  // Conditions or specifications
  conditionText?: string;
}

export interface SimulationLog {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface OPMProjectData {
  nodes: Node<OPMNodeData>[];
  edges: Edge<OPMEdgeData>[];
}
