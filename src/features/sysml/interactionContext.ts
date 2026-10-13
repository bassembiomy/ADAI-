import type { MetaclassKind } from '../../engine/sysml/domain/base';
import type { SysmlRepositoryV4 } from '../../engine/sysml/domain';
import {
  evaluateOwnership,
  getLegalOwnerGuidance,
  resolveSemanticElement,
} from '../../engine/sysml/capabilities/ownershipPolicy';

export type InteractionSource = 'propertyPanel' | 'canvas' | 'tree';

export interface InteractionContextInput {
  repository: SysmlRepositoryV4;
  source: InteractionSource;
  requestedMetaclass: MetaclassKind;
  inspectorElementId?: string;
  canvasElementId?: string;
  treeElementId?: string;
}

export type ResolvedInteractionContext =
  | { status: 'resolved'; ownerId: string; source: InteractionSource; diagramId?: string }
  | { status: 'disabled'; code: 'LEGAL_OWNER_REQUIRED' | 'OWNER_NOT_FOUND' | 'ILLEGAL_OWNERSHIP'; reason: string };

export function disabledSelection(requestedMetaclass: MetaclassKind): ResolvedInteractionContext {
  return {
    status: 'disabled',
    code: 'LEGAL_OWNER_REQUIRED',
    reason: getLegalOwnerGuidance(requestedMetaclass),
  };
}

export function resolveInteractionContext(input: InteractionContextInput): ResolvedInteractionContext {
  const selectedId =
    input.source === 'propertyPanel'
      ? input.inspectorElementId
      : input.source === 'canvas'
      ? input.canvasElementId
      : input.treeElementId;

  if (!selectedId) return disabledSelection(input.requestedMetaclass);

  const diagram = input.repository.diagrams ? input.repository.diagrams[selectedId] : undefined;
  const ownerId = diagram?.ownerId ?? selectedId;
  const owner = resolveSemanticElement(input.repository, ownerId);

  if (!owner) {
    return {
      status: 'disabled',
      code: 'OWNER_NOT_FOUND',
      reason: `Owner ${ownerId} no longer exists.`,
    };
  }

  const decision = evaluateOwnership(owner, input.requestedMetaclass);
  return decision.allowed
    ? {
        status: 'resolved',
        ownerId,
        source: input.source,
        ...(diagram ? { diagramId: diagram.id } : {}),
      }
    : {
        status: 'disabled',
        code: 'ILLEGAL_OWNERSHIP',
        reason: decision.message ?? `${input.requestedMetaclass} cannot be owned by ${owner.metaclass}.`,
      };
}
