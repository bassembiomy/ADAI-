import type {
  BlockDefinition,
  PropertyDefinition,
  SysmlRepository,
  SysmlRelationship,
} from './model';

export interface InheritedFeature {
  featureId: string;
  inheritedFromId: string;
}

export interface InheritanceResolution {
  valid: boolean;
  features: InheritedFeature[];
  diagnostics: string[];
}

export interface RelationshipDecision {
  allowed: boolean;
  diagram: 'bdd' | 'ibd' | 'requirements' | 'rtm';
  ownership?: 'composite' | 'shared' | 'none';
  diagnostics: string[];
}

export interface DeletionDecision {
  targetKind: 'definition' | 'usage' | 'connector' | 'relationship' | 'requirement' | 'unknown';
  cascadeIds: string[];
  unresolvedUsageIds: string[];
  diagnostics: string[];
}

function block(repo: SysmlRepository, id: string): BlockDefinition | undefined {
  const definition = repo.definitions[id];
  return definition?.kind === 'block' ? definition : undefined;
}

export function resolveInheritance(repo: SysmlRepository, definitionId: string): InheritanceResolution {
  const definition = block(repo, definitionId);
  if (!definition) return { valid: false, features: [], diagnostics: [`UNKNOWN_DEFINITION: Unknown block definition: ${definitionId}`] };

  const features: InheritedFeature[] = [];
  const diagnostics: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (id: string) => {
    const current = block(repo, id);
    if (!current) {
      diagnostics.push(`MISSING_SUPERTYPE: Supertype ${id} does not exist`);
      return;
    }
    if (visiting.has(id)) {
      diagnostics.push(`INHERITANCE_CYCLE: Inheritance cycle includes ${id}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const parentId of current.supertypeIds ?? []) visit(parentId);
    visiting.delete(id);
    visited.add(id);
    if (id !== definitionId) {
      for (const property of current.properties) features.push({ featureId: property.id, inheritedFromId: id });
      for (const port of current.ports) features.push({ featureId: port.id, inheritedFromId: id });
    }
  };

  visit(definitionId);

  // Leaf specialization: a leaf block cannot be specialized (OMG SysML 1.6 / UML).
  for (const parentId of definition.supertypeIds ?? []) {
    const parent = block(repo, parentId);
    if (parent?.isLeaf) {
      diagnostics.push(`LEAF_SPECIALIZATION: Leaf block ${parentId} cannot be specialized by ${definitionId}`);
    }
  }

  // Abstract instantiation guidance: abstract blocks are never directly instantiable.
  if (definition.isAbstract) {
    diagnostics.push(
      `ABSTRACT_INSTANTIATION: Block ${definitionId} is abstract and cannot be directly instantiated; specialize it with a concrete subtype`,
    );
  }

  // Redefine / subset conformance awareness (mirrors bdd.ts validateBlockDefinition).
  const inherited = collectInheritedProperties(repo, definition);
  for (const property of definition.properties) {
    if (property.redefinesId) {
      const original = inherited.find(candidate => candidate.id === property.redefinesId);
      if (!original || original.kind !== property.kind || original.typeId !== property.typeId || !multiplicityConforms(property, original)) {
        diagnostics.push(`INCOMPATIBLE_REDEFINITION: Property ${property.id} does not conform to redefined feature ${property.redefinesId}`);
      }
    }
    if (property.subsetsId) {
      const original = inherited.find(candidate => candidate.id === property.subsetsId);
      if (!original || original.kind !== property.kind || original.typeId !== property.typeId || !multiplicityIsSubset(property, original)) {
        diagnostics.push(`INVALID_SUBSETTING_MULTIPLICITY: Property ${property.id} is not a valid subset of ${property.subsetsId}`);
      }
    }
  }

  // Deterministic ordering for mass-production stability.
  features.sort((a, b) => a.featureId.localeCompare(b.featureId) || a.inheritedFromId.localeCompare(b.inheritedFromId));
  diagnostics.sort();

  const errors = diagnostics.filter(d => !d.startsWith('ABSTRACT_INSTANTIATION:'));
  return { valid: errors.length === 0, features, diagnostics };
}

function collectInheritedProperties(repo: SysmlRepository, definition: BlockDefinition): PropertyDefinition[] {
  const result: PropertyDefinition[] = [];
  const visited = new Set<string>();
  const collect = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const parent = block(repo, id);
    if (!parent) return;
    for (const supertypeId of parent.supertypeIds ?? []) collect(supertypeId);
    result.push(...parent.properties);
  };
  for (const parentId of definition.supertypeIds ?? []) collect(parentId);
  return result;
}

function multiplicityConforms(candidate: PropertyDefinition, original: PropertyDefinition): boolean {
  return candidate.multiplicity.lower >= original.multiplicity.lower && upperAtMost(candidate.multiplicity.upper, original.multiplicity.upper);
}

function multiplicityIsSubset(candidate: PropertyDefinition, original: PropertyDefinition): boolean {
  return upperAtMost(candidate.multiplicity.upper, original.multiplicity.upper);
}

function upperAtMost(candidate: number | '*', original: number | '*'): boolean {
  if (original === '*') return true;
  return candidate !== '*' && candidate <= original;
}

const BDD_KINDS = new Set(['association', 'sharedAggregation', 'composition', 'generalization', 'dependency', 'allocation']);
const IBD_KINDS = new Set(['binding', 'itemFlow']);
const RTM_KINDS = new Set(['deriveReqt', 'satisfy', 'verify', 'refine', 'trace', 'copy']);

function elementExists(repo: SysmlRepository, id: string): boolean {
  return Boolean(
    repo.definitions[id] ?? repo.usages[id] ?? repo.connectors[id] ?? repo.relationships[id] ??
    repo.requirements[id] ?? repo.verificationCases[id] ?? repo.evidence[id] ?? repo.baselines[id] ?? repo.artifacts[id],
  );
}

function requirementDirectionValid(repo: SysmlRepository, relationship: SysmlRelationship): { valid: boolean; code: string } {
  const sourceReq = Boolean(repo.requirements[relationship.sourceId]);
  const targetReq = Boolean(repo.requirements[relationship.targetId]);
  switch (relationship.kind) {
    case 'requirementContainment':
      return sourceReq && targetReq
        ? { valid: true, code: '' }
        : { valid: false, code: 'INVALID_REQUIREMENT_CONTAINMENT_ENDPOINT' };
    case 'deriveReqt':
    case 'copy':
      return sourceReq && targetReq
        ? { valid: true, code: '' }
        : { valid: false, code: 'INVALID_REQUIREMENT_RELATION_DIRECTION' };
    case 'satisfy':
    case 'refine':
      return !sourceReq && targetReq
        ? { valid: true, code: '' }
        : { valid: false, code: 'INVALID_REQUIREMENT_RELATION_DIRECTION' };
    case 'verify':
      return Boolean(repo.verificationCases[relationship.sourceId]) && targetReq
        ? { valid: true, code: '' }
        : { valid: false, code: 'INVALID_REQUIREMENT_RELATION_DIRECTION' };
    case 'trace':
      return sourceReq || targetReq
        ? { valid: true, code: '' }
        : { valid: false, code: 'INVALID_REQUIREMENT_RELATION_DIRECTION' };
    default:
      return { valid: true, code: '' };
  }
}

export function classifyRelationship(repo: SysmlRepository, relationshipId: string): RelationshipDecision {
  const relationship = repo.relationships[relationshipId] as SysmlRelationship | undefined;
  if (!relationship) return { allowed: false, diagram: 'bdd', diagnostics: [`UNKNOWN_RELATIONSHIP: Unknown relationship: ${relationshipId}`] };

  if (!BDD_KINDS.has(relationship.kind) && !IBD_KINDS.has(relationship.kind) && relationship.kind !== 'requirementContainment' && !RTM_KINDS.has(relationship.kind)) {
    return { allowed: false, diagram: 'bdd', diagnostics: [`UNSUPPORTED_RELATIONSHIP_KIND: Unsupported relationship kind: ${relationship.kind}`] };
  }

  const diagnostics: string[] = [];
  if (!elementExists(repo, relationship.sourceId)) {
    diagnostics.push(`MISSING_RELATIONSHIP_ENDPOINT: Source ${relationship.sourceId} does not exist`);
  }
  if (!elementExists(repo, relationship.targetId)) {
    diagnostics.push(`MISSING_RELATIONSHIP_ENDPOINT: Target ${relationship.targetId} does not exist`);
  }

  // BDD kinds carry ownership; IBD connector-ish kinds carry none.
  if (BDD_KINDS.has(relationship.kind)) {
    const ownership = relationship.kind === 'composition' ? 'composite' : relationship.kind === 'sharedAggregation' ? 'shared' : 'none';
    if (relationship.kind === 'generalization') {
      const sourceIsBlock = block(repo, relationship.sourceId) !== undefined;
      const targetIsBlock = block(repo, relationship.targetId) !== undefined;
      if (!sourceIsBlock || !targetIsBlock) {
        diagnostics.push(`INVALID_GENERALIZATION_ENDPOINTS: Generalization ${relationshipId} must connect block to block`);
      }
    }
    if (relationship.kind === 'composition') {
      const touchesRequirement = Boolean(repo.requirements[relationship.sourceId]) || Boolean(repo.requirements[relationship.targetId]);
      if (touchesRequirement) {
        diagnostics.push(`INVALID_COMPOSITION_ENDPOINTS: Composition ${relationshipId} must not touch requirement endpoints`);
      }
    }
    diagnostics.sort();
    return { allowed: diagnostics.length === 0, diagram: 'bdd', ownership, diagnostics };
  }

  if (IBD_KINDS.has(relationship.kind)) {
    diagnostics.sort();
    return { allowed: diagnostics.length === 0, diagram: 'ibd', diagnostics };
  }

  // Requirement kinds: containment lives on the requirements diagram, governed
  // trace links (derive/satisfy/verify/refine/trace/copy) belong to the RTM.
  if (relationship.kind === 'requirementContainment') {
    const check = requirementDirectionValid(repo, relationship);
    if (!check.valid) diagnostics.push(`${check.code}: Requirement containment ${relationshipId} must connect requirement to requirement`);
    diagnostics.sort();
    return { allowed: diagnostics.length === 0, diagram: 'requirements', diagnostics };
  }

  const check = requirementDirectionValid(repo, relationship);
  if (!check.valid) diagnostics.push(`${check.code}: ${relationship.kind} ${relationshipId} has invalid SysML endpoint direction`);
  diagnostics.sort();
  return { allowed: diagnostics.length === 0, diagram: 'rtm', diagnostics };
}

export function classifyDeletionTarget(repo: SysmlRepository, elementId: string): DeletionDecision {
  const definition = repo.definitions[elementId];
  if (definition) {
    // Cascade only through explicit composite ownership. Definition-typed
    // usages (shared/reference, or any typeId match that is not an owned
    // composite child) are unresolved impacts, never implicit children.
    const cascadeIds = Object.values(repo.usages)
      .filter(usage => usage.kind === 'part' && usage.ownerId === elementId && usage.aggregation === 'composite')
      .map(usage => usage.id)
      .sort();
    const cascadeSet = new Set(cascadeIds);
    const unresolvedUsageIds = Object.values(repo.usages)
      .filter(usage => usage.kind === 'part' && usage.typeId === elementId && !cascadeSet.has(usage.id))
      .map(usage => usage.id)
      .sort();
    return { targetKind: 'definition', cascadeIds, unresolvedUsageIds, diagnostics: [] };
  }
  const usage = repo.usages[elementId];
  if (usage) {
    if (usage.kind !== 'part' || usage.aggregation !== 'composite') {
      return { targetKind: 'usage', cascadeIds: [], unresolvedUsageIds: [], diagnostics: [] };
    }
    // Composite usage deletion cascades the subtree: itself plus transitively
    // owned composite parts and owned ports. Shared/reference usages never cascade.
    const cascade = new Set<string>([usage.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of Object.values(repo.usages)) {
        if (cascade.has(candidate.id) || !cascade.has(candidate.ownerId)) continue;
        if (candidate.kind === 'port') {
          cascade.add(candidate.id);
          changed = true;
        } else if (candidate.kind === 'part' && candidate.aggregation === 'composite') {
          cascade.add(candidate.id);
          changed = true;
        }
      }
    }
    return { targetKind: 'usage', cascadeIds: [...cascade].sort(), unresolvedUsageIds: [], diagnostics: [] };
  }
  if (repo.connectors[elementId]) return { targetKind: 'connector', cascadeIds: [elementId], unresolvedUsageIds: [], diagnostics: [] };
  if (repo.relationships[elementId]) return { targetKind: 'relationship', cascadeIds: [elementId], unresolvedUsageIds: [], diagnostics: [] };
  if (repo.requirements[elementId]) return { targetKind: 'requirement', cascadeIds: [elementId], unresolvedUsageIds: [], diagnostics: [] };
  return { targetKind: 'unknown', cascadeIds: [], unresolvedUsageIds: [], diagnostics: [`UNKNOWN_ELEMENT: Unknown element: ${elementId}`] };
}
