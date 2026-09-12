import type { SysmlRepository } from './model';
import type { SysmlDiagnostic } from './validation';
import { projectSysmlToOpm } from './opmAdapter';

/**
 * Task 7: qualified persistence + interchange loss reporting.
 *
 * Profile: `OMG-SysML-1.6-ADIA` only. The canonical `SysmlRepository` stays
 * the single mutation/serialization authority; every projection that cannot
 * carry a construct must record an explicit loss entry instead of silently
 * dropping it, and every import with dangling endpoints must quarantine the
 * affected edge instead of synthesizing a generic association.
 */

export interface InterchangeLossEntry {
  sourceId: string;
  sourceKind: string;
  diagnosticCode: string;
  reason: string;
  severity: 'info' | 'warning';
}

export interface UnresolvedEndpointRecord {
  kind: 'relationship' | 'connector' | 'usage' | 'verificationCase' | 'evidence';
  id: string;
  endpoint: string;
  missingId: string;
  code: 'UNRESOLVED_ENDPOINT';
  message: string;
}

export interface InterchangeReport {
  lossless: boolean;
  lossEntries: InterchangeLossEntry[];
  unresolvedEndpoints: UnresolvedEndpointRecord[];
  quarantinedRelationshipIds: string[];
  quarantinedConnectorIds: string[];
  diagnostics: SysmlDiagnostic[];
}

export function createEmptyInterchangeReport(): InterchangeReport {
  return {
    lossless: true,
    lossEntries: [],
    unresolvedEndpoints: [],
    quarantinedRelationshipIds: [],
    quarantinedConnectorIds: [],
    diagnostics: [],
  };
}

function loss(
  sourceId: string,
  sourceKind: string,
  diagnosticCode: string,
  reason: string,
  severity: InterchangeLossEntry['severity'] = 'warning',
): InterchangeLossEntry {
  return { sourceId, sourceKind, diagnosticCode, reason, severity };
}

function diag(code: string, elementId: string, message: string, severity: SysmlDiagnostic['severity'] = 'warning'): SysmlDiagnostic {
  return { code, severity, elementId, message };
}

/**
 * Legacy (BDD/IBD/RTM-style) projection is a read-only view over blocks,
 * parts, relationships, and connectors. Anything outside that view —
 * evidence rows, frozen baselines, artifacts, verification metadata, port
 * usages, inheritance edges beyond generalization display, and requirement
 * governance fields — must be reported, never silently dropped.
 */
export function assessLegacyProjectionLoss(repo: SysmlRepository): InterchangeReport {
  const report = createEmptyInterchangeReport();
  for (const evidence of Object.values(repo.evidence ?? {}).sort(byId)) {
    report.lossEntries.push(loss(
      evidence.id, 'evidence', 'INTERCHANGE_EVIDENCE_NOT_PROJECTED',
      `Evidence ${evidence.id} (case ${evidence.verificationCaseId} -> ${evidence.requirementId}) has no legacy diagram element and survives only in the canonical repository`,
    ));
  }
  for (const baseline of Object.values(repo.baselines ?? {}).sort(byId)) {
    report.lossEntries.push(loss(
      baseline.id, 'baseline', 'INTERCHANGE_BASELINE_NOT_PROJECTED',
      `Baseline ${baseline.id} is a frozen content snapshot; legacy projections show live elements only`,
      'info',
    ));
  }
  for (const artifact of Object.values(repo.artifacts ?? {}).sort(byId)) {
    report.lossEntries.push(loss(
      artifact.id, 'artifact', 'INTERCHANGE_ARTIFACT_NOT_PROJECTED',
      `Trace artifact ${artifact.id} is carried by persistence, not by legacy diagram arrays`,
      'info',
    ));
  }
  for (const usage of Object.values(repo.usages ?? {}).sort(byId)) {
    if (usage.kind === 'port') {
      report.lossEntries.push(loss(
        usage.id, 'port-usage', 'INTERCHANGE_PORT_USAGE_CONTEXT_LOSS',
        `Port usage ${usage.id} is a hierarchical usage context (owner ${usage.ownerId}); legacy part arrays carry part usages only`,
      ));
    }
  }
  for (const definition of Object.values(repo.definitions ?? {}).sort(byId)) {
    if (definition.kind === 'block' && definition.supertypeIds && definition.supertypeIds.length > 0) {
      report.lossEntries.push(loss(
        definition.id, 'generalization', 'INTERCHANGE_INHERITANCE_PROJECTION_LOSS',
        `Block ${definition.id} specializes ${(definition.supertypeIds ?? []).join(', ')}; legacy blocks carry feature compartments, inheritance is carried by generalization edges`,
        'info',
      ));
    }
  }
  for (const vc of Object.values(repo.verificationCases ?? {}).sort(byId)) {
    if ((vc.verifiesRequirementIds ?? []).length > 0) {
      report.lossEntries.push(loss(
        vc.id, 'verificationCase', 'INTERCHANGE_VERIFICATION_LINK_LOSS',
        `Verification case ${vc.id} verifies ${(vc.verifiesRequirementIds ?? []).join(', ')}; legacy blocks do not carry the verifies link, only the canonical verify edges do`,
        'info',
      ));
    }
  }
  finishReport(report);
  return report;
}

/**
 * OPM (ISO 19450) projection is one-directional and lossy by construction.
 * Wrap the adapter output as interchange loss entries so callers never have
 * to interpret adapter internals silently.
 */
export function assessOpmInterchangeLoss(repo: SysmlRepository): InterchangeReport {
  const report = createEmptyInterchangeReport();
  const projection = projectSysmlToOpm(repo);
  for (const mapping of [...projection.mappings].sort((a, b) => a.sourceSysmlId.localeCompare(b.sourceSysmlId))) {
    if (mapping.status === 'mapped') continue;
    report.lossEntries.push(loss(
      mapping.sourceSysmlId,
      mapping.sourceKind,
      mapping.diagnosticCode ?? 'OPM_RELATIONSHIP_UNSUPPORTED',
      `OPM projection of ${mapping.sourceKind} ${mapping.sourceSysmlId} is ${mapping.status}`,
      mapping.status === 'unsupported' ? 'warning' : 'warning',
    ));
  }
  report.diagnostics.push(...projection.diagnostics);
  finishReport(report);
  return report;
}

/** Collect every dangling endpoint reference without mutating the repo. */
export function findUnresolvedEndpoints(repo: SysmlRepository): UnresolvedEndpointRecord[] {
  const records: UnresolvedEndpointRecord[] = [];
  const known = new Set<string>([
    ...Object.keys(repo.definitions ?? {}),
    ...Object.keys(repo.usages ?? {}),
    ...Object.keys(repo.connectors ?? {}),
    ...Object.keys(repo.relationships ?? {}),
    ...Object.keys(repo.requirements ?? {}),
    ...Object.keys(repo.verificationCases ?? {}),
    ...Object.keys(repo.evidence ?? {}),
    ...Object.keys(repo.baselines ?? {}),
    ...Object.keys(repo.artifacts ?? {}),
  ]);
  // Nested definition features (properties/ports) are addressable endpoints too.
  for (const definition of Object.values(repo.definitions ?? {})) {
    if (definition.kind === 'block') {
      for (const feature of [...(definition.properties ?? []), ...(definition.ports ?? [])]) {
        known.add(feature.id);
      }
    }
  }

  for (const rel of Object.values(repo.relationships ?? {})) {
    if (!known.has(rel.sourceId)) {
      records.push({
        kind: 'relationship', id: rel.id, endpoint: 'sourceId', missingId: rel.sourceId,
        code: 'UNRESOLVED_ENDPOINT', message: `Relationship ${rel.id} source ${rel.sourceId} does not resolve to any canonical element`,
      });
    }
    if (!known.has(rel.targetId)) {
      records.push({
        kind: 'relationship', id: rel.id, endpoint: 'targetId', missingId: rel.targetId,
        code: 'UNRESOLVED_ENDPOINT', message: `Relationship ${rel.id} target ${rel.targetId} does not resolve to any canonical element`,
      });
    }
  }
  for (const conn of Object.values(repo.connectors ?? {})) {
    if (!known.has(conn.ownerId)) {
      records.push({
        kind: 'connector', id: conn.id, endpoint: 'ownerId', missingId: conn.ownerId,
        code: 'UNRESOLVED_ENDPOINT', message: `Connector ${conn.id} owner ${conn.ownerId} does not resolve to any canonical element`,
      });
    }
    // Connector endpoints reference port usages either as bare usage ids or as
    // `partId::portId` pairs synthesized by legacy migration.
    for (const endpoint of ['sourcePortId', 'targetPortId'] as const) {
      const raw = conn[endpoint] ?? '';
      if (!raw) {
        records.push({
          kind: 'connector', id: conn.id, endpoint, missingId: raw,
          code: 'UNRESOLVED_ENDPOINT', message: `Connector ${conn.id} endpoint ${endpoint} is empty`,
        });
        continue;
      }
      const candidates = raw.includes('::') ? [raw, ...raw.split('::')] : [raw];
      const resolved = candidates.some(candidate => known.has(candidate));
      if (!resolved) {
        records.push({
          kind: 'connector', id: conn.id, endpoint, missingId: raw,
          code: 'UNRESOLVED_ENDPOINT', message: `Connector ${conn.id} endpoint ${endpoint} (${raw}) does not resolve to any port usage`,
        });
      }
    }
  }
  for (const usage of Object.values(repo.usages ?? {})) {
    if (!known.has(usage.ownerId)) {
      records.push({
        kind: 'usage', id: usage.id, endpoint: 'ownerId', missingId: usage.ownerId,
        code: 'UNRESOLVED_ENDPOINT', message: `Usage ${usage.id} owner ${usage.ownerId} does not resolve to any canonical element`,
      });
    }
    if (usage.kind === 'part' && !known.has(usage.typeId)) {
      records.push({
        kind: 'usage', id: usage.id, endpoint: 'typeId', missingId: usage.typeId,
        code: 'UNRESOLVED_ENDPOINT', message: `Part usage ${usage.id} type ${usage.typeId} does not resolve to any block`,
      });
    }
    if (usage.kind === 'port' && !known.has(usage.definitionId)) {
      records.push({
        kind: 'usage', id: usage.id, endpoint: 'definitionId', missingId: usage.definitionId,
        code: 'UNRESOLVED_ENDPOINT', message: `Port usage ${usage.id} definition ${usage.definitionId} does not resolve to any port definition`,
      });
    }
  }
  for (const vc of Object.values(repo.verificationCases ?? {})) {
    for (const reqId of vc.verifiesRequirementIds ?? []) {
      if (!known.has(reqId)) {
        records.push({
          kind: 'verificationCase', id: vc.id, endpoint: 'verifiesRequirementIds', missingId: reqId,
          code: 'UNRESOLVED_ENDPOINT', message: `Verification case ${vc.id} verifies unknown requirement ${reqId}`,
        });
      }
    }
  }
  for (const ev of Object.values(repo.evidence ?? {})) {
    if (!known.has(ev.verificationCaseId)) {
      records.push({
        kind: 'evidence', id: ev.id, endpoint: 'verificationCaseId', missingId: ev.verificationCaseId,
        code: 'UNRESOLVED_ENDPOINT', message: `Evidence ${ev.id} references unknown verification case ${ev.verificationCaseId}`,
      });
    }
    if (!known.has(ev.requirementId)) {
      records.push({
        kind: 'evidence', id: ev.id, endpoint: 'requirementId', missingId: ev.requirementId,
        code: 'UNRESOLVED_ENDPOINT', message: `Evidence ${ev.id} references unknown requirement ${ev.requirementId}`,
      });
    }
  }
  return records.sort((a, b) => a.id.localeCompare(b.id) || a.endpoint.localeCompare(b.endpoint));
}

/**
 * Quarantine edges with dangling endpoints: strip them from the live
 * repository into explicit quarantine lists. Never synthesize a generic
 * association to paper over a missing endpoint.
 */
export function quarantineUnresolvedEndpoints(repo: SysmlRepository): { repository: SysmlRepository; report: InterchangeReport } {
  const report = createEmptyInterchangeReport();
  report.unresolvedEndpoints = findUnresolvedEndpoints(repo);
  const badRelationshipIds = new Set(
    report.unresolvedEndpoints.filter(r => r.kind === 'relationship').map(r => r.id),
  );
  const badConnectorIds = new Set(
    report.unresolvedEndpoints.filter(r => r.kind === 'connector').map(r => r.id),
  );
  const next: SysmlRepository = {
    ...repo,
    relationships: { ...(repo.relationships ?? {}) },
    connectors: { ...(repo.connectors ?? {}) },
  };
  for (const id of [...badRelationshipIds].sort()) {
    delete next.relationships[id];
    report.quarantinedRelationshipIds.push(id);
    report.diagnostics.push(diag(
      'UNRESOLVED_ENDPOINT', id,
      `Quarantined relationship ${id}: endpoint does not resolve; no generic association synthesized`,
      'error',
    ));
  }
  for (const id of [...badConnectorIds].sort()) {
    delete next.connectors[id];
    report.quarantinedConnectorIds.push(id);
    report.diagnostics.push(diag(
      'UNRESOLVED_ENDPOINT', id,
      `Quarantined connector ${id}: endpoint does not resolve; no generic association synthesized`,
      'error',
    ));
  }
  // Non-edge dangling references (usages, verification links, evidence) stay
  // in place so validation can fail closed on them; they are still reported.
  for (const record of report.unresolvedEndpoints) {
    if (record.kind === 'relationship' || record.kind === 'connector') continue;
    report.diagnostics.push(diag('UNRESOLVED_ENDPOINT', record.id, record.message, 'error'));
  }
  finishReport(report);
  return { repository: next, report };
}

/** Merge migration loss entries into a report (deterministic order). */
export function recordMigrationLoss(
  report: InterchangeReport,
  entry: InterchangeLossEntry,
  diagnostic?: SysmlDiagnostic,
): void {
  report.lossEntries.push(entry);
  if (diagnostic) report.diagnostics.push(diagnostic);
  finishReport(report);
}

export function mergeInterchangeReports(...reports: InterchangeReport[]): InterchangeReport {
  const merged = createEmptyInterchangeReport();
  for (const report of reports) {
    merged.lossEntries.push(...report.lossEntries);
    merged.unresolvedEndpoints.push(...report.unresolvedEndpoints);
    merged.quarantinedRelationshipIds.push(...report.quarantinedRelationshipIds);
    merged.quarantinedConnectorIds.push(...report.quarantinedConnectorIds);
    merged.diagnostics.push(...report.diagnostics);
  }
  merged.lossEntries.sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.diagnosticCode.localeCompare(b.diagnosticCode));
  merged.unresolvedEndpoints.sort((a, b) => a.id.localeCompare(b.id) || a.endpoint.localeCompare(b.endpoint));
  merged.quarantinedRelationshipIds.sort();
  merged.quarantinedConnectorIds.sort();
  finishReport(merged);
  return merged;
}

function finishReport(report: InterchangeReport): void {
  report.lossEntries.sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.diagnosticCode.localeCompare(b.diagnosticCode));
  report.unresolvedEndpoints.sort((a, b) => a.id.localeCompare(b.id) || a.endpoint.localeCompare(b.endpoint));
  report.quarantinedRelationshipIds.sort();
  report.quarantinedConnectorIds.sort();
  report.lossless =
    report.lossEntries.length === 0 &&
    report.unresolvedEndpoints.length === 0 &&
    report.quarantinedRelationshipIds.length === 0 &&
    report.quarantinedConnectorIds.length === 0;
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}
