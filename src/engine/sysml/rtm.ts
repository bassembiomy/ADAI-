import type { RequirementDefinition, SysmlRelationship, SysmlRepository } from './model';
import { deriveEvidenceStatus } from './evidence';
import { hash, stableStringify } from './requirements';

export type RtmStatus = 'covered' | 'verified' | 'failed' | 'uncovered' | 'stale' | 'suspect' | 'orphan' | 'unsupported' | 'unresolved';
export type RtmChangeKind = 'unchanged' | 'added' | 'modified' | 'suspect';

export interface RtmFilters {
  baselineId?: string;
  compareBaselineId?: string;
  changeType?: 'all' | 'added' | 'modified' | 'suspect';
  subsystem?: string;
  owner?: string;
  risk?: RequirementDefinition['risk'];
  status?: RtmStatus;
  method?: string;
  changedSinceRevision?: number;
}

export interface RtmRequirementRef {
  id: string;
  requirementId: string;
  name: string;
  kind: SysmlRelationship['kind'];
}

export interface RtmCoveringElement {
  id: string;
  name: string;
  kind: SysmlRelationship['kind'];
  type: 'block' | 'part';
}

export interface RtmRequirementRelation {
  relationshipId: string;
  kind: SysmlRelationship['kind'];
  direction: 'incoming' | 'outgoing';
  otherRequirementId: string;
  otherReqIdentifier: string;
  otherRequirementName: string;
}

export interface RtmRow {
  requirement: RequirementDefinition;
  status: RtmStatus;
  changeKind?: RtmChangeKind;
  relationshipIds: string[];
  parents: RtmRequirementRef[];
  children: RtmRequirementRef[];
  coveringBlocks: RtmCoveringElement[];
  requirementRelations: RtmRequirementRelation[];
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
    .map(requirement => buildRow(repo, requirement, filters.compareBaselineId))
    .filter(row => matchesFilters(repo, row, filters))
    .sort((a, b) => a.requirement.requirementId.localeCompare(b.requirement.requirementId) || a.requirement.id.localeCompare(b.requirement.id));
  return { revision: repo.revision, filters: { ...filters }, rows };
}

export function projectRtmChangeSet(
  repo: SysmlRepository,
  baselineId: string,
  changeType: RtmFilters['changeType'] = 'all',
): TraceabilityMatrix {
  return buildTraceabilityMatrix(repo, { compareBaselineId: baselineId, changeType });
}

export function computeCoverageMetrics(matrix: TraceabilityMatrix): CoverageMetrics {
  const total = matrix.rows.length;
  let covered = 0;
  let verified = 0;
  let failed = 0;
  let stale = 0;
  let suspect = 0;
  let uncovered = 0;
  let orphan = 0;
  let unresolved = 0;
  for (const row of matrix.rows) {
    if (row.status === 'covered') covered += 1;
    else if (row.status === 'verified') { verified += 1; covered += 1; }
    else if (row.status === 'failed') failed += 1;
    else if (row.status === 'stale') stale += 1;
    else if (row.status === 'suspect') suspect += 1;
    else if (row.status === 'uncovered') uncovered += 1;
    else if (row.status === 'orphan') orphan += 1;
    else if (row.status === 'unresolved') unresolved += 1;
  }
  const coveragePercent = total ? (covered * 100) / total : 100;
  const verificationPercent = total ? (verified * 100) / total : 100;
  return { total, covered, verified, failed, stale, suspect, uncovered, orphan, unresolved, coveragePercent, verificationPercent };
}

export function exportRtmCsv(matrix: TraceabilityMatrix): string {
  const csv = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const hasChange = Boolean(matrix.filters.compareBaselineId || matrix.rows.some(r => r.changeKind !== undefined));
  const headers = [
    'Requirement ID', 'Name', 'Text', 'Status',
    ...(hasChange ? ['Change'] : []),
    'Owner', 'Risk', 'Version', 'Baseline',
    'Parents', 'Children', 'Covering Blocks',
    'Blocks', 'Parts', 'Ports', 'Connectors', 'Behaviors', 'Simulations', 'Verification Cases',
    'Evidence', 'Artifacts', 'Relationships', 'Unresolved Endpoints',
  ];
  const rows = matrix.rows.map(row => [
    row.requirement.requirementId, row.requirement.name, row.requirement.text, row.status,
    ...(hasChange ? [row.changeKind ?? 'unchanged'] : []),
    row.requirement.owner ?? '', row.requirement.risk ?? '', row.requirement.version, row.requirement.baselineId ?? '',
    row.parents.map(p => `[${p.kind}] ${p.requirementId} ${p.name}`).join(';'),
    row.children.map(c => `[${c.kind}] ${c.requirementId} ${c.name}`).join(';'),
    row.coveringBlocks.map(b => `[${b.kind}] ${b.name}`).join(';'),
    row.blocks.join(';'), row.parts.join(';'), row.ports.join(';'), row.connectors.join(';'),
    row.behaviors.join(';'), row.simulations.join(';'), row.verificationCases.join(';'), row.evidence.join(';'),
    row.artifacts.join(';'), row.relationshipIds.join(';'), row.unresolvedEndpointIds.join(';'),
  ]);
  return [headers.join(','), ...rows.map(columns => columns.map(csv).join(','))].join('\r\n');
}

function buildRow(repo: SysmlRepository, requirement: RequirementDefinition, compareBaselineId?: string): RtmRow {
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
  const parents: RtmRequirementRef[] = [];
  const children: RtmRequirementRef[] = [];
  const coveringBlocks: RtmCoveringElement[] = [];
  const requirementRelations: RtmRequirementRelation[] = [];

  for (const r of relationships) {
    const isSource = r.sourceId === requirement.id;
    const otherId = isSource ? r.targetId : r.sourceId;

    const otherReq = repo.requirements[otherId];
    if (otherReq) {
      requirementRelations.push({
        relationshipId: r.id,
        kind: r.kind,
        direction: isSource ? 'outgoing' : 'incoming',
        otherRequirementId: otherReq.id,
        otherReqIdentifier: otherReq.requirementId,
        otherRequirementName: otherReq.name,
      });

      if (r.kind === 'requirementContainment') {
        if (!isSource) {
          parents.push({ id: otherReq.id, requirementId: otherReq.requirementId, name: otherReq.name, kind: r.kind });
        } else {
          children.push({ id: otherReq.id, requirementId: otherReq.requirementId, name: otherReq.name, kind: r.kind });
        }
      } else if (r.kind === 'deriveReqt') {
        if (isSource) {
          parents.push({ id: otherReq.id, requirementId: otherReq.requirementId, name: otherReq.name, kind: r.kind });
        } else {
          children.push({ id: otherReq.id, requirementId: otherReq.requirementId, name: otherReq.name, kind: r.kind });
        }
      }
    }

    if (r.kind === 'satisfy') {
      const def = repo.definitions[otherId];
      const usage = repo.usages[otherId];
      if (def?.kind === 'block') {
        coveringBlocks.push({ id: def.id, name: def.name, kind: r.kind, type: 'block' });
      } else if (usage?.kind === 'part') {
        coveringBlocks.push({ id: usage.id, name: usage.name, kind: r.kind, type: 'part' });
      }
    }
  }

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

  let changeKind: RtmChangeKind | undefined = undefined;
  if (compareBaselineId && repo.baselines[compareBaselineId]) {
    const baseline = repo.baselines[compareBaselineId];
    const baseHash = baseline.elementHashes?.[requirement.id];
    if (!baseHash) {
      changeKind = 'added';
    } else {
      const currentHash = hash(stableStringify(requirement));
      if (currentHash !== baseHash) {
        changeKind = 'modified';
      } else if (relationships.some(r => r.suspect)) {
        changeKind = 'suspect';
      } else {
        changeKind = 'unchanged';
      }
    }
  }

  const row: Omit<RtmRow, 'status'> = {
    requirement,
    changeKind,
    relationshipIds: relationships.map(item => item.id).sort(),
    parents,
    children,
    coveringBlocks,
    requirementRelations,
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
  if (requirement.status === 'stale' || evidence.some(item => item.result === 'passed' && deriveEvidenceStatus(repo, item.id) === 'stale')) return 'stale';
  if (evidence.some(item => item.result === 'passed' && deriveEvidenceStatus(repo, item.id) === 'current')) return 'verified';
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
  if (filters.changeType && row.changeKind) {
    if (filters.changeType === 'added' && row.changeKind !== 'added') return false;
    if (filters.changeType === 'modified' && row.changeKind !== 'modified') return false;
    if (filters.changeType === 'suspect' && row.changeKind !== 'suspect') return false;
    if (filters.changeType === 'all' && row.changeKind === 'unchanged') return false;
  }
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
