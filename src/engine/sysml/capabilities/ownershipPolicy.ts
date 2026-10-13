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
    'Diagram',
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
    'View',
    'Viewpoint',
    'Stakeholder',
    'Enumeration',
    'Signal',
    'Requirement',
    'TestCase',
    'VerificationCase',
    'UseCase',
    'Activity',
    'Interaction',
    'Comment',
    'Rationale',
    'Constraint',
  ],
  Package: [
    'Diagram',
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
    'View',
    'Viewpoint',
    'Stakeholder',
    'Enumeration',
    'Signal',
    'Requirement',
    'TestCase',
    'VerificationCase',
    'UseCase',
    'Activity',
    'Interaction',
    'Comment',
    'Rationale',
    'Constraint',
  ],
  Block: [
    'Diagram',
    'PartProperty',
    'ReferenceProperty',
    'ValueProperty',
    'ConstraintProperty',
    'FlowProperty',
    'Port',
    'Operation',
    'Reception',
    'Activity',
    'Interaction',
    'Constraint',
    'Comment',
    'Rationale',
  ],
  InterfaceBlock: [
    'Diagram',
    'FlowProperty',
    'Port',
    'Operation',
    'Reception',
    'Constraint',
    'Comment',
    'Rationale',
  ],
  ConstraintBlock: [
    'Diagram',
    'ConstraintProperty',
    'Constraint',
    'Parameter',
    'Operation',
    'Comment',
    'Rationale',
  ],
  AssociationBlock: [
    'Diagram',
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
    'Diagram',
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
  UseCase: [
    'Diagram',
    // A scenario that elaborates the use case (SysML 1.6 Clause 12 / Cameo).
    'Interaction',
    'Activity',
    'Comment',
    'Rationale',
    'Constraint',
  ],
  Activity: [
    'Diagram',
    'ActivityPartition',
    'Parameter',
    'Comment',
    'Rationale',
    'Constraint',
  ],
  ActivityPartition: [
    'ActivityPartition',
    'Comment',
    'Rationale',
    'Constraint',
  ],
  Interaction: [
    'Diagram',
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

export function getLegalOwnerGuidance(childKind: MetaclassKind): string {
  if (
    childKind === 'Port' ||
    childKind === 'PartProperty' ||
    childKind === 'ReferenceProperty' ||
    childKind === 'ValueProperty' ||
    childKind === 'FlowProperty' ||
    childKind === 'Operation' ||
    childKind === 'Reception'
  ) {
    return `Select a Block to add a ${childKind}.`;
  }
  if (
    childKind === 'Block' ||
    childKind === 'Package' ||
    childKind === 'Requirement' ||
    childKind === 'TestCase' ||
    childKind === 'UseCase' ||
    childKind === 'Activity' ||
    childKind === 'Interaction'
  ) {
    return `Select a Package to add a ${childKind}.`;
  }
  if (childKind === 'Parameter') {
    return 'Select an Operation or Activity to add a Parameter.';
  }
  for (const [ownerKind, allowedKinds] of Object.entries(OWNERSHIP_MATRIX)) {
    if (allowedKinds.includes(childKind)) {
      return `Select a ${ownerKind} to add a ${childKind}.`;
    }
  }
  return `Select a legal owner to add a ${childKind}.`;
}

export function resolveSemanticElement(
  repository: SysmlRepositoryV4 | any,
  id: string
): SemanticElement | undefined {
  if (!id || !repository) return undefined;
  if (repository.elements && repository.elements[id]) {
    return repository.elements[id];
  }
  if (repository.elements && (id === 'model' || id === 'root')) {
    return (
      repository.elements['pkg-root'] ??
      (Object.values(repository.elements).find(
        (e: any) => e.metaclass === 'Model'
      ) as SemanticElement | undefined)
    );
  }
  if (repository.definitions && repository.definitions[id]) {
    const def = repository.definitions[id];
    return {
      id: def.id,
      name: def.name,
      metaclass:
        def.kind === 'block'
          ? 'Block'
          : def.kind === 'package'
          ? 'Package'
          : def.kind === 'requirement'
          ? 'Requirement'
          : def.kind === 'interface'
          ? 'InterfaceBlock'
          : def.kind === 'valueType'
          ? 'ValueType'
          : def.kind === 'enumeration'
          ? 'Enumeration'
          : def.kind === 'signal'
          ? 'Signal'
          : def.kind === 'unit'
          ? 'Unit'
          : def.kind === 'quantityKind'
          ? 'QuantityKind'
          : def.kind === 'view'
          ? 'View'
          : def.kind === 'viewpoint'
          ? 'Viewpoint'
          : def.kind === 'stakeholder'
          ? 'Stakeholder'
          : def.kind === 'constraintBlock'
          ? 'ConstraintBlock'
          : def.kind === 'activity'
          ? 'Activity'
          : def.kind === 'interaction'
          ? 'Interaction'
          : 'Block',
      namespace: def.namespace ?? [],
      ownerId: def.ownerId ?? null,
    } as SemanticElement;
  }
  if (repository.packages && repository.packages[id]) {
    const pkg = repository.packages[id];
    return {
      id: pkg.id,
      name: pkg.name,
      metaclass: 'Package',
      namespace: pkg.namespace ?? [],
      ownerId: pkg.ownerId ?? null,
    } as SemanticElement;
  }
  if (repository.requirements && repository.requirements[id]) {
    const req = repository.requirements[id];
    return {
      id: req.id,
      name: req.name,
      metaclass: 'Requirement',
      namespace: req.namespace ?? [],
      ownerId: req.ownerId ?? null,
    } as SemanticElement;
  }
  if (repository.useCases && repository.useCases[id]) {
    const useCase = repository.useCases[id];
    return {
      id: useCase.id,
      name: useCase.name,
      metaclass: 'UseCase',
      namespace: useCase.namespace ?? [],
      ownerId: useCase.ownerId ?? null,
    } as SemanticElement;
  }
  if (repository.definitions && (id === 'model' || id === 'root')) {
    return {
      id: 'pkg-root',
      name: 'Model',
      metaclass: 'Model',
      namespace: [],
      ownerId: null,
    };
  }
  return undefined;
}

