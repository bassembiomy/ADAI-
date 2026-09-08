import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type RequirementDefinition, type SysmlRepository } from './model';
import { buildTraceabilityMatrix, computeCoverageMetrics, exportRtmCsv } from './rtm';

const requirement = (id: string, status: RequirementDefinition['status'] = 'implemented'): RequirementDefinition => ({
  id, name: id, namespace: ['Powertrain'], kind: 'requirement', requirementId: id.toUpperCase(), text: `${id} shall work`,
  status, version: '1', owner: id === 'r2' ? 'Bob' : 'Alice', risk: id === 'r3' ? 'critical' : 'medium',
});
const model = (): SysmlRepository => {
  const repo = createEmptyRepository();
  repo.revision = 5;
  repo.requirements.r1 = requirement('r1');
  repo.requirements.r2 = requirement('r2');
  repo.requirements.r3 = requirement('r3');
  repo.definitions.b = { id: 'b', name: 'Controller', namespace: ['Powertrain'], kind: 'block', isAbstract: false, isLeaf: false, properties: [], ports: [{ id: 'pd', name: 'p', kind: 'proxy', typeId: 'if', direction: 'out', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } }], operations: [], constraints: [] };
  repo.definitions.if = { id: 'if', name: 'IF', namespace: [], kind: 'interface', features: [] };
  repo.usages.p = { id: 'p', name: 'part', kind: 'part', ownerId: 'b', typeId: 'b', aggregation: 'composite', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } };
  repo.usages.pu = { id: 'pu', name: 'port', kind: 'port', ownerId: 'p', definitionId: 'pd' };
  repo.connectors.c = { id: 'c', kind: 'assembly', ownerId: 'b', sourcePortId: 'pu', targetPortId: 'pu' };
  repo.artifacts.beh = { id: 'beh', name: 'Control behavior', kind: 'behavior', ownerId: 'b', revision: 5 };
  repo.artifacts.sim = { id: 'sim', name: 'Nominal simulation', kind: 'simulation', ownerId: 'beh', revision: 5 };
  repo.artifacts.code = { id: 'code', name: 'controller.c', kind: 'generatedArtifact', ownerId: 'b', revision: 5, uri: 'src/controller.c' };
  repo.relationships.s1 = { id: 's1', kind: 'satisfy', sourceId: 'b', targetId: 'r1' };
  repo.relationships.s2 = { id: 's2', kind: 'satisfy', sourceId: 'p', targetId: 'r1' };
  repo.relationships.t1 = { id: 't1', kind: 'trace', sourceId: 'pu', targetId: 'r1' };
  repo.relationships.t2 = { id: 't2', kind: 'trace', sourceId: 'c', targetId: 'r1' };
  repo.relationships.t3 = { id: 't3', kind: 'trace', sourceId: 'beh', targetId: 'r1' };
  repo.relationships.t4 = { id: 't4', kind: 'trace', sourceId: 'sim', targetId: 'r1' };
  repo.relationships.t5 = { id: 't5', kind: 'trace', sourceId: 'code', targetId: 'r1' };
  repo.verificationCases.v = { id: 'v', name: 'Test 1', namespace: [], kind: 'verificationCase', method: 'test', verifiesRequirementIds: ['r1'] };
  repo.relationships.vr = { id: 'vr', kind: 'verify', sourceId: 'v', targetId: 'r1' };
  repo.evidence.e = { id: 'e', verificationCaseId: 'v', requirementId: 'r1', revision: 5, result: 'passed', executedAt: '2026-09-08' };
  return repo;
};

describe('canonical requirements traceability matrix', () => {
  it('builds many-to-many cells across model, behavior, simulation, test, evidence, and artifacts', () => {
    const row = buildTraceabilityMatrix(model()).rows.find(item => item.requirement.id === 'r1')!;
    expect(row.status).toBe('verified');
    expect(row.blocks).toEqual(['b']);
    expect(row.parts).toEqual(['p']);
    expect(row.ports).toEqual(['pu']);
    expect(row.connectors).toEqual(['c']);
    expect(row.behaviors).toEqual(['beh']);
    expect(row.simulations).toEqual(['sim']);
    expect(row.verificationCases).toEqual(['v']);
    expect(row.evidence).toEqual(['e']);
    expect(row.artifacts).toEqual(['code']);
  });

  it('assigns covered, failed, stale, suspect, uncovered, orphan, and unresolved statuses deterministically', () => {
    const repo = model();
    repo.requirements.r4 = requirement('r4');
    repo.requirements.r5 = requirement('r5');
    repo.requirements.r6 = requirement('r6');
    repo.requirements.r7 = requirement('r7');
    repo.relationships.cover = { id: 'cover', kind: 'satisfy', sourceId: 'b', targetId: 'r2' };
    repo.relationships.uncovered = { id: 'uncovered', kind: 'deriveReqt', sourceId: 'r3', targetId: 'r2' };
    repo.relationships.suspect = { id: 'suspect', kind: 'satisfy', sourceId: 'b', targetId: 'r4', suspect: true };
    repo.verificationCases.failed = { id: 'failed', name: 'Failed', namespace: [], kind: 'verificationCase', method: 'analysis', verifiesRequirementIds: ['r5'] };
    repo.evidence.failedEvidence = { id: 'failedEvidence', verificationCaseId: 'failed', requirementId: 'r5', revision: 5, result: 'failed', executedAt: '2026-09-08' };
    repo.verificationCases.stale = { id: 'stale', name: 'Stale', namespace: [], kind: 'verificationCase', method: 'inspection', verifiesRequirementIds: ['r6'] };
    repo.evidence.staleEvidence = { id: 'staleEvidence', verificationCaseId: 'stale', requirementId: 'r6', revision: 4, result: 'passed', executedAt: '2026-09-07' };
    repo.relationships.unresolved = { id: 'unresolved', kind: 'satisfy', sourceId: 'missing', targetId: 'r7' };

    const status = Object.fromEntries(buildTraceabilityMatrix(repo).rows.map(row => [row.requirement.id, row.status]));
    expect(status).toMatchObject({ r1: 'verified', r2: 'covered', r3: 'uncovered', r4: 'suspect', r5: 'failed', r6: 'stale', r7: 'unresolved' });
    expect(status.r3).not.toBe('orphan');
  });

  it('supports baseline/subsystem/owner/risk/status/method/change filters and computes coverage', () => {
    const repo = model();
    repo.baselines.bl = { id: 'bl', name: 'Release', revision: 5, createdAt: '2026-09-08', protected: true };
    repo.requirements.r1.baselineId = 'bl';
    const matrix = buildTraceabilityMatrix(repo, { baselineId: 'bl', subsystem: 'Powertrain', owner: 'Alice', risk: 'medium', status: 'verified', method: 'test', changedSinceRevision: 4 });
    expect(matrix.rows.map(row => row.requirement.id)).toEqual(['r1']);
    const metrics = computeCoverageMetrics(buildTraceabilityMatrix(repo));
    expect(metrics.total).toBe(3);
    expect(metrics.verified).toBe(1);
    expect(metrics.coveragePercent).toBeCloseTo(33.33, 1);
  });

  it('exports stable RFC-style CSV with status text and escaped values', () => {
    const repo = model();
    repo.requirements.r1.text = 'Voltage, current, and "power"';
    const csv1 = exportRtmCsv(buildTraceabilityMatrix(repo));
    const csv2 = exportRtmCsv(buildTraceabilityMatrix(repo));
    expect(csv1).toBe(csv2);
    expect(csv1).toContain('Requirement ID,Name,Text,Status');
    expect(csv1).toContain('"Voltage, current, and ""power"""');
  });
});
