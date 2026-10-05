import type { SysmlRelationship, SysmlRepository } from '../engine/sysml/model';
import type { SysmlEditorCommand } from './sysmlCommandGateway';

/** A unique, stable-looking id for a new «allocate» relationship between two elements. */
export function newAllocationId(repository: SysmlRepository, sourceId: string, targetId: string): string {
  const baseId = `allocate-${sourceId}-${targetId}`;
  let id = baseId;
  let suffix = 2;
  while (repository.relationships[id] || repository.definitions[id] || repository.requirements[id] || repository.usages[id]) {
    id = `${baseId}-${suffix++}`;
  }
  return id;
}

/** One gateway command (one undo step) that allocates `sourceId` (allocatedFrom) to `targetId` (allocatedTo). */
export function buildCreateAllocationCommand(repository: SysmlRepository, sourceId: string, targetId: string): SysmlEditorCommand {
  const relationship: SysmlRelationship = {
    id: newAllocationId(repository, sourceId, targetId), kind: 'allocation', sourceId, targetId,
  };
  return { type: 'createElement', element: relationship };
}

/** Deletes «allocate» relationships. The gateway may answer with an impact preview that must be confirmed. */
export function buildDeleteAllocationCommand(relationshipIds: readonly string[], authorizedBaselineIds: readonly string[] = []): SysmlEditorCommand {
  return { type: 'deleteElements', elementIds: [...relationshipIds], authorizedBaselineIds: [...authorizedBaselineIds] };
}
