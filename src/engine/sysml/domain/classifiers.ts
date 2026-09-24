import type { Multiplicity, SemanticElement, ValueSpecification } from './base';

export interface Classifier extends SemanticElement {
  isAbstract?: boolean;
  isLeaf?: boolean;
  generalIds?: string[];
}

export interface Block extends Classifier {
  metaclass: 'Block';
  isEncapsulated?: boolean;
}

export interface InterfaceBlock extends Classifier {
  metaclass: 'InterfaceBlock';
}

export interface ConstraintBlock extends Classifier {
  metaclass: 'ConstraintBlock';
  constraintIds: string[];
}

export interface AssociationBlock extends Classifier {
  metaclass: 'AssociationBlock';
  associationId: string;
}

export interface DataType extends Classifier {
  metaclass: 'DataType';
}

export interface QuantityKind extends SemanticElement {
  metaclass: 'QuantityKind';
  symbol?: string;
  description?: string;
}

export interface Unit extends SemanticElement {
  metaclass: 'Unit';
  symbol?: string;
  quantityKindId?: string;
}

export interface ValueType extends Classifier {
  metaclass: 'ValueType';
  quantityKindId?: string;
  unitId?: string;
  dataTypeId?: string;
}

export interface EnumerationLiteral extends SemanticElement {
  metaclass: 'EnumerationLiteral';
}

export interface Enumeration extends Classifier {
  metaclass: 'Enumeration';
  literalIds: string[];
}

export interface Signal extends Classifier {
  metaclass: 'Signal';
}

export interface Parameter extends SemanticElement {
  metaclass: 'Parameter';
  typeId: string;
  direction: 'in' | 'out' | 'inout' | 'return';
  multiplicity: Multiplicity;
  defaultValue?: ValueSpecification;
}

export interface Operation extends SemanticElement {
  metaclass: 'Operation';
  parameterIds: string[];
  returnTypeId?: string;
  isQuery?: boolean;
}

export interface Reception extends SemanticElement {
  metaclass: 'Reception';
  signalId: string;
}
