import type { BlockDefinition, PartUsage, PropertyDefinition, SysmlRepository } from '../model';

/**
 * SysML 1.6: a part is a property of the Block that owns it (the IBD shows that
 * property's occurrences). In this model a part therefore exists as a Block
 * property (the definition, shown as a BDD feature row) and as a PartUsage (its
 * occurrence, which owns ports and connector ends in an IBD). The property is
 * authoritative; the usage is its occurrence and is linked by `propertyId`.
 *
 * These helpers keep the two sides complete. Nothing is ever deleted: a missing
 * side is created from the side that exists, so no data (ports, connectors,
 * presentations) can be lost.
 */
export type PartUsageDriftCode =
  | 'PART_USAGE_WITHOUT_PROPERTY'
  | 'PROPERTY_WITHOUT_PART_USAGE'
  | 'NESTED_PART_USAGE';

export interface PartUsageDrift { code: PartUsageDriftCode; elementId: string; ownerId: string }

const isStructural = (property: PropertyDefinition) => property.kind === 'part' || property.kind === 'reference';
const isBlock = (repo: SysmlRepository, id: string): boolean => repo.definitions[id]?.kind === 'block';

function blockProperty(repo: SysmlRepository, usage: PartUsage): PropertyDefinition | undefined {
  const owner = repo.definitions[usage.ownerId];
  if (owner?.kind !== 'block') return undefined;
  return usage.propertyId ? owner.properties.find(property => property.id === usage.propertyId) : undefined;
}

/** Read-only report of where the two sides disagree. */
export function findPartUsageDrift(repo: SysmlRepository): PartUsageDrift[] {
  const drift: PartUsageDrift[] = [];
  const usages = Object.values(repo.usages).filter((usage): usage is PartUsage => usage.kind === 'part');
  for (const usage of usages) {
    if (repo.usages[usage.ownerId]?.kind === 'part') {
      // SysML v1 owns nested parts through the part's TYPE, not through an instance.
      drift.push({ code: 'NESTED_PART_USAGE', elementId: usage.id, ownerId: usage.ownerId });
    } else if (isBlock(repo, usage.ownerId) && !blockProperty(repo, usage)) {
      drift.push({ code: 'PART_USAGE_WITHOUT_PROPERTY', elementId: usage.id, ownerId: usage.ownerId });
    }
  }
  const linked = new Set(usages.map(usage => usage.propertyId).filter((id): id is string => Boolean(id)));
  for (const definition of Object.values(repo.definitions)) {
    if (definition.kind !== 'block') continue;
    for (const property of definition.properties) {
      if (isStructural(property) && isBlock(repo, property.typeId) && !linked.has(property.id)) {
        drift.push({ code: 'PROPERTY_WITHOUT_PART_USAGE', elementId: property.id, ownerId: definition.id });
      }
    }
  }
  return drift;
}

export function allIds(repo: SysmlRepository): Set<string> {
  const ids = new Set<string>();
  for (const collection of [repo.packages, repo.diagrams, repo.definitions, repo.usages, repo.connectors, repo.relationships,
    repo.requirements, repo.verificationCases, repo.evidence, repo.baselines, repo.artifacts, repo.actors, repo.subjects,
    repo.useCases, repo.extensionPoints, repo.diagramReferences]) {
    for (const id of Object.keys(collection ?? {})) ids.add(id);
  }
  for (const definition of Object.values(repo.definitions)) {
    if (definition.kind !== 'block') continue;
    for (const feature of [...definition.properties, ...definition.ports]) ids.add(feature.id);
  }
  return ids;
}

export function freshId(taken: Set<string>, base: string): string {
  let id = base;
  for (let suffix = 2; taken.has(id); suffix += 1) id = `${base}:${suffix}`;
  taken.add(id);
  return id;
}

/**
 * Completes both sides in place and returns the ids of the records it created.
 * Idempotent. `willChange` is told about each existing element before it is
 * modified so callers can carry baselines through the change.
 */
export function reconcilePartUsages(repo: SysmlRepository, willChange?: (elementId: string) => void): string[] {
  const created: string[] = [];
  const taken = allIds(repo);

  for (const definition of Object.values(repo.definitions)) {
    if (definition.kind !== 'block') continue;
    const block: BlockDefinition = definition;
    const usages = Object.values(repo.usages).filter((usage): usage is PartUsage =>
      usage.kind === 'part' && usage.ownerId === block.id);
    const claimed = new Set<string>();

    // 1. Usage -> property. Link by propertyId, else by name and type; else create the property.
    for (const usage of usages) {
      let property = usage.propertyId ? block.properties.find(candidate => candidate.id === usage.propertyId) : undefined;
      if (!property) {
        property = block.properties.find(candidate => isStructural(candidate) && !claimed.has(candidate.id)
          && candidate.name === usage.name && candidate.typeId === usage.typeId);
      }
      if (!property) {
        willChange?.(block.id);
        const id = freshId(taken, `property:${usage.id}`);
        property = {
          id, name: usage.name, kind: usage.aggregation === 'composite' ? 'part' : 'reference',
          typeId: usage.typeId, multiplicity: usage.multiplicity,
        };
        block.properties.push(property);
        created.push(id);
      }
      if (usage.propertyId !== property.id) {
        willChange?.(usage.id);
        usage.propertyId = property.id;
      }
      claimed.add(property.id);
    }

    // 2. Property -> usage, for structural properties typed by a Block.
    for (const property of block.properties) {
      if (!isStructural(property) || claimed.has(property.id) || !isBlock(repo, property.typeId)) continue;
      const id = freshId(taken, `usage:${property.id}`);
      repo.usages[id] = {
        id, kind: 'part', name: property.name, ownerId: block.id, typeId: property.typeId,
        aggregation: property.kind === 'reference' ? 'reference' : 'composite',
        multiplicity: property.multiplicity, propertyId: property.id,
      };
      created.push(id);
    }
  }
  return created;
}
