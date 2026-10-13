import type { NormalizedSysmlStore } from '../../engine/sysml/normalizedStore';
import type { ModelTreeNode } from './modelExplorerTypes';
import { sysmlObjectLabel } from '../sysml/sysmlDisplayLabel';
import type { SysmlEntity } from '../../engine/sysml/model';

export interface PageOptions {
  offset?: number;
  limit?: number;
}

export interface PagedExplorerResult {
  nodes: ModelTreeNode[];
  totalCount: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

interface CacheEntry<T> {
  revision: number;
  data: T;
}

const sortedChildrenCache = new WeakMap<NormalizedSysmlStore, Map<string, CacheEntry<string[]>>>();
const childrenQueryCache = new WeakMap<NormalizedSysmlStore, Map<string, CacheEntry<PagedExplorerResult>>>();
const searchQueryCache = new WeakMap<NormalizedSysmlStore, Map<string, CacheEntry<PagedExplorerResult>>>();

function getEntityName(entity: SysmlEntity): string {
  if ('name' in entity && typeof (entity as any).name === 'string') {
    return (entity as any).name;
  }
  return '';
}

function entityToTreeNode(
  store: NormalizedSysmlStore,
  id: string,
  entity: SysmlEntity,
  parentNodeId: string | null,
): ModelTreeNode {
  const kind = 'kind' in entity && typeof (entity as any).kind === 'string' ? (entity as any).kind : 'element';
  const label = sysmlObjectLabel(entity, 'Element');
  const ownerId = 'ownerId' in entity && typeof (entity as any).ownerId === 'string'
    ? (entity as any).ownerId
    : (parentNodeId?.startsWith('sysml:element:') ? parentNodeId.replace('sysml:element:', '') : undefined);
  const childIds = store.indexes.ownerId.get(id);
  const hasChildren = (childIds?.size ?? 0) > 0;

  return {
    nodeId: `sysml:element:${id}`,
    semanticId: id,
    domain: 'sysml',
    kind,
    label,
    parentNodeId,
    ownerSemanticId: ownerId,
    childNodeIds: [],
    hasChildren,
  };
}

function getSortedChildIds(store: NormalizedSysmlStore, semanticParentId: string): string[] {
  let cache = sortedChildrenCache.get(store);
  if (!cache) {
    cache = new Map();
    sortedChildrenCache.set(store, cache);
  }
  const entry = cache.get(semanticParentId);
  if (entry && entry.revision === store.revision) {
    return entry.data;
  }

  let rawChildIds: string[] = [];
  const fromOwnerIndex = store.indexes.ownerId.get(semanticParentId);
  if (fromOwnerIndex && fromOwnerIndex.size > 0) {
    rawChildIds = Array.from(fromOwnerIndex);
  } else if (semanticParentId === 'model') {
    rawChildIds = Array.from(store.packages.keys()).filter(id => id !== 'model');
  }

  // Fast mapped sort (avoids repeated Map lookups and localeCompare in sort comparator)
  const mapped = new Array<{ id: string; name: string }>(rawChildIds.length);
  for (let i = 0; i < rawChildIds.length; i++) {
    const id = rawChildIds[i];
    const ent = store.entities.get(id);
    mapped[i] = { id, name: ent ? getEntityName(ent) : id };
  }
  mapped.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const sorted = new Array<string>(mapped.length);
  for (let i = 0; i < mapped.length; i++) {
    sorted[i] = mapped[i].id;
  }

  cache.set(semanticParentId, { revision: store.revision, data: sorted });
  return sorted;
}

/**
 * Query children of a given parent node with paging.
 * When parentId is null, returns top-level model roots.
 */
export function queryExplorerChildren(
  store: NormalizedSysmlStore,
  parentId: string | null,
  options?: PageOptions,
): PagedExplorerResult {
  const offset = Math.max(0, options?.offset ?? 0);
  const limit = Math.max(1, Math.min(500, options?.limit ?? 50));
  const cacheKey = `${parentId ?? '__root__'}:${offset}:${limit}`;

  let storeCache = childrenQueryCache.get(store);
  if (!storeCache) {
    storeCache = new Map();
    childrenQueryCache.set(store, storeCache);
  }

  const cached = storeCache.get(cacheKey);
  if (cached && cached.revision === store.revision) {
    return cached.data;
  }

  const semanticParentId = parentId
    ? (parentId.startsWith('sysml:element:') ? parentId.replace('sysml:element:', '') : parentId)
    : 'model';

  const sortedChildIds = getSortedChildIds(store, semanticParentId);
  const totalCount = sortedChildIds.length;
  const pagedIds = sortedChildIds.slice(offset, offset + limit);

  const parentNodeId = parentId
    ? (parentId.startsWith('sysml:element:') ? parentId : `sysml:element:${parentId}`)
    : null;

  const nodes: ModelTreeNode[] = [];
  for (const id of pagedIds) {
    const entity = store.entities.get(id);
    if (entity) {
      nodes.push(entityToTreeNode(store, id, entity, parentNodeId));
    }
  }

  const result: PagedExplorerResult = {
    nodes,
    totalCount,
    hasMore: offset + nodes.length < totalCount,
    offset,
    limit,
  };

  storeCache.set(cacheKey, { revision: store.revision, data: result });
  return result;
}

/**
 * Search explorer entities matching the query prefix/tokens with paging.
 */
export function searchExplorer(
  store: NormalizedSysmlStore,
  query: string,
  options?: PageOptions,
): PagedExplorerResult {
  const trimmed = query.trim().toLowerCase();
  const offset = Math.max(0, options?.offset ?? 0);
  const limit = Math.max(1, Math.min(500, options?.limit ?? 50));
  const cacheKey = `${trimmed}:${offset}:${limit}`;

  let storeCache = searchQueryCache.get(store);
  if (!storeCache) {
    storeCache = new Map();
    searchQueryCache.set(store, storeCache);
  }

  const cached = storeCache.get(cacheKey);
  if (cached && cached.revision === store.revision) {
    return cached.data;
  }

  if (!trimmed) {
    const emptyResult: PagedExplorerResult = { nodes: [], totalCount: 0, hasMore: false, offset, limit };
    storeCache.set(cacheKey, { revision: store.revision, data: emptyResult });
    return emptyResult;
  }

  // Fast indexed search
  const matchedIds = new Set<string>();

  // 1. Direct token match
  const directTokenMatch = store.indexes.searchTokens.get(trimmed);
  if (directTokenMatch) {
    for (const id of directTokenMatch) {
      matchedIds.add(id);
    }
  }

  // 2. Token prefix scan
  for (const [token, ids] of store.indexes.searchTokens.entries()) {
    if (token !== trimmed && token.startsWith(trimmed)) {
      for (const id of ids) {
        matchedIds.add(id);
        if (matchedIds.size >= offset + limit * 4) break;
      }
    }
    if (matchedIds.size >= offset + limit * 4) break;
  }

  // Fast mapped sort for matched items
  const mapped = new Array<{ id: string; name: string }>(matchedIds.size);
  let idx = 0;
  for (const id of matchedIds) {
    const ent = store.entities.get(id);
    mapped[idx++] = { id, name: ent ? getEntityName(ent).toLowerCase() : id };
  }

  mapped.sort((a, b) => {
    const aExact = a.name === trimmed;
    const bExact = b.name === trimmed;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    const aStarts = a.name.startsWith(trimmed);
    const bStarts = b.name.startsWith(trimmed);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;

    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  const totalCount = mapped.length;
  const pagedSlice = mapped.slice(offset, offset + limit);

  const nodes: ModelTreeNode[] = [];
  for (const item of pagedSlice) {
    const entity = store.entities.get(item.id);
    if (entity) {
      const ownerId = 'ownerId' in entity && typeof (entity as any).ownerId === 'string'
        ? (entity as any).ownerId
        : null;
      const parentNodeId = ownerId && ownerId !== 'model' ? `sysml:element:${ownerId}` : null;
      nodes.push(entityToTreeNode(store, item.id, entity, parentNodeId));
    }
  }

  const result: PagedExplorerResult = {
    nodes,
    totalCount,
    hasMore: offset + nodes.length < totalCount,
    offset,
    limit,
  };

  storeCache.set(cacheKey, { revision: store.revision, data: result });
  return result;
}
