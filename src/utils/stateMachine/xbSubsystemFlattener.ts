import type { XBEdgeV1, XBNodeV1, XBPersistedModelV1 } from './xbModel';

export function flattenXBSubsystems(model: XBPersistedModelV1): XBPersistedModelV1 {
  const subsystemNodes = model.nodes.filter(n => n.type === 'Subsystem');
  if (subsystemNodes.length === 0) return model;

  const subsystemIds = new Set(subsystemNodes.map(n => n.id));
  const newNodes: XBNodeV1[] = [];
  const parentMap = new Map<string, string>(); // subId -> parentId

  for (const sub of subsystemNodes) {
    parentMap.set(sub.id, sub.parentId ?? 'root');
  }

  // 1. Promote child nodes
  for (const node of model.nodes) {
    if (subsystemIds.has(node.id)) continue; // skip Subsystem container nodes

    let currentParent = node.parentId ?? 'root';
    while (subsystemIds.has(currentParent)) {
      currentParent = parentMap.get(currentParent) ?? 'root';
    }

    newNodes.push({
      ...node,
      parentId: currentParent,
    });
  }

  // Build lookup maps for subsystem ports: subId:portName -> realPortId
  const inportMap = new Map<string, string>();  // subId:portId -> internal Inport node.id
  const outportMap = new Map<string, string>(); // subId:portId -> internal Outport node.id

  for (const node of model.nodes) {
    if (node.parentId && subsystemIds.has(node.parentId)) {
      if (node.type === 'Inport') {
        const portName = (node.parameters.name as string) || node.id;
        inportMap.set(`${node.parentId}:${portName}`, node.id);
        inportMap.set(`${node.parentId}:${node.id}`, node.id);
      } else if (node.type === 'Outport') {
        const portName = (node.parameters.name as string) || node.id;
        outportMap.set(`${node.parentId}:${portName}`, node.id);
        outportMap.set(`${node.parentId}:${node.id}`, node.id);
      }
    }
  }

  // 2. Rewire edges
  const newEdges: XBEdgeV1[] = model.edges.map(edge => {
    let targetNodeId = edge.targetNodeId;
    let targetPortId = edge.targetPortId;
    let sourceNodeId = edge.sourceNodeId;
    let sourcePortId = edge.sourcePortId;

    if (subsystemIds.has(targetNodeId)) {
      const internalInport = inportMap.get(`${targetNodeId}:${edge.targetPortId}`);
      if (internalInport) {
        targetNodeId = internalInport;
        targetPortId = 'in';
      }
    }

    if (subsystemIds.has(sourceNodeId)) {
      const internalOutport = outportMap.get(`${sourceNodeId}:${edge.sourcePortId}`);
      if (internalOutport) {
        sourceNodeId = internalOutport;
        sourcePortId = 'out';
      }
    }

    return {
      ...edge,
      sourceNodeId,
      sourcePortId,
      targetNodeId,
      targetPortId,
    };
  });

  const nextModel: XBPersistedModelV1 = {
    ...model,
    nodes: newNodes,
    edges: newEdges,
  };

  // Recurse if there were nested subsystems
  return flattenXBSubsystems(nextModel);
}
