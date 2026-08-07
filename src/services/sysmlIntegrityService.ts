import {
  SysMLDiagramState,
  SysMLPort,
  SysMLPart,
  SysMLBlock,
  SysMLConnector,
  SysMLRequirement,
  SysMLRelation,
  RelationType,
  DeletionImpact,
  ValidationResult,
} from '../types/sysml_types';

export function migrateSysMLState(rawState: any): SysMLDiagramState {
  if (!rawState || typeof rawState !== 'object') {
    return {
      blocks: [],
      ports: [],
      parts: [],
      connectors: [],
      requirements: [],
      relations: [],
    };
  }

  const blocks: SysMLBlock[] = Array.isArray(rawState.blocks)
    ? rawState.blocks.map((b: any) => ({
        id: String(b.id || ''),
        name: String(b.name || ''),
        ports: Array.isArray(b.ports) ? b.ports.map(String) : [],
        parts: Array.isArray(b.parts) ? b.parts.map(String) : [],
      }))
    : [];

  const ports: SysMLPort[] = Array.isArray(rawState.ports)
    ? rawState.ports.map((p: any) => ({
        id: String(p.id || ''),
        name: String(p.name || ''),
        direction: p.direction === 'in' || p.direction === 'out' || p.direction === 'inout' ? p.direction : 'inout',
        blockId: String(p.blockId || ''),
      }))
    : [];

  const parts: SysMLPart[] = Array.isArray(rawState.parts)
    ? rawState.parts.map((pt: any) => ({
        id: String(pt.id || ''),
        name: String(pt.name || ''),
        typeBlockId: String(pt.typeBlockId || ''),
        parentBlockId: String(pt.parentBlockId || ''),
        parentPartId: pt.parentPartId ? String(pt.parentPartId) : null,
      }))
    : [];

  const connectors: SysMLConnector[] = Array.isArray(rawState.connectors)
    ? rawState.connectors.map((c: any) => ({
        id: String(c.id || ''),
        name: c.name ? String(c.name) : undefined,
        sourcePortId: String(c.sourcePortId || ''),
        targetPortId: String(c.targetPortId || ''),
      }))
    : [];

  const requirements: SysMLRequirement[] = Array.isArray(rawState.requirements)
    ? rawState.requirements.map((r: any) => ({
        id: String(r.id || ''),
        reqId: String(r.reqId || r.id || ''),
        text: String(r.text || ''),
      }))
    : [];

  const relations: SysMLRelation[] = Array.isArray(rawState.relations)
    ? rawState.relations.map((rel: any) => {
        let relType: RelationType = 'trace';
        if (rel.type === 'derive' || rel.type === 'deriveReqt') {
          relType = 'deriveReqt';
        } else if (rel.type === 'satisfy' || rel.type === 'verify' || rel.type === 'refines' || rel.type === 'trace') {
          relType = rel.type;
        }
        return {
          id: String(rel.id || ''),
          sourceId: String(rel.sourceId || ''),
          targetId: String(rel.targetId || ''),
          type: relType,
        };
      })
    : [];

  return {
    blocks,
    ports,
    parts,
    connectors,
    requirements,
    relations,
  };
}

export function previewDeletionImpact(elementId: string, state: SysMLDiagramState): DeletionImpact {
  const isBlock = state.blocks.some(b => b.id === elementId);
  const isPort = state.ports.some(p => p.id === elementId);
  const isPart = state.parts.some(pt => pt.id === elementId);
  const isReq = state.requirements.some(r => r.id === elementId);

  const elementType = isBlock ? 'block' : isPort ? 'port' : isPart ? 'part' : 'requirement';
  const affectedParts: Set<string> = new Set();
  const affectedConnectors: Set<string> = new Set();
  const affectedRelations: Set<string> = new Set();

  if (isBlock) {
    const blockPortIds = new Set(state.ports.filter(p => p.blockId === elementId).map(p => p.id));
    state.parts.forEach(pt => {
      if (pt.parentBlockId === elementId || pt.typeBlockId === elementId) {
        affectedParts.add(pt.id);
      }
    });
    state.connectors.forEach(c => {
      if (blockPortIds.has(c.sourcePortId) || blockPortIds.has(c.targetPortId)) {
        affectedConnectors.add(c.id);
      }
    });
    state.relations.forEach(r => {
      if (r.sourceId === elementId || r.targetId === elementId ||
          blockPortIds.has(r.sourceId) || blockPortIds.has(r.targetId) ||
          affectedParts.has(r.sourceId) || affectedParts.has(r.targetId)) {
        affectedRelations.add(r.id);
      }
    });
  } else if (isPort) {
    state.connectors.forEach(c => {
      if (c.sourcePortId === elementId || c.targetPortId === elementId) {
        affectedConnectors.add(c.id);
      }
    });
    state.relations.forEach(r => {
      if (r.sourceId === elementId || r.targetId === elementId) {
        affectedRelations.add(r.id);
      }
    });
  } else if (isPart) {
    state.parts.forEach(pt => {
      if (pt.parentPartId === elementId) {
        affectedParts.add(pt.id);
      }
    });
    state.relations.forEach(r => {
      if (r.sourceId === elementId || r.targetId === elementId) {
        affectedRelations.add(r.id);
      }
    });
  } else if (isReq) {
    state.relations.forEach(r => {
      if (r.sourceId === elementId || r.targetId === elementId) {
        affectedRelations.add(r.id);
      }
    });
  }

  return {
    elementId,
    elementType,
    affectedParts: Array.from(affectedParts),
    affectedConnectors: Array.from(affectedConnectors),
    affectedRelations: Array.from(affectedRelations),
  };
}

export function cascadeDeleteBlock(blockId: string, state: SysMLDiagramState): SysMLDiagramState {
  const impact = previewDeletionImpact(blockId, state);
  const blockPorts = new Set(state.ports.filter(p => p.blockId === blockId).map(p => p.id));
  const affectedParts = new Set(impact.affectedParts);
  const affectedConnectors = new Set(impact.affectedConnectors);
  const affectedRelations = new Set(impact.affectedRelations);

  return {
    blocks: state.blocks.filter(b => b.id !== blockId),
    ports: state.ports.filter(p => !blockPorts.has(p.id)),
    parts: state.parts.filter(pt => !affectedParts.has(pt.id)),
    connectors: state.connectors.filter(c => !affectedConnectors.has(c.id)),
    requirements: state.requirements,
    relations: state.relations.filter(r => !affectedRelations.has(r.id)),
  };
}

export function cascadeDeletePort(portId: string, state: SysMLDiagramState): SysMLDiagramState {
  const impact = previewDeletionImpact(portId, state);
  const affectedConnectors = new Set(impact.affectedConnectors);
  const affectedRelations = new Set(impact.affectedRelations);

  return {
    blocks: state.blocks.map(b => ({
      ...b,
      ports: b.ports.filter(pid => pid !== portId),
    })),
    ports: state.ports.filter(p => p.id !== portId),
    parts: state.parts,
    connectors: state.connectors.filter(c => !affectedConnectors.has(c.id)),
    requirements: state.requirements,
    relations: state.relations.filter(r => !affectedRelations.has(r.id)),
  };
}

export function validateConnectorConnection(
  sourcePortId: string,
  targetPortId: string,
  state: SysMLDiagramState
): ValidationResult {
  if (sourcePortId === targetPortId) {
    return { valid: false, reason: 'Cannot connect a port to itself' };
  }

  const srcPort = state.ports.find(p => p.id === sourcePortId);
  const tgtPort = state.ports.find(p => p.id === targetPortId);

  if (!srcPort || !tgtPort) {
    return { valid: false, reason: 'Source or target port not found' };
  }

  const duplicate = state.connectors.some(
    c =>
      (c.sourcePortId === sourcePortId && c.targetPortId === targetPortId) ||
      (c.sourcePortId === targetPortId && c.targetPortId === sourcePortId)
  );

  if (duplicate) {
    return { valid: false, reason: 'A connector already exists between these ports' };
  }

  if (srcPort.direction === 'out' && tgtPort.direction === 'out') {
    return { valid: false, reason: 'Cannot connect output port to output port' };
  }

  if (srcPort.direction === 'in' && tgtPort.direction === 'in') {
    return { valid: false, reason: 'Cannot connect input port to input port' };
  }

  return { valid: true };
}


