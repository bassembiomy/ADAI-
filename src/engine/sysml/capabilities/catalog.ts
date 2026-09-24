import type { MetaclassKind } from '../domain/base';
import type { SemanticAuthority } from '../compliance/types';

export interface ElementCapabilityDefinition {
  metaclass: MetaclassKind;
  label: string;
  authority: SemanticAuthority;
  category: 'element' | 'feature';
  description?: string;
}

const ELEMENT_CATALOG: readonly ElementCapabilityDefinition[] = [
  // Packages and Organization
  { metaclass: 'Model', label: 'Model', authority: 'UML_FOUNDATION', category: 'element' },
  { metaclass: 'Package', label: 'Package', authority: 'UML_FOUNDATION', category: 'element' },

  // Classifiers
  { metaclass: 'Block', label: 'Block', authority: 'OMG_SYSML_1_6', category: 'element' },
  { metaclass: 'InterfaceBlock', label: 'Interface Block', authority: 'OMG_SYSML_1_6', category: 'element' },
  { metaclass: 'ConstraintBlock', label: 'Constraint Block', authority: 'OMG_SYSML_1_6', category: 'element' },
  { metaclass: 'AssociationBlock', label: 'Association Block', authority: 'OMG_SYSML_1_6', category: 'element' },
  { metaclass: 'FlowSpecification', label: 'Flow Specification', authority: 'OMG_SYSML_1_6', category: 'element' },
  { metaclass: 'ValueType', label: 'Value Type', authority: 'OMG_SYSML_1_6', category: 'element' },
  { metaclass: 'DataType', label: 'Data Type', authority: 'UML_FOUNDATION', category: 'element' },
  { metaclass: 'QuantityKind', label: 'Quantity Kind', authority: 'OMG_SYSML_1_6', category: 'element' },
  { metaclass: 'Unit', label: 'Unit', authority: 'OMG_SYSML_1_6', category: 'element' },
  { metaclass: 'Enumeration', label: 'Enumeration', authority: 'UML_FOUNDATION', category: 'element' },
  { metaclass: 'Signal', label: 'Signal', authority: 'UML_FOUNDATION', category: 'element' },

  // Requirements & Verification
  { metaclass: 'Requirement', label: 'Requirement', authority: 'OMG_SYSML_1_6', category: 'element' },
  { metaclass: 'TestCase', label: 'Test Case', authority: 'OMG_SYSML_1_6', category: 'element' },
  { metaclass: 'VerificationCase', label: 'Verification Case', authority: 'ADIA_EXTENSION', category: 'element' },

  // Behaviors
  { metaclass: 'UseCase', label: 'Use Case', authority: 'OMG_SYSML_1_6', category: 'element' },
  { metaclass: 'Activity', label: 'Activity', authority: 'OMG_SYSML_1_6', category: 'element' },
  { metaclass: 'ActivityPartition', label: 'Activity Partition', authority: 'OMG_SYSML_1_6', category: 'element' },

  // Annotations & Constraints
  { metaclass: 'Comment', label: 'Comment', authority: 'UML_FOUNDATION', category: 'element' },
  { metaclass: 'Rationale', label: 'Rationale', authority: 'OMG_SYSML_1_6', category: 'element' },
  { metaclass: 'Constraint', label: 'Constraint', authority: 'UML_FOUNDATION', category: 'element' },

  // Classifier Features
  { metaclass: 'PartProperty', label: 'Part Property', authority: 'OMG_SYSML_1_6', category: 'feature' },
  { metaclass: 'ReferenceProperty', label: 'Reference Property', authority: 'OMG_SYSML_1_6', category: 'feature' },
  { metaclass: 'ValueProperty', label: 'Value Property', authority: 'OMG_SYSML_1_6', category: 'feature' },
  { metaclass: 'ConstraintProperty', label: 'Constraint Property', authority: 'OMG_SYSML_1_6', category: 'feature' },
  { metaclass: 'FlowProperty', label: 'Flow Property', authority: 'OMG_SYSML_1_6', category: 'feature' },
  { metaclass: 'Port', label: 'Port', authority: 'UML_FOUNDATION', category: 'feature' },
  { metaclass: 'Operation', label: 'Operation', authority: 'UML_FOUNDATION', category: 'feature' },
  { metaclass: 'Parameter', label: 'Parameter', authority: 'UML_FOUNDATION', category: 'feature' },
  { metaclass: 'Reception', label: 'Reception', authority: 'UML_FOUNDATION', category: 'feature' },
  { metaclass: 'EnumerationLiteral', label: 'Enumeration Literal', authority: 'UML_FOUNDATION', category: 'feature' },
];

const CATALOG_BY_METACLASS = new Map<MetaclassKind, ElementCapabilityDefinition>(
  ELEMENT_CATALOG.map((def) => [def.metaclass, def])
);

export function getSupportedElementKinds(): ElementCapabilityDefinition[] {
  return [...ELEMENT_CATALOG];
}

export function getElementCapabilityDefinition(kind: MetaclassKind): ElementCapabilityDefinition | undefined {
  return CATALOG_BY_METACLASS.get(kind);
}
