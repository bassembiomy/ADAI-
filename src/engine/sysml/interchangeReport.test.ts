import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type SysmlRepository } from './model';
import { loadRepository, serializeRepository, createBaseline } from './persistence';
import { fromRepository, toRepository } from './normalizedStore';
import {
  assessLegacyProjectionLoss,
  assessOpmInterchangeLoss,
  findUnresolvedEndpoints,
  quarantineUnresolvedEndpoints,
} from './interchangeReport';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };

function buildFullFixture(): SysmlRepository {
  const repo = createEmptyRepository();
  // Inheritance: base + child specializing base (feature + generalization edge).
  repo.definitions['blk-base'] = {
    id: 'blk-base', name: 'Base', namespace: [], kind: 'block',
    isAbstract: false, isLeaf: false,
    properties: [{ id: 'prop-base', name: 'mass', kind: 'value', typeId: 'Real', multiplicity: one }],
    ports: [{ id: 'port-def-out', name: 'out', kind: 'proxy', typeId: 'IF', direction: 'out', isConjugated: false, multiplicity: one }],
    operations: ['run()'], constraints: ['mass > 0'],
  };
  repo.definitions['blk-child'] = {
    id: 'blk-child', name: 'Child', namespace: [], kind: 'block',
    isAbstract: false, isLeaf: false, supertypeIds: ['blk-base'],
    properties: [{ id: 'prop-child', name: 'thrust', kind: 'value', typeId: 'Real', multiplicity: one }],
    ports: [{ id: 'port-def-in', name: 'in', kind: 'proxy', typeId: 'IF', direction: 'in', isConjugated: false, multiplicity: one }],
    operations: [], constraints: [],
  };
  repo.definitions['IF'] = { id: 'IF', name: 'IF', namespace: [], kind: 'interface', features: ['signal'] };
  repo.relationships['rel-gen'] = { id: 'rel-gen', kind: 'generalization', sourceId: 'blk-child', targetId: 'blk-base' };
  // Composition (block-to-block structural ownership).
  repo.relationships['rel-comp'] = { id: 'rel-comp', kind: 'composition', sourceId: 'blk-base', targetId: 'blk-child' };
  // Usages: composite + shared + reference parts owned by base.
  repo.usages['part-composite'] = { id: 'part-composite', name: 'c', kind: 'part', ownerId: 'blk-base', typeId: 'blk-child', aggregation: 'composite', multiplicity: one };
  repo.usages['part-shared'] = { id: 'part-shared', name: 's', kind: 'part', ownerId: 'blk-base', typeId: 'blk-child', aggregation: 'shared', multiplicity: one };
  repo.usages['part-ref'] = { id: 'part-ref', name: 'r', kind: 'part', ownerId: 'blk-base', typeId: 'blk-child', aggregation: 'reference', multiplicity: one };
  // Ports as usages + connector between them.
  repo.usages['port-use-out'] = { id: 'port-use-out', name: 'out', kind: 'port', ownerId: 'part-composite', definitionId: 'port-def-out' };
  repo.usages['port-use-in'] = { id: 'port-use-in', name: 'in', kind: 'port', ownerId: 'part-shared', definitionId: 'port-def-in' };
  repo.connectors['conn-asm'] = {
    id: 'conn-asm', kind: 'assembly', ownerId: 'blk-base',
    sourcePortId: 'port-use-out', targetPortId: 'port-use-in', itemFlowId: 'IF',
  };
  // Requirements + verify/satisfy + containment.
  repo.requirements['req-parent'] = {
    id: 'req-parent', kind: 'requirement', name: 'ParentReq', namespace: [],
    requirementId: 'REQ-P', text: 'Parent shall hold', status: 'approved', version: '1.0',
  };
  repo.requirements['req-child'] = {
    id: 'req-child', kind: 'requirement', name: 'ChildReq', namespace: [],
    requirementId: 'REQ-C', text: 'Child shall hold', status: 'approved', version: '1.0',
  };
  repo.relationships['rel-contain'] = { id: 'rel-contain', kind: 'requirementContainment', sourceId: 'req-parent', targetId: 'req-child' };
  repo.relationships['rel-sat'] = { id: 'rel-sat', kind: 'satisfy', sourceId: 'blk-base', targetId: 'req-parent' };
  repo.verificationCases['vc-1'] = {
    id: 'vc-1', name: 'VC1', namespace: [], kind: 'verificationCase', method: 'Test', verifiesRequirementIds: ['req-child'],
  };
  repo.relationships['rel-verify'] = { id: 'rel-verify', kind: 'verify', sourceId: 'vc-1', targetId: 'req-child' };
  repo.evidence['ev-1'] = {
    id: 'ev-1', verificationCaseId: 'vc-1', requirementId: 'req-child',
    revision: 0, result: 'passed', executedAt: '2026-09-12T00:00:00.000Z', status: 'current',
  };
  repo.artifacts['art-1'] = { id: 'art-1', name: 'sim', kind: 'simulation', revision: 0, uri: 'sim/run' };
  return repo;
}

describe('sysml persistence + interchange qualification (Task 7)', () => {
  it('round-trips inheritance, composition, shared/reference parts, ports, connectors, requirements, evidence, baselines with stable IDs and deterministic serialization', () => {
    const repo = buildFullFixture();
    const withBaseline = createBaseline(repo, { id: 'bl-1', name: 'BL1', createdAt: '2026-09-12T00:00:00.000Z' }).repository;

    const first = serializeRepository(withBaseline);
    const second = serializeRepository(withBaseline);
    expect(first).toBe(second);

    const loaded = loadRepository(first);
    expect(loaded.valid).toBe(true);
    expect(loaded.migrated).toBe(false);
    expect(loaded.repository.schemaVersion).toBe(2);
    expect(loaded.repository.profileId).toBe('OMG-SysML-1.6-ADIA');
    // Semantic IDs preserved across every collection.
    for (const id of ['blk-base', 'blk-child', 'IF']) expect(loaded.repository.definitions[id]?.id).toBe(id);
    for (const id of ['part-composite', 'part-shared', 'part-ref', 'port-use-out', 'port-use-in']) expect(loaded.repository.usages[id]?.id).toBe(id);
    for (const id of ['rel-gen', 'rel-comp', 'rel-contain', 'rel-sat', 'rel-verify']) {
      expect(loaded.repository.relationships[id]?.id).toBe(id);
    }
    expect(loaded.repository.usages['part-shared'].kind).toBe('part');
    if (loaded.repository.usages['part-shared'].kind === 'part') {
      expect(loaded.repository.usages['part-shared'].aggregation).toBe('shared');
    }
    if (loaded.repository.usages['part-ref'].kind === 'part') {
      expect(loaded.repository.usages['part-ref'].aggregation).toBe('reference');
    }
    expect((loaded.repository.definitions['blk-child'] as { supertypeIds?: string[] }).supertypeIds).toEqual(['blk-base']);
    expect(loaded.repository.connectors['conn-asm']).toMatchObject({ sourcePortId: 'port-use-out', targetPortId: 'port-use-in' });
    expect(loaded.repository.evidence['ev-1']).toMatchObject({ verificationCaseId: 'vc-1', requirementId: 'req-child' });
    expect(loaded.repository.baselines['bl-1']?.protected).toBe(true);
    expect(loaded.repository.auditTrail.length).toBeGreaterThanOrEqual(withBaseline.auditTrail.length);

    // Normalized store round-trip preserves IDs and emits deterministically sorted keys.
    const store = fromRepository(loaded.repository);
    const back = toRepository(store);
    const byCode = (a: string, b: string): number => a.localeCompare(b);
    expect(Object.keys(back.definitions)).toEqual([...Object.keys(back.definitions)].sort(byCode));
    expect(Object.keys(back.relationships)).toEqual([...Object.keys(back.relationships)].sort(byCode));
    expect(serializeRepository(back)).toBe(serializeRepository(loaded.repository));

    // No unresolved endpoints and no quarantine on the clean fixture.
    expect(loaded.interchangeReport.unresolvedEndpoints).toEqual([]);
    expect(loaded.interchangeReport.quarantinedRelationshipIds).toEqual([]);
    expect(loaded.interchangeReport.quarantinedConnectorIds).toEqual([]);
  });

  it('records explicit loss entries for unsupported legacy relationship kinds instead of silently mapping to trace', () => {
    const legacy = {
      blocks: [{ id: 'b', name: 'B', stereotype: 'block' }],
      parts: [],
      relationships: [{ id: 'r-weird', sourceId: 'b', targetId: 'b', type: 'frobnicate-super-edge', label: '' }],
      connectors: [],
    };
    const loaded = loadRepository(legacy);
    expect(loaded.repository.relationships['r-weird']).toBeDefined();
    expect(loaded.repository.relationships['r-weird'].kind).toBe('trace');
    const codes = loaded.diagnostics.map(d => d.code);
    expect(codes).toContain('LEGACY_RELATIONSHIP_KIND_UNSUPPORTED');
    expect(loaded.interchangeReport.lossEntries.some(e => e.sourceId === 'r-weird')).toBe(true);
  });

  it('rejects/quarantines unresolved endpoint references instead of creating generic associations', () => {
    const repo = buildFullFixture();
    (repo.relationships['rel-ghost'] as unknown) = { id: 'rel-ghost', kind: 'association', sourceId: 'blk-base', targetId: 'ghost-missing' };
    (repo.connectors['conn-ghost'] as unknown) = {
      id: 'conn-ghost', kind: 'assembly', ownerId: 'blk-base',
      sourcePortId: 'port-use-out', targetPortId: 'ghost-port',
    };
    const serialized = serializeRepository(repo);
    const loaded = loadRepository(serialized);
    expect(loaded.valid).toBe(false);
    expect(loaded.diagnostics.map(d => d.code)).toContain('UNRESOLVED_ENDPOINT');
    expect(loaded.repository.relationships['rel-ghost']).toBeUndefined();
    expect(loaded.repository.connectors['conn-ghost']).toBeUndefined();
    expect(loaded.interchangeReport.quarantinedRelationshipIds).toContain('rel-ghost');
    expect(loaded.interchangeReport.quarantinedConnectorIds).toContain('conn-ghost');
    expect(loaded.interchangeReport.unresolvedEndpoints.length).toBeGreaterThanOrEqual(2);

    // Direct helper agrees and never mutates the input.
    const before = structuredClone(repo);
    const { repository: quarantined, report } = quarantineUnresolvedEndpoints(repo);
    expect(quarantined.relationships['rel-ghost']).toBeUndefined();
    expect(report.quarantinedRelationshipIds).toContain('rel-ghost');
    expect(repo).toEqual(before);
    expect(findUnresolvedEndpoints(repo).length).toBeGreaterThanOrEqual(2);
  });

  it('qualifies OPM projection loss explicitly through the interchange report', () => {
    const repo = buildFullFixture();
    const report = assessOpmInterchangeLoss(repo);
    expect(report.lossless).toBe(false);
    const codes = new Set(report.lossEntries.map(e => e.diagnosticCode));
    expect(codes.has('OPM_COMPOSITION_OWNERSHIP_LOSS')).toBe(true);
    expect(codes.has('OPM_USAGE_UNSUPPORTED')).toBe(true);
    expect(codes.has('OPM_IBD_CONNECTOR_UNSUPPORTED')).toBe(true);
    // Generalization stays lossless-mapped; composition/shared/connector/usage do not.
    expect(report.lossEntries.some(e => e.sourceId === 'rel-gen')).toBe(false);
    expect(report.lossEntries.some(e => e.sourceId === 'rel-comp')).toBe(true);
  });

  it('qualifies legacy-projection loss explicitly (evidence, baselines, and port usages are not silently dropped)', () => {
    const repo = buildFullFixture();
    const report = assessLegacyProjectionLoss(repo);
    expect(report.lossless).toBe(false);
    const ids = new Set(report.lossEntries.map(e => e.sourceId));
    expect(ids.has('ev-1')).toBe(true);
    expect(ids.has('port-use-out')).toBe(true);
  });

  it('migrates legacy arrays to schemaVersion 2 with deterministic serialization and stable IDs', () => {
    const legacy = {
      blocks: [
        { id: 'b', name: 'Controller', stereotype: 'block', properties: [], ports: [] },
        { id: 'r', name: 'Safety', stereotype: 'requirement', reqId: 'REQ-1', description: 'Safe', status: 'Approved' },
      ],
      parts: [{ id: 'p', name: 'c', blockId: 'b', typeId: 'b', multiplicity: '1' }],
      relationships: [{ id: 's', sourceId: 'b', targetId: 'r', type: 'satisfy', label: '' }],
      connectors: [],
    };
    const loaded = loadRepository(legacy);
    expect(loaded.migrated).toBe(true);
    expect(loaded.repository.schemaVersion).toBe(2);
    expect(loaded.repository.profileId).toBe('OMG-SysML-1.6-ADIA');
    expect(loaded.repository.definitions['b']?.id).toBe('b');
    expect(loaded.repository.usages['p']?.id).toBe('p');
    expect(serializeRepository(loaded.repository)).toBe(serializeRepository(loadRepository(serializeRepository(loaded.repository)).repository));
  });
});
