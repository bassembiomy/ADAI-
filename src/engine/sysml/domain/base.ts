/**
 * Canonical SysML v1.6 Metamodel Base Types and Value Specifications.
 * Based on OMG SysML v1.6 Clause 7 / Clause 8 and UML 2.5 Infrastructure.
 */

export interface Multiplicity {
  lower: number;
  upper: number | '*';
  ordered: boolean;
  unique: boolean;
}

export type LiteralString = { kind: 'literalString'; value: string };
export type LiteralInteger = { kind: 'literalInteger'; value: number };
export type LiteralReal = { kind: 'literalReal'; value: number };
export type LiteralBoolean = { kind: 'literalBoolean'; value: boolean };
export type OpaqueExpression = { kind: 'opaqueExpression'; body: string; language?: string };
export type InstanceValue = { kind: 'instanceValue'; instanceId: string };

export type ValueSpecification =
  | LiteralString
  | LiteralInteger
  | LiteralReal
  | LiteralBoolean
  | OpaqueExpression
  | InstanceValue;

export type MetaclassKind =
  // Packages & Groups
  | 'Package'
  | 'Model'
  // Classifiers
  | 'Block'
  | 'InterfaceBlock'
  | 'FlowSpecification'
  | 'ConstraintBlock'
  | 'AssociationBlock'
  | 'DataType'
  | 'ValueType'
  | 'QuantityKind'
  | 'Unit'
  | 'Enumeration'
  | 'EnumerationLiteral'
  | 'Signal'
  | 'Operation'
  | 'Parameter'
  | 'Reception'
  | 'Constraint'
  | 'Comment'
  | 'Rationale'
  // Properties
  | 'PartProperty'
  | 'ReferenceProperty'
  | 'ValueProperty'
  | 'ConstraintProperty'
  | 'FlowProperty'
  // Ports
  | 'Port'
  // Requirements & Verification
  | 'Requirement'
  | 'TestCase'
  | 'VerificationCase'
  // Behaviors
  | 'UseCase'
  | 'Activity'
  | 'ActivityPartition'
  // Diagrams
  | 'Diagram';

export interface SemanticElement {
  id: string;
  name: string;
  metaclass: MetaclassKind;
  namespace: string[];
  ownerId: string | null;
  commentIds?: string[];
  appliedStereotypeIds?: string[];
  customProperties?: Record<string, unknown>;
}

export interface Package extends SemanticElement {
  metaclass: 'Package' | 'Model';
}

export interface Comment extends SemanticElement {
  metaclass: 'Comment';
  body: string;
  annotatedElementIds: string[];
}

export interface Rationale extends SemanticElement {
  metaclass: 'Rationale';
  body: string;
  annotatedElementIds: string[];
  rationaleText: string;
}

export interface Constraint extends SemanticElement {
  metaclass: 'Constraint';
  specification: ValueSpecification;
  constrainedElementIds: string[];
}

export interface ConstraintExpression {
  language?: string;
  body: string;
}

