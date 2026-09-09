import type { BlockData, ConnectorData, PartData, PortData, RelationshipData } from '../types/sysml_types';

export interface CreationValidationResult {
  valid: boolean;
  codes: string[];
  reason?: string;
}

export function validateLegacyRequirementStatusTransition(
  blocks: readonly BlockData[], relationships: readonly RelationshipData[], requirementId: string, targetStatus: string,
): CreationValidationResult {
  const requirement = blocks.find(block => block.id === requirementId && block.stereotype === 'requirement');
  if (!requirement) return result(['REQUIREMENT_NOT_FOUND']);
  const current = requirement.status || 'Draft';
  if (current === targetStatus) return result([]);
  const exceptional = ['Failed', 'Stale', 'Retired'].includes(targetStatus);
  const next: Record<string, string[]> = { Draft: ['Approved'], Approved: ['Implemented'], Implemented: ['Verified'], Verified: [], Failed: ['Draft', 'Approved', 'Implemented'], Stale: ['Draft', 'Approved', 'Implemented'], Retired: [] };
  const codes: string[] = [];
  if (!exceptional && !(next[current] ?? []).includes(targetStatus)) codes.push('INVALID_REQUIREMENT_STATUS_TRANSITION');
  if (targetStatus === 'Verified') {
    const passed = relationships.some(relationship => relationship.type === 'verify' && relationship.targetId === requirementId
      && blocks.some(block => block.id === relationship.sourceId && block.stereotype === 'verificationCase' && block.verificationResult === 'passed'));
    if (!passed) codes.push('CURRENT_PASSING_EVIDENCE_REQUIRED');
  }
  return result(codes);
}

export function validateLegacyRelationshipCandidate(
  model: { blocks: readonly BlockData[]; parts: readonly PartData[]; relationships: readonly RelationshipData[] },
  candidate: RelationshipData,
): CreationValidationResult {
  const codes: string[] = [];
  const source = endpointKind(model.blocks, model.parts, candidate.sourceId);
  const target = endpointKind(model.blocks, model.parts, candidate.targetId);
  const type: string = candidate.type === 'derive' ? 'deriveReqt' : candidate.type;
  if (!source || !target) codes.push('MISSING_RELATIONSHIP_ENDPOINT');
  if (candidate.sourceId === candidate.targetId) codes.push('SELF_RELATIONSHIP');
  if (model.relationships.some(existing => existing.id !== candidate.id && existing.sourceId === candidate.sourceId && existing.targetId === candidate.targetId && normalize(existing.type) === type)) codes.push('DUPLICATE_RELATIONSHIP');

  const sourceReq = source === 'requirement';
  const targetReq = target === 'requirement';
  if (type === 'satisfy' && (sourceReq || !targetReq)) codes.push('INVALID_SATISFY_DIRECTION');
  if ((type === 'deriveReqt' || type === 'copy') && (!sourceReq || !targetReq)) codes.push('INVALID_REQUIREMENT_RELATION_DIRECTION');
  if (type === 'verify' && (source !== 'verificationCase' || !targetReq)) codes.push('INVALID_VERIFY_DIRECTION');
  if (type === 'refine' && (sourceReq || !targetReq)) codes.push('INVALID_REFINE_DIRECTION');
  if (type === 'trace' && !sourceReq && !targetReq) codes.push('INVALID_TRACE_ENDPOINTS');
  if (type === 'composition' && sourceReq !== targetReq) codes.push('INVALID_COMPOSITION_ENDPOINTS');
  if (type === 'generalization' && (source !== 'block' || target !== 'block')) codes.push('INVALID_GENERALIZATION_ENDPOINTS');

  if (['generalization', 'composition', 'deriveReqt', 'copy'].includes(type) && createsCycle(model.relationships, candidate, type)) codes.push('RELATIONSHIP_CYCLE');
  return result(codes);
}

export function validateLegacyConnectorCandidate(
  model: { blocks: readonly BlockData[]; parts: readonly PartData[]; connectors: readonly ConnectorData[] },
  candidate: ConnectorData,
  contextBlockId: string,
): CreationValidationResult {
  const codes: string[] = [];
  const source = resolveEndpoint(model.blocks, model.parts, candidate.sourcePartId, candidate.sourcePortId);
  const target = resolveEndpoint(model.blocks, model.parts, candidate.targetPartId, candidate.targetPortId);
  if (!source || !target) codes.push('MISSING_CONNECTOR_ENDPOINT');
  if (candidate.sourcePartId === candidate.targetPartId && candidate.sourcePortId === candidate.targetPortId) codes.push('SELF_CONNECTOR');
  if (model.connectors.some(existing => existing.id !== candidate.id && sameConnector(existing, candidate))) codes.push('DUPLICATE_CONNECTOR');
  if (!endpointInContext(model.parts, candidate.sourcePartId, contextBlockId) || !endpointInContext(model.parts, candidate.targetPartId, contextBlockId)) codes.push('INVALID_CONNECTOR_CONTEXT');
  const sourceBoundary = candidate.sourcePartId === contextBlockId;
  const targetBoundary = candidate.targetPartId === contextBlockId;
  const connectorKind = candidate.kind ?? (sourceBoundary !== targetBoundary ? 'delegation' : 'assembly');
  if (connectorKind === 'delegation' && sourceBoundary === targetBoundary) codes.push('INVALID_DELEGATION_ENDPOINTS');
  if (connectorKind === 'assembly' && (sourceBoundary || targetBoundary)) codes.push('INVALID_ASSEMBLY_ENDPOINTS');
  if (candidate.itemFlow && !model.blocks.some(block => (block.id === candidate.itemFlow || block.name === candidate.itemFlow) && ['valueType', 'interface', 'interfaceBlock'].includes(block.stereotype))) codes.push('MISSING_ITEM_FLOW_TYPE');
  if (source && target) {
    const sourceDirection = source.direction ?? 'inout';
    const targetDirection = target.direction ?? 'inout';
    if (connectorKind !== 'binding' && sourceDirection !== 'inout' && targetDirection !== 'inout' && sourceDirection === targetDirection) codes.push('INCOMPATIBLE_PORT_DIRECTION');
    if (source.type !== target.type && source.type !== 'any' && target.type !== 'any') codes.push('INCOMPATIBLE_PORT_TYPE');
    if (source.unit && target.unit && source.unit !== target.unit) codes.push('INCOMPATIBLE_PORT_UNIT');
  }
  return result(codes);
}

function endpointKind(blocks: readonly BlockData[], parts: readonly PartData[], id: string): 'block' | 'requirement' | 'verificationCase' | 'part' | undefined {
  const block = blocks.find(item => item.id === id);
  if (block) return block.stereotype === 'requirement' ? 'requirement' : block.stereotype === 'verificationCase' ? 'verificationCase' : 'block';
  return parts.some(item => item.id === id) ? 'part' : undefined;
}

function createsCycle(existing: readonly RelationshipData[], candidate: RelationshipData, normalizedType: string): boolean {
  const adjacency = new Map<string, string[]>();
  for (const relationship of [...existing.filter(item => item.id !== candidate.id), candidate]) {
    if (normalize(relationship.type) !== normalizedType) continue;
    adjacency.set(relationship.sourceId, [...(adjacency.get(relationship.sourceId) ?? []), relationship.targetId]);
  }
  const queue = [candidate.targetId];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (current === candidate.sourceId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

function resolveEndpoint(blocks: readonly BlockData[], parts: readonly PartData[], ownerId: string, portId: string): PortData | undefined {
  const part = parts.find(item => item.id === ownerId);
  const blockId = part?.typeId ?? part?.typeBlockId ?? ownerId;
  return blocks.find(item => item.id === blockId)?.ports.find(port => port.id === portId);
}

function endpointInContext(parts: readonly PartData[], endpointOwnerId: string, contextBlockId: string): boolean {
  if (endpointOwnerId === contextBlockId) return true;
  const part = parts.find(item => item.id === endpointOwnerId);
  return part?.blockId === contextBlockId || part?.parentBlockId === contextBlockId || Boolean(part?.parentPartId && hasAncestor(parts, part.parentPartId, contextBlockId));
}

function hasAncestor(parts: readonly PartData[], partId: string, contextBlockId: string): boolean {
  const visited = new Set<string>();
  let current = parts.find(item => item.id === partId);
  while (current && !visited.has(current.id)) {
    if (current.blockId === contextBlockId || current.parentBlockId === contextBlockId) return true;
    visited.add(current.id);
    current = current.parentPartId ? parts.find(item => item.id === current!.parentPartId) : undefined;
  }
  return false;
}

function sameConnector(left: ConnectorData, right: ConnectorData): boolean {
  return (left.sourcePartId === right.sourcePartId && left.sourcePortId === right.sourcePortId && left.targetPartId === right.targetPartId && left.targetPortId === right.targetPortId)
    || (left.sourcePartId === right.targetPartId && left.sourcePortId === right.targetPortId && left.targetPartId === right.sourcePartId && left.targetPortId === right.sourcePortId);
}
function normalize(type: RelationshipData['type']): string { return type === 'derive' ? 'deriveReqt' : type; }
function result(codes: string[]): CreationValidationResult {
  const unique = [...new Set(codes)];
  return { valid: unique.length === 0, codes: unique, reason: unique.length ? unique.join(', ') : undefined };
}
