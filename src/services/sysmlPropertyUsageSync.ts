import type { BlockData, ConnectorData, PartData, ValuePropertyData } from '../types/sysml_types';

export interface PropertyUsageDiagnostic {
  code: 'MISSING_PROPERTY_TYPE' | 'INVALID_PROPERTY_USAGE_TYPE';
  elementId: string;
  message: string;
}

export interface PropertyUsageReconciliation {
  blocks: BlockData[];
  parts: PartData[];
  connectors: ConnectorData[];
  diagnostics: PropertyUsageDiagnostic[];
}

export type ReconciliationAuthority = 'property' | 'usage';

const STRUCTURAL_KINDS = new Set(['part', 'reference']);

function isEligibleProperty(property: ValuePropertyData): boolean {
  return STRUCTURAL_KINDS.has(property.kind ?? 'value');
}

function findPropertyForPart(block: BlockData, part: PartData): ValuePropertyData | undefined {
  return block.properties.find(property => property.id === (part.propertyId ?? part.id))
    ?? block.properties.find(property => property.id === part.id)
    ?? block.properties.find(property => isEligibleProperty(property)
      && property.name === part.name
      && (property.typeId === part.typeId || property.type === part.typeId));
}

export function reconcilePropertyUsages(
  blocks: readonly BlockData[],
  parts: readonly PartData[],
  connectors: readonly ConnectorData[],
  ownerBlockId: string,
  authority: ReconciliationAuthority = 'property',
): PropertyUsageReconciliation {
  const owner = blocks.find(block => block.id === ownerBlockId);
  if (!owner) return { blocks: [...blocks], parts: [...parts], connectors: [...connectors], diagnostics: [] };

  const diagnostics: PropertyUsageDiagnostic[] = [];
  const ownerProperties = owner.properties;
  const eligible = ownerProperties.filter(isEligibleProperty);
  const retainedIds = new Set<string>();
  const nextParts = parts.filter(part => {
    if (part.blockId !== ownerBlockId) return true;
    const property = findPropertyForPart(owner, part);
    if (!property && authority === 'usage') {
      retainedIds.add(part.id);
      return true;
    }
    if (!property) return false;
    if (!isEligibleProperty(property)) return false;
    retainedIds.add(part.id);
    return true;
  });

  for (const property of eligible) {
    const typeId = property.typeId || property.type;
    const type = blocks.find(block => block.id === typeId || block.name === typeId);
    if (!type) {
      diagnostics.push({ code: 'MISSING_PROPERTY_TYPE', elementId: property.id, message: `${property.name} references missing block type ${typeId || '(empty)'}` });
      continue;
    }
    if (type.stereotype !== 'block') {
      diagnostics.push({ code: 'INVALID_PROPERTY_USAGE_TYPE', elementId: property.id, message: `${property.name} must be typed by a Block to appear in an IBD` });
      continue;
    }
    const existing = nextParts.find(part => (part.propertyId ?? part.id) === property.id)
      ?? nextParts.find(part => part.blockId === ownerBlockId && part.name === property.name && part.typeId === type.id);
    const usageWins = authority === 'usage' && existing !== undefined;
    const nextPart: PartData = {
      id: existing?.id ?? property.id,
      propertyId: property.id,
      name: usageWins ? existing.name : property.name,
      blockId: ownerBlockId,
      typeId: usageWins ? existing.typeId : type.id,
      aggregation: usageWins ? (existing.aggregation ?? 'composite') : property.kind === 'reference' ? 'reference' : 'composite',
      x: existing?.x ?? 100 + nextParts.length * 180,
      y: existing?.y ?? 100,
      width: existing?.width ?? 150,
      height: existing?.height ?? 100,
      multiplicity: usageWins ? (existing.multiplicity || '1') : (property.multiplicity || '1'),
      satisfiedReqIds: existing?.satisfiedReqIds,
      portLayouts: existing?.portLayouts,
      parentPartId: existing?.parentPartId,
      parentBlockId: existing?.parentBlockId,
      typeBlockId: existing?.typeBlockId,
    };
    const index = nextParts.findIndex(part => part.id === nextPart.id);
    if (index >= 0) nextParts[index] = nextPart;
    else nextParts.push(nextPart);
    retainedIds.add(nextPart.id);
  }

  const projectedProperties = nextParts
    .filter(part => part.blockId === ownerBlockId)
    .map(part => {
      const type = blocks.find(block => block.id === part.typeId);
      const propertyId = part.propertyId ?? part.id;
      const existing = ownerProperties.find(property => property.id === propertyId);
      if (!type) {
        diagnostics.push({ code: 'MISSING_PROPERTY_TYPE', elementId: propertyId, message: `${part.name} has an unresolved block type` });
      }
      return {
        ...existing,
        id: propertyId,
        name: part.name,
        type: type?.name ?? '',
        typeId: type?.id,
        kind: part.aggregation === 'reference' ? 'reference' : 'part',
        multiplicity: part.multiplicity || '1',
      } as ValuePropertyData;
    })
    .filter((property): property is ValuePropertyData => property !== null);
  const nextBlocks = blocks.map(block => block.id !== ownerBlockId ? block : {
    ...block,
    properties: [
      ...block.properties
        .filter(property => projectedProperties.some(next => next.id === property.id) || !parts.some(part => part.blockId === ownerBlockId && (part.propertyId ?? part.id) === property.id))
        .map(property => projectedProperties.find(next => next.id === property.id) ?? property),
      ...projectedProperties.filter(property => !block.properties.some(existing => existing.id === property.id)),
    ],
  });
  const removedIds = new Set(parts.filter(part => part.blockId === ownerBlockId && !retainedIds.has(part.id)).map(part => part.id));
  return {
    blocks: nextBlocks,
    parts: nextParts,
    connectors: connectors.filter(connector => !removedIds.has(connector.sourcePartId) && !removedIds.has(connector.targetPartId)),
    diagnostics,
  };
}

export function reconcileAllPropertyUsages(
  blocks: readonly BlockData[],
  parts: readonly PartData[],
  connectors: readonly ConnectorData[],
): PropertyUsageReconciliation {
  let result: PropertyUsageReconciliation = {
    blocks: [...blocks], parts: [...parts], connectors: [...connectors], diagnostics: [],
  };
  for (const block of blocks.filter(item => item.stereotype === 'block')) {
    const next = reconcilePropertyUsages(result.blocks, result.parts, result.connectors, block.id, 'usage');
    result = {
      blocks: next.blocks,
      parts: next.parts,
      connectors: next.connectors,
      diagnostics: [...result.diagnostics, ...next.diagnostics],
    };
  }
  return result;
}
