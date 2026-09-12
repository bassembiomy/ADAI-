import type {
  BlockDefinition,
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
  if (!definition) return { valid: false, features: [], diagnostics: [`Unknown block definition: ${definitionId}`] };

  const features: InheritedFeature[] = [];
  const diagnostics: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (id: string) => {
    const current = block(repo, id);
    if (!current) {
      diagnostics.push(`Missing supertype: ${id}`);
      return;
    }
    if (visiting.has(id)) {
      diagnostics.push(`Inheritance cycle includes ${id}`);
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
  return { valid: diagnostics.length === 0, features, diagnostics };
}

export function classifyRelationship(repo: SysmlRepository, relationshipId: string): RelationshipDecision {
  const relationship = repo.relationships[relationshipId] as SysmlRelationship | undefined;
  if (!relationship) return { allowed: false, diagram: 'bdd', diagnostics: [`Unknown relationship: ${relationshipId}`] };

  const requirementKinds = new Set(['requirementContainment', 'deriveReqt', 'satisfy', 'verify', 'refine', 'trace', 'copy']);
  if (requirementKinds.has(relationship.kind)) return { allowed: true, diagram: 'requirements', diagnostics: [] };
  if (['association', 'sharedAggregation', 'composition', 'generalization', 'dependency', 'allocation'].includes(relationship.kind)) {
    const ownership = relationship.kind === 'composition' ? 'composite' : relationship.kind === 'sharedAggregation' ? 'shared' : 'none';
    return { allowed: true, diagram: 'bdd', ownership, diagnostics: [] };
  }
  if (['binding', 'itemFlow'].includes(relationship.kind)) return { allowed: true, diagram: 'ibd', diagnostics: [] };
  return { allowed: false, diagram: 'bdd', diagnostics: [`Unsupported relationship kind: ${relationship.kind}`] };
}

export function classifyDeletionTarget(repo: SysmlRepository, elementId: string): DeletionDecision {
  const definition = repo.definitions[elementId];
  if (definition) {
    const cascadeIds = Object.values(repo.usages)
      .filter(usage => usage.kind === 'part' && usage.ownerId === elementId && usage.aggregation === 'composite')
      .map(usage => usage.id)
      .sort();
    const unresolvedUsageIds = Object.values(repo.usages)
      .filter(usage => usage.kind === 'part' && usage.typeId === elementId && !cascadeIds.includes(usage.id))
      .map(usage => usage.id)
      .sort();
    return { targetKind: 'definition', cascadeIds, unresolvedUsageIds, diagnostics: [] };
  }
  const usage = repo.usages[elementId];
  if (usage) return { targetKind: 'usage', cascadeIds: usage.kind === 'part' && usage.aggregation === 'composite' ? [usage.id] : [], unresolvedUsageIds: [], diagnostics: [] };
  if (repo.connectors[elementId]) return { targetKind: 'connector', cascadeIds: [elementId], unresolvedUsageIds: [], diagnostics: [] };
  if (repo.relationships[elementId]) return { targetKind: 'relationship', cascadeIds: [elementId], unresolvedUsageIds: [], diagnostics: [] };
  if (repo.requirements[elementId]) return { targetKind: 'requirement', cascadeIds: [elementId], unresolvedUsageIds: [], diagnostics: [] };
  return { targetKind: 'unknown', cascadeIds: [], unresolvedUsageIds: [], diagnostics: [`Unknown element: ${elementId}`] };
}
