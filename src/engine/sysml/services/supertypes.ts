import type { SysmlRepository } from '../model';

/**
 * Effective supertypes of a Block: its stored `supertypeIds` plus every
 * Block-to-Block Generalization drawn from it (source = specific, target =
 * general; UML 2.5 §9.9.7). A Generalization on a diagram therefore gives
 * inheritance without a second write, and removing the relationship removes
 * the inheritance it contributed.
 */
export function effectiveSupertypeIds(repo: SysmlRepository, blockId: string): string[] {
  const definition = repo.definitions[blockId];
  if (definition?.kind !== 'block') return [];
  const stored = definition.supertypeIds ?? [];
  const drawn = generalizationTargets(repo).get(blockId);
  if (!drawn) return stored;
  return [...new Set([...stored, ...drawn])];
}

interface Cached {
  revision: number;
  definitions: SysmlRepository['definitions'];
  byChild: Map<string, string[]>;
}
const cache = new WeakMap<SysmlRepository['relationships'], Cached>();

/**
 * Index of drawn Generalizations by specific Block. Inheritance is resolved
 * once per Block per validation pass, so the index is cached per relationship
 * map. The cache is valid only while `repo.revision` and the definitions map
 * are unchanged: every committed change bumps the revision, and the check is
 * O(1) (counting keys on each call is quadratic on large models). Code that
 * mutates a repository in place must bump `revision` (or use a new object)
 * before querying again.
 */
function generalizationTargets(repo: SysmlRepository): Map<string, string[]> {
  const cached = cache.get(repo.relationships);
  if (cached && cached.revision === repo.revision && cached.definitions === repo.definitions) return cached.byChild;
  const byChild = new Map<string, string[]>();
  for (const relationship of Object.values(repo.relationships)) {
    if (relationship.kind !== 'generalization') continue;
    if (repo.definitions[relationship.sourceId]?.kind !== 'block' || repo.definitions[relationship.targetId]?.kind !== 'block') continue;
    const list = byChild.get(relationship.sourceId) ?? [];
    list.push(relationship.targetId);
    byChild.set(relationship.sourceId, list);
  }
  cache.set(repo.relationships, { revision: repo.revision, definitions: repo.definitions, byChild });
  return byChild;
}

/**
 * Load-time normalisation: the Generalization relationship is the single
 * source of inheritance, so a stored `supertypeIds` entry becomes the
 * relationship it stood for. Idempotent. Entries that do not resolve to a Block
 * are left in place so MISSING_SUPERTYPE is still reported, and entries already
 * covered by a drawn Generalization are simply dropped from the legacy field.
 * Mutates `repo` (callers pass a freshly hydrated copy) and returns the ids of
 * the relationships it created.
 */
export function materializeSupertypes(repo: SysmlRepository, willChange?: (elementId: string) => void): string[] {
  const created: string[] = [];
  const drawn = new Set(
    Object.values(repo.relationships)
      .filter(relationship => relationship.kind === 'generalization')
      .map(relationship => `${relationship.sourceId}>${relationship.targetId}`),
  );
  for (const definition of Object.values(repo.definitions)) {
    if (definition.kind !== 'block' || !definition.supertypeIds?.length) continue;
    willChange?.(definition.id);
    const remaining: string[] = [];
    for (const supertypeId of definition.supertypeIds) {
      if (repo.definitions[supertypeId]?.kind !== 'block') {
        remaining.push(supertypeId);
        continue;
      }
      if (drawn.has(`${definition.id}>${supertypeId}`)) continue;
      let id = `generalization:${definition.id}:${supertypeId}`;
      for (let suffix = 2; repo.relationships[id] || repo.definitions[id]; suffix += 1) {
        id = `generalization:${definition.id}:${supertypeId}:${suffix}`;
      }
      repo.relationships[id] = { id, kind: 'generalization', sourceId: definition.id, targetId: supertypeId };
      drawn.add(`${definition.id}>${supertypeId}`);
      created.push(id);
    }
    if (remaining.length > 0) definition.supertypeIds = remaining;
    else delete definition.supertypeIds;
  }
  if (created.length > 0) invalidateSupertypeIndex(repo);
  return created;
}

/** Drops the cached index; for callers that mutate a repository in place without bumping its revision. */
export function invalidateSupertypeIndex(repo: SysmlRepository): void {
  cache.delete(repo.relationships);
}
