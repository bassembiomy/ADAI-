import type { SysmlRepositoryV4, SemanticElement, PartProperty, StructuralFeature } from '../domain';

export interface ConnectorPathResult {
  valid: boolean;
  errorCode?: string;
  targetElementId?: string;
}

export function resolveConnectorPath(
  repo: SysmlRepositoryV4,
  contextClassifierId: string,
  pathSegmentIds: string[]
): ConnectorPathResult {
  if (pathSegmentIds.length === 0) {
    return { valid: false, errorCode: 'EMPTY_PATH' };
  }

  let currentContextId = contextClassifierId;

  for (let i = 0; i < pathSegmentIds.length; i++) {
    const segmentId = pathSegmentIds[i];
    const element = repo.elements[segmentId];
    if (!element) {
      return { valid: false, errorCode: 'INVALID_PATH_SEGMENT' };
    }

    // Must be owned by currentContextId
    if (element.ownerId !== currentContextId) {
      return { valid: false, errorCode: 'INVALID_PATH_SEGMENT' };
    }

    const isLast = i === pathSegmentIds.length - 1;
    if (isLast) {
      return { valid: true, targetElementId: segmentId };
    }

    // Intermediate segments must be structural features typed by a classifier
    const feature = element as unknown as StructuralFeature;
    if (!feature.typeId) {
      return { valid: false, errorCode: 'INVALID_INTERMEDIATE_SEGMENT' };
    }
    currentContextId = feature.typeId;
  }

  return { valid: true, targetElementId: pathSegmentIds[pathSegmentIds.length - 1] };
}

export function validateConnectorEnds(
  repo: SysmlRepositoryV4,
  contextClassifierId: string,
  sourcePath: string[],
  targetPath: string[]
): boolean {
  const srcRes = resolveConnectorPath(repo, contextClassifierId, sourcePath);
  const tgtRes = resolveConnectorPath(repo, contextClassifierId, targetPath);
  return srcRes.valid && tgtRes.valid;
}
