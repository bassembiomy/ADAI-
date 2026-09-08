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
  isExecutable?: boolean;
}

export interface OpmPortConnectionVerdict {
  valid: boolean;
  code?: string;
  reason?: string;
  sourcePort?: OPMPort;
  targetPort?: OPMPort;
}

function isNodeExecutable(node: AppNode): boolean {
  return Boolean(
    node.data?.objectExecution ||
    node.data?.stateExecution ||
    node.data?.processExecution
  );
}

function getPortMaxLinks(port: OPMPort): number | null {
  const mult = (port as any).multiplicity ?? (port as any).maxLinks;
  if (mult === undefined || mult === null) return null;
  if (typeof mult === 'number') return mult;
  if (typeof mult === 'string') {
    if (mult === '1' || mult === '0..1') return 1;
    const n = Number(mult);
    return isNaN(n) ? null : n;
  }
  return null;
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

  const sourceType = (sourceNode.data.type || 'object') as OPMNodeType;
  const targetType = (targetNode.data.type || 'object') as OPMNodeType;

  // 1. Role / semantic link direction verdict
  const roleVerdict = validateOpmConnectionContract(sourceType, targetType, linkType);
  if (!roleVerdict.valid) {
    return {
      valid: false,
      code: roleVerdict.code || 'OPM_PORT_DIRECTION_INVALID',
      reason: roleVerdict.reason || `Cannot connect ${sourceType} to ${targetType} with "${linkType}" link.`,
    };
  }

  // 2. Conceptual vs Executable compatibility check
  const requiresExecutable = Boolean(
    connection.isExecutable ||
    (connection as any).linkExecution ||
    (sourceNode.data.objectExecution && targetNode.data.processExecution && (linkType === 'consumption' || linkType === 'result'))
  );
  if (connection.isExecutable || (connection as any).linkExecution) {
    if (!isNodeExecutable(sourceNode) || !isNodeExecutable(targetNode)) {
      return {
        valid: false,
        code: 'OPM_CONCEPTUAL_EXECUTABLE_INCOMPATIBLE',
        reason: 'Cannot create executable link between conceptual-only and executable elements.',
      };
    }
  }

  // Helper to find a port on a node
  const findPortOnNode = (node: AppNode, handleId: string): OPMPort | undefined => {
    const all = [...(node.data?.inputs || []), ...(node.data?.outputs || [])];
    return all.find(p => p.id === handleId);
  };

  // Helper to find which node owns a handle across the whole model
  const findPortOwnerNode = (handleId: string): AppNode | undefined => {
    return nodes.find(n => findPortOnNode(n, handleId) !== undefined);
  };

  let resolvedSourcePort: OPMPort | undefined;
  let resolvedTargetPort: OPMPort | undefined;

  // 3. Source handle resolution & validation
  if (connection.sourceHandle) {
    resolvedSourcePort = findPortOnNode(sourceNode, connection.sourceHandle);
    if (!resolvedSourcePort) {
      const owner = findPortOwnerNode(connection.sourceHandle);
      if (owner) {
        return {
          valid: false,
          code: 'OPM_PORT_HANDLE_WRONG_NODE',
          reason: `Source handle "${connection.sourceHandle}" belongs to node "${owner.id}", not "${sourceNode.id}".`,
        };
      }
      return {
        valid: false,
        code: 'OPM_PORT_HANDLE_MISSING',
        reason: `Source handle "${connection.sourceHandle}" not found on node "${sourceNode.id}".`,
      };
    }

    if (resolvedSourcePort.direction === 'input') {
      return {
        valid: false,
        code: 'OPM_PORT_INPUT_AS_SOURCE',
        reason: `Port "${resolvedSourcePort.id}" is an input port and cannot be used as a connection source.`,
      };
    }
  }

  // 4. Target handle resolution & validation
  if (connection.targetHandle) {
    resolvedTargetPort = findPortOnNode(targetNode, connection.targetHandle);
    if (!resolvedTargetPort) {
      const owner = findPortOwnerNode(connection.targetHandle);
      if (owner) {
        return {
          valid: false,
          code: 'OPM_PORT_HANDLE_WRONG_NODE',
          reason: `Target handle "${connection.targetHandle}" belongs to node "${owner.id}", not "${targetNode.id}".`,
        };
      }
      return {
        valid: false,
        code: 'OPM_PORT_HANDLE_MISSING',
        reason: `Target handle "${connection.targetHandle}" not found on node "${targetNode.id}".`,
      };
    }

    if (resolvedTargetPort.direction === 'output') {
      return {
        valid: false,
        code: 'OPM_PORT_OUTPUT_AS_TARGET',
        reason: `Port "${resolvedTargetPort.id}" is an output port and cannot be used as a connection target.`,
      };
    }
  }

  // 5. Port-level type and role compatibility
  if (resolvedSourcePort && resolvedTargetPort) {
    const sType = resolvedSourcePort.type?.trim().toLowerCase() || '';
    const tType = resolvedTargetPort.type?.trim().toLowerCase() || '';
    const isGeneric = (t: string) => !t || t === 'standard' || t === 'any' || t === '*';

    // Scalar type check
    if (!isGeneric(sType) && !isGeneric(tType) && sType !== tType) {
      return {
        valid: false,
        code: 'OPM_PORT_TYPE_INCOMPATIBLE',
        reason: `Incompatible port types: source port "${resolvedSourcePort.id}" (${resolvedSourcePort.type}) cannot connect to target port "${resolvedTargetPort.id}" (${resolvedTargetPort.type}).`,
      };
    }

    // Role check
    const knownRoles = ['agent', 'instrument', 'consumption', 'result', 'effect'];
    if (knownRoles.includes(sType) && sType !== linkType) {
      return {
        valid: false,
        code: 'OPM_PORT_ROLE_INCOMPATIBLE',
        reason: `Port "${resolvedSourcePort.id}" role "${resolvedSourcePort.type}" is incompatible with link type "${linkType}".`,
      };
    }
    if (knownRoles.includes(tType) && tType !== linkType) {
      return {
        valid: false,
        code: 'OPM_PORT_ROLE_INCOMPATIBLE',
        reason: `Port "${resolvedTargetPort.id}" role "${resolvedTargetPort.type}" is incompatible with link type "${linkType}".`,
      };
    }
  }

  // 6. Duplicate connections
  if (connection.sourceHandle && connection.targetHandle) {
    const duplicateSamePort = edges.some(
      e =>
        e.source === connection.source &&
        e.target === connection.target &&
        e.sourceHandle === connection.sourceHandle &&
        e.targetHandle === connection.targetHandle,
    );
    if (duplicateSamePort) {
      return {
        valid: false,
        code: 'OPM_DUPLICATE_PORT_CONNECTION',
        reason: `A link already connects source port "${connection.sourceHandle}" to target port "${connection.targetHandle}".`,
      };
    }
  }

  const duplicate = edges.some(
    e =>
      e.source === connection.source &&
      e.target === connection.target &&
      (e.data?.linkType ?? (e.data?.type ?? (e as any).type)) === linkType &&
      (e.sourceHandle || undefined) === (connection.sourceHandle || undefined) &&
      (e.targetHandle || undefined) === (connection.targetHandle || undefined),
  );
  if (duplicate) {
    return {
      valid: false,
      code: 'OPM_DUPLICATE_CONNECTION',
      reason: `A link of type "${linkType}" already exists between "${sourceNode.data.name || sourceNode.id}" and "${targetNode.data.name || targetNode.id}".`,
    };
  }

  // 7. Multiplicity constraints
  if (resolvedSourcePort) {
    const sMax = getPortMaxLinks(resolvedSourcePort);
    if (sMax !== null) {
      const currentCount = edges.filter(
        e => e.source === sourceNode.id && e.sourceHandle === resolvedSourcePort!.id,
      ).length;
      if (currentCount >= sMax) {
        return {
          valid: false,
          code: 'OPM_PORT_MULTIPLICITY_OVERFLOW',
          reason: `Source port "${resolvedSourcePort.id}" multiplicity limit (${sMax}) exceeded.`,
        };
      }
    }
  }

  if (resolvedTargetPort) {
    const tMax = getPortMaxLinks(resolvedTargetPort);
    if (tMax !== null) {
      const currentCount = edges.filter(
        e => e.target === targetNode.id && e.targetHandle === resolvedTargetPort!.id,
      ).length;
      if (currentCount >= tMax) {
        return {
          valid: false,
          code: 'OPM_PORT_MULTIPLICITY_OVERFLOW',
          reason: `Target port "${resolvedTargetPort.id}" multiplicity limit (${tMax}) exceeded.`,
        };
      }
    }
  }

  return {
    valid: true,
    sourcePort: resolvedSourcePort,
    targetPort: resolvedTargetPort,
  };
}
