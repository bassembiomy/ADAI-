import type {
  SemanticElement,
  SemanticRelationship,
  SysmlRepositoryV4,
  MetaclassKind,
} from '../domain';
import { evaluateSysmlConnection, familyOfMetaclass, type ConnectionPolicyInput, type SysmlEndpointFamily } from '../connectionPolicy';

export interface RelationshipValidationDecision {
  allowed: boolean;
  code?: string;
  message?: string;
  diagnostics?: string[];
}

export type SupportedRelationshipMetaclass =
  | 'Association'
  | 'SharedAggregation'
  | 'Composition'
  | 'Generalization'
  | 'Dependency'
  | 'Allocate'
  | 'Satisfy'
  | 'Verify'
  | 'Refine'
  | 'Trace'
  | 'RequirementContainment'
  | 'DeriveReqt'
  | 'Copy'
  | 'Connector'
  | 'BindingConnector'
  | 'ItemFlow'
  | 'Transition'
  | 'ActivityEdge'
  | 'ControlFlow'
  | 'ObjectFlow';

export const RELATIONSHIP_ALIASES: Record<string, SupportedRelationshipMetaclass> = {
  association: 'Association',
  sharedaggregation: 'SharedAggregation',
  aggregation: 'SharedAggregation',
  composition: 'Composition',
  generalization: 'Generalization',
  dependency: 'Dependency',
  allocate: 'Allocate',
  allocation: 'Allocate',
  satisfy: 'Satisfy',
  verify: 'Verify',
  refine: 'Refine',
  trace: 'Trace',
  requirementcontainment: 'RequirementContainment',
  containment: 'RequirementContainment',
  derivereqt: 'DeriveReqt',
  derive: 'DeriveReqt',
  copy: 'Copy',
  connector: 'Connector',
  bindingconnector: 'BindingConnector',
  binding: 'BindingConnector',
  itemflow: 'ItemFlow',
  transition: 'Transition',
  activityedge: 'ActivityEdge',
  controlflow: 'ControlFlow',
  objectflow: 'ObjectFlow',
};

export function normalizeRelationshipKind(kind: string): SupportedRelationshipMetaclass | null {
  const lower = kind.trim().toLowerCase();
  return RELATIONSHIP_ALIASES[lower] ?? (Object.values(RELATIONSHIP_ALIASES).includes(kind as any) ? (kind as SupportedRelationshipMetaclass) : null);
}

const CLASSIFIER_KINDS: readonly MetaclassKind[] = [
  'Block',
  'InterfaceBlock',
  'ConstraintBlock',
  'AssociationBlock',
  'DataType',
  'ValueType',
  'Signal',
  'FlowSpecification',
];

const FEATURE_KINDS: readonly MetaclassKind[] = [
  'Port',
  'PartProperty',
  'ReferenceProperty',
  'ValueProperty',
  'FlowProperty',
  'ConstraintProperty',
];

interface RelationshipRule {
  allowedSources: readonly MetaclassKind[] | 'ANY';
  allowedTargets: readonly MetaclassKind[] | 'ANY';
}

const RELATIONSHIP_RULES: Record<SupportedRelationshipMetaclass, RelationshipRule> = {
  Association: {
    allowedSources: CLASSIFIER_KINDS,
    allowedTargets: CLASSIFIER_KINDS,
  },
  SharedAggregation: {
    allowedSources: ['Block', 'AssociationBlock'],
    allowedTargets: CLASSIFIER_KINDS,
  },
  Composition: {
    allowedSources: ['Block', 'AssociationBlock', 'Requirement'],
    allowedTargets: CLASSIFIER_KINDS.concat('Requirement'),
  },
  Generalization: {
    allowedSources: CLASSIFIER_KINDS,
    allowedTargets: CLASSIFIER_KINDS,
  },
  Dependency: {
    allowedSources: 'ANY',
    allowedTargets: 'ANY',
  },
  Allocate: {
    allowedSources: ['Block', 'PartProperty', 'Operation', 'Activity', 'UseCase'],
    allowedTargets: ['Block', 'PartProperty', 'Operation', 'Activity', 'UseCase'],
  },
  Satisfy: {
    allowedSources: ['Block', 'PartProperty', 'Operation', 'Activity', 'UseCase'],
    allowedTargets: ['Requirement'],
  },
  Verify: {
    allowedSources: ['TestCase', 'Block', 'Operation', 'Activity', 'Interaction'],
    allowedTargets: ['Requirement'],
  },
  Refine: {
    allowedSources: ['Block', 'UseCase', 'Activity', 'Interaction', 'Operation', 'Requirement'],
    allowedTargets: ['Requirement'],
  },
  Trace: {
    allowedSources: 'ANY',
    allowedTargets: 'ANY',
  },
  RequirementContainment: {
    allowedSources: ['Requirement'],
    allowedTargets: ['Requirement'],
  },
  DeriveReqt: {
    allowedSources: ['Requirement'],
    allowedTargets: ['Requirement'],
  },
  Copy: {
    allowedSources: ['Requirement'],
    allowedTargets: ['Requirement'],
  },
  Connector: {
    allowedSources: FEATURE_KINDS,
    allowedTargets: FEATURE_KINDS,
  },
  BindingConnector: {
    allowedSources: FEATURE_KINDS,
    allowedTargets: FEATURE_KINDS,
  },
  ItemFlow: {
    allowedSources: FEATURE_KINDS.concat(CLASSIFIER_KINDS),
    allowedTargets: FEATURE_KINDS.concat(CLASSIFIER_KINDS),
  },
  Transition: {
    allowedSources: 'ANY',
    allowedTargets: 'ANY',
  },
  ActivityEdge: {
    allowedSources: 'ANY',
    allowedTargets: 'ANY',
  },
  ControlFlow: {
    allowedSources: 'ANY',
    allowedTargets: 'ANY',
  },
  ObjectFlow: {
    allowedSources: 'ANY',
    allowedTargets: 'ANY',
  },
};

/**
 * Kinds whose endpoint legality is owned by the central connection policy
 * (connectionPolicy.ts). Only kinds the policy does not model (connectors,
 * item flows, behaviour edges) keep the metaclass table below.
 */
const POLICY_DELEGATED: Partial<Record<SupportedRelationshipMetaclass, Pick<ConnectionPolicyInput, 'relationshipKind' | 'diagram'>>> = {
  Association: { relationshipKind: 'association', diagram: 'bdd' },
  SharedAggregation: { relationshipKind: 'sharedAggregation', diagram: 'bdd' },
  Composition: { relationshipKind: 'composition', diagram: 'bdd' },
  Generalization: { relationshipKind: 'generalization', diagram: 'bdd' },
  Dependency: { relationshipKind: 'dependency', diagram: 'bdd' },
  Allocate: { relationshipKind: 'allocation', diagram: 'bdd' },
  Satisfy: { relationshipKind: 'satisfy', diagram: 'rtm' },
  Verify: { relationshipKind: 'verify', diagram: 'rtm' },
  Refine: { relationshipKind: 'refine', diagram: 'rtm' },
  Trace: { relationshipKind: 'trace', diagram: 'rtm' },
  RequirementContainment: { relationshipKind: 'requirementContainment', diagram: 'requirements' },
  DeriveReqt: { relationshipKind: 'deriveReqt', diagram: 'requirements' },
  Copy: { relationshipKind: 'copy', diagram: 'requirements' },
};

const PROBE_FAMILIES: readonly SysmlEndpointFamily[] = [
  'block', 'interfaceBlock', 'interface', 'valueType', 'enumeration', 'signal', 'constraintBlock', 'requirement', 'verificationCase',
  'part', 'port', 'property', 'actor', 'useCase', 'subject', 'state', 'activity', 'operation',
];

function connectionAllows(
  delegated: Pick<ConnectionPolicyInput, 'relationshipKind' | 'diagram'>,
  sourceFamily: SysmlEndpointFamily,
  targetFamily: SysmlEndpointFamily,
): boolean {
  return evaluateSysmlConnection({
    ...delegated,
    source: { id: 'source', name: 'source', family: sourceFamily },
    target: { id: 'target', name: 'target', family: targetFamily },
  }).allowed;
}
export function validateRelationshipEndpoints(
  rel: SemanticRelationship,
  repo: SysmlRepositoryV4
): RelationshipValidationDecision {
  const normKind = normalizeRelationshipKind(rel.metaclass);
  if (!normKind) {
    return {
      allowed: false,
      code: 'UNSUPPORTED_RELATIONSHIP',
      message: `Relationship kind "${rel.metaclass}" is unsupported.`,
      diagnostics: ['UNSUPPORTED_RELATIONSHIP'],
    };
  }

  const source = repo.elements[rel.sourceId];
  if (!source) {
    return {
      allowed: false,
      code: 'SOURCE_ELEMENT_NOT_FOUND',
      message: `Source element "${rel.sourceId}" does not exist.`,
      diagnostics: ['SOURCE_ELEMENT_NOT_FOUND'],
    };
  }

  const target = repo.elements[rel.targetId];
  if (!target) {
    return {
      allowed: false,
      code: 'TARGET_ELEMENT_NOT_FOUND',
      message: `Target element "${rel.targetId}" does not exist.`,
      diagnostics: ['TARGET_ELEMENT_NOT_FOUND'],
    };
  }

  const delegated = POLICY_DELEGATED[normKind];
  const rule = RELATIONSHIP_RULES[normKind];
  const sourceAllowed = delegated
    ? connectionAllows(delegated, familyOfMetaclass(source.metaclass), familyOfMetaclass(target.metaclass))
    : rule.allowedSources === 'ANY' || rule.allowedSources.includes(source.metaclass);
  const targetAllowed = delegated ? sourceAllowed : rule.allowedTargets === 'ANY' || rule.allowedTargets.includes(target.metaclass);

  if (!sourceAllowed || !targetAllowed) {
    const diagnostic = `${normKind.toUpperCase()}_INVALID_ENDPOINTS`;
    return {
      allowed: false,
      code: 'INVALID_ENDPOINT_METACLASS',
      message: `${normKind} cannot connect ${source.metaclass} to ${target.metaclass}.`,
      diagnostics: [diagnostic],
    };
  }

  return { allowed: true, diagnostics: [] };
}

export function getLegalRelationshipKinds(
  source: SemanticElement,
  direction: 'outgoing' | 'incoming',
  _repo: SysmlRepositoryV4
): SupportedRelationshipMetaclass[] {
  const legalKinds: SupportedRelationshipMetaclass[] = [];

  for (const [kind, rule] of Object.entries(RELATIONSHIP_RULES) as Array<[SupportedRelationshipMetaclass, RelationshipRule]>) {
    const delegated = POLICY_DELEGATED[kind];
    if (delegated) {
      // Probe the shared policy with one representative of every family.
      const own = familyOfMetaclass(source.metaclass);
      const legal = PROBE_FAMILIES.some(other => direction === 'outgoing'
        ? connectionAllows(delegated, own, other)
        : connectionAllows(delegated, other, own));
      if (legal) legalKinds.push(kind);
      continue;
    }
    if (direction === 'outgoing') {
      if (rule.allowedSources === 'ANY' || rule.allowedSources.includes(source.metaclass)) {
        legalKinds.push(kind);
      }
    } else {
      if (rule.allowedTargets === 'ANY' || rule.allowedTargets.includes(source.metaclass)) {
        legalKinds.push(kind);
      }
    }
  }

  return legalKinds;
}

export function getLegalRelationshipTargets(
  source: SemanticElement,
  kind: string,
  direction: 'outgoing' | 'incoming',
  repo: SysmlRepositoryV4
): SemanticElement[] {
  const normKind = normalizeRelationshipKind(kind);
  if (!normKind) return [];

  const targets: SemanticElement[] = [];

  for (const element of Object.values(repo.elements)) {
    if (element.id === source.id) continue;

    const testRel: SemanticRelationship = direction === 'outgoing'
      ? { id: '__test__', metaclass: normKind as any, sourceId: source.id, targetId: element.id }
      : { id: '__test__', metaclass: normKind as any, sourceId: element.id, targetId: source.id };

    if (validateRelationshipEndpoints(testRel, repo).allowed) {
      targets.push(element);
    }
  }

  return targets;
}
