import type { Multiplicity, SemanticElement, ValueSpecification } from './base';

export interface StructuralFeature extends SemanticElement {
  typeId: string;
  multiplicity: Multiplicity;
  isStatic?: boolean;
  isReadOnly?: boolean;
  defaultValue?: ValueSpecification;
  isDerived?: boolean;
  redefinesId?: string;
  subsetsId?: string;
}

export interface PartProperty extends StructuralFeature {
  metaclass: 'PartProperty';
  aggregation: 'composite';
}

export interface ReferenceProperty extends StructuralFeature {
  metaclass: 'ReferenceProperty';
  aggregation: 'none' | 'shared';
  associationId?: string;
}

export interface ValueProperty extends StructuralFeature {
  metaclass: 'ValueProperty';
  quantityKindId?: string;
  unitId?: string;
}

export interface ConstraintProperty extends StructuralFeature {
  metaclass: 'ConstraintProperty';
  constraintBlockId?: string;
}

export interface FlowProperty extends StructuralFeature {
  metaclass: 'FlowProperty';
  direction: 'in' | 'out' | 'inout';
}

export type Property =
  | PartProperty
  | ReferenceProperty
  | ValueProperty
  | ConstraintProperty
  | FlowProperty;
