import type { ConnectorUsage, Multiplicity, SysmlRepository } from '../../engine/sysml/model';
import {
  connectorEndOf,
  connectorPathKey,
  findBlockProperty,
  type ConnectorEnd,
  type ConnectorSide,
} from '../../engine/sysml/connectorEnds';
import { derivedDepthOneParts, pathFromKey } from '../../engine/sysml/partOccurrences';

/**
 * Projection of path-based connector ends (nested connector ends) for the legacy
 * IBD view. Parts are derived from Block properties instead of PartUsage
 * records: the part at path `a/b` has id `'a/b'`. When a legacy PartUsage
 * already stands for a depth-1 property of the context (its `propertyId`
 * matches), that usage keeps being the part, so nothing is drawn twice.
 */
export interface DerivedPathPart {
  /** Path string, or the id of the legacy usage that already represents this property. */
  id: string;
  /** True when the part has no PartUsage record behind it. */
  derived: boolean;
  propertyId: string;
  name: string;
  /** Part (path string / usage id) that contains this part, or the context Block id at depth 1. */
  parentId: string;
  typeId: string;
  multiplicity: Multiplicity;
  aggregation: 'composite' | 'shared' | 'reference';
}

export function pathPartId(repo: SysmlRepository, contextId: string, path: readonly string[]): string {
  if (path.length === 1) {
    for (const usage of Object.values(repo.usages)) {
      if (usage.kind === 'part' && usage.ownerId === contextId && usage.propertyId === path[0]) return usage.id;
    }
  }
  return connectorPathKey(path);
}

/** Legacy `{partId, portId}` endpoint for a path-based side; the boundary uses the context Block id. */
export function pathEndpointOf(
  repo: SysmlRepository,
  connector: ConnectorUsage,
  side: ConnectorSide,
): { partId: string; portId: string } | undefined {
  const end = connectorEndOf(connector, side);
  if (!end) return undefined;
  return {
    partId: end.path.length === 0 ? connector.ownerId : pathPartId(repo, connector.ownerId, end.path),
    portId: end.portId ?? '',
  };
}

/** Parts of block-typed part properties that no PartUsage record represents (format 5), with the Block that owns each. */
export function depthOneDerivedParts(repo: SysmlRepository): Array<{ part: DerivedPathPart; contextId: string }> {
  return derivedDepthOneParts(repo).map(occurrence => ({
    contextId: occurrence.contextId,
    part: {
      id: occurrence.id, derived: true, propertyId: occurrence.propertyId, name: occurrence.name,
      parentId: occurrence.contextId, typeId: occurrence.typeId, multiplicity: occurrence.multiplicity,
      aggregation: occurrence.aggregation,
    },
  }));
}

/** The part that a path string stands for under a context Block, or undefined when the path does not resolve. */
export function derivedPartForKey(repo: SysmlRepository, contextId: string, key: string): DerivedPathPart | undefined {
  const path = pathFromKey(key);
  const parts = partsAlongPath(repo, contextId, { path });
  return path.length > 0 && parts.length === path.length ? parts[parts.length - 1] : undefined;
}

function partsAlongPath(repo: SysmlRepository, contextId: string, end: ConnectorEnd): DerivedPathPart[] {
  const parts: DerivedPathPart[] = [];
  let ownerTypeId = contextId;
  for (let depth = 1; depth <= end.path.length; depth += 1) {
    const prefix = end.path.slice(0, depth);
    const property = findBlockProperty(repo, ownerTypeId, prefix[depth - 1]);
    if (!property) break;
    const id = pathPartId(repo, contextId, prefix);
    parts.push({
      id,
      derived: id === connectorPathKey(prefix),
      propertyId: property.id,
      name: property.name,
      parentId: depth === 1 ? contextId : pathPartId(repo, contextId, prefix.slice(0, -1)),
      typeId: property.typeId,
      multiplicity: property.multiplicity,
      aggregation: property.kind === 'reference' ? 'reference' : 'composite',
    });
    ownerTypeId = property.typeId;
  }
  return parts;
}

/**
 * Every part a diagram shows that has no PartUsage record behind it: parts of
 * block-typed part properties, nested parts the diagram presents by path string,
 * and parts that path-based connector ends run through. `contextId` is the Block
 * whose IBD the part belongs to.
 */
export function collectDerivedParts(
  repo: SysmlRepository,
  options: { isVisible: (id: string) => boolean; visibleIds: ReadonlySet<string> | null; diagramContextId?: string },
): Array<{ part: DerivedPathPart; contextId: string }> {
  const seen = new Set<string>();
  const result: Array<{ part: DerivedPathPart; contextId: string }> = [];
  const add = (part: DerivedPathPart, contextId: string) => {
    if (!part.derived || seen.has(part.id)) return;
    seen.add(part.id);
    result.push({ part, contextId });
  };
  for (const { part, contextId } of depthOneDerivedParts(repo)) {
    if (options.isVisible(part.id)) add(part, contextId);
  }
  if (options.visibleIds && options.diagramContextId) {
    for (const id of options.visibleIds) {
      if (!id.includes('/') || seen.has(id)) continue;
      const part = derivedPartForKey(repo, options.diagramContextId, id);
      if (part) add(part, options.diagramContextId);
    }
  }
  for (const connector of Object.values(repo.connectors)) {
    const pathParts = pathPartsOfConnector(repo, connector);
    if (pathParts.length === 0) continue;
    if (!options.isVisible(connector.id) && !pathParts.every(part => options.isVisible(part.id))) continue;
    for (const part of pathParts) add(part, connector.ownerId);
  }
  return result;
}

/** Every part (outermost first) that a path-based connector's ends run through. */
export function pathPartsOfConnector(repo: SysmlRepository, connector: ConnectorUsage): DerivedPathPart[] {
  const parts: DerivedPathPart[] = [];
  for (const side of ['source', 'target'] as const) {
    const end = connectorEndOf(connector, side);
    if (end) parts.push(...partsAlongPath(repo, connector.ownerId, end));
  }
  return parts;
}
