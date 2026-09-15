import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type RequirementDefinition, type SysmlRepository } from './model';
import { buildTraceabilityMatrix, computeCoverageMetrics, exportRtmCsv } from './rtm';
import { createModelBaseline } from './requirements';

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

  it('projects baseline change-sets with added, modified, and suspect classification', () => {
    const repo = model();
    // Create baseline at current state
    const { baseline, repository: baseRepo } = createModelBaseline(repo, 'Baseline Alpha');

    // Mutate repository:
    // 1. Add r4 (added)
    baseRepo.requirements.r4 = requirement('r4');
    // 2. Modify r1 text (modified)
    baseRepo.requirements.r1.text = 'r1 shall work with upgraded power';
    // 3. Mark relationship to r2 suspect (suspect)
    baseRepo.relationships.s1.suspect = true; // wait, s1 is to r1; let's add a suspect link to r2
    baseRepo.relationships.s_r2 = { id: 's_r2', kind: 'satisfy', sourceId: 'b', targetId: 'r2', suspect: true };

    const matrixAll = buildTraceabilityMatrix(baseRepo, { compareBaselineId: baseline.id });
    const r4Row = matrixAll.rows.find(r => r.requirement.id === 'r4');
    const r1Row = matrixAll.rows.find(r => r.requirement.id === 'r1');
    const r2Row = matrixAll.rows.find(r => r.requirement.id === 'r2');
    const r3Row = matrixAll.rows.find(r => r.requirement.id === 'r3');

    expect(r4Row?.changeKind).toBe('added');
    expect(r1Row?.changeKind).toBe('modified');
    expect(r2Row?.changeKind).toBe('suspect');
    expect(r3Row?.changeKind).toBe('unchanged');

    // Filter by changeType
    const matrixAdded = buildTraceabilityMatrix(baseRepo, { compareBaselineId: baseline.id, changeType: 'added' });
    expect(matrixAdded.rows.map(r => r.requirement.id)).toEqual(['r4']);

    const matrixChangesOnly = buildTraceabilityMatrix(baseRepo, { compareBaselineId: baseline.id, changeType: 'all' });
    expect(matrixChangesOnly.rows.map(r => r.requirement.id).sort()).toEqual(['r1', 'r2', 'r4']);

    // CSV export includes Change column when compareBaselineId is set
    const csv = exportRtmCsv(matrixAll);
    expect(csv).toContain('Requirement ID,Name,Text,Status,Change');
    expect(csv).toContain('added');
    expect(csv).toContain('modified');
  });

  it('confirms containment creates requirement hierarchy but not satisfaction/verification coverage; nested requirements remain independent RTM rows', () => {
    const repo = createEmptyRepository();
    repo.revision = 1;
    repo.requirements.rRoot = requirement('rRoot');
    repo.requirements.rMid = requirement('rMid');
    repo.requirements.rLeaf = requirement('rLeaf');

    // 3-level containment tree: rRoot -> rMid -> rLeaf
    repo.relationships.rc1 = { id: 'rc1', kind: 'requirementContainment', sourceId: 'rRoot', targetId: 'rMid' };
    repo.relationships.rc2 = { id: 'rc2', kind: 'requirementContainment', sourceId: 'rMid', targetId: 'rLeaf' };

    const matrix = buildTraceabilityMatrix(repo);

    // Each requirement remains an independent RTM row
    expect(matrix.rows).toHaveLength(3);
    const rowRoot = matrix.rows.find(r => r.requirement.id === 'rRoot')!;
    const rowMid = matrix.rows.find(r => r.requirement.id === 'rMid')!;
    const rowLeaf = matrix.rows.find(r => r.requirement.id === 'rLeaf')!;

    expect(rowRoot).toBeDefined();
    expect(rowMid).toBeDefined();
    expect(rowLeaf).toBeDefined();

    // Containment does NOT grant satisfaction (covered) or verification (verified)
    expect(rowRoot.status).not.toBe('covered');
    expect(rowRoot.status).not.toBe('verified');
    expect(rowMid.status).not.toBe('covered');
    expect(rowMid.status).not.toBe('verified');
    expect(rowLeaf.status).not.toBe('covered');
    expect(rowLeaf.status).not.toBe('verified');

    // Neither has verification cases or evidence from containment
    expect(rowRoot.verificationCases).toHaveLength(0);
    expect(rowRoot.evidence).toHaveLength(0);
    expect(rowMid.verificationCases).toHaveLength(0);
    expect(rowMid.evidence).toHaveLength(0);
    expect(rowLeaf.verificationCases).toHaveLength(0);
    expect(rowLeaf.evidence).toHaveLength(0);

    // Parent and child hierarchy links with connection type
    expect(rowRoot.parents).toHaveLength(0);
    expect(rowRoot.children).toHaveLength(1);
    expect(rowRoot.children[0]).toMatchObject({ id: 'rMid', kind: 'requirementContainment' });

    expect(rowMid.parents).toHaveLength(1);
    expect(rowMid.parents[0]).toMatchObject({ id: 'rRoot', kind: 'requirementContainment' });
    expect(rowMid.children).toHaveLength(1);
    expect(rowMid.children[0]).toMatchObject({ id: 'rLeaf', kind: 'requirementContainment' });

    expect(rowLeaf.parents).toHaveLength(1);
    expect(rowLeaf.parents[0]).toMatchObject({ id: 'rMid', kind: 'requirementContainment' });
    expect(rowLeaf.children).toHaveLength(0);
  });

  it('populates coveringBlocks and requirement relations in RTM rows and CSV', () => {
    const repo = createEmptyRepository();
    repo.definitions.ctrl = {
      id: 'ctrl',
      name: 'PowerController',
      namespace: [],
      kind: 'block',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    repo.requirements.r1 = {
      id: 'r1',
      kind: 'requirement',
      requirementId: 'REQ-001',
      name: 'Base Power',
      text: 'Shall provide power',
      status: 'approved',
      version: '1.0',
      namespace: [],
    };
    repo.requirements.r2 = {
      id: 'r2',
      kind: 'requirement',
      requirementId: 'REQ-002',
      name: 'Derived Voltage',
      text: 'Shall provide 12V',
      status: 'approved',
      version: '1.0',
      namespace: [],
    };

    // ctrl satisfies r1
    repo.relationships.s1 = { id: 's1', kind: 'satisfy', sourceId: 'ctrl', targetId: 'r1' };
    // r2 derives from r1
    repo.relationships.d1 = { id: 'd1', kind: 'deriveReqt', sourceId: 'r2', targetId: 'r1' };

    const matrix = buildTraceabilityMatrix(repo);
    const row1 = matrix.rows.find(r => r.requirement.id === 'r1')!;
    const row2 = matrix.rows.find(r => r.requirement.id === 'r2')!;

    expect(row1.coveringBlocks).toHaveLength(1);
    expect(row1.coveringBlocks[0]).toMatchObject({ id: 'ctrl', name: 'PowerController', kind: 'satisfy' });

    expect(row2.parents).toHaveLength(1);
    expect(row2.parents[0]).toMatchObject({ id: 'r1', kind: 'deriveReqt' });

    expect(row1.children).toHaveLength(1);
    expect(row1.children[0]).toMatchObject({ id: 'r2', kind: 'deriveReqt' });

    const csv = exportRtmCsv(matrix);
    expect(csv).toContain('Parents');
    expect(csv).toContain('Children');
    expect(csv).toContain('Covering Blocks');
    expect(csv).toContain('PowerController');
  });

  it('indexes all 7 relationship types into directional RTM fields', () => {
    const repo = createEmptyRepository();
    repo.requirements.r1 = { id: 'r1', kind: 'requirement', requirementId: 'REQ-1', name: 'Parent Req', text: '', status: 'draft', version: '1', namespace: [] };
    repo.requirements.r2 = { id: 'r2', kind: 'requirement', requirementId: 'REQ-2', name: 'Child / Derived Req', text: '', status: 'draft', version: '1', namespace: [] };
    repo.requirements.r3 = { id: 'r3', kind: 'requirement', requirementId: 'REQ-3', name: 'Copy Req', text: '', status: 'draft', version: '1', namespace: [] };
    repo.definitions.b1 = { id: 'b1', name: 'Controller', kind: 'block', namespace: [], isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    repo.verificationCases.t1 = { id: 't1', name: 'Temp Test', namespace: [], kind: 'verificationCase', method: 'test', verifiesRequirementIds: [] };

    repo.relationships.rc1 = { id: 'rc1', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r2' };
    repo.relationships.rd1 = { id: 'rd1', kind: 'deriveReqt', sourceId: 'r2', targetId: 'r1' };
    repo.relationships.rcopy1 = { id: 'rcopy1', kind: 'copy', sourceId: 'r3', targetId: 'r2' };
    repo.relationships.rsat = { id: 'rsat', kind: 'satisfy', sourceId: 'b1', targetId: 'r2' };
    repo.relationships.rver = { id: 'rver', kind: 'verify', sourceId: 't1', targetId: 'r2' };
    repo.relationships.rref = { id: 'rref', kind: 'refine', sourceId: 'b1', targetId: 'r2' };
    repo.relationships.rtr = { id: 'rtr', kind: 'trace', sourceId: 'r1', targetId: 'r3' };

    const matrix = buildTraceabilityMatrix(repo);
    const rowR2 = matrix.rows.find(r => r.requirement.id === 'r2')!;

    expect(rowR2.containmentParents.map(x => x.id)).toContain('r1');
    expect(rowR2.derivedFrom.map(x => x.id)).toContain('r1');
    expect(rowR2.copiedRequirements.map(x => x.id)).toContain('r3');
    expect(rowR2.satisfiedBy.map(x => x.id)).toContain('b1');
    expect(rowR2.verifiedBy.map(x => x.id)).toContain('t1');
    expect(rowR2.refinedBy.map(x => x.id)).toContain('b1');
    expect(rowR2.satisfactionStatus).toBe('satisfied');
    expect(rowR2.verificationStatus).toBe('not-run');

    const rowR3 = matrix.rows.find(r => r.requirement.id === 'r3')!;
    expect(rowR3.copiedFrom.map(x => x.id)).toContain('r2');
    expect(rowR3.tracedElements.map(x => x.id)).toContain('r1');

    const rowR1 = matrix.rows.find(r => r.requirement.id === 'r1')!;
    expect(rowR1.containmentChildren.map(x => x.id)).toContain('r2');
    expect(rowR1.derivedRequirements.map(x => x.id)).toContain('r2');
    expect(rowR1.tracedElements.map(x => x.id)).toContain('r3');

    // Add evidence to test verificationStatus passed
    repo.evidence.ev1 = { id: 'ev1', verificationCaseId: 't1', requirementId: 'r2', revision: 1, result: 'passed', executedAt: '2026-09-15' };
    const matrixWithEv = buildTraceabilityMatrix(repo);
    expect(matrixWithEv.rows.find(r => r.requirement.id === 'r2')!.verificationStatus).toBe('passed');

    // CSV export contains all new columns
    const csv = exportRtmCsv(matrixWithEv);
    expect(csv).toContain('Contained By');
    expect(csv).toContain('Contains');
    expect(csv).toContain('Derived From');
    expect(csv).toContain('Derived Requirements');
    expect(csv).toContain('Copied From');
    expect(csv).toContain('Copied Requirements');
    expect(csv).toContain('Satisfied By');
    expect(csv).toContain('Verified By');
    expect(csv).toContain('Refined By');
    expect(csv).toContain('Traced Elements');
    expect(csv).toContain('Satisfaction Status');
    expect(csv).toContain('Verification Status');
  });
});
