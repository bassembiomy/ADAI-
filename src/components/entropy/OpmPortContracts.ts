/**
 * OPM Port and Connection Contracts.
 * Shared between canvas connection preview, onConnect gate, and semantic validation.
 */
import type { AppNode, AppEdge, OPMLinkType, OPMNodeType, OPMPort } from './EntropyTypes';
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

  const sourcePorts = [
    ...((sourceNode.data.outputs ?? []) as OPMPort[]),
    ...((sourceNode.data.inputs ?? []) as OPMPort[]),
  ];
  const targetPorts = [
    ...((targetNode.data.outputs ?? []) as OPMPort[]),
    ...((targetNode.data.inputs ?? []) as OPMPort[]),
  ];
  const hasDeclaredSourcePorts = sourcePorts.length > 0;
  const hasDeclaredTargetPorts = targetPorts.length > 0;
  const sourcePort = connection.sourceHandle
    ? sourcePorts.find(port => port.id === connection.sourceHandle)
    : undefined;
  const targetPort = connection.targetHandle
    ? targetPorts.find(port => port.id === connection.targetHandle)
    : undefined;

  if ((hasDeclaredSourcePorts && !sourcePort) || (hasDeclaredTargetPorts && !targetPort)) {
    return {
      valid: false,
      code: !sourcePort && hasDeclaredSourcePorts ? 'OPM_SOURCE_PORT_MISSING' : 'OPM_TARGET_PORT_MISSING',
      reason: 'Both connection handles must identify declared OPM ports.',
    };
  }
  if (sourcePort && sourcePort.direction !== 'output') {
    return { valid: false, code: 'OPM_SOURCE_PORT_DIRECTION_INVALID', reason: 'A source handle must be an output port.' };
  }
  if (targetPort && targetPort.direction !== 'input') {
    return { valid: false, code: 'OPM_TARGET_PORT_DIRECTION_INVALID', reason: 'A target handle must be an input port.' };
  }
  const portSupportsLink = (port: OPMPort | undefined) =>
    !port || port.type === 'any' || port.type === 'standard' || port.type === linkType;
  if (!portSupportsLink(sourcePort) || !portSupportsLink(targetPort)) {
    return {
      valid: false,
      code: 'OPM_PORT_TYPE_INCOMPATIBLE',
      reason: `The selected ports do not support a "${linkType}" link.`,
      sourcePort,
      targetPort,
    };
  }
  if (sourcePort?.dataType && targetPort?.dataType && sourcePort.dataType !== 'any' && targetPort.dataType !== 'any' && sourcePort.dataType !== targetPort.dataType) {
    return {
      valid: false,
      code: 'OPM_PORT_DATA_TYPE_MISMATCH',
      reason: `Port data types "${sourcePort.dataType}" and "${targetPort.dataType}" are incompatible.`,
      sourcePort,
      targetPort,
    };
  }

  // Check duplicate link, including handles so distinct ports can be linked.
  const duplicate = edges.some(
    e =>
      e.source === connection.source &&
      e.target === connection.target &&
      (e.data?.type ?? (e.data as any)?.linkType) === linkType &&
      (e.sourceHandle ?? null) === (connection.sourceHandle ?? null) &&
      (e.targetHandle ?? null) === (connection.targetHandle ?? null),
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
    sourcePort,
    targetPort,
  };
}
