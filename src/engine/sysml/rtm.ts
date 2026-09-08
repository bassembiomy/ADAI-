import type { RequirementDefinition, SysmlRelationship, SysmlRepository } from './model';

export type RtmStatus = 'covered' | 'verified' | 'failed' | 'uncovered' | 'stale' | 'suspect' | 'orphan' | 'unsupported' | 'unresolved';

export interface RtmFilters {
  baselineId?: string;
  subsystem?: string;
  owner?: string;
  risk?: RequirementDefinition['risk'];
  status?: RtmStatus;
  method?: string;
  changedSinceRevision?: number;
}

export interface RtmRow {
  requirement: RequirementDefinition;
  status: RtmStatus;
  relationshipIds: string[];
  blocks: string[];
  parts: string[];
  ports: string[];
  connectors: string[];
  behaviors: string[];
  simulations: string[];
  verificationCases: string[];
  evidence: string[];
  artifacts: string[];
  unresolvedEndpointIds: string[];
}

export interface TraceabilityMatrix {
  revision: number;
  filters: RtmFilters;
  rows: RtmRow[];
}

export interface CoverageMetrics {
  total: number;
  covered: number;
  verified: number;
  failed: number;
  stale: number;
  suspect: number;
  uncovered: number;
  orphan: number;
  unresolved: number;
  coveragePercent: number;
  verificationPercent: number;
}

export function buildTraceabilityMatrix(repo: SysmlRepository, filters: RtmFilters = {}): TraceabilityMatrix {
  const rows = Object.values(repo.requirements)
    .map(requirement => buildRow(repo, requirement))
    .filter(row => matchesFilters(repo, row, filters))
    .sort((a, b) => a.requirement.requirementId.localeCompare(b.requirement.requirementId) || a.requirement.id.localeCompare(b.requirement.id));
  return { revision: repo.revision, filters: { ...filters }, rows };
}

export function computeCoverageMetrics(matrix: TraceabilityMatrix): CoverageMetrics {
  const count = (status: RtmStatus) => matrix.rows.filter(row => row.status === status).length;
  const total = matrix.rows.length;
  const verified = count('verified');
  const coveredOnly = count('covered');
  const covered = coveredOnly + verified;
  return {
    total,
    covered,
    verified,
    failed: count('failed'),
    stale: count('stale'),
    suspect: count('suspect'),
    uncovered: count('uncovered'),
    orphan: count('orphan'),
    unresolved: count('unresolved'),
    coveragePercent: total ? covered * 100 / total : 100,
    verificationPercent: total ? verified * 100 / total : 100,
  };
}

export function exportRtmCsv(matrix: TraceabilityMatrix): string {
  const headers = [
    'Requirement ID', 'Name', 'Text', 'Status', 'Owner', 'Risk', 'Version', 'Baseline',
    'Blocks', 'Parts', 'Ports', 'Connectors', 'Behaviors', 'Simulations', 'Verification Cases',
    'Evidence', 'Artifacts', 'Relationships', 'Unresolved Endpoints',
  ];
  const rows = matrix.rows.map(row => [
    row.requirement.requirementId, row.requirement.name, row.requirement.text, row.status,
    row.requirement.owner ?? '', row.requirement.risk ?? '', row.requirement.version, row.requirement.baselineId ?? '',
    row.blocks.join(';'), row.parts.join(';'), row.ports.join(';'), row.connectors.join(';'),
    row.behaviors.join(';'), row.simulations.join(';'), row.verificationCases.join(';'), row.evidence.join(';'),
    row.artifacts.join(';'), row.relationshipIds.join(';'), row.unresolvedEndpointIds.join(';'),
  ]);
  return [headers, ...rows].map(columns => columns.map(csv).join(',')).join('\r\n');
}

function buildRow(repo: SysmlRepository, requirement: RequirementDefinition): RtmRow {
  const relationships = Object.values(repo.relationships).filter(r => r.sourceId === requirement.id || r.targetId === requirement.id);
  const relatedIds = relationships.map(r => r.sourceId === requirement.id ? r.targetId : r.sourceId);
  const blocks: string[] = [];
  const parts: string[] = [];
  const ports: string[] = [];
  const connectors: string[] = [];
  const behaviors: string[] = [];
  const simulations: string[] = [];
  const artifacts: string[] = [];
  const unresolvedEndpointIds: string[] = [];
  for (const id of relatedIds) {
    const definition = repo.definitions[id];
    const usage = repo.usages[id];
    const artifact = repo.artifacts[id];
    if (definition?.kind === 'block') blocks.push(id);
    else if (usage?.kind === 'part') parts.push(id);
    else if (usage?.kind === 'port') ports.push(id);
    else if (repo.connectors[id]) connectors.push(id);
    else if (artifact?.kind === 'behavior') behaviors.push(id);
    else if (artifact?.kind === 'simulation') simulations.push(id);
    else if (artifact) artifacts.push(id);
    else if (!repo.requirements[id] && !repo.verificationCases[id]) unresolvedEndpointIds.push(id);
  }
  const verificationCases = Object.values(repo.verificationCases)
    .filter(test => test.verifiesRequirementIds.includes(requirement.id) || relatedIds.includes(test.id))
    .map(test => test.id);
  const evidence = Object.values(repo.evidence)
    .filter(item => item.requirementId === requirement.id || verificationCases.includes(item.verificationCaseId))
    .map(item => item.id);
  const row: Omit<RtmRow, 'status'> = {
    requirement,
    relationshipIds: relationships.map(item => item.id).sort(),
    blocks: sortedUnique(blocks), parts: sortedUnique(parts), ports: sortedUnique(ports), connectors: sortedUnique(connectors),
    behaviors: sortedUnique(behaviors), simulations: sortedUnique(simulations), verificationCases: sortedUnique(verificationCases),
    evidence: sortedUnique(evidence), artifacts: sortedUnique(artifacts), unresolvedEndpointIds: sortedUnique(unresolvedEndpointIds),
  };
  return { ...row, status: deriveStatus(repo, requirement, relationships, row) };
}

function deriveStatus(
  repo: SysmlRepository,
  requirement: RequirementDefinition,
  relationships: SysmlRelationship[],
  row: Omit<RtmRow, 'status'>,
): RtmStatus {
  if (row.unresolvedEndpointIds.length) return 'unresolved';
  if (relationships.some(relationship => relationship.suspect)) return 'suspect';
  const evidence = row.evidence.map(id => repo.evidence[id]).filter(Boolean);
  if (evidence.some(item => item.result === 'failed')) return 'failed';
  if (requirement.status === 'stale' || evidence.some(item => item.result === 'passed' && item.revision < repo.revision)) return 'stale';
  if (evidence.some(item => item.result === 'passed' && item.revision === repo.revision)) return 'verified';
  if (relationships.some(relationship => relationship.kind === 'satisfy')) return 'covered';
  if (relationships.length || row.verificationCases.length || row.evidence.length) return 'uncovered';
  return 'orphan';
}

function matchesFilters(repo: SysmlRepository, row: RtmRow, filters: RtmFilters): boolean {
  const requirement = row.requirement;
  if (filters.baselineId && requirement.baselineId !== filters.baselineId) return false;
  if (filters.subsystem && !requirement.namespace.some(segment => segment.toLocaleLowerCase() === filters.subsystem!.toLocaleLowerCase())) return false;
  if (filters.owner && requirement.owner?.toLocaleLowerCase() !== filters.owner.toLocaleLowerCase()) return false;
  if (filters.risk && requirement.risk !== filters.risk) return false;
  if (filters.status && row.status !== filters.status) return false;
  if (filters.method && !row.verificationCases.some(id => repo.verificationCases[id]?.method.toLocaleLowerCase() === filters.method!.toLocaleLowerCase())) return false;
  if (filters.changedSinceRevision !== undefined) {
    const revisions = [
      ...row.evidence.map(id => repo.evidence[id]?.revision ?? -1),
      ...[...row.behaviors, ...row.simulations, ...row.artifacts].map(id => repo.artifacts[id]?.revision ?? -1),
      requirement.baselineId ? repo.baselines[requirement.baselineId]?.revision ?? -1 : -1,
    ];
    if (!revisions.some(revision => revision > filters.changedSinceRevision!)) return false;
  }
  return true;
}

function sortedUnique(values: string[]): string[] { return [...new Set(values)].sort(); }
function csv(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
