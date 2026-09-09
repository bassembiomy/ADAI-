import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type RequirementDefinition, type SysmlRepository } from './model';
import {
  clearSuspectLink,
  createModelBaseline,
  deriveRequirementView,
  markSuspectLinks,
  synchronizeRequirementCopy,
  transitionRequirementStatus,
  validateRequirement,
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
    model.relationships.h1 = { id: 'h1', kind: 'composition', sourceId: 'r1', targetId: 'r2' };
    model.relationships.h2 = { id: 'h2', kind: 'composition', sourceId: 'r2', targetId: 'r1' };

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

