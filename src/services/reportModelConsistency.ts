import type {
  BlockData,
  ConnectorData,
  PartData,
  RelationshipData,
} from '../types/sysml_types';
import type {
  StateData,
  Layer,
  TransitionData,
  JunctionData,
} from '../types/sm_types';

export interface ReportModelInput {
  blocks: readonly BlockData[];
  relationships: readonly RelationshipData[];
  parts: readonly PartData[];
  connectors: readonly ConnectorData[];
  states?: readonly StateData[];
  layers?: readonly Layer[];
  transitions?: readonly TransitionData[];
  junctions?: readonly JunctionData[];
}

export interface ReportModelDiagnostics {
  errors: Array<{
    code: 'DANGLING_RELATIONSHIP' | 'DANGLING_CONNECTOR' | 'DUPLICATE_ID' | 'INVALID_CONTEXT';
    elementId: string;
    message: string;
  }>;
  removedRelationshipIds: string[];
  removedConnectorIds: string[];
}

export interface ReportModelSnapshot extends ReportModelInput {
  revision: string;
  diagnostics: ReportModelDiagnostics;
}

/**
 * Pure cascade deletion helper for SysML and report model elements.
 */
export function cascadeDeleteReportElement(
  model: ReportModelInput,
  target: { kind: 'block' | 'requirement' | 'part' | 'port'; id: string },
): ReportModelInput {
  switch (target.kind) {
    case 'block': {
      const targetBlock = model.blocks.find(b => b.id === target.id);
      if (!targetBlock) {
        return model;
      }

      const removedBlockIds = new Set<string>([target.id]);
      const removedPortIds = new Set<string>((targetBlock.ports || []).map(p => p.id));

      // Find all parts referencing this block directly or via parent/type, plus descendants
      const removedPartIds = new Set<string>();
      let partChanged = true;
      while (partChanged) {
        partChanged = false;
        for (const p of model.parts) {
          if (!removedPartIds.has(p.id)) {
            const matchesBlock =
              (p.blockId && removedBlockIds.has(p.blockId)) ||
              (p.typeId && removedBlockIds.has(p.typeId)) ||
              (p.parentBlockId && removedBlockIds.has(p.parentBlockId)) ||
              (p.typeBlockId && removedBlockIds.has(p.typeBlockId));
            const matchesParentPart =
              p.parentPartId && removedPartIds.has(p.parentPartId);

            if (matchesBlock || matchesParentPart) {
              removedPartIds.add(p.id);
              partChanged = true;
            }
          }
        }
      }

      const nextBlocks = model.blocks.filter(b => !removedBlockIds.has(b.id));
      const nextParts = model.parts.filter(p => !removedPartIds.has(p.id));
      const nextConnectors = model.connectors.filter(c => {
        if (removedPartIds.has(c.sourcePartId) || removedPartIds.has(c.targetPartId)) return false;
        if (c.sourcePortId && removedPortIds.has(c.sourcePortId)) return false;
        if (c.targetPortId && removedPortIds.has(c.targetPortId)) return false;
        return true;
      });
      const nextRelationships = model.relationships.filter(r => {
        if (removedBlockIds.has(r.sourceId) || removedBlockIds.has(r.targetId)) return false;
        if (removedPartIds.has(r.sourceId) || removedPartIds.has(r.targetId)) return false;
        if (removedPortIds.has(r.sourceId) || removedPortIds.has(r.targetId)) return false;
        return true;
      });

      return {
        ...model,
        blocks: nextBlocks,
        parts: nextParts,
        connectors: nextConnectors,
        relationships: nextRelationships,
      };
    }

    case 'requirement': {
      const nextBlocks = model.blocks.filter(b => b.id !== target.id);
      const nextRelationships = model.relationships.filter(
        r => r.sourceId !== target.id && r.targetId !== target.id,
      );
      return {
        ...model,
        blocks: nextBlocks,
        relationships: nextRelationships,
      };
    }

    case 'part': {
      const removedPartIds = new Set<string>([target.id]);
      let partChanged = true;
      while (partChanged) {
        partChanged = false;
        for (const p of model.parts) {
          if (!removedPartIds.has(p.id) && p.parentPartId && removedPartIds.has(p.parentPartId)) {
            removedPartIds.add(p.id);
            partChanged = true;
          }
        }
      }

      const nextParts = model.parts.filter(p => !removedPartIds.has(p.id));
      const nextConnectors = model.connectors.filter(
        c => !removedPartIds.has(c.sourcePartId) && !removedPartIds.has(c.targetPartId),
      );
      const nextRelationships = model.relationships.filter(
        r => !removedPartIds.has(r.sourceId) && !removedPartIds.has(r.targetId),
      );

      return {
        ...model,
        parts: nextParts,
        connectors: nextConnectors,
        relationships: nextRelationships,
      };
    }

    case 'port': {
      const nextBlocks = model.blocks.map(b => ({
        ...b,
        ports: (b.ports || []).filter(p => p.id !== target.id),
      }));
      const nextConnectors = model.connectors.filter(
        c => c.sourcePortId !== target.id && c.targetPortId !== target.id,
      );
      const nextRelationships = model.relationships.filter(
        r => r.sourceId !== target.id && r.targetId !== target.id,
      );

      return {
        ...model,
        blocks: nextBlocks,
        connectors: nextConnectors,
        relationships: nextRelationships,
      };
    }

    default:
      return model;
  }
}

/**
 * Reconciles the model by cleaning up dangling relationships and connectors,
 * detecting duplicate element IDs, and reporting invalid parent/hierarchy contexts.
 */
export function reconcileReportModel(
  model: ReportModelInput,
): { model: ReportModelInput; diagnostics: ReportModelDiagnostics } {
  const errors: ReportModelDiagnostics['errors'] = [];
  const removedRelationshipIds: string[] = [];
  const removedConnectorIds: string[] = [];

  // Check duplicate IDs within each collection
  const checkDuplicates = (items: readonly { id: string }[], kind: string) => {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id)) {
        errors.push({
          code: 'DUPLICATE_ID',
          elementId: item.id,
          message: `Duplicate ${kind} ID: ${item.id}`,
        });
      }
      seen.add(item.id);
    }
  };

  checkDuplicates(model.blocks, 'block');
  checkDuplicates(model.parts, 'part');
  checkDuplicates(model.relationships, 'relationship');
  checkDuplicates(model.connectors, 'connector');
  if (model.states) checkDuplicates(model.states, 'state');
  if (model.layers) checkDuplicates(model.layers, 'layer');
  if (model.transitions) checkDuplicates(model.transitions, 'transition');
  if (model.junctions) checkDuplicates(model.junctions, 'junction');

  // Validate contexts / containment
  const blockIdSet = new Set(model.blocks.map(b => b.id));
  const partIdSet = new Set(model.parts.map(p => p.id));
  const stateIdSet = new Set((model.states || []).map(s => s.id));

  for (const part of model.parts) {
    if (part.parentBlockId && !blockIdSet.has(part.parentBlockId)) {
      errors.push({
        code: 'INVALID_CONTEXT',
        elementId: part.id,
        message: `Part ${part.id} references non-existent parentBlockId: ${part.parentBlockId}`,
      });
    }
    if (part.blockId && !blockIdSet.has(part.blockId)) {
      errors.push({
        code: 'INVALID_CONTEXT',
        elementId: part.id,
        message: `Part ${part.id} references non-existent blockId: ${part.blockId}`,
      });
    }
    if (part.parentPartId && !partIdSet.has(part.parentPartId)) {
      errors.push({
        code: 'INVALID_CONTEXT',
        elementId: part.id,
        message: `Part ${part.id} references non-existent parentPartId: ${part.parentPartId}`,
      });
    }
  }

  if (model.layers) {
    for (const layer of model.layers) {
      if (layer.parentStateId && !stateIdSet.has(layer.parentStateId)) {
        errors.push({
          code: 'INVALID_CONTEXT',
          elementId: layer.id,
          message: `Layer ${layer.id} references non-existent parentStateId: ${layer.parentStateId}`,
        });
      }
    }
  }

  // Endpoints validation for relationships: blocks, parts, or ports of blocks
  const validRelEndpoints = new Set<string>([
    ...blockIdSet,
    ...partIdSet,
  ]);
  for (const b of model.blocks) {
    for (const port of b.ports || []) {
      validRelEndpoints.add(port.id);
    }
  }

  const survivingRelationships: RelationshipData[] = [];
  for (const rel of model.relationships) {
    const sourceValid = validRelEndpoints.has(rel.sourceId);
    const targetValid = validRelEndpoints.has(rel.targetId);

    if (!sourceValid || !targetValid) {
      removedRelationshipIds.push(rel.id);
      errors.push({
        code: 'DANGLING_RELATIONSHIP',
        elementId: rel.id,
        message: `Relationship ${rel.id} references missing endpoint: source=${rel.sourceId}, target=${rel.targetId}`,
      });
    } else {
      survivingRelationships.push(rel);
    }
  }

  // Endpoints validation for connectors: sourcePartId and targetPartId must be in parts
  const survivingConnectors: ConnectorData[] = [];
  for (const conn of model.connectors) {
    const sourcePartValid = partIdSet.has(conn.sourcePartId);
    const targetPartValid = partIdSet.has(conn.targetPartId);

    if (!sourcePartValid || !targetPartValid) {
      removedConnectorIds.push(conn.id);
      errors.push({
        code: 'DANGLING_CONNECTOR',
        elementId: conn.id,
        message: `Connector ${conn.id} references missing part: source=${conn.sourcePartId}, target=${conn.targetPartId}`,
      });
    } else {
      survivingConnectors.push(conn);
    }
  }

  const reconciledModel: ReportModelInput = {
    ...model,
    relationships: survivingRelationships,
    connectors: survivingConnectors,
  };

  const diagnostics: ReportModelDiagnostics = {
    errors,
    removedRelationshipIds,
    removedConnectorIds,
  };

  return { model: reconciledModel, diagnostics };
}

function computeDeterministicHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Builds an immutable report snapshot with deterministic revision and diagnostics.
 */
export function buildReportSnapshot(model: ReportModelInput): ReportModelSnapshot {
  const { model: reconciled, diagnostics } = reconcileReportModel(model);

  const blockTokens = reconciled.blocks.map(b => `${b.id}:${b.stereotype}`).sort().join(';');
  const partTokens = reconciled.parts.map(p => `${p.id}:${p.blockId || ''}:${p.parentPartId || ''}`).sort().join(';');
  const relTokens = reconciled.relationships.map(r => `${r.id}:${r.sourceId}->${r.targetId}:${r.type}`).sort().join(';');
  const connTokens = reconciled.connectors.map(c => `${c.id}:${c.sourcePartId}->${c.targetPartId}`).sort().join(';');
  const stateTokens = (reconciled.states || []).map(s => s.id).sort().join(';');
  const layerTokens = (reconciled.layers || []).map(l => l.id).sort().join(';');
  const transTokens = (reconciled.transitions || []).map(t => `${t.id}:${t.sourceId}->${t.targetId}`).sort().join(';');
  const juncTokens = (reconciled.junctions || []).map(j => j.id).sort().join(';');

  const contentSignature = [
    blockTokens,
    partTokens,
    relTokens,
    connTokens,
    stateTokens,
    layerTokens,
    transTokens,
    juncTokens,
  ].join('|');

  const revision = `rev_${computeDeterministicHash(contentSignature)}`;

  return {
    ...reconciled,
    revision,
    diagnostics,
  };
}
