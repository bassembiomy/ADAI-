import type { BlockData, ConnectorData, PartData, PortData, RelationshipData } from '../types/sysml_types';
import type {
  BlockDefinition,
  ConnectorUsage,
  SysmlRelationship,
  SysmlRepository,
} from '../engine/sysml/model';
import {
  classifyDeletionTarget,
  classifyRelationship,
  parsePolicyDiagnostic,
  resolveInheritance,
  type DeletionDecision,
} from '../engine/sysml/policy';
import { validateConnector } from '../engine/sysml/ibd';
import {
  classifyCanonicalEndpoint,
  classifyLegacyEndpoint,
  evaluateSysmlConnection,
  type ConnectionEndpoint,
} from '../engine/sysml/connectionPolicy';

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
  const source = legacyConnectionEndpoint(model.blocks, model.parts, candidate.sourceId);
  const target = legacyConnectionEndpoint(model.blocks, model.parts, candidate.targetId);
  const type: string = candidate.type === 'derive' ? 'deriveReqt' : candidate.type;
  if (!source || !target) codes.push('MISSING_RELATIONSHIP_ENDPOINT');
  if (candidate.sourceId === candidate.targetId) codes.push('SELF_RELATIONSHIP');
  if (model.relationships.some(existing => existing.id !== candidate.id && existing.sourceId === candidate.sourceId && existing.targetId === candidate.targetId && normalize(existing.type) === type)) codes.push('DUPLICATE_RELATIONSHIP');

  const sourceReq = source?.family === 'requirement';
  const targetReq = target?.family === 'requirement';
  if (source && target) {
    const decision = evaluateSysmlConnection({ relationshipKind: type, source, target, diagram: relationshipDiagram(type) });
    codes.push(...decision.diagnostics.map(diagnostic => diagnostic.code));
  }
  if (type === 'composition') {
    // Retain this legacy compatibility code alongside the central primary code.
    if (source && target && source.family !== 'unknown' && target.family !== 'unknown' && (source.family !== 'block' || target.family !== 'block')) codes.push('INVALID_COMPOSITION_ENDPOINTS');
    if (createsCycle(model.relationships, candidate, 'composition')) codes.push('COMPOSITION_CYCLE');
  }
  if (type === 'requirementContainment') {
    if (!sourceReq || !targetReq) codes.push('INVALID_REQUIREMENT_CONTAINMENT_ENDPOINT');
    if (candidate.sourceId === candidate.targetId) codes.push('REQUIREMENT_SELF_CONTAINMENT');
    const existingContainers = model.relationships.filter(existing =>
      existing.id !== candidate.id &&
      normalize(existing.type) === 'requirementContainment' &&
      existing.targetId === candidate.targetId
    );
    if (existingContainers.length > 0) codes.push('MULTIPLE_REQUIREMENT_CONTAINERS');
    if (createsCycle(model.relationships, candidate, 'requirementContainment')) {
      codes.push('REQUIREMENT_CONTAINMENT_CYCLE');
    }
  }
  if (type === 'copy') {
    const existingMasters = model.relationships.filter(existing =>
      existing.id !== candidate.id &&
      normalize(existing.type) === 'copy' &&
      existing.sourceId === candidate.sourceId
    );
    if (existingMasters.length > 0) codes.push('MULTIPLE_MASTERS_FOR_COPY');
  }
  if (type === 'generalization' && source && target && !['block', 'interfaceBlock', 'interface', 'valueType', 'enumeration'].includes(source.family)) codes.push('INVALID_GENERALIZATION_ENDPOINTS');

  if (['generalization', 'deriveReqt', 'copy'].includes(type) && createsCycle(model.relationships, candidate, type)) codes.push('RELATIONSHIP_CYCLE');
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

function legacyConnectionEndpoint(blocks: readonly BlockData[], parts: readonly PartData[], id: string): ConnectionEndpoint | undefined {
  const endpoint = blocks.find(item => item.id === id) ?? parts.find(item => item.id === id);
  return endpoint ? classifyLegacyEndpoint(endpoint) : undefined;
}

function relationshipDiagram(type: string): 'bdd' | 'ibd' | 'requirements' | 'rtm' {
  if (type === 'binding') return 'ibd';
  if (type === 'requirementContainment' || ['deriveReqt', 'copy', 'satisfy', 'verify', 'refine', 'trace'].includes(type)) return 'requirements';
  return 'bdd';
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

// ---------------------------------------------------------------------------
// Canonical (repository-level) validators — Task 2 gateway policy gating.
// These delegate to the central typed policy (policy.ts single source +
// ibd.ts connector policy) so canonical commands emit the same typed codes
// as validation, instead of generic invalid-operation errors.
// ---------------------------------------------------------------------------

function canonicalElementExists(repo: SysmlRepository, id: string): boolean {
  return Boolean(
    repo.definitions[id] ?? repo.usages[id] ?? repo.connectors[id] ?? repo.relationships[id] ??
    repo.requirements[id] ?? repo.verificationCases[id] ?? repo.evidence[id] ?? repo.baselines[id] ?? repo.artifacts[id],
  );
}

function withCandidateRelationship(repo: SysmlRepository, candidate: SysmlRelationship): SysmlRepository {
  return { ...repo, relationships: { ...repo.relationships, [candidate.id]: candidate } };
}

function canonicalRelationshipCycle(
  repo: SysmlRepository, candidate: SysmlRelationship,
): 'RELATIONSHIP_CYCLE' | 'REQUIREMENT_CONTAINMENT_CYCLE' | undefined {
  const kinds = new Set<SysmlRelationship['kind']>([
    'sharedAggregation', 'composition', 'generalization', 'deriveReqt', 'copy',
    'requirementContainment',
  ]);
  if (!kinds.has(candidate.kind)) return undefined;
  const adjacency = new Map<string, string[]>();
  for (const relationship of [...Object.values(repo.relationships), candidate]) {
    if (relationship.id === candidate.id && repo.relationships[candidate.id]) continue;
    if (relationship.kind !== candidate.kind) continue;
    adjacency.set(relationship.sourceId, [...(adjacency.get(relationship.sourceId) ?? []), relationship.targetId]);
  }
  adjacency.set(candidate.sourceId, [...(adjacency.get(candidate.sourceId) ?? []), candidate.targetId]);
  const queue = [candidate.targetId];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (current === candidate.sourceId) {
      return candidate.kind === 'requirementContainment' ? 'REQUIREMENT_CONTAINMENT_CYCLE' : 'RELATIONSHIP_CYCLE';
    }
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(adjacency.get(current) ?? []));
  }
  return undefined;
}

/** Canonical relationship admission: typed codes via classifyRelationship + duplicate/cycle/self checks. */
export function validateCanonicalRelationshipCandidate(
  repo: SysmlRepository, candidate: SysmlRelationship,
): CreationValidationResult {
  const codes: string[] = [];
  if (candidate.sourceId === candidate.targetId) codes.push('SELF_RELATIONSHIP');
  if (!canonicalElementExists(repo, candidate.sourceId) || !canonicalElementExists(repo, candidate.targetId)) {
    codes.push('MISSING_RELATIONSHIP_ENDPOINT');
  }
  const duplicate = Object.values(repo.relationships).some(existing =>
    existing.id !== candidate.id &&
    existing.sourceId === candidate.sourceId &&
    existing.targetId === candidate.targetId &&
    existing.kind === candidate.kind,
  );
  if (duplicate) codes.push('DUPLICATE_RELATIONSHIP');

  const decision = classifyRelationship(withCandidateRelationship(repo, candidate), candidate.id);
  for (const entry of decision.diagnostics) codes.push(parsePolicyDiagnostic(entry).code);

  const cycle = canonicalRelationshipCycle(repo, candidate);
  if (cycle) codes.push(cycle);
  return result(codes);
}

/** Canonical connector admission (connect path): typed codes via the IBD policy. */
export function validateCanonicalConnectorCandidate(
  repo: SysmlRepository, candidate: ConnectorUsage,
): CreationValidationResult {
  const codes: string[] = [];
  if (candidate.sourcePortId === candidate.targetPortId) codes.push('SELF_CONNECTOR');
  const staged = { ...repo, connectors: { ...repo.connectors, [candidate.id]: candidate } };
  for (const diagnostic of validateConnector(staged, candidate.id)) codes.push(diagnostic.code);
  return result(codes);
}

/** Canonical block admission: leaf specialization / redefine / subset via resolveInheritance. */
export function validateCanonicalBlockDefinition(
  repo: SysmlRepository, definition: BlockDefinition,
): CreationValidationResult {
  const staged = { ...repo, definitions: { ...repo.definitions, [definition.id]: definition } };
  const resolution = resolveInheritance(staged, definition.id);
  const codes = resolution.diagnostics.map(entry => parsePolicyDiagnostic(entry).code);
  const errors = codes.filter(code => code !== 'ABSTRACT_INSTANTIATION');
  return { valid: errors.length === 0, codes: [...new Set(codes)], reason: codes.length ? codes.join(', ') : undefined };
}

/**
 * Canonical block update admission: patches the element in a staged copy, then
 * runs the same inheritance policy. Additionally, sealing a block as leaf is
 * rejected when existing definitions already specialize it (their
 * LEAF_SPECIALIZATION would otherwise be retroactively introduced).
 */
export function validateCanonicalBlockUpdate(
  repo: SysmlRepository, elementId: string, patch: Record<string, unknown>,
): CreationValidationResult {
  const existing = repo.definitions[elementId];
  if (!existing || existing.kind !== 'block') return result(['ELEMENT_NOT_FOUND']);
  const codes: string[] = [];
  if (patch.isLeaf === true) {
    const specializedBy = Object.values(repo.definitions).filter(definition =>
      definition.kind === 'block' && (definition.supertypeIds ?? []).includes(elementId),
    );
    if (specializedBy.length > 0) codes.push('LEAF_SPECIALIZATION');
  }
  const staged = {
    ...repo,
    definitions: { ...repo.definitions, [elementId]: { ...existing, ...patch } as BlockDefinition },
  };
  const resolution = resolveInheritance(staged, elementId);
  for (const entry of resolution.diagnostics) {
    const code = parsePolicyDiagnostic(entry).code;
    if (code !== 'ABSTRACT_INSTANTIATION') codes.push(code);
  }
  if ((patch as { isAbstract?: unknown }).isAbstract === true) codes.push('ABSTRACT_INSTANTIATION');
  const errors = codes.filter(code => code !== 'ABSTRACT_INSTANTIATION');
  const unique = [...new Set(codes)];
  return { valid: errors.length === 0, codes: unique, reason: unique.length ? unique.join(', ') : undefined };
}

/** Canonical deletion-target classification (gateway/adapter boundary). */
export function classifyCanonicalDeletionTarget(repo: SysmlRepository, elementId: string): DeletionDecision {
  return classifyDeletionTarget(repo, elementId);
}
