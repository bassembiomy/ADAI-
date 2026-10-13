import type { SysmlRepository } from '../model';

/**
 * SysML 1.6 / Cameo: a requirement nested under another is *owned* by it, and
 * the ⊕ containment line is the notation for that ownership. Ownership
 * (`ownerId`) is authoritative; the `requirementContainment` relationship is
 * its drawable form and is kept aligned with it:
 *   - a containment relationship makes the child owned by the parent;
 *   - a requirement owned by a requirement has a containment relationship.
 * Nothing is deleted here: a second parent or a cycle is left for validation
 * to report (MULTIPLE_REQUIREMENT_CONTAINERS / REQUIREMENT_CONTAINMENT_CYCLE).
 */
export function containmentRelationshipId(parentId: string, childId: string): string {
  return `containment:${parentId}:${childId}`;
}

function ownerChainReaches(repo: SysmlRepository, startId: string, targetId: string): boolean {
  const seen = new Set<string>();
  let current: string | undefined = startId;
  while (current && !seen.has(current)) {
    if (current === targetId) return true;
    seen.add(current);
    current = repo.requirements[current]?.ownerId;
  }
  return false;
}

/** Aligns ownership and containment relationships in place; returns the ids it changed. Idempotent. */
export function alignRequirementOwnership(repo: SysmlRepository, willChange?: (elementId: string) => void): string[] {
  const changed: string[] = [];
  const containments = Object.values(repo.relationships)
    .filter(r => r.kind === 'requirementContainment' && r.sourceId !== r.targetId
      && repo.requirements[r.sourceId] && repo.requirements[r.targetId])
    .sort((a, b) => a.id.localeCompare(b.id));

  const claimed = new Set<string>();
  for (const relationship of containments) {
    if (claimed.has(relationship.targetId)) continue; // second parent: validation reports it
    // Adopting would make the parent (transitively) owned by its own child.
    if (ownerChainReaches(repo, relationship.sourceId, relationship.targetId)) continue;
    claimed.add(relationship.targetId);
    const child = repo.requirements[relationship.targetId];
    if (child.ownerId !== relationship.sourceId) {
      willChange?.(child.id);
      child.ownerId = relationship.sourceId;
      changed.push(child.id);
    }
  }

  const hasContainment = new Set(containments.map(r => r.targetId));
  for (const requirement of Object.values(repo.requirements).sort((a, b) => a.id.localeCompare(b.id))) {
    const parentId = requirement.ownerId;
    if (!parentId || !repo.requirements[parentId] || hasContainment.has(requirement.id)) continue;
    const id = containmentRelationshipId(parentId, requirement.id);
    if (repo.relationships[id]) continue;
    repo.relationships[id] = { id, kind: 'requirementContainment', sourceId: parentId, targetId: requirement.id };
    hasContainment.add(requirement.id);
    changed.push(id);
  }
  return changed;
}

/** Requirement-to-requirement containment relationships whose child is currently owned by the parent. */
export function activeContainments(repo: SysmlRepository, relationshipIds: readonly string[]) {
  return relationshipIds
    .map(id => repo.relationships[id])
    .filter(r => r?.kind === 'requirementContainment' && repo.requirements[r.sourceId] && repo.requirements[r.targetId]
      && repo.requirements[r.targetId].ownerId === r.sourceId);
}
