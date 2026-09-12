import { describe, expect, it } from 'vitest';
import type { BlockData, ConnectorData, PartData, RelationshipData } from '../types/sysml_types';
import { applyLegacySysmlDeletion, classifyLegacyDeletionTarget, formatLegacyDeletionImpact, mergeLegacyDiagramIntoRepository, requiresDeletionConfirmation, toCompactImpactDelta } from './sysmlTransactionAdapter';
import { createEmptyRepository } from '../engine/sysml/model';

const block = (id: string, stereotype = 'block'): BlockData => ({ id, name: id, stereotype, x: 0, y: 0, width: 100, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [] });
const part = (id: string, owner: string, type: string, parentPartId: string | null = null): PartData => ({ id, name: id, blockId: owner, typeId: type, parentPartId, x: 0, y: 0, width: 80, height: 60 });
const relation = (id: string, sourceId: string, targetId: string, type: RelationshipData['type']): RelationshipData => ({ id, sourceId, targetId, type, label: '' });

describe('legacy UI to canonical SysML mutation adapter', () => {
  it('deletes a BDD whole and its owned IBD usages but preserves connected reusable definitions and external typed usages', () => {
    const blocks = [block('whole'), block('child1'), block('child2'), block('other')];
    const parts = [part('owned1', 'whole', 'child1'), part('owned2', 'whole', 'child2'), part('external', 'other', 'child1')];
    const relationships = [relation('c1', 'whole', 'child1', 'composition'), relation('c2', 'whole', 'child2', 'composition')];
    const connectors: ConnectorData[] = [{ id: 'wire', sourcePartId: 'owned1', sourcePortId: 'p1', targetPartId: 'external', targetPortId: 'p2' }];

    const result = applyLegacySysmlDeletion({ blocks, parts, relationships, connectors }, ['whole']);

    expect(result.model.blocks.map(item => item.id).sort()).toEqual(['child1', 'child2', 'other']);
    expect(result.model.parts.map(item => item.id)).toEqual(['external']);
    expect(result.model.relationships).toEqual([]);
    expect(result.model.connectors).toEqual([]);
    expect(result.impact.deletedElementIds).toEqual(expect.arrayContaining(['whole', 'owned1', 'owned2', 'c1', 'c2']));
    expect(requiresDeletionConfirmation(result.impact)).toBe(true);
    expect(formatLegacyDeletionImpact(result.impact)).toContain('Affected diagrams: bdd, ibd');
    expect(formatLegacyDeletionImpact(result.impact)).toContain('owned1');
  });

  it('recursively deletes selected nested part usages without deleting their type definitions', () => {
    const input = {
      blocks: [block('system'), block('type')],
      parts: [part('parent', 'system', 'type'), part('child', 'system', 'type', 'parent')],
      relationships: [] as RelationshipData[], connectors: [] as ConnectorData[],
    };
    const result = applyLegacySysmlDeletion(input, ['parent']);
    expect(result.model.parts).toEqual([]);
    expect(result.model.blocks.map(item => item.id)).toEqual(['system', 'type']);
  });

  it('handles mixed multi-selection atomically and removes dangling satisfied requirement references', () => {
    const requirement = { ...block('req', 'requirement'), reqId: 'REQ-1', description: 'Required' };
    const supplier = { ...block('supplier'), satisfiedReqIds: ['req'] };
    const input = { blocks: [requirement, supplier], parts: [], relationships: [relation('s', 'supplier', 'req', 'satisfy')], connectors: [] };
    const result = applyLegacySysmlDeletion(input, ['req', 's']);
    expect(result.model.blocks).toHaveLength(1);
    expect(result.model.blocks[0].satisfiedReqIds).toEqual([]);
    expect(result.model.relationships).toEqual([]);
    expect(result.repository.revision).toBe(1);
  });

  it('does not require an impact confirmation for an isolated relationship deletion', () => {
    const input = { blocks: [block('a'), block('b')], parts: [], relationships: [relation('r', 'a', 'b', 'association')], connectors: [] };
    const result = applyLegacySysmlDeletion(input, ['r']);
    expect(requiresDeletionConfirmation(result.impact)).toBe(false);
  });

  it('merges legacy editor changes into the canonical source while preserving evidence, baselines, and layout-insensitive revision', () => {
    const canonical = createEmptyRepository();
    canonical.evidence.e = { id: 'e', verificationCaseId: 'v', requirementId: 'req', revision: 0, result: 'passed', executedAt: '2026-09-08' };
    canonical.baselines.bl = { id: 'bl', name: 'Baseline', revision: 0, createdAt: '2026-09-08', protected: true };
    const legacy = { blocks: [block('a')], parts: [], relationships: [], connectors: [] };
    const merged = mergeLegacyDiagramIntoRepository(canonical, legacy);
    expect(merged.definitions.a).toBeDefined();
    expect(merged.evidence.e).toBeDefined();
    expect(merged.baselines.bl).toBeDefined();
    const moved = { ...legacy, blocks: [{ ...legacy.blocks[0], x: 900, y: 700 }] };
    expect(mergeLegacyDiagramIntoRepository(merged, moved)).toBe(merged);
  });

  it('requires confirmation and lists nested requirements when deleting a requirement container', () => {
    const parentReq = { ...block('p', 'requirement'), reqId: 'REQ-P' };
    const childReq = { ...block('c', 'requirement'), reqId: 'REQ-C' };
    const gcReq = { ...block('gc', 'requirement'), reqId: 'REQ-GC' };
    const unrelatedReq = { ...block('u', 'requirement'), reqId: 'REQ-U' };

    const input = {
      blocks: [parentReq, childReq, gcReq, unrelatedReq],
      parts: [],
      relationships: [
        relation('rc1', 'p', 'c', 'requirementContainment'),
        relation('rc2', 'c', 'gc', 'requirementContainment'),
      ],
      connectors: [],
    };

    const result = applyLegacySysmlDeletion(input, ['p']);
    expect(requiresDeletionConfirmation(result.impact)).toBe(true);
    expect(result.impact.nestedRequirementIds).toEqual(['c', 'gc']);
    expect(result.impact.removedRelationshipIds).toEqual(expect.arrayContaining(['rc1', 'rc2']));
    expect(result.model.blocks.map(b => b.id)).toEqual(['u']);
    expect(result.model.relationships).toEqual([]);

    const formatted = formatLegacyDeletionImpact(result.impact);
    expect(formatted).toContain('Nested requirements: c, gc');
  });

  it('classifies legacy deletion targets through the central policy', () => {
    const input = {
      blocks: [block('whole'), block('child')],
      parts: [part('owned', 'whole', 'child')],
      relationships: [relation('c1', 'whole', 'child', 'composition')],
      connectors: [] as ConnectorData[],
    };
    const decision = classifyLegacyDeletionTarget(input, 'whole');
    expect(decision.targetKind).toBe('definition');

    const unknown = classifyLegacyDeletionTarget(input, 'ghost');
    expect(unknown.targetKind).toBe('unknown');
    expect(unknown.diagnostics.join('\n')).toMatch('UNKNOWN_ELEMENT');
  });

  it('projects deletion impact to a compact delta without embedding the repository', () => {
    const input = {
      blocks: [block('a'), block('b')],
      parts: [] as PartData[],
      relationships: [relation('r', 'a', 'b', 'association')],
      connectors: [] as ConnectorData[],
    };
    const result = applyLegacySysmlDeletion(input, ['r']);
    const delta = toCompactImpactDelta(result.impact);
    expect(delta.requestedElementIds).toEqual(['r']);
    expect(delta.deletedElementIds).toContain('r');
    expect(delta.impactSummary.removedRelationships).toBe(result.impact.removedRelationshipIds.length);
    expect(delta.impactSummary.unresolvedUsages).toBe(result.impact.unresolvedUsageIds.length);
    expect(delta.impact).toEqual(result.impact);
    expect((delta as unknown as Record<string, unknown>).definitions).toBeUndefined();
    expect((delta as unknown as Record<string, unknown>).repository).toBeUndefined();
  });
});

