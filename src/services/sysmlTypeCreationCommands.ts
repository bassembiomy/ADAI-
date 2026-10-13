import type { BlockDefinition, SysmlRepository } from '../engine/sysml/model';
import type { CreateNewTypeAction } from '../engine/sysml/commands/commandResult';
import type { SysmlEditorCommand } from './sysmlCommandGateway';

export function buildCreateNewTypeCommand(
  action: CreateNewTypeAction,
  repository: SysmlRepository,
  createId: () => string,
): SysmlEditorCommand {
  if (action.actionKind !== 'CreateNewType') throw new Error('Unsupported explicit type creation action.');
  const ownerId = action.targetOwnerId && (
    repository.packages[action.targetOwnerId] || repository.definitions[action.targetOwnerId]
  ) ? action.targetOwnerId : 'model';
  const definition: BlockDefinition = {
    id: createId(),
    name: action.suggestedName,
    kind: 'block',
    namespace: action.targetNamespace ?? (ownerId === 'model' ? ['model'] : [ownerId]),
    ownerId,
    isAbstract: false,
    isLeaf: false,
    properties: [],
    ports: [],
    operations: [],
    constraints: [],
  };
  return { type: 'createElement', element: definition };
}
