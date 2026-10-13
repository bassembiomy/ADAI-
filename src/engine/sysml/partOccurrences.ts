import type {
  BlockDefinition,
  Multiplicity,
  PartUsage,
  PortDefinition,
  PortUsage,
  PropertyDefinition,
  SysmlRepository,
} from './model';
import { effectiveSupertypeIds } from './services/supertypes';

/**
 * Part occurrences derived from Block properties (format v5).
 *
 * A part is only a property of its Block. Where a PartUsage record used to
 * stand for "this part in this context", the occurrence is now a property path
 * under the context Block: `['engine']`, `['engine', 'crankshaft']`. A path
 * string (`path.join('/')`) is the stable identity of the occurrence, so a
 * depth-1 occurrence has the property's own id.
 *
 * Everything here is read-only and works on repositories that still carry
 * PartUsage records (their `propertyId` links them to the property).
 */

export const PATH_SEPARATOR = '/';

export const pathKey = (path: readonly string[]): string => path.join(PATH_SEPARATOR);
export const pathFromKey = (key: string): string[] => (key === '' ? [] : key.split(PATH_SEPARATOR));

export function isStructuralProperty(property: PropertyDefinition): boolean {
  return property.kind === 'part' || property.kind === 'reference';
}

/** A part or reference property typed by a Block: the property form of a former PartUsage. */
export function isPartProperty(repo: SysmlRepository, property: PropertyDefinition): boolean {
  return isStructuralProperty(property) && repo.definitions[property.typeId]?.kind === 'block';
}

export interface FeatureOwner<T> { block: BlockDefinition; feature: T }

function sortedBlocks(repo: SysmlRepository): BlockDefinition[] {
  return Object.values(repo.definitions)
    .filter((definition): definition is BlockDefinition => definition.kind === 'block')
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Blocks that declare a property with this id (normally exactly one). */
export function findPropertyOwners(repo: SysmlRepository, propertyId: string): Array<FeatureOwner<PropertyDefinition>> {
  const owners: Array<FeatureOwner<PropertyDefinition>> = [];
  for (const definition of Object.values(repo.definitions)) {
    if (definition.kind !== 'block') continue;
    const feature = definition.properties.find(property => property.id === propertyId);
    if (feature) owners.push({ block: definition, feature });
  }
  return owners.sort((a, b) => a.block.id.localeCompare(b.block.id));
}

export function findPropertyOwner(repo: SysmlRepository, propertyId: string): FeatureOwner<PropertyDefinition> | undefined {
  return findPropertyOwners(repo, propertyId)[0];
}

export function findPortOwner(repo: SysmlRepository, portId: string): FeatureOwner<PortDefinition> | undefined {
  for (const block of sortedBlocks(repo)) {
    const feature = block.ports.find(port => port.id === portId);
    if (feature) return { block, feature };
  }
  return undefined;
}

/** Property ids that some PartUsage record still represents. */
export function linkedPropertyIds(repo: SysmlRepository): Set<string> {
  const linked = new Set<string>();
  for (const usage of Object.values(repo.usages ?? {})) {
    if (usage.kind === 'part' && usage.propertyId) linked.add(usage.propertyId);
  }
  return linked;
}

/** Declaring Block and property found on `blockId` or inherited through its effective supertypes. */
export function findBlockPropertyWithOwner(
  repo: SysmlRepository,
  blockId: string,
  propertyId: string,
  visited = new Set<string>(),
): FeatureOwner<PropertyDefinition> | undefined {
  if (visited.has(blockId)) return undefined;
  visited.add(blockId);
  const block = repo.definitions[blockId];
  if (!block || block.kind !== 'block') return undefined;
  const direct = block.properties.find(property => property.id === propertyId);
  if (direct) return { block, feature: direct };
  for (const supertypeId of effectiveSupertypeIds(repo, blockId)) {
    const inherited = findBlockPropertyWithOwner(repo, supertypeId, propertyId, visited);
    if (inherited) return inherited;
  }
  return undefined;
}

export interface PartOccurrence {
  /** Path string (`path.join('/')`); equals the property id at depth 1. */
  id: string;
  path: string[];
  contextId: string;
  property: PropertyDefinition;
  propertyId: string;
  /** The Block that declares the property. */
  declaringBlockId: string;
  /** Context Block id at depth 1, otherwise the path string of the enclosing occurrence. */
  parentId: string;
  name: string;
  typeId: string;
  aggregation: 'composite' | 'reference';
  multiplicity: Multiplicity;
}

/** Walks a property path from the context Block through part/reference property types. */
export function occurrenceAt(repo: SysmlRepository, contextId: string, path: readonly string[]): PartOccurrence | undefined {
  if (path.length === 0) return undefined;
  let typeId = contextId;
  let found: FeatureOwner<PropertyDefinition> | undefined;
  for (const segment of path) {
    found = findBlockPropertyWithOwner(repo, typeId, segment);
    if (!found || !isStructuralProperty(found.feature)) return undefined;
    typeId = found.feature.typeId;
  }
  const { block, feature } = found!;
  return {
    id: pathKey(path),
    path: [...path],
    contextId,
    property: feature,
    propertyId: feature.id,
    declaringBlockId: block.id,
    parentId: path.length === 1 ? contextId : pathKey(path.slice(0, -1)),
    name: feature.name,
    typeId: feature.typeId,
    aggregation: feature.kind === 'reference' ? 'reference' : 'composite',
    multiplicity: feature.multiplicity,
  };
}

/**
 * Occurrence for a path string. With a context the path is walked from it;
 * without one, the first segment's declaring Block(s) are tried as context.
 */
export function resolveOccurrenceKey(repo: SysmlRepository, key: string, contextId?: string): PartOccurrence | undefined {
  const path = pathFromKey(key);
  if (path.length === 0) return undefined;
  if (contextId) return occurrenceAt(repo, contextId, path);
  for (const owner of findPropertyOwners(repo, path[0])) {
    const found = occurrenceAt(repo, owner.block.id, path);
    if (found) return found;
  }
  return undefined;
}

/** Depth-1 occurrences of block-typed part properties that no PartUsage record represents. */
export function derivedDepthOneParts(repo: SysmlRepository): PartOccurrence[] {
  const linked = linkedPropertyIds(repo);
  const parts: PartOccurrence[] = [];
  // Only the blocks that own a part are sorted (by block id, then property order), not every block of a large model.
  for (const block of Object.values(repo.definitions)) {
    if (block.kind !== 'block') continue;
    for (const property of block.properties) {
      if (!isPartProperty(repo, property) || linked.has(property.id)) continue;
      parts.push({
        id: property.id, path: [property.id], contextId: block.id, property, propertyId: property.id,
        declaringBlockId: block.id, parentId: block.id, name: property.name, typeId: property.typeId,
        aggregation: property.kind === 'reference' ? 'reference' : 'composite', multiplicity: property.multiplicity,
      });
    }
  }
  const order = new Map<PartOccurrence, number>(parts.map((part, index) => [part, index]));
  return parts.sort((a, b) => a.contextId.localeCompare(b.contextId) || order.get(a)! - order.get(b)!);
}

export function occurrenceAsPartUsage(occurrence: PartOccurrence): PartUsage {
  return {
    id: occurrence.id, kind: 'part', name: occurrence.name, ownerId: occurrence.parentId,
    typeId: occurrence.typeId, aggregation: occurrence.aggregation, multiplicity: occurrence.multiplicity,
    propertyId: occurrence.propertyId,
  };
}

/**
 * The record a part/port id stands for, whichever representation holds it:
 * a PartUsage/PortUsage, a block-typed part property (by property id or path
 * string), or a Block port. Returned in the usage shape so older readers that
 * only know usages keep working on a model without usage records.
 */
export function resolvePartLike(repo: SysmlRepository, id: string): PartUsage | PortUsage | undefined {
  const usage = repo.usages?.[id];
  if (usage) return usage;
  if (!id) return undefined;
  if (id.includes(PATH_SEPARATOR)) {
    const occurrence = resolveOccurrenceKey(repo, id);
    return occurrence ? occurrenceAsPartUsage(occurrence) : undefined;
  }
  const owner = findPropertyOwner(repo, id);
  if (owner && isPartProperty(repo, owner.feature)) {
    const property = owner.feature;
    return {
      id: property.id, kind: 'part', name: property.name, ownerId: owner.block.id, typeId: property.typeId,
      aggregation: property.kind === 'reference' ? 'reference' : 'composite', multiplicity: property.multiplicity,
      propertyId: property.id,
    };
  }
  const port = findPortOwner(repo, id);
  if (port) return { id: port.feature.id, kind: 'port', name: port.feature.name, ownerId: port.block.id, definitionId: port.feature.id };
  return undefined;
}

/**
 * True when `id` (a property id declared or inherited by the context Block, or
 * a property path under it) is a part of that context.
 */
export function isOccurrenceInContext(repo: SysmlRepository, contextId: string, id: string): boolean {
  if (id.includes(PATH_SEPARATOR)) return Boolean(occurrenceAt(repo, contextId, pathFromKey(id)));
  const found = findBlockPropertyWithOwner(repo, contextId, id);
  return Boolean(found && isPartProperty(repo, found.feature));
}

/**
 * Block property id an id stands for: the id itself when it is a property,
 * the last segment of a path string, or the `propertyId` of a PartUsage.
 */
export function propertyIdOfPartReference(repo: SysmlRepository, id: string): string | undefined {
  const usage = repo.usages?.[id];
  if (usage) return usage.kind === 'part' ? usage.propertyId : undefined;
  if (id.includes(PATH_SEPARATOR)) return resolveOccurrenceKey(repo, id)?.propertyId;
  return findPropertyOwner(repo, id) ? id : undefined;
}
