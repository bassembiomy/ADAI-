import type { MetaclassKind, SemanticElement } from '../domain/base';
import type { SysmlRepositoryV4 } from '../domain';
import type { SemanticAuthority } from '../compliance/types';
import { getSupportedElementKinds } from './catalog';

export interface CapabilityDecision {
  allowed: boolean;
  code?: 'ILLEGAL_OWNERSHIP';
  message?: string;
}

export interface ElementCapability {
  metaclass: MetaclassKind;
  label: string;
  allowed: boolean;
  category: 'element' | 'feature';
  authority: SemanticAuthority;
  diagnosticCode?: 'ILLEGAL_OWNERSHIP';
  reason?: string;
}

export const OWNERSHIP_MATRIX: Record<string, readonly MetaclassKind[]> = {
  Model: [
    'Package',
    'Block',
    'InterfaceBlock',
    'ConstraintBlock',
    'AssociationBlock',
    'FlowSpecification',
    'DataType',
    'ValueType',
    'QuantityKind',
    'Unit',
    'Enumeration',
    'Signal',
    'Requirement',
    'TestCase',
    'VerificationCase',
    'Comment',
    'Rationale',
    'Constraint',
  ],
  Package: [
    'Package',
    'Block',
    'InterfaceBlock',
    'ConstraintBlock',
    'AssociationBlock',
    'FlowSpecification',
    'DataType',
    'ValueType',
    'QuantityKind',
    'Unit',
    'Enumeration',
    'Signal',
    'Requirement',
    'TestCase',
    'VerificationCase',
    'Comment',
    'Rationale',
    'Constraint',
  ],
  Block: [
    'PartProperty',
    'ReferenceProperty',
    'ValueProperty',
    'ConstraintProperty',
    'FlowProperty',
    'Port',
    'Operation',
    'Reception',
    'Constraint',
    'Comment',
    'Rationale',
  ],
  InterfaceBlock: [
    'FlowProperty',
    'Port',
    'Operation',
    'Reception',
    'Constraint',
    'Comment',
    'Rationale',
  ],
  ConstraintBlock: [
    'ConstraintProperty',
    'Constraint',
    'Parameter',
    'Operation',
    'Comment',
    'Rationale',
  ],
  AssociationBlock: [
    'PartProperty',
    'ReferenceProperty',
    'ValueProperty',
    'ConstraintProperty',
    'FlowProperty',
    'Port',
    'Operation',
    'Reception',
    'Constraint',
    'Comment',
    'Rationale',
  ],
  Requirement: [
    'Requirement',
    'Comment',
    'Rationale',
    'Constraint',
  ],
  Operation: [
    'Parameter',
    'Comment',
    'Rationale',
    'Constraint',
  ],
  Enumeration: [
    'EnumerationLiteral',
    'Comment',
    'Rationale',
  ],
  FlowSpecification: [
    'FlowProperty',
    'Comment',
    'Rationale',
  ],
  Port: [
    'Comment',
    'Rationale',
    'Constraint',
  ],
};

export function evaluateOwnership(
  owner: SemanticElement | null,
  childKind: MetaclassKind
): CapabilityDecision {
  const ownerKind = owner?.metaclass ?? 'Model';
  const allowedKinds = OWNERSHIP_MATRIX[ownerKind] ?? [];
  const allowed = allowedKinds.includes(childKind);
  return allowed
    ? { allowed: true }
    : {
        allowed: false,
        code: 'ILLEGAL_OWNERSHIP',
        message: `${childKind} cannot be owned by ${ownerKind}.`,
      };
}

export function getOwnedElementCapabilities(
  owner: SemanticElement | null,
  _repository?: SysmlRepositoryV4
): ElementCapability[] {
  return getSupportedElementKinds().map((def) => {
    const decision = evaluateOwnership(owner, def.metaclass);
    return {
      metaclass: def.metaclass,
      label: def.label,
      allowed: decision.allowed,
      category: def.category,
      authority: def.authority,
      diagnosticCode: decision.code,
      reason: decision.message,
    };
  });
}
