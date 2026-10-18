import type { SysmlRepository } from '../../engine/sysml/model';
import type { ModelTreeProjection } from './modelExplorerTypes';
import { buildUnifiedModelProjection } from './unifiedModelExplorerProjection';

type ProjectionInput = Parameters<typeof buildUnifiedModelProjection>[0];

const ancestors = (projection: ModelTreeProjection, nodeId: string): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  let current = projection.nodes[nodeId]?.parentNodeId;
  while (current && !seen.has(current)) {
    seen.add(current);
    out.push(current);
    current = projection.nodes[current]?.parentNodeId;
  }
  return out;
};

const findBySemanticId = (projection: ModelTreeProjection, semanticId: string) => {
  for (const nodeId in projection.nodes) if (projection.nodes[nodeId].semanticId === semanticId) return projection.nodes[nodeId];
  return undefined;
};

const COLLECTIONS = ['packages', 'diagrams', 'definitions', 'requirements', 'verificationCases', 'actors', 'subjects', 'useCases', 'extensionPoints'] as const;
const ownerOf = (repo: SysmlRepository, id: string): string | undefined => {
  for (const collection of COLLECTIONS) {
    const element = (repo[collection] as Record<string, { ownerId?: string }> | undefined)?.[id];
    if (element) return element.ownerId || undefined;
  }
  return undefined;
};

/** True when the element has a row in the projection and every ancestor of that row is expanded. */
export function isRevealed(projection: ModelTreeProjection, expanded: ReadonlySet<string>, semanticId: string): boolean {
  const node = findBySemanticId(projection, semanticId);
  return Boolean(node && ancestors(projection, node.nodeId).every(id => expanded.has(id)));
}

/**
 * The expanded-node set that shows the rows of `semanticIds` in the lazily built tree: the
 * row's ancestors (its diagram group, package, pillar) and the containment owners that make
 * the lazy projection register the element at all. Returns `expanded` itself when nothing
 * needs to change, and leaves elements that have no tree row (connectors, activity nodes) alone.
 */
export function expandedIdsToReveal(
  input: ProjectionInput,
  semanticIds: readonly string[],
  expanded: ReadonlySet<string>,
): ReadonlySet<string> {
  const initial = buildUnifiedModelProjection({ ...input, expandedNodeIds: expanded as Set<string> });
  const pending = semanticIds.filter(id => !isRevealed(initial, expanded, id));
  if (pending.length === 0) return expanded;
  const full = buildUnifiedModelProjection({ ...input, sysmlStore: undefined, expandedNodeIds: undefined });
  const next = new Set(expanded);
  const expandChain = (projection: ModelTreeProjection, nodeId: string) => { for (const id of ancestors(projection, nodeId)) next.add(id); };
  for (let round = 0; round < 8; round += 1) {
    const lazy = buildUnifiedModelProjection({ ...input, expandedNodeIds: next });
    const unresolved = pending.filter(id => !isRevealed(lazy, next, id));
    if (unresolved.length === 0) break;
    for (const id of unresolved) {
      const lazyNode = findBySemanticId(lazy, id);
      if (lazyNode) expandChain(lazy, lazyNode.nodeId);
      const fullNode = findBySemanticId(full, id);
      if (!fullNode) continue;
      expandChain(full, fullNode.nodeId);
      // the lazy tree lists an element only once its containment owner is expanded
      let owner = ownerOf(input.sysml, id);
      for (let depth = 0; owner && depth < 32; depth += 1) {
        const ownerNode = findBySemanticId(full, owner);
        if (ownerNode) { next.add(ownerNode.nodeId); expandChain(full, ownerNode.nodeId); }
        owner = ownerOf(input.sysml, owner);
      }
    }
  }
  return next.size === expanded.size ? expanded : next;
}
