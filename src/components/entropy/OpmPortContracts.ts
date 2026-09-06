/**
 * OPM Port and Connection Contracts.
 * Shared between canvas connection preview, onConnect gate, and semantic validation.
 */
import type { AppNode, AppEdge, OPMLinkType, OPMNodeType } from './EntropyTypes';
import { validateOpmConnectionContract } from './OpmLinkRules';

export interface OpmConnectionEndpoint {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface OpmPortConnectionVerdict {
  valid: boolean;
  code?: string;
  reason?: string;
  sourcePort?: unknown;
  targetPort?: unknown;
}

export function validateOpmPortConnection(
  nodes: AppNode[],
  edges: AppEdge[],
  connection: OpmConnectionEndpoint,
  linkType: OPMLinkType = 'effect',
): OpmPortConnectionVerdict {
  const sourceNode = nodes.find(n => n.id === connection.source);
  const targetNode = nodes.find(n => n.id === connection.target);

  if (!sourceNode) {
    return {
      valid: false,
      code: 'OPM_PORT_SOURCE_MISSING',
      reason: `Source node "${connection.source}" does not exist.`,
    };
  }

  if (!targetNode) {
    return {
      valid: false,
      code: 'OPM_PORT_TARGET_MISSING',
      reason: `Target node "${connection.target}" does not exist.`,
    };
  }

  if (connection.source === connection.target) {
    return {
      valid: false,
      code: 'OPM_SELF_CONNECTION_INVALID',
      reason: 'Self-connecting links are not permitted.',
    };
  }

  // Check duplicate link
  const duplicate = edges.some(
    e =>
      e.source === connection.source &&
      e.target === connection.target &&
      (e.data?.linkType ?? (e as any).type) === linkType,
  );
  if (duplicate) {
    return {
      valid: false,
      code: 'OPM_DUPLICATE_CONNECTION',
      reason: `A link of type "${linkType}" already exists between "${sourceNode.data.name || sourceNode.id}" and "${targetNode.data.name || targetNode.id}".`,
    };
  }

  const sourceType = (sourceNode.data.type || 'object') as OPMNodeType;
  const targetType = (targetNode.data.type || 'object') as OPMNodeType;

  const roleVerdict = validateOpmConnectionContract(sourceType, targetType, linkType);
  if (!roleVerdict.valid) {
    return {
      valid: false,
      code: 'OPM_PORT_DIRECTION_INVALID',
      reason: roleVerdict.reason || `Cannot connect ${sourceType} to ${targetType} with "${linkType}" link.`,
    };
  }

  return {
    valid: true,
  };
}
