export type UseCaseNodeType = 'useCase' | 'actor' | 'systemBoundary';

export type UseCaseRelationshipType = 
  | 'association' 
  | 'include' 
  | 'extend' 
  | 'generalization' 
  | 'refine' 
  | 'satisfy' 
  | 'trace';

export interface UseCaseRequirementTrace {
  requirementId: string;
  relationType: 'refine' | 'satisfy' | 'trace' | 'verify';
}

export interface UseCaseElementData extends Record<string, unknown> {
  label: string;
  description?: string;
  isExternal?: boolean;
  subjectBlockId?: string;           // Maps to SysML Block
  elaboratingDiagramId?: string;     // Maps to Activity or Sequence Diagram
  requirementTraces?: UseCaseRequirementTrace[];
  extensionPoints?: string[];
  canonicalElementId?: string;
}

export interface UseCaseNode {
  id: string;
  type: UseCaseNodeType;
  position: { x: number; y: number };
  data: UseCaseElementData;
  width?: number;
  height?: number;
  parentId?: string;
  selected?: boolean;
}

export interface UseCaseRelationship {
  id: string;
  source: string;
  target: string;
  type: UseCaseRelationshipType;
  label?: string;
  selected?: boolean;
}

export interface UseCaseDiagram {
  id: string;
  name: string;
  nodes: UseCaseNode[];
  edges: UseCaseRelationship[];
}
