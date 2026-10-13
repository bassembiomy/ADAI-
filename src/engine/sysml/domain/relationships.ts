import type { Multiplicity } from './base';

export type RelationshipMetaclass =
  // UML Foundation Relationships
  | 'Association'
  | 'Generalization'
  | 'Dependency'
  | 'Realization'
  | 'Usage'
  | 'PackageImport'
  | 'ElementImport'
  | 'PackageMerge'
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
  | 'InformationFlow'
  // Behavioral Relationships
  | 'Transition'
  | 'ActivityEdge'
  | 'ControlFlow'
  | 'ObjectFlow'
  // Use case relationships (UML 2.5 §18.1)
  | 'Include'
  | 'Extend';

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
  ownerId?: string | null;
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

export type PackageVisibility = 'public' | 'private';

export interface PackageImport extends SemanticRelationship {
  metaclass: 'PackageImport';
  importingNamespaceId: string;
  importedPackageId: string;
  visibility: PackageVisibility;
}

export interface ElementImport extends SemanticRelationship {
  metaclass: 'ElementImport';
  importingNamespaceId: string;
  importedElementId: string;
  visibility: PackageVisibility;
  alias?: string;
}

export interface PackageMerge extends SemanticRelationship {
  metaclass: 'PackageMerge';
  mergingPackageId: string;
  mergedPackageId: string;
}
