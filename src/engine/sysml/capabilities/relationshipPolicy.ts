import type {
  SemanticElement,
  SemanticRelationship,
  SysmlRepositoryV4,
  MetaclassKind,
} from '../domain';

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
  | 'ItemFlow';

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
    allowedSources: ['TestCase', 'Block', 'Operation', 'Activity'],
    allowedTargets: ['Requirement'],
  },
  Refine: {
    allowedSources: ['Block', 'UseCase', 'Activity', 'Operation', 'Requirement'],
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
};

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

  const rule = RELATIONSHIP_RULES[normKind];
  const sourceAllowed = rule.allowedSources === 'ANY' || rule.allowedSources.includes(source.metaclass);
  const targetAllowed = rule.allowedTargets === 'ANY' || rule.allowedTargets.includes(target.metaclass);

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
