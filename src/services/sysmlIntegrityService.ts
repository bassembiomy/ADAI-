import type {
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
  const isReq = (state.requirements ?? []).some(r => r.id === elementId);

  const elementType = isBlock ? 'block' : isPort ? 'port' : isPart ? 'part' : 'requirement';
  const affectedParts: Set<string> = new Set();
  const affectedConnectors: Set<string> = new Set();
  const affectedRelations: Set<string> = new Set();

  if (isBlock) {
    const blockPortIds = new Set(state.ports.filter(p => p.blockId === elementId).map(p => p.id));
    let changed = true;
    while (changed) {
      changed = false;
      state.parts.forEach(pt => {
        if (!affectedParts.has(pt.id)) {
          if (
            pt.parentBlockId === elementId ||
            pt.typeBlockId === elementId ||
            (pt as any).blockId === elementId ||
            (pt as any).typeId === elementId ||
            (pt.parentPartId && affectedParts.has(pt.parentPartId))
          ) {
            affectedParts.add(pt.id);
            changed = true;
          }
        }
      });
    }
    state.connectors.forEach(c => {
      if (
        (c.sourcePortId && blockPortIds.has(c.sourcePortId)) ||
        (c.targetPortId && blockPortIds.has(c.targetPortId)) ||
        (c.sourcePartId && affectedParts.has(c.sourcePartId)) ||
        (c.targetPartId && affectedParts.has(c.targetPartId))
      ) {
        affectedConnectors.add(c.id);
      }
    });
    (state.relations ?? []).forEach(r => {
      if (
        r.sourceId === elementId ||
        r.targetId === elementId ||
        blockPortIds.has(r.sourceId) ||
        blockPortIds.has(r.targetId) ||
        affectedParts.has(r.sourceId) ||
        affectedParts.has(r.targetId)
      ) {
        affectedRelations.add(r.id);
      }
    });
  } else if (isPort) {
    state.connectors.forEach(c => {
      if (c.sourcePortId === elementId || c.targetPortId === elementId) {
        affectedConnectors.add(c.id);
      }
    });
    (state.relations ?? []).forEach(r => {
      if (r.sourceId === elementId || r.targetId === elementId) {
        affectedRelations.add(r.id);
      }
    });
  } else if (isPart) {
    affectedParts.add(elementId);
    let changed = true;
    while (changed) {
      changed = false;
      state.parts.forEach(pt => {
        if (!affectedParts.has(pt.id) && pt.parentPartId && affectedParts.has(pt.parentPartId)) {
          affectedParts.add(pt.id);
          changed = true;
        }
      });
    }
    state.connectors.forEach(c => {
      if (
        (c.sourcePartId && affectedParts.has(c.sourcePartId)) ||
        (c.targetPartId && affectedParts.has(c.targetPartId))
      ) {
        affectedConnectors.add(c.id);
      }
    });
    (state.relations ?? []).forEach(r => {
      if (
        r.sourceId === elementId ||
        r.targetId === elementId ||
        affectedParts.has(r.sourceId) ||
        affectedParts.has(r.targetId)
      ) {
        affectedRelations.add(r.id);
      }
    });
  } else if (isReq) {
    (state.relations ?? []).forEach(r => {
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
    ...state,
    blocks: state.blocks.filter(b => b.id !== blockId),
    ports: state.ports.filter(p => !blockPorts.has(p.id)),
    parts: state.parts.filter(pt => !affectedParts.has(pt.id)),
    connectors: state.connectors.filter(c => !affectedConnectors.has(c.id)),
    requirements: state.requirements ?? [],
    relations: (state.relations ?? []).filter(r => !affectedRelations.has(r.id)),
  };
}

export function cascadeDeletePort(portId: string, state: SysMLDiagramState): SysMLDiagramState {
  const impact = previewDeletionImpact(portId, state);
  const affectedConnectors = new Set(impact.affectedConnectors);
  const affectedRelations = new Set(impact.affectedRelations);

  return {
    ...state,
    blocks: state.blocks.map(b => ({
      ...b,
      ports: (b.ports ?? []).filter(p => (typeof p === 'string' ? p : p.id) !== portId),
    })),
    ports: state.ports.filter(p => p.id !== portId),
    parts: state.parts,
    connectors: state.connectors.filter(c => !affectedConnectors.has(c.id)),
    requirements: state.requirements ?? [],
    relations: (state.relations ?? []).filter(r => !affectedRelations.has(r.id)),
  };
}

export function cascadeDeletePart(partId: string, state: SysMLDiagramState): SysMLDiagramState {
  const impact = previewDeletionImpact(partId, state);
  const affectedParts = new Set([partId, ...(impact.affectedParts ?? [])]);
  const affectedConnectors = new Set(impact.affectedConnectors);
  const affectedRelations = new Set(impact.affectedRelations);

  return {
    ...state,
    parts: state.parts.filter(pt => !affectedParts.has(pt.id)),
    connectors: state.connectors.filter(c => !affectedConnectors.has(c.id)),
    relations: (state.relations ?? []).filter(r => !affectedRelations.has(r.id)),
  };
}

export function cascadeDeleteRequirement(requirementId: string, state: SysMLDiagramState): SysMLDiagramState {
  const impact = previewDeletionImpact(requirementId, state);
  const affectedRelations = new Set(impact.affectedRelations);

  return {
    ...state,
    requirements: (state.requirements ?? []).filter(r => r.id !== requirementId),
    blocks: state.blocks.filter(b => b.id !== requirementId),
    relations: (state.relations ?? []).filter(
      r => !affectedRelations.has(r.id) && r.sourceId !== requirementId && r.targetId !== requirementId
    ),
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

export function validateTraceabilityRelation(
  sourceId: string,
  targetId: string,
  relationType: string,
  state: SysMLDiagramState
): ValidationResult {
  const isSourceReq = (state.requirements ?? []).some(r => r.id === sourceId);
  const isTargetReq = (state.requirements ?? []).some(r => r.id === targetId);

  const isSourceBlockOrPart =
    state.blocks.some(b => b.id === sourceId) || state.parts.some(p => p.id === sourceId);

  const normalizedType = relationType === 'derive' ? 'deriveReqt' : relationType;

  if (normalizedType === 'satisfy') {
    if (!isTargetReq) {
      return { valid: false, reason: 'Target must be a Requirement for satisfy relation' };
    }
    if (!isSourceBlockOrPart) {
      return { valid: false, reason: 'Source must be a Block or Part for satisfy relation' };
    }
  } else if (normalizedType === 'deriveReqt') {
    if (!isSourceReq) {
      return { valid: false, reason: 'Source must be a Requirement for deriveReqt relation' };
    }
    if (!isTargetReq) {
      return { valid: false, reason: 'Target must be a Requirement for deriveReqt relation' };
    }
  } else if (normalizedType === 'verify') {
    if (!isTargetReq) {
      return { valid: false, reason: 'Target must be a Requirement for verify relation' };
    }
  }

  return { valid: true };
}

export function validateUniqueRequirementIds(requirements: SysMLRequirement[]): ValidationResult {
  const seen = new Set<string>();
  for (const req of requirements) {
    if (!req.reqId) continue;
    const normalizedReqId = req.reqId.trim().toUpperCase();
    if (seen.has(normalizedReqId)) {
      return {
        valid: false,
        reason: `Duplicate requirement ID found: ${req.reqId}`,
      };
    }
    seen.add(normalizedReqId);
  }
  return { valid: true };
}



