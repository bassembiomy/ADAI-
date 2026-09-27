import type { RequirementDefinition, SysmlRelationship, SysmlRepository } from './model';
import { deriveEvidenceStatus } from './evidence';
import { hash, stableStringify } from './requirements';
import { buildTraceabilityIndex, type TraceabilityIndex } from './traceabilityIndex';

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

export type CoverageStatus = 'not-satisfied' | 'satisfied';
export type VerificationStatus = 'not-verified' | 'not-run' | 'passed' | 'failed';

export interface RtmReference {
  id: string;
  name: string;
  kind?: string;
  type?: string;
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
  containmentParents: RtmRequirementRef[];
  containmentChildren: RtmRequirementRef[];
  derivedFrom: RtmRequirementRef[];
  derivedRequirements: RtmRequirementRef[];
  copiedFrom: RtmRequirementRef[];
  copiedRequirements: RtmRequirementRef[];
  satisfiedBy: RtmCoveringElement[];
  verifiedBy: RtmReference[];
  refinedBy: RtmReference[];
  tracedElements: RtmReference[];
  satisfactionStatus: CoverageStatus;
  verificationStatus: VerificationStatus;
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
  unsupported: number;
  coveragePercent: number;
  verificationPercent: number;
}

export function buildTraceabilityMatrix(repo: SysmlRepository, filters: RtmFilters = {}, suppliedIndex?: TraceabilityIndex): TraceabilityMatrix {
  const index = suppliedIndex ?? buildTraceabilityIndex(repo);
  const rows = Object.values(repo.requirements)
    .map(requirement => buildRow(repo, requirement, filters.compareBaselineId, index))
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
  let unsupported = 0;
  for (const row of matrix.rows) {
    if (row.status === 'covered') covered += 1;
    else if (row.status === 'verified') { verified += 1; covered += 1; }
    else if (row.status === 'failed') failed += 1;
    else if (row.status === 'stale') stale += 1;
    else if (row.status === 'suspect') suspect += 1;
    else if (row.status === 'uncovered') uncovered += 1;
    else if (row.status === 'orphan') orphan += 1;
    else if (row.status === 'unresolved') unresolved += 1;
    else if (row.status === 'unsupported') unsupported += 1;
  }
  const coveragePercent = total ? (covered * 100) / total : 100;
  const verificationPercent = total ? (verified * 100) / total : 100;
  return { total, covered, verified, failed, stale, suspect, uncovered, orphan, unresolved, unsupported, coveragePercent, verificationPercent };
}

export function exportRtmCsv(matrix: TraceabilityMatrix): string {
  const csv = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const hasChange = Boolean(matrix.filters.compareBaselineId || matrix.rows.some(r => r.changeKind !== undefined));
  const headers = [
    'Requirement ID', 'Name', 'Text', 'Status',
    ...(hasChange ? ['Change'] : []),
    'Owner', 'Risk', 'Version', 'Baseline',
    'Parents', 'Children', 'Covering Blocks',
    'Contained By', 'Contains', 'Derived From', 'Derived Requirements', 'Copied From', 'Copied Requirements',
    'Satisfied By', 'Verified By', 'Refined By', 'Traced Elements',
    'Satisfaction Status', 'Verification Status',
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
    row.containmentParents.map(p => `${p.requirementId} ${p.name}`).join(';'),
    row.containmentChildren.map(c => `${c.requirementId} ${c.name}`).join(';'),
    row.derivedFrom.map(d => `${d.requirementId} ${d.name}`).join(';'),
    row.derivedRequirements.map(d => `${d.requirementId} ${d.name}`).join(';'),
    row.copiedFrom.map(c => `${c.requirementId} ${c.name}`).join(';'),
    row.copiedRequirements.map(c => `${c.requirementId} ${c.name}`).join(';'),
    row.satisfiedBy.map(s => s.name).join(';'),
    row.verifiedBy.map(v => v.name).join(';'),
    row.refinedBy.map(r => r.name).join(';'),
    row.tracedElements.map(t => t.name).join(';'),
    row.satisfactionStatus,
    row.verificationStatus,
    row.blocks.join(';'), row.parts.join(';'), row.ports.join(';'), row.connectors.join(';'),
    row.behaviors.join(';'), row.simulations.join(';'), row.verificationCases.join(';'), row.evidence.join(';'),
    row.artifacts.join(';'), row.relationshipIds.join(';'), row.unresolvedEndpointIds.join(';'),
  ]);
  return [headers.join(','), ...rows.map(columns => columns.map(csv).join(','))].join('\r\n');
}

function buildRow(repo: SysmlRepository, requirement: RequirementDefinition, compareBaselineId: string | undefined, index: TraceabilityIndex): RtmRow {
  const relationships = index.relationshipsByEndpoint.get(requirement.id) ?? [];
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

  const containmentParents: RtmRequirementRef[] = [];
  const containmentChildren: RtmRequirementRef[] = [];
  const derivedFrom: RtmRequirementRef[] = [];
  const derivedRequirements: RtmRequirementRef[] = [];
  const copiedFrom: RtmRequirementRef[] = [];
  const copiedRequirements: RtmRequirementRef[] = [];
  const satisfiedBy: RtmCoveringElement[] = [];
  const verifiedBy: RtmReference[] = [];
  const refinedBy: RtmReference[] = [];
  const tracedElements: RtmReference[] = [];

  for (const r of relationships) {
    const isSource = r.sourceId === requirement.id;
    const isTarget = r.targetId === requirement.id;
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
          containmentParents.push({ id: otherReq.id, requirementId: otherReq.requirementId, name: otherReq.name, kind: r.kind });
        } else {
          children.push({ id: otherReq.id, requirementId: otherReq.requirementId, name: otherReq.name, kind: r.kind });
          containmentChildren.push({ id: otherReq.id, requirementId: otherReq.requirementId, name: otherReq.name, kind: r.kind });
        }
      } else if (r.kind === 'deriveReqt') {
        if (isSource) {
          parents.push({ id: otherReq.id, requirementId: otherReq.requirementId, name: otherReq.name, kind: r.kind });
          derivedFrom.push({ id: otherReq.id, requirementId: otherReq.requirementId, name: otherReq.name, kind: r.kind });
        } else {
          children.push({ id: otherReq.id, requirementId: otherReq.requirementId, name: otherReq.name, kind: r.kind });
          derivedRequirements.push({ id: otherReq.id, requirementId: otherReq.requirementId, name: otherReq.name, kind: r.kind });
        }
      } else if (r.kind === 'copy') {
        if (isSource) {
          copiedFrom.push({ id: otherReq.id, requirementId: otherReq.requirementId, name: otherReq.name, kind: r.kind });
        } else {
          copiedRequirements.push({ id: otherReq.id, requirementId: otherReq.requirementId, name: otherReq.name, kind: r.kind });
        }
      }
    }

    if (r.kind === 'satisfy' && isTarget) {
      const def = repo.definitions[otherId];
      const usage = repo.usages[otherId];
      if (def?.kind === 'block') {
        const item: RtmCoveringElement = { id: def.id, name: def.name, kind: r.kind, type: 'block' };
        coveringBlocks.push(item);
        satisfiedBy.push(item);
      } else if (usage?.kind === 'part') {
        const item: RtmCoveringElement = { id: usage.id, name: usage.name, kind: r.kind, type: 'part' };
        coveringBlocks.push(item);
        satisfiedBy.push(item);
      } else {
        const ref = resolveRef(repo, otherId);
        const item: RtmCoveringElement = { id: otherId, name: ref.name, kind: r.kind, type: 'block' };
        coveringBlocks.push(item);
        satisfiedBy.push(item);
      }
    }

    if (r.kind === 'verify' && isTarget) {
      verifiedBy.push(resolveRef(repo, otherId));
    }

    if (r.kind === 'refine' && isTarget) {
      refinedBy.push(resolveRef(repo, otherId));
    }

    if (r.kind === 'trace') {
      tracedElements.push(resolveRef(repo, otherId));
    }
  }

  for (const id of relatedIds) {
    const definition = repo.definitions[id];
    const usage = repo.usages[id];
    const artifact = repo.artifacts[id];
    if (definition?.kind === 'block') blocks.push(id);
    else if (definition) blocks.push(id);
    else if (usage?.kind === 'part') parts.push(id);
    else if (usage?.kind === 'port') ports.push(id);
    else if (repo.connectors[id]) connectors.push(id);
    else if (artifact?.kind === 'behavior') behaviors.push(id);
    else if (artifact?.kind === 'simulation') simulations.push(id);
    else if (artifact) artifacts.push(id);
    else if (!repo.requirements[id] && !repo.verificationCases[id]) unresolvedEndpointIds.push(id);
  }
  const verificationCases = sortedUnique([
    ...(index.verificationCasesByRequirement.get(requirement.id) ?? []),
    ...relatedIds.filter(id => Boolean(repo.verificationCases[id])),
  ]);
  const evidence = sortedUnique([
    ...(index.evidenceByRequirement.get(requirement.id) ?? []),
    ...verificationCases.flatMap(id => index.evidenceByVerificationCase.get(id) ?? []),
  ]);

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

  const satisfactionStatus: CoverageStatus = (satisfiedBy.length > 0 || coveringBlocks.length > 0)
    ? 'satisfied'
    : 'not-satisfied';

  const allVerificationIds = sortedUnique([
    ...verificationCases,
    ...verifiedBy.map(v => v.id),
  ]);

  let verificationStatus: VerificationStatus = 'not-verified';
  const evidenceItems = evidence.map(id => repo.evidence[id]).filter(Boolean);
  if (evidenceItems.some(item => item.result === 'failed')) {
    verificationStatus = 'failed';
  } else if (evidenceItems.some(item => item.result === 'passed')) {
    verificationStatus = 'passed';
  } else if (allVerificationIds.length > 0) {
    verificationStatus = 'not-run';
  }

  const row: Omit<RtmRow, 'status'> = {
    requirement,
    changeKind,
    relationshipIds: relationships.map(item => item.id).sort(),
    parents: dedupeRefs(parents),
    children: dedupeRefs(children),
    coveringBlocks: dedupeRefs(coveringBlocks),
    requirementRelations,
    containmentParents: dedupeRefs(containmentParents),
    containmentChildren: dedupeRefs(containmentChildren),
    derivedFrom: dedupeRefs(derivedFrom),
    derivedRequirements: dedupeRefs(derivedRequirements),
    copiedFrom: dedupeRefs(copiedFrom),
    copiedRequirements: dedupeRefs(copiedRequirements),
    satisfiedBy: dedupeRefs(satisfiedBy),
    verifiedBy: dedupeRefs(verifiedBy),
    refinedBy: dedupeRefs(refinedBy),
    tracedElements: dedupeRefs(tracedElements),
    satisfactionStatus,
    verificationStatus,
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

function resolveRef(repo: SysmlRepository, id: string): RtmReference {
  const req = repo.requirements[id];
  if (req) return { id, name: req.name || req.requirementId, kind: 'requirement', type: 'requirement' };
  const def = repo.definitions[id];
  if (def) return { id, name: def.name, kind: def.kind, type: def.kind };
  const usage = repo.usages[id];
  if (usage) return { id, name: usage.name, kind: usage.kind, type: usage.kind };
  const vc = repo.verificationCases[id];
  if (vc) return { id, name: vc.name, kind: 'verificationCase', type: 'verificationCase' };
  const art = repo.artifacts[id];
  if (art) return { id, name: art.name, kind: art.kind, type: art.kind };
  return { id, name: id, kind: 'unknown', type: 'unknown' };
}

function dedupeRefs<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}
