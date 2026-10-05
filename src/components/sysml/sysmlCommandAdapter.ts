import type { SysmlCommand } from '../../engine/sysml/commands/types';
import type { SysmlEditorCommand } from '../../services/sysmlCommandGateway';

// The inspector reads a V4 view of the repository (migrateV3ToV4), which
// names the root package 'pkg-root'; the gateway it writes to calls it 'model'.
const V4_ROOT_ID = 'pkg-root';
const GATEWAY_ROOT_ID = 'model';
const toGatewayId = (id: string) => (id === V4_ROOT_ID ? GATEWAY_ROOT_ID : id);

function toGatewayPatch(patch: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries((patch ?? {}) as Record<string, unknown>)
      .map(([key, value]) => [key, typeof value === 'string' ? toGatewayId(value) : value]),
  );
}

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
        patch: toGatewayPatch(cmd.patch),
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
        targetOwnerId: toGatewayId(cmd.newOwnerId || GATEWAY_ROOT_ID),
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
        patch: toGatewayPatch(cmd.patch),
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
