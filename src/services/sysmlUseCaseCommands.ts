import type { SysmlRelationship, SysmlRepository, UseCaseRelationshipKind } from '../engine/sysml/model';
import type { SysmlEditorCommand, SysmlMutationCommand } from './sysmlCommandGateway';
import { createExtensionPoint } from '../features/modelExplorer/adapters/modelExplorerFactories';
import {
  checkUseCaseConnection,
  type SubjectAssignmentProposal,
} from '../features/sysml/useCaseDiagramView';
import { sysmlObjectLabel } from '../features/sysml/sysmlDisplayLabel';

/** A unique, stable id for a new use-case relationship. */
export function newUseCaseRelationshipId(repository: SysmlRepository, kind: UseCaseRelationshipKind, sourceId: string, targetId: string): string {
  const baseId = `${kind}-${sourceId}-${targetId}`;
  let id = baseId;
  let suffix = 2;
  while (repository.relationships[id]) id = `${baseId}-${suffix++}`;
  return id;
}

export interface UseCaseRelationshipInput {
  kind: UseCaseRelationshipKind;
  sourceId: string;
  targetId: string;
  /** «extend» only: the extension point of the extended (target) use case. */
  extensionPointId?: string;
  /** «extend» only: create a new extension point on the target in the same command. */
  newExtensionPointName?: string;
  /** «extend» only: the condition note. */
  condition?: string;
  /** Test seam for deterministic ids. */
  relationshipId?: string;
  extensionPointNewId?: string;
}

export type UseCaseRelationshipPlan =
  | { ok: true; command: SysmlEditorCommand }
  | {
      ok: false;
      diagnostics: Array<{ code: string; message: string }>;
      /** Set for «extend» without an extension point: the user must pick one or name a new one. */
      needsExtensionPoint?: { targetUseCaseId: string; candidates: Array<{ id: string; label: string }> };
    };

/**
 * One gateway command (one undo step) that creates a use-case relationship.
 * Endpoint legality comes from the central connection policy; «extend» must
 * name an extension point of the extended use case (SysML 1.6 §16.3.2.8).
 */
export function buildCreateUseCaseRelationshipCommand(
  repository: SysmlRepository,
  input: UseCaseRelationshipInput,
): UseCaseRelationshipPlan {
  const check = checkUseCaseConnection(repository, input.kind, input.sourceId, input.targetId);
  if (!check.allowed) {
    return { ok: false, diagnostics: check.diagnostics.map(d => ({ code: d.code, message: d.message })) };
  }
  const relationship: SysmlRelationship = {
    id: input.relationshipId ?? newUseCaseRelationshipId(repository, input.kind, input.sourceId, input.targetId),
    kind: input.kind,
    sourceId: input.sourceId,
    targetId: input.targetId,
  };
  if (input.kind !== 'extend') {
    return { ok: true, command: { type: 'createElement', element: relationship } };
  }

  const target = repository.useCases[input.targetId];
  const condition = input.condition?.trim();
  if (condition) relationship.name = condition;

  const newName = input.newExtensionPointName?.trim();
  if (newName) {
    const existingNames = (target.extensionPointIds ?? []).map(id => repository.extensionPoints[id]?.name).filter((n): n is string => Boolean(n));
    if (existingNames.includes(newName)) {
      return { ok: false, diagnostics: [{ code: 'DUPLICATE_EXTENSION_POINT_NAME', message: `Use case ${sysmlObjectLabel(target, 'Use Case')} already has an extension point named "${newName}".` }] };
    }
    const extensionPoint = createExtensionPoint({ id: input.extensionPointNewId, name: newName, useCaseId: target.id });
    relationship.extensionPointId = extensionPoint.id;
    return {
      ok: true,
      command: {
        type: 'batch',
        commands: [
          { type: 'createElement', element: extensionPoint },
          { type: 'updateElement', elementId: target.id, patch: { extensionPointIds: [...(target.extensionPointIds ?? []), extensionPoint.id] } },
          { type: 'createElement', element: relationship },
        ],
      },
    };
  }

  const candidates = (target.extensionPointIds ?? [])
    .map(id => repository.extensionPoints[id])
    .filter((ep): ep is NonNullable<typeof ep> => Boolean(ep))
    .map(ep => ({ id: ep.id, label: sysmlObjectLabel(ep, 'Extension Point') }));
  const chosen = input.extensionPointId ?? (candidates.length === 1 ? candidates[0].id : undefined);
  if (!chosen) {
    return {
      ok: false,
      diagnostics: [{ code: 'MISSING_EXTENSION_POINT', message: `Extend must name an extension point of ${sysmlObjectLabel(target, 'Use Case')}.` }],
      needsExtensionPoint: { targetUseCaseId: target.id, candidates },
    };
  }
  if (!candidates.some(candidate => candidate.id === chosen)) {
    return { ok: false, diagnostics: [{ code: 'INVALID_EXTENSION_POINT', message: `${sysmlObjectLabel(target, 'Use Case')} does not define that extension point.` }] };
  }
  relationship.extensionPointId = chosen;
  return { ok: true, command: { type: 'createElement', element: relationship } };
}

/** Adds an extension point to a use case (two steps, one undo). */
export function buildCreateExtensionPointCommand(
  repository: SysmlRepository,
  useCaseId: string,
  name?: string,
  ids: { extensionPointId?: string } = {},
): SysmlEditorCommand | undefined {
  const useCase = repository.useCases[useCaseId];
  if (!useCase) return undefined;
  const taken = (useCase.extensionPointIds ?? []).map(id => repository.extensionPoints[id]?.name).filter((n): n is string => Boolean(n));
  let chosen = name?.trim();
  if (!chosen) {
    chosen = 'extensionPoint';
    let index = 1;
    while (taken.includes(chosen)) chosen = `extensionPoint_${index++}`;
  }
  const extensionPoint = createExtensionPoint({ id: ids.extensionPointId, name: chosen, useCaseId });
  return {
    type: 'batch',
    commands: [
      { type: 'createElement', element: extensionPoint },
      { type: 'updateElement', elementId: useCaseId, patch: { extensionPointIds: [...(useCase.extensionPointIds ?? []), extensionPoint.id] } },
    ],
  };
}

/** Commits confirmed subject-nesting proposals as one undoable batch. */
export function buildAssignSubjectsCommand(proposals: readonly SubjectAssignmentProposal[]): SysmlEditorCommand | undefined {
  if (proposals.length === 0) return undefined;
  const commands: SysmlMutationCommand[] = proposals.map(proposal => ({
    type: 'updateElement',
    elementId: proposal.useCaseId,
    patch: { subjectId: proposal.toSubjectId },
  }));
  return { type: 'batch', commands };
}
