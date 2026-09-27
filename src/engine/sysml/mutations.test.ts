import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type PartUsage, type SysmlRepository } from './model';
import {
  analyzeMutation,
  applyCommand,
  applyUnresolvedResolutions,
  computeTouchedProtectedBaselines,
  createHistory,
  impactSeverity,
  redo,
  undo,
} from './mutations';

const block = (id: string): BlockDefinition => ({
  id, name: id, namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
  properties: [], ports: [], operations: [], constraints: [],
});
const part = (id: string, ownerId: string, typeId: string, aggregation: PartUsage['aggregation']): PartUsage => ({
  id, ownerId, typeId, aggregation, kind: 'part', name: id,
  multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
});
const repository = (): SysmlRepository => {
  const repo = createEmptyRepository();
  repo.definitions.whole = block('whole');
  repo.definitions.childType = block('childType');
  repo.definitions.sharedType = block('sharedType');
  repo.usages.owned = part('owned', 'whole', 'childType', 'composite');
  repo.usages.nested = part('nested', 'owned', 'childType', 'composite');
  repo.usages.shared = part('shared', 'whole', 'sharedType', 'shared');
  repo.usages.external = part('external', 'sharedType', 'childType', 'reference');
  repo.relationships.assoc = { id: 'assoc', kind: 'association', sourceId: 'whole', targetId: 'sharedType' };
  return repo;
};

describe('composition-aware SysML transactions', () => {
  it('deletes only recursively owned composite usages, preserving definitions and shared/reference usages', () => {
    const result = applyCommand(repository(), { kind: 'deleteElements', elementIds: ['whole'] });

    expect(result.applied).toBe(true);
    expect(Object.keys(result.repository.definitions).sort()).toEqual(['childType', 'sharedType']);
    expect(Object.keys(result.repository.usages).sort()).toEqual(['external', 'shared']);
    expect(result.impact.deletedElementIds).toEqual(expect.arrayContaining(['whole', 'owned', 'nested', 'assoc']));
    expect(result.repository.revision).toBe(1);
  });

  it('keeps usages typed by a deleted definition and reports them as unresolved impacts', () => {
    const repo = repository();
    const impact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['childType'] });
    const result = applyCommand(repo, { kind: 'deleteElements', elementIds: ['childType'] });

    expect(impact.unresolvedUsageIds.sort()).toEqual(['external', 'nested', 'owned']);
    expect(Object.keys(result.repository.usages).sort()).toEqual(['external', 'nested', 'owned', 'shared']);
    expect(result.repository.definitions.childType).toBeUndefined();
  });

  it('atomically removes connectors, trace links, and verification evidence touching deleted elements', () => {
    const repo = repository();
    const whole = repo.definitions.whole as BlockDefinition;
    whole.ports.push({
      id: 'pd', name: 'p', kind: 'proxy', typeId: 'sharedType', direction: 'out', isConjugated: false,
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    });
    repo.usages.pu = { id: 'pu', kind: 'port', name: 'p', ownerId: 'owned', definitionId: 'pd' };
    repo.usages.extPort = { id: 'extPort', kind: 'port', name: 'p2', ownerId: 'external', definitionId: 'pd' };
    repo.connectors.c = { id: 'c', kind: 'assembly', ownerId: 'whole', sourcePortId: 'pu', targetPortId: 'extPort' };
    repo.requirements.r = { id: 'r', name: 'R', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'x', status: 'verified', version: '1' };
    repo.verificationCases.v = { id: 'v', name: 'V', namespace: [], kind: 'verificationCase', method: 'test', verifiesRequirementIds: ['r'] };
    repo.evidence.e = { id: 'e', verificationCaseId: 'v', requirementId: 'r', revision: 0, result: 'passed', executedAt: '2026-01-01' };
    repo.relationships.s = { id: 's', kind: 'satisfy', sourceId: 'owned', targetId: 'r' };

    const result = applyCommand(repo, { kind: 'deleteElements', elementIds: ['whole'] });

    expect(result.repository.connectors).toEqual({});
    expect(result.repository.relationships.s).toBeUndefined();
    expect(result.repository.evidence.e).toBeUndefined();
    expect(result.impact.invalidatedEvidenceIds).toEqual(['e']);
  });

  it('supports exact undo and redo without mutating prior snapshots', () => {
    const original = repository();
    const history = createHistory(original);
    const applied = applyCommand(original, { kind: 'deleteElements', elementIds: ['whole'] });
    const afterDelete = { past: [original], present: applied.repository, future: [] };
    const undone = undo(afterDelete);
    const redone = redo(undone);

    expect(undone.present).toEqual(original);
    expect(redone.present).toEqual(applied.repository);
    expect(history.present).toEqual(original);
    expect(original.definitions.whole).toBeDefined();
  });

  it('recursively deletes nested requirements and containment edges when container is deleted, while unrelated elements survive', () => {
    const repo = repository();
    repo.requirements.rParent = { id: 'rParent', name: 'Parent', namespace: [], kind: 'requirement', requirementId: 'REQ-P', text: 'Parent', status: 'draft', version: '1' };
    repo.requirements.rChild = { id: 'rChild', name: 'Child', namespace: [], kind: 'requirement', requirementId: 'REQ-C', text: 'Child', status: 'draft', version: '1' };
    repo.requirements.rGrandchild = { id: 'rGrandchild', name: 'Grandchild', namespace: [], kind: 'requirement', requirementId: 'REQ-GC', text: 'Grandchild', status: 'draft', version: '1' };
    repo.requirements.rUnrelated = { id: 'rUnrelated', name: 'Unrelated', namespace: [], kind: 'requirement', requirementId: 'REQ-U', text: 'Unrelated', status: 'draft', version: '1' };

    repo.relationships.rc1 = { id: 'rc1', kind: 'requirementContainment', sourceId: 'rParent', targetId: 'rChild' };
    repo.relationships.rc2 = { id: 'rc2', kind: 'requirementContainment', sourceId: 'rChild', targetId: 'rGrandchild' };
    repo.relationships.sat = { id: 'sat', kind: 'satisfy', sourceId: 'whole', targetId: 'rChild' };

    repo.verificationCases.v = { id: 'v', name: 'V', namespace: [], kind: 'verificationCase', method: 'test', verifiesRequirementIds: ['rGrandchild'] };
    repo.evidence.ev = { id: 'ev', verificationCaseId: 'v', requirementId: 'rGrandchild', revision: 0, result: 'passed', executedAt: '2026-09-09' };

    const impact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['rParent'] });
    expect(impact.nestedRequirementIds).toEqual(['rChild', 'rGrandchild']);
    expect(impact.removedRelationshipIds).toEqual(expect.arrayContaining(['rc1', 'rc2', 'sat']));

    const result = applyCommand(repo, { kind: 'deleteElements', elementIds: ['rParent'] });
    expect(result.repository.requirements.rParent).toBeUndefined();
    expect(result.repository.requirements.rChild).toBeUndefined();
    expect(result.repository.requirements.rGrandchild).toBeUndefined();
    expect(result.repository.relationships.rc1).toBeUndefined();
    expect(result.repository.relationships.rc2).toBeUndefined();
    expect(result.repository.relationships.sat).toBeUndefined();
    expect(result.repository.evidence.ev).toBeUndefined();

    // Unrelated requirement, supplier block, and verification case survive
    expect(result.repository.requirements.rUnrelated).toBeDefined();
    expect(result.repository.definitions.whole).toBeDefined();
    expect(result.repository.verificationCases.v).toBeDefined();
    expect(result.repository.verificationCases.v.verifiesRequirementIds).toEqual([]);
  });

  it('deleting only a containment relationship preserves both container and nested requirements', () => {
    const repo = repository();
    repo.requirements.rParent = { id: 'rParent', name: 'Parent', namespace: [], kind: 'requirement', requirementId: 'REQ-P', text: 'Parent', status: 'draft', version: '1' };
    repo.requirements.rChild = { id: 'rChild', name: 'Child', namespace: [], kind: 'requirement', requirementId: 'REQ-C', text: 'Child', status: 'draft', version: '1' };
    repo.relationships.rc = { id: 'rc', kind: 'requirementContainment', sourceId: 'rParent', targetId: 'rChild' };

    const impact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['rc'] });
    expect(impact.nestedRequirementIds).toEqual([]);
    expect(impact.deletedElementIds).toEqual(['rc']);
    expect(impact.removedRelationshipIds).toEqual(['rc']);

    const result = applyCommand(repo, { kind: 'deleteElements', elementIds: ['rc'] });
    expect(result.repository.relationships.rc).toBeUndefined();
    expect(result.repository.requirements.rParent).toBeDefined();
    expect(result.repository.requirements.rChild).toBeDefined();
  });

  it('deleting non-containment relationships never cascades to connected elements', () => {
    const repo = repository();
    repo.requirements.r1 = { id: 'r1', name: 'R1', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'R1', status: 'draft', version: '1' };
    repo.requirements.r2 = { id: 'r2', name: 'R2', namespace: [], kind: 'requirement', requirementId: 'REQ-2', text: 'R2', status: 'draft', version: '1' };
    repo.definitions.b = block('b');
    repo.verificationCases.v = { id: 'v', name: 'V', namespace: [], kind: 'verificationCase', method: 'test', verifiesRequirementIds: ['r1'] };

    repo.relationships.d = { id: 'rel_d', kind: 'deriveReqt', sourceId: 'r1', targetId: 'r2' };
    repo.relationships.s = { id: 'rel_s', kind: 'satisfy', sourceId: 'b', targetId: 'r1' };
    repo.relationships.v = { id: 'rel_v', kind: 'verify', sourceId: 'v', targetId: 'r1' };
    repo.relationships.ref = { id: 'rel_ref', kind: 'refine', sourceId: 'b', targetId: 'r1' };
    repo.relationships.tr = { id: 'rel_tr', kind: 'trace', sourceId: 'r1', targetId: 'b' };
    repo.relationships.cp = { id: 'rel_cp', kind: 'copy', sourceId: 'r1', targetId: 'r2' };

    for (const relId of ['rel_d', 'rel_s', 'rel_v', 'rel_ref', 'rel_tr', 'rel_cp']) {
      const result = applyCommand(repo, { kind: 'deleteElements', elementIds: [relId] });
      expect(result.repository.relationships[relId]).toBeUndefined();
      expect(result.repository.requirements.r1).toBeDefined();
      expect(result.repository.requirements.r2).toBeDefined();
      expect(result.repository.definitions.b).toBeDefined();
      expect(result.repository.verificationCases.v).toBeDefined();
    }
  });
});

describe('Task 6 deletion decision matrix (docs/sysml/SYSML_MODULE_BIBLE.md §7)', () => {
  it('relationship deletion is safe: removes only the edge, endpoints remain', () => {
    const impact = analyzeMutation(repository(), { kind: 'deleteElements', elementIds: ['assoc'] });
    expect(impact.deletedElementIds).toEqual(['assoc']);
    expect(impact.removedRelationshipIds).toEqual(['assoc']);
    expect(impact.severity).toBe('safe');
    expect(impactSeverity(impact)).toBe('safe');

    const result = applyCommand(repository(), { kind: 'deleteElements', elementIds: ['assoc'] });
    expect(result.applied).toBe(true);
    expect(result.repository.relationships.assoc).toBeUndefined();
    expect(result.repository.definitions.whole).toBeDefined();
    expect(result.repository.definitions.sharedType).toBeDefined();
  });

  it('connector deletion removes the connector and its item-flow annotation without dangling ports', () => {
    const repo = repository();
    repo.usages.pu = { id: 'pu', kind: 'port', name: 'p', ownerId: 'owned', definitionId: 'pd' };
    repo.usages.extPort = { id: 'extPort', kind: 'port', name: 'p2', ownerId: 'external', definitionId: 'pd' };
    repo.connectors.c = { id: 'c', kind: 'assembly', ownerId: 'whole', sourcePortId: 'pu', targetPortId: 'extPort', itemFlowId: 'flow-1' };

    const impact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['c'] });
    expect(impact.deletedElementIds).toEqual(['c']);
    expect(impact.severity).toBe('safe');

    const result = applyCommand(repo, { kind: 'deleteElements', elementIds: ['c'] });
    expect(result.repository.connectors.c).toBeUndefined();
    // The conveyed item classifier survives; only the annotation on the
    // removed connector goes away with it.
    expect(result.repository.usages.pu).toBeDefined();
    expect(result.repository.usages.extPort).toBeDefined();
    for (const connector of Object.values(result.repository.connectors)) {
      expect(result.repository.usages[connector.sourcePortId]).toBeDefined();
      expect(result.repository.usages[connector.targetPortId]).toBeDefined();
    }
  });

  it('port deletion cascades connectors using it and requires review', () => {
    const repo = repository();
    repo.usages.pu = { id: 'pu', kind: 'port', name: 'p', ownerId: 'owned', definitionId: 'pd' };
    repo.usages.extPort = { id: 'extPort', kind: 'port', name: 'p2', ownerId: 'external', definitionId: 'pd' };
    repo.connectors.c = { id: 'c', kind: 'assembly', ownerId: 'whole', sourcePortId: 'pu', targetPortId: 'extPort' };

    const impact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['pu'] });
    expect(impact.deletedElementIds).toEqual(expect.arrayContaining(['pu', 'c']));
    expect(impact.severity).toBe('review');

    const result = applyCommand(repo, { kind: 'deleteElements', elementIds: ['pu'] });
    expect(result.repository.connectors.c).toBeUndefined();
    expect(result.repository.usages.extPort).toBeDefined();
    for (const connector of Object.values(result.repository.connectors)) {
      expect(result.repository.usages[connector.sourcePortId]).toBeDefined();
      expect(result.repository.usages[connector.targetPortId]).toBeDefined();
    }
  });

  it('composite part deletion cascades owned descendants, ports, and connectors', () => {
    const repo = repository();
    repo.usages.pu = { id: 'pu', kind: 'port', name: 'p', ownerId: 'nested', definitionId: 'pd' };
    repo.usages.extPort = { id: 'extPort', kind: 'port', name: 'p2', ownerId: 'external', definitionId: 'pd' };
    repo.connectors.c = { id: 'c', kind: 'assembly', ownerId: 'whole', sourcePortId: 'pu', targetPortId: 'extPort' };

    const impact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['owned'] });
    expect(impact.deletedElementIds).toEqual(expect.arrayContaining(['owned', 'nested', 'pu', 'c']));
    expect(impact.deletedElementIds).not.toContain('external');
    expect(impact.deletedElementIds).not.toContain('childType');
    expect(impact.severity).toBe('review');

    const result = applyCommand(repo, { kind: 'deleteElements', elementIds: ['owned'] });
    expect(result.repository.usages.owned).toBeUndefined();
    expect(result.repository.usages.nested).toBeUndefined();
    expect(result.repository.connectors.c).toBeUndefined();
    expect(result.repository.definitions.childType).toBeDefined();
  });

  it('shared/reference part deletion removes only its connectors; shared peers remain', () => {
    const repo = repository();
    repo.usages.sharedPort = { id: 'sharedPort', kind: 'port', name: 'p', ownerId: 'shared', definitionId: 'pd' };
    repo.usages.extPort = { id: 'extPort', kind: 'port', name: 'p2', ownerId: 'external', definitionId: 'pd' };
    repo.connectors.c = { id: 'c', kind: 'assembly', ownerId: 'whole', sourcePortId: 'sharedPort', targetPortId: 'extPort' };

    const impact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['shared'] });
    expect(impact.deletedElementIds).toEqual(expect.arrayContaining(['shared', 'sharedPort', 'c']));
    expect(impact.deletedElementIds).not.toContain('external');
    expect(impact.deletedElementIds).not.toContain('sharedType');

    const result = applyCommand(repo, { kind: 'deleteElements', elementIds: ['shared'] });
    expect(result.repository.usages.shared).toBeUndefined();
    // Shared peer typed by the same definition is untouched.
    expect(result.repository.usages.external).toBeDefined();
    expect(result.repository.definitions.sharedType).toBeDefined();
  });

  it('block definition deletion keeps typed usages as explicit unresolved impacts with resolution choices', () => {
    const impact = analyzeMutation(repository(), { kind: 'deleteElements', elementIds: ['childType'] });
    expect(impact.severity).toBe('review');
    expect(impact.unresolvedUsageIds.sort()).toEqual(['external', 'nested', 'owned']);

    // Keep-unresolved is explicit: usages survive and demand a follow-up
    // resolution command instead of vanishing silently.
    const applied = applyCommand(repository(), { kind: 'deleteElements', elementIds: ['childType'] });
    expect(applied.applied).toBe(true);
    expect(Object.keys(applied.repository.usages).sort()).toEqual(['external', 'nested', 'owned', 'shared']);

    // Resolution choices: retarget to a live definition, delete explicitly,
    // or keep (no-op) — never an implicit cascade.
    const retargeted = applyUnresolvedResolutions(applied.repository, [{ usageId: 'owned', action: 'retarget', newTypeId: 'sharedType' }]);
    expect(retargeted.usages.owned).toMatchObject({ typeId: 'sharedType' });
    const deleted = applyUnresolvedResolutions(applied.repository, [{ usageId: 'owned', action: 'delete' }]);
    expect(deleted.usages.owned).toBeUndefined();
    expect(deleted.usages.external).toBeDefined();
    const kept = applyUnresolvedResolutions(applied.repository, [{ usageId: 'owned', action: 'keep' }]);
    expect(kept.usages.owned).toMatchObject({ typeId: 'childType' });
  });

  it('leaf unreferenced requirement deletion is safe; container deletion cascades with review', () => {
    const repo = repository();
    repo.requirements.leaf = { id: 'leaf', name: 'Leaf', namespace: [], kind: 'requirement', requirementId: 'REQ-L', text: 'Leaf', status: 'draft', version: '1' };
    const leafImpact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['leaf'] });
    expect(leafImpact.nestedRequirementIds).toEqual([]);
    expect(leafImpact.severity).toBe('safe');

    repo.requirements.rParent = { id: 'rParent', name: 'Parent', namespace: [], kind: 'requirement', requirementId: 'REQ-P', text: 'Parent', status: 'draft', version: '1' };
    repo.requirements.rChild = { id: 'rChild', name: 'Child', namespace: [], kind: 'requirement', requirementId: 'REQ-C', text: 'Child', status: 'draft', version: '1' };
    repo.relationships.rc = { id: 'rc', kind: 'requirementContainment', sourceId: 'rParent', targetId: 'rChild' };
    const containerImpact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['rParent'] });
    expect(containerImpact.nestedRequirementIds).toEqual(['rChild']);
    expect(containerImpact.severity).toBe('review');
  });

  it('protected baselines block destructive mutation until cloned or explicitly authorized', () => {
    const repo = repository();
    repo.requirements.r = { id: 'r', name: 'R', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'x', status: 'approved', version: '1' };
    repo.baselines.bl = {
      id: 'bl', name: 'Frozen', revision: 0, createdAt: '2026-09-12', protected: true,
      contentHash: 'hash', elementHashes: { r: 'h-r', whole: 'h-whole' },
    };
    // An unrelated protected baseline is never listed as affected.
    repo.baselines.other = {
      id: 'other', name: 'Other', revision: 0, createdAt: '2026-09-12', protected: true,
      contentHash: 'other', elementHashes: { unrelated: 'h-u' },
    };

    expect(computeTouchedProtectedBaselines(repo, new Set(['r']), new Set(['r']))).toEqual(['bl']);
    const impact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['r'] });
    expect(impact.affectedBaselineIds).toEqual(['bl']);
    expect(impact.blockedBaselineIds).toEqual(['bl']);
    expect(impact.severity).toBe('blocked');
    expect(impactSeverity(impact)).toBe('blocked');
    // A leaf requirement names only itself, so once the frozen baseline is
    // authorized the deletion is safe (Bible §7: "Yes unless
    // leaf/unreferenced").
    expect(impactSeverity(impact, ['bl'])).toBe('safe');

    const before = structuredClone(repo);
    const refused = applyCommand(repo, { kind: 'deleteElements', elementIds: ['r'] });
    expect(refused.applied).toBe(false);
    expect(refused.blockedBaselineIds).toEqual(['bl']);
    expect(refused.diagnostics?.[0]?.code).toBe('PROTECTED_BASELINE_REQUIRES_AUTHORIZATION');
    expect(refused.repository).toEqual(before);
    expect(repo.requirements.r).toBeDefined();

    const authorized = applyCommand(repo, { kind: 'deleteElements', elementIds: ['r'] }, { authorizedBaselineIds: ['bl'] });
    expect(authorized.applied).toBe(true);
    expect(authorized.impact.blockedBaselineIds).toEqual([]);
    expect(authorized.impact.severity).toBe('safe');
    expect(authorized.repository.requirements.r).toBeUndefined();
  });

  it('inverse patch restores every cascade member and the evidence invalidation state', () => {
    const repo = repository();
    repo.requirements.r = { id: 'r', name: 'R', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'x', status: 'verified', version: '1' };
    repo.verificationCases.v = { id: 'v', name: 'V', namespace: [], kind: 'verificationCase', method: 'test', verifiesRequirementIds: ['r'] };
    repo.evidence.e = { id: 'e', verificationCaseId: 'v', requirementId: 'r', revision: 0, result: 'passed', executedAt: '2026-09-12', status: 'current' };
    repo.relationships.s = { id: 's', kind: 'satisfy', sourceId: 'owned', targetId: 'r' };

    // Deleting the requirement itself exercises the verifiesRequirementIds
    // invalidation path (the list is filtered, not just the evidence row).
    const result = applyCommand(repo, { kind: 'deleteElements', elementIds: ['whole', 'r'] });
    expect(result.applied).toBe(true);
    expect(result.impact.invalidatedEvidenceIds).toEqual(['e']);
    expect(result.repository.evidence.e).toBeUndefined();
    expect(result.repository.verificationCases.v.verifiesRequirementIds).toEqual([]);

    // The forward patch carries a remove for every cascade member plus a
    // replace capturing the verifiesRequirementIds invalidation; the inverse
    // patch restores all of them byte-for-byte.
    const forwardIds = (result.forwardPatch?.forward ?? [])
      .filter(op => op.op === 'remove')
      .map(op => (op as { id: string }).id);
    for (const id of result.impact.deletedElementIds) {
      if (repo.definitions[id] ?? repo.usages[id] ?? repo.connectors[id] ?? repo.relationships[id] ?? repo.requirements[id] ?? repo.verificationCases[id] ?? repo.evidence[id]) {
        expect(forwardIds).toContain(id);
      }
    }
    const inverseOps = result.inversePatch?.forward ?? [];
    const restoredByInverse: Record<string, Record<string, unknown>> = {
      definitions: {}, usages: {}, connectors: {}, relationships: {}, requirements: {}, verificationCases: {}, evidence: {},
    };
    for (const op of inverseOps) {
      if (op.op === 'add') {
        restoredByInverse[op.collection as string][op.id] = op.value as Record<string, unknown>;
      } else if (op.op === 'replace' && (op as { path?: string[] }).path?.join('.') === 'verifiesRequirementIds') {
        expect((op as { value: unknown }).value).toEqual(['r']);
      }
    }
    expect(Object.keys(restoredByInverse.definitions)).toEqual(['whole']);
    expect(Object.keys(restoredByInverse.usages).sort()).toEqual(['nested', 'owned']);
    expect(restoredByInverse.evidence.e).toMatchObject({ status: 'current', result: 'passed' });
    // verifiesRequirementIds invalidation is captured for exact restore.
    expect(inverseOps.some(op => op.op === 'replace' && op.collection === 'verificationCases' && op.id === 'v')).toBe(true);
  });
});

