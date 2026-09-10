import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type RequirementDefinition, type SysmlRepository } from './model';
import {
  clearSuspectLink,
  createModelBaseline,
  deriveRequirementView,
  getNestedRequirementIds,
  markSuspectLinks,
  synchronizeRequirementCopy,
  transitionRequirementStatus,
  validateRequirement,
  validateRequirementContainment,
} from './requirements';

const requirement = (id: string, requirementId = id): RequirementDefinition => ({
  id, requirementId, name: id, namespace: ['Vehicle'], kind: 'requirement', text: `${id} shall work`,
  status: 'draft', version: '1.0', source: 'Stakeholder', rationale: 'Safety', owner: 'Systems', risk: 'high', priority: 'high',
});
const repo = (): SysmlRepository => {
  const value = createEmptyRepository();
  value.requirements.r1 = requirement('r1', 'REQ-1');
  value.requirements.r2 = requirement('r2', 'REQ-2');
  value.definitions.b = { id: 'b', name: 'Controller', namespace: [], kind: 'block', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
  return value;
};

describe('governed SysML requirements', () => {
  it('validates identity, text, metadata, baseline, and copy source', () => {
    const model = repo();
    model.requirements.r2.requirementId = 'req-1';
    model.requirements.r2.text = '';
    model.requirements.r2.owner = '';
    model.requirements.r2.baselineId = 'missing';
    model.requirements.r2.copiedFromId = 'missing-source';

    expect(validateRequirement(model, 'r2').map(d => d.code)).toEqual(expect.arrayContaining([
      'DUPLICATE_REQUIREMENT_ID', 'EMPTY_REQUIREMENT_TEXT', 'MISSING_REQUIREMENT_OWNER',
      'MISSING_BASELINE', 'MISSING_COPY_SOURCE',
    ]));
  });

  it('enforces relation direction and detects derive/copy/containment cycles', () => {
    const model = repo();
    model.relationships.badSatisfy = { id: 'badSatisfy', kind: 'satisfy', sourceId: 'r1', targetId: 'b' };
    model.relationships.d1 = { id: 'd1', kind: 'deriveReqt', sourceId: 'r1', targetId: 'r2' };
    model.relationships.d2 = { id: 'd2', kind: 'deriveReqt', sourceId: 'r2', targetId: 'r1' };
    model.relationships.h1 = { id: 'h1', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r2' };
    model.relationships.h2 = { id: 'h2', kind: 'requirementContainment', sourceId: 'r2', targetId: 'r1' };

    const codes = deriveRequirementView(model).diagnostics.map(d => d.code);
    expect(codes).toEqual(expect.arrayContaining([
      'INVALID_REQUIREMENT_RELATION_DIRECTION', 'REQUIREMENT_DERIVATION_CYCLE', 'REQUIREMENT_CONTAINMENT_CYCLE',
    ]));
  });

  it('allows draft to approved to implemented but refuses verified without current passed evidence', () => {
    let model = repo();
    let result = transitionRequirementStatus(model, 'r1', 'approved');
    expect(result.applied).toBe(true);
    model = result.repository;
    result = transitionRequirementStatus(model, 'r1', 'implemented');
    expect(result.applied).toBe(true);
    model = result.repository;

    expect(transitionRequirementStatus(model, 'r1', 'verified').diagnostics.map(d => d.code)).toContain('CURRENT_PASSING_EVIDENCE_REQUIRED');

    model.verificationCases.v = { id: 'v', name: 'Test', namespace: [], kind: 'verificationCase', method: 'test', verifiesRequirementIds: ['r1'] };
    model.evidence.e = { id: 'e', verificationCaseId: 'v', requirementId: 'r1', revision: model.revision, result: 'passed', executedAt: '2026-09-08' };
    result = transitionRequirementStatus(model, 'r1', 'verified');
    expect(result.applied).toBe(true);
    expect(result.repository.requirements.r1.status).toBe('verified');
  });

  it('rejects skipped lifecycle states and permits failed, stale, and retired governance states', () => {
    const model = repo();
    expect(transitionRequirementStatus(model, 'r1', 'implemented').applied).toBe(false);
    expect(transitionRequirementStatus(model, 'r1', 'failed').applied).toBe(true);
    expect(transitionRequirementStatus(model, 'r1', 'stale').applied).toBe(true);
    expect(transitionRequirementStatus(model, 'r1', 'retired').applied).toBe(true);
  });

  it('marks downstream links suspect and makes prior evidence stale after semantic change', () => {
    const model = repo();
    model.revision = 3;
    model.relationships.s = { id: 's', kind: 'satisfy', sourceId: 'b', targetId: 'r1', lastValidatedRevision: 3 };
    model.verificationCases.v = { id: 'v', name: 'Test', namespace: [], kind: 'verificationCase', method: 'test', verifiesRequirementIds: ['r1'] };
    model.evidence.e = { id: 'e', verificationCaseId: 'v', requirementId: 'r1', revision: 3, result: 'passed', executedAt: '2026-09-08' };

    const changed = markSuspectLinks(model, ['b']);
    const view = deriveRequirementView(changed);
    expect(changed.relationships.s.suspect).toBe(true);
    expect(changed.revision).toBe(4);
    expect(view.requirements.find(r => r.requirement.id === 'r1')?.verificationStatus).toBe('stale');
  });

  it('creates model baseline with frozen hashes and protects baseline', () => {
    const model = repo();
    const { repository, baseline } = createModelBaseline(model, 'Release-1.0');

    expect(baseline.name).toBe('Release-1.0');
    expect(baseline.protected).toBe(true);
    expect(baseline.contentHash).toBeDefined();
    expect(baseline.elementHashes).toBeDefined();
    expect(repository.baselines[baseline.id]).toBeDefined();
  });

  it('clears suspect flag and stamps lastValidatedRevision', () => {
    const model = repo();
    model.relationships.rel1 = { id: 'rel1', kind: 'satisfy', sourceId: 'b', targetId: 'r1', suspect: true, lastValidatedRevision: 1 };
    model.revision = 5;

    const cleared = clearSuspectLink(model, 'rel1');
    expect(cleared.relationships.rel1.suspect).toBe(false);
    expect(cleared.relationships.rel1.lastValidatedRevision).toBe(5);
  });

  it('synchronizes copy requirement from master and returns applied diffs', () => {
    const model = repo();
    model.requirements.master = requirement('master', 'REQ-MASTER');
    model.requirements.master.text = 'Updated master requirement text';
    model.requirements.master.priority = 'critical';

    model.requirements.copyReq = {
      ...requirement('copyReq', 'REQ-COPY'),
      copiedFromId: 'master',
      text: 'Old outdated text',
      priority: 'low',
    };

    const { repository, diff } = synchronizeRequirementCopy(model, 'copyReq');
    expect(repository.requirements.copyReq.text).toBe('Updated master requirement text');
    expect(repository.requirements.copyReq.priority).toBe('critical');
    expect(diff).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'text', from: 'Old outdated text', to: 'Updated master requirement text' }),
      expect.objectContaining({ field: 'priority', from: 'low', to: 'critical' }),
    ]));
  });
});

describe('SysML requirement containment semantics and traversal', () => {
  it('validates parent-to-child containment and rejects non-requirement endpoints', () => {
    const model = repo();
    model.relationships.rc1 = { id: 'rc1', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r2' };
    expect(validateRequirementContainment(model, 'rc1')).toEqual([]);

    model.relationships.badRc = { id: 'badRc', kind: 'requirementContainment', sourceId: 'b', targetId: 'r1' };
    const diags = validateRequirementContainment(model, 'badRc');
    expect(diags.map(d => d.code)).toContain('INVALID_REQUIREMENT_CONTAINMENT_ENDPOINT');
  });

  it('rejects self-containment', () => {
    const model = repo();
    model.relationships.selfRc = { id: 'selfRc', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r1' };
    const diags = validateRequirementContainment(model, 'selfRc');
    expect(diags.map(d => d.code)).toContain('REQUIREMENT_SELF_CONTAINMENT');
  });

  it('rejects multiple containers for a single nested requirement', () => {
    const model = repo();
    model.requirements.r3 = requirement('r3', 'REQ-3');
    model.relationships.rc1 = { id: 'rc1', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r3' };
    model.relationships.rc2 = { id: 'rc2', kind: 'requirementContainment', sourceId: 'r2', targetId: 'r3' };

    const diags = validateRequirementContainment(model, 'rc2');
    expect(diags.map(d => d.code)).toContain('MULTIPLE_REQUIREMENT_CONTAINERS');
  });

  it('detects direct and transitive containment cycles', () => {
    const model = repo();
    model.requirements.r3 = requirement('r3', 'REQ-3');
    // Direct cycle r1 -> r2 -> r1
    model.relationships.rc1 = { id: 'rc1', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r2' };
    model.relationships.rc2 = { id: 'rc2', kind: 'requirementContainment', sourceId: 'r2', targetId: 'r1' };
    expect(validateRequirementContainment(model, 'rc2').map(d => d.code)).toContain('REQUIREMENT_CONTAINMENT_CYCLE');

    // Transitive cycle r1 -> r2 -> r3 -> r1
    const modelTrans = repo();
    modelTrans.requirements.r3 = requirement('r3', 'REQ-3');
    modelTrans.relationships.rc1 = { id: 'rc1', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r2' };
    modelTrans.relationships.rc2 = { id: 'rc2', kind: 'requirementContainment', sourceId: 'r2', targetId: 'r3' };
    modelTrans.relationships.rc3 = { id: 'rc3', kind: 'requirementContainment', sourceId: 'r3', targetId: 'r1' };
    expect(validateRequirementContainment(modelTrans, 'rc3').map(d => d.code)).toContain('REQUIREMENT_CONTAINMENT_CYCLE');
  });

  it('allows valid re-homing after deleting previous containment relationship', () => {
    const model = repo();
    model.requirements.r3 = requirement('r3', 'REQ-3');
    model.relationships.rc1 = { id: 'rc1', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r3' };
    expect(validateRequirementContainment(model, 'rc1')).toEqual([]);

    // Delete rc1 to re-home r3 under r2
    delete model.relationships.rc1;
    model.relationships.rc2 = { id: 'rc2', kind: 'requirementContainment', sourceId: 'r2', targetId: 'r3' };
    expect(validateRequirementContainment(model, 'rc2')).toEqual([]);
  });

  it('getNestedRequirementIds returns descendants in deterministic depth-first, stable-ID order, protecting against cycles and excluding root', () => {
    const model = repo();
    // Tree:
    // root: r1
    // r1 -> r3, r2 (siblings: r2, r3 in sorted order)
    // r2 -> r5, r4 (sorted: r4, r5)
    // r3 -> r6
    model.requirements.r3 = requirement('r3', 'REQ-3');
    model.requirements.r4 = requirement('r4', 'REQ-4');
    model.requirements.r5 = requirement('r5', 'REQ-5');
    model.requirements.r6 = requirement('r6', 'REQ-6');

    model.relationships.rc1 = { id: 'rc1', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r3' };
    model.relationships.rc2 = { id: 'rc2', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r2' };
    model.relationships.rc3 = { id: 'rc3', kind: 'requirementContainment', sourceId: 'r2', targetId: 'r5' };
    model.relationships.rc4 = { id: 'rc4', kind: 'requirementContainment', sourceId: 'r2', targetId: 'r4' };
    model.relationships.rc5 = { id: 'rc5', kind: 'requirementContainment', sourceId: 'r3', targetId: 'r6' };

    const descendants = getNestedRequirementIds(model, 'r1');
    // Depth-first with sorted sibling IDs:
    // r1's children: r2, r3
    // Under r2: r4, r5
    // Under r3: r6
    // Expected order: r2, r4, r5, r3, r6
    expect(descendants).toEqual(['r2', 'r4', 'r5', 'r3', 'r6']);
    expect(descendants).not.toContain('r1');

    // Corrupt cycle: r6 points back to r1 and r2
    model.relationships.corrupt1 = { id: 'corrupt1', kind: 'requirementContainment', sourceId: 'r6', targetId: 'r1' };
    model.relationships.corrupt2 = { id: 'corrupt2', kind: 'requirementContainment', sourceId: 'r6', targetId: 'r2' };
    const cycleDescendants = getNestedRequirementIds(model, 'r1');
    expect(cycleDescendants).toEqual(['r2', 'r4', 'r5', 'r3', 'r6']);
    expect(cycleDescendants).not.toContain('r1');
  });

  it('deriveRequirementView incorporates requirementContainment and ignores composition between requirements', () => {
    const model = repo();
    model.relationships.rc = { id: 'rc', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r2' };
    const view = deriveRequirementView(model);
    expect(view.relationships.map(r => r.id)).toContain('rc');
    const r1Row = view.requirements.find(r => r.requirement.id === 'r1');
    expect(r1Row?.outgoing.map(r => r.id)).toContain('rc');
  });
});


