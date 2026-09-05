/**
 * Pure node and link conversion and migration helpers for the OPM editor.
 */
import type { AppNode, AppEdge, OPMNodeType, OPMLinkType } from './EntropyTypes';

export interface OpmMigrationWarning {
  code: string;
  message: string;
  elementId: string;
}

export interface ConvertOpmNodeResult {
  node: AppNode;
  warnings: OpmMigrationWarning[];
}

export interface ConvertOpmEdgeResult {
  edge: AppEdge;
  warnings: OpmMigrationWarning[];
}

export type OpmNodeKind = 'opmObject' | 'opmProcess' | 'opmState';

export function convertOpmNodeType(
  node: AppNode,
  nextType: OpmNodeKind,
): ConvertOpmNodeResult {
  const warnings: OpmMigrationWarning[] = [];
  const currentKind = node.data.type;
  const targetKind = nextType.startsWith('opm')
    ? nextType.slice(3).toLowerCase()
    : nextType.toLowerCase();

  const clonedNode: AppNode = JSON.parse(JSON.stringify(node));
  clonedNode.type = nextType;
  clonedNode.data.type = targetKind as OPMNodeType;

  // If converting away from stateful object or state to process
  if ((currentKind === 'object' || currentKind === 'state') && targetKind === 'process') {
    if (clonedNode.data.stateExecution || (clonedNode.data.states && clonedNode.data.states.length > 0) || clonedNode.data.objectExecution) {
      warnings.push({
        code: 'OPM_STATE_DATA_DISABLED',
        message: `State/object configuration for "${node.data.name || node.id}" will be disabled in process mode.`,
        elementId: node.id,
      });
    }
    // Keep the candidate safe if the user confirms the migration: execution
    // metadata that has no meaning on a process is disabled explicitly.
    clonedNode.data = {
      ...clonedNode.data,
      objectExecution: undefined,
      stateExecution: undefined,
      states: undefined,
    };
  }

  // If converting to state
  if (targetKind === 'state' && currentKind !== 'state') {
    warnings.push({
      code: 'OPM_STATE_PARENT_REQUIRED',
      message: `Converted state "${node.data.name || node.id}" must be assigned a parent object.`,
      elementId: node.id,
    });
  }

  return { node: clonedNode, warnings };
}

export function convertOpmEdgeType(
  edge: AppEdge,
  nextType: OPMLinkType,
): ConvertOpmEdgeResult {
  const warnings: OpmMigrationWarning[] = [];
  const clonedEdge: AppEdge = JSON.parse(JSON.stringify(edge));

  // React Flow's renderer type is always `opmEdge`; the semantic OPM role is
  // carried by edge.data.type.  Mixing these two fields silently breaks the
  // canvas when a link is migrated.
  clonedEdge.type = 'opmEdge';
  clonedEdge.data = { ...(clonedEdge.data ?? {}), type: nextType };

  return { edge: clonedEdge, warnings };
}
