import type { SysmlRepository } from '../sysml/model';
import { parseSimTarget } from './simTarget';

const LINK_KINDS = new Set(['satisfy', 'verify', 'refine', 'trace']);

const idsOf = (items: unknown): string[] => {
  if (Array.isArray(items)) return items.map((item) => (item as { id?: unknown })?.id).filter((id): id is string => typeof id === 'string');
  if (items && typeof items === 'object') return Object.keys(items as object);
  return [];
};

/** Maps state ids and transition ids of a state machine to the requirement ids linked in the repository. */
export function smRequirementLinks(
  repo: SysmlRepository,
  model: { states?: unknown; transitions?: unknown },
): Map<string, string[]> {
  const stateIds = new Set(idsOf(model.states));
  const transitionIds = new Set(idsOf(model.transitions));
  const sets = new Map<string, Set<string>>();

  const resolve = (id: string): string | null => {
    const target = parseSimTarget(id);
    if (target) return target.domain === 'sm' && target.kind === 'transition' && transitionIds.has(target.id) ? target.id : null;
    return stateIds.has(id) ? id : null;
  };

  for (const rel of Object.values(repo.relationships ?? {})) {
    if (!LINK_KINDS.has(rel.kind as string)) continue;
    const sides: Array<[string, string]> = [[rel.sourceId, rel.targetId], [rel.targetId, rel.sourceId]];
    for (const [reqSide, otherSide] of sides) {
      const req = repo.requirements?.[reqSide];
      if (!req) continue;
      if (repo.requirements?.[otherSide]) continue;
      const key = resolve(otherSide);
      if (key === null) continue;
      const reqId = typeof req.requirementId === 'string' && req.requirementId !== '' ? req.requirementId : req.id;
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key)!.add(reqId);
    }
  }

  const out = new Map<string, string[]>();
  for (const [key, set] of sets) out.set(key, [...set].sort());
  return out;
}
