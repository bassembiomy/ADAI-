import type { SysmlCommand } from '../../engine/sysml/commands/types';
import type { SysmlEditorCommand } from '../../services/sysmlCommandGateway';

/**
 * Adapts domain SysmlCommand objects (emitted by SysmlPropertyPanel and inspectorSchema)
 * to canonical gateway SysmlEditorCommand objects (dispatched by handleExecuteSysmlCommand).
 */
export function sysmlCommandToEditorCommand(cmd: SysmlCommand): SysmlEditorCommand | null {
  switch (cmd.type) {
    case 'UpdateElement':
      return {
        type: 'updateElement',
        elementId: cmd.elementId,
        patch: cmd.patch as Record<string, unknown>,
        coalesceKey: `update-element-${cmd.elementId}`,
      };
    case 'RenameElement':
      return {
        type: 'updateElement',
        elementId: cmd.elementId,
        patch: { name: cmd.newName },
        coalesceKey: `rename-element-${cmd.elementId}`,
      };
    case 'MoveElement':
      return {
        type: 'moveElements',
        elementIds: [cmd.elementId],
        targetOwnerId: cmd.newOwnerId || 'model',
      };
    case 'DeleteElement':
      return {
        type: 'deleteElements',
        elementIds: [cmd.elementId],
      };
    case 'UpdateRelationship':
      return {
        type: 'updateElement',
        elementId: cmd.relationshipId,
        patch: cmd.patch as Record<string, unknown>,
        coalesceKey: `update-relationship-${cmd.relationshipId}`,
      };
    case 'DeleteRelationship':
      return {
        type: 'deleteElements',
        elementIds: [cmd.relationshipId],
      };
    case 'CreateElement':
      return {
        type: 'createElement',
        element: cmd.element as any,
      };
    default:
      return null;
  }
}
