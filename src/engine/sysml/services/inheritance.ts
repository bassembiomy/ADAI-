import type {
  SysmlRepositoryV4,
  Classifier,
  SemanticElement,
} from '../domain';

export interface InheritedFeature {
  feature: SemanticElement;
  inheritedFromId: string;
}

/**
 * Resolves inherited features (properties, operations, receptions, ports)
 * recursively without cloning the semantic objects.
 */
export function resolveInheritedFeatures(
  repo: SysmlRepositoryV4,
  classifierId: string
): InheritedFeature[] {
  const root = repo.elements[classifierId] as Classifier | undefined;
  if (!root || !root.generalIds || root.generalIds.length === 0) {
    return [];
  }

  const result: InheritedFeature[] = [];
  const visited = new Set<string>([classifierId]);
  const queue = [...root.generalIds];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);

    const currentClassifier = repo.elements[currentId] as Classifier | undefined;
    if (!currentClassifier) continue;

    // Direct features owned by currentClassifier
    const ownedFeatureIds = repo.indexes.byOwner[currentId] || [];
    for (const featId of ownedFeatureIds) {
      const feat = repo.elements[featId];
      if (feat) {
        result.push({ feature: feat, inheritedFromId: currentId });
      }
    }

    if (currentClassifier.generalIds) {
      for (const genId of currentClassifier.generalIds) {
        if (!visited.has(genId)) {
          queue.push(genId);
        }
      }
    }
  }

  return result;
}

/**
 * Detects if adding candidateGeneralId to classifierId would create an inheritance cycle.
 */
export function detectInheritanceCycle(
  repo: SysmlRepositoryV4,
  classifierId: string,
  candidateGeneralId: string
): boolean {
  if (classifierId === candidateGeneralId) {
    return true;
  }

  const visited = new Set<string>([classifierId]);
  const queue = [candidateGeneralId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (currentId === classifierId) {
      return true;
    }
    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);

    const current = repo.elements[currentId] as Classifier | undefined;
    if (current && current.generalIds) {
      for (const genId of current.generalIds) {
        queue.push(genId);
      }
    }
  }

  return false;
}
