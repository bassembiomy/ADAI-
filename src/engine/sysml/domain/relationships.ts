import type { Multiplicity } from './base';

export type RelationshipMetaclass =
  // UML Foundation Relationships
  | 'Association'
  | 'Generalization'
  | 'Dependency'
  | 'Realization'
  | 'Usage'
  // SysML Requirements Relationships
  | 'Containment'
  | 'DeriveReqt'
  | 'Satisfy'
  | 'Verify'
  | 'Refine'
  | 'Trace'
  | 'Copy'
  // Cross-Cutting Allocations
  | 'Allocate'
  // Internal Block Diagram Connectors
  | 'Connector'
  | 'BindingConnector'
  // Flows
  | 'ItemFlow'
  | 'InformationFlow';

export interface AssociationEnd {
  id: string;
  role?: string;
  multiplicity?: Multiplicity;
  aggregation: 'none' | 'shared' | 'composite';
  isNavigable: boolean;
}

export interface ConnectorEnd {
  id: string;
  roleId: string;
  partWithPortId?: string;
  nestedPath?: string[];
}

export interface SemanticRelationship {
  id: string;
  name?: string;
  metaclass: RelationshipMetaclass;
  sourceId: string;
  targetId: string;
  sourceEnd?: AssociationEnd | ConnectorEnd;
  targetEnd?: AssociationEnd | ConnectorEnd;
  suspect?: boolean;
  lastValidatedRevision?: number;
  customProperties?: Record<string, unknown>;
}

export interface ItemFlow {
  id: string;
  name?: string;
  realizingRelationshipId: string;
  conveyedClassifierIds: string[];
  itemPropertyId?: string;
  sourceId: string;
  targetId: string;
}

export interface InformationFlow {
  id: string;
  name?: string;
  realizingRelationshipIds: string[];
  conveyedClassifierIds: string[];
  sourceId: string;
  targetId: string;
}

export interface AllocateRelationship extends SemanticRelationship {
  metaclass: 'Allocate';
  allocatedFromId: string;
  allocatedToId: string;
}
