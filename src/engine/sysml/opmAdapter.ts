import type { SysmlRepository } from './model';
import type { SysmlDiagnostic } from './validation';

export type OpmMappingStatus = 'mapped' | 'conceptual-only' | 'unsupported' | 'unresolved';

export interface OpmProjectionNode {
  id: string;
  name: string;
  type: 'object' | 'requirement';
  sourceSysmlId: string;
  mappingStatus: OpmMappingStatus;
  requirementId?: string;
  requirementText?: string;
  requirementStatus?: string;
  requirementVersion?: string;
}

export interface OpmProjectionEdge {
  id: string;
  source: string;
  target: string;
  type: 'aggregation' | 'generalization' | 'satisfies' | 'verifies';
  sourceSysmlId: string;
  sourceSysmlKind: string;
  mappingStatus: OpmMappingStatus;
}

export interface OpmMappingRecord {
  sourceSysmlId: string;
  sourceKind: string;
  projectedId?: string;
  status: OpmMappingStatus;
  diagnosticCode?: string;
}

export interface OpmProjection {
  sourceProfileId: string;
  sourceRevision: number;
  nodes: OpmProjectionNode[];
  edges: OpmProjectionEdge[];
  mappings: OpmMappingRecord[];
  diagnostics: SysmlDiagnostic[];
}

export interface OpmRoundTripAssessment {
  lossless: boolean;
  lossySourceIds: string[];
  missingMappingSourceIds: string[];
  diagnostics: SysmlDiagnostic[];
}

export function projectSysmlToOpm(repo: SysmlRepository): OpmProjection {
  const nodes: OpmProjectionNode[] = [];
  const edges: OpmProjectionEdge[] = [];
  const mappings: OpmMappingRecord[] = [];
  const diagnostics: SysmlDiagnostic[] = [];
  for (const definition of Object.values(repo.definitions).sort(byId)) {
    if (definition.kind === 'block') {
      nodes.push({ id: definition.id, name: definition.name, type: 'object', sourceSysmlId: definition.id, mappingStatus: 'conceptual-only' });
      mappings.push({ sourceSysmlId: definition.id, sourceKind: definition.kind, projectedId: definition.id, status: 'conceptual-only', diagnosticCode: 'OPM_BLOCK_FEATURE_LOSS' });
      diagnostics.push(warning('OPM_BLOCK_FEATURE_LOSS', definition.id, 'OPM objects do not preserve all SysML block features and typing'));
    } else {
      mappings.push({ sourceSysmlId: definition.id, sourceKind: definition.kind, status: 'unsupported', diagnosticCode: 'OPM_DEFINITION_UNSUPPORTED' });
      diagnostics.push(warning('OPM_DEFINITION_UNSUPPORTED', definition.id, `${definition.kind} has no lossless OPM equivalent`));
    }
  }
  for (const requirement of Object.values(repo.requirements).sort(byId)) {
    nodes.push({
      id: requirement.id, name: requirement.name, type: 'requirement', sourceSysmlId: requirement.id, mappingStatus: 'conceptual-only',
      requirementId: requirement.requirementId, requirementText: requirement.text,
      requirementStatus: requirement.status, requirementVersion: requirement.version,
    });
    mappings.push({ sourceSysmlId: requirement.id, sourceKind: requirement.kind, projectedId: requirement.id, status: 'conceptual-only', diagnosticCode: 'OPM_REQUIREMENT_GOVERNANCE_LOSS' });
    diagnostics.push(warning('OPM_REQUIREMENT_GOVERNANCE_LOSS', requirement.id, 'Requirement governance metadata is retained as source metadata but is not native OPM semantics'));
  }
  for (const usage of Object.values(repo.usages).sort(byId)) {
    mappings.push({ sourceSysmlId: usage.id, sourceKind: usage.kind, status: 'unsupported', diagnosticCode: 'OPM_USAGE_UNSUPPORTED' });
    diagnostics.push(warning('OPM_USAGE_UNSUPPORTED', usage.id, `${usage.kind} usage remains authoritative in SysML and is not projected as an OPM element`));
  }
  for (const connector of Object.values(repo.connectors).sort(byId)) {
    mappings.push({ sourceSysmlId: connector.id, sourceKind: connector.kind, status: 'unsupported', diagnosticCode: 'OPM_IBD_CONNECTOR_UNSUPPORTED' });
    diagnostics.push(warning('OPM_IBD_CONNECTOR_UNSUPPORTED', connector.id, 'IBD connector and item-flow semantics have no direct OPM edge equivalent'));
  }
  for (const relationship of Object.values(repo.relationships).sort(byId)) {
    const mapped = mapRelationship(relationship.kind, relationship.sourceId, relationship.targetId);
    if (!mapped) {
      mappings.push({ sourceSysmlId: relationship.id, sourceKind: relationship.kind, status: 'unsupported', diagnosticCode: 'OPM_RELATIONSHIP_UNSUPPORTED' });
      diagnostics.push(warning('OPM_RELATIONSHIP_UNSUPPORTED', relationship.id, `${relationship.kind} has no automatic OPM equivalent`));
      continue;
    }
    const edge: OpmProjectionEdge = {
      id: `sysml-${relationship.id}`, source: mapped.source, target: mapped.target, type: mapped.type,
      sourceSysmlId: relationship.id, sourceSysmlKind: relationship.kind, mappingStatus: mapped.status,
    };
    edges.push(edge);
    mappings.push({ sourceSysmlId: relationship.id, sourceKind: relationship.kind, projectedId: edge.id, status: mapped.status, diagnosticCode: mapped.code });
    if (mapped.code) diagnostics.push(warning(mapped.code, relationship.id, mapped.message!));
  }
  return { sourceProfileId: repo.profileId, sourceRevision: repo.revision, nodes, edges, mappings, diagnostics };
}

export function assessOpmRoundTripLoss(repo: SysmlRepository, projection: OpmProjection): OpmRoundTripAssessment {
  const sourceIds = allSourceIds(repo);
  const mappedIds = new Set(projection.mappings.map(mapping => mapping.sourceSysmlId));
  const missingMappingSourceIds = [...sourceIds].filter(id => !mappedIds.has(id)).sort();
  const lossySourceIds = projection.mappings.filter(mapping => mapping.status !== 'mapped').map(mapping => mapping.sourceSysmlId).sort();
  const diagnostics = [...projection.diagnostics];
  for (const id of missingMappingSourceIds) diagnostics.push(warning('OPM_SOURCE_MAPPING_MISSING', id, 'SysML source element has no mapping record'));
  return { lossless: lossySourceIds.length === 0 && missingMappingSourceIds.length === 0, lossySourceIds, missingMappingSourceIds, diagnostics };
}

function mapRelationship(kind: string, source: string, target: string): { source: string; target: string; type: OpmProjectionEdge['type']; status: OpmMappingStatus; code?: string; message?: string } | undefined {
  switch (kind) {
    case 'composition': return { source, target, type: 'aggregation', status: 'conceptual-only', code: 'OPM_COMPOSITION_OWNERSHIP_LOSS', message: 'OPM aggregation does not preserve SysML composite part-usage lifecycle ownership' };
    case 'sharedAggregation': return { source, target, type: 'aggregation', status: 'conceptual-only', code: 'OPM_SHARED_AGGREGATION_LOSS', message: 'OPM aggregation does not preserve SysML shared aggregation semantics' };
    case 'generalization': return { source: target, target: source, type: 'generalization', status: 'mapped' };
    case 'satisfy': return { source: target, target: source, type: 'satisfies', status: 'conceptual-only', code: 'OPM_REQUIREMENT_RELATION_LOSS', message: 'OPM satisfies is a conceptual projection of SysML satisfy' };
    case 'verify': return { source: target, target: source, type: 'verifies', status: 'conceptual-only', code: 'OPM_REQUIREMENT_RELATION_LOSS', message: 'OPM verifies is a conceptual projection of SysML verify' };
    default: return undefined;
  }
}

function allSourceIds(repo: SysmlRepository): Set<string> {
  return new Set([
    ...Object.keys(repo.definitions), ...Object.keys(repo.usages), ...Object.keys(repo.connectors),
    ...Object.keys(repo.relationships), ...Object.keys(repo.requirements),
  ]);
}
function byId<T extends { id: string }>(a: T, b: T): number { return a.id.localeCompare(b.id); }
function warning(code: string, elementId: string, message: string): SysmlDiagnostic { return { code, severity: 'warning', elementId, message }; }
