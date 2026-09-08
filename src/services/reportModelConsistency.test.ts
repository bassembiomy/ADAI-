import { describe, it, expect } from 'vitest';
import type { BlockData, ConnectorData, PartData, RelationshipData, PortData } from '../types/sysml_types';
import {
  cascadeDeleteReportElement,
  reconcileReportModel,
  buildReportSnapshot,
  type ReportModelInput,
} from './reportModelConsistency';

function block(id: string, stereotype = 'block', ports: PortData[] = []): BlockData {
  return {
    id,
    name: id,
    stereotype,
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    properties: [],
    operations: [],
    constraints: [],
    classes: [],
    ports,
  };
}

function relation(
  id: string,
  sourceId: string,
  targetId: string,
  type: RelationshipData['type'] = 'trace',
  label = '',
): RelationshipData {
  return {
    id,
    sourceId,
    targetId,
    type,
    label,
  };
}

function part(
  id: string,
  blockId: string | null = null,
  parentBlockId: string | null = null,
  parentPartId: string | null = null,
  typeBlockId: string | null = null,
): PartData {
  return {
    id,
    name: id,
    blockId,
    parentBlockId,
    parentPartId,
    typeBlockId,
    x: 0,
    y: 0,
    width: 80,
    height: 60,
  };
}

function connector(
  id: string,
  sourcePartId: string,
  targetPartId: string,
  sourcePortId = 'p1',
  targetPortId = 'p2',
): ConnectorData {
  return {
    id,
    sourcePartId,
    targetPartId,
    sourcePortId,
    targetPortId,
  };
}

function fixture(overrides: Partial<ReportModelInput> = {}): ReportModelInput {
  return {
    blocks: overrides.blocks ?? [],
    relationships: overrides.relationships ?? [],
    parts: overrides.parts ?? [],
    connectors: overrides.connectors ?? [],
    states: overrides.states,
    layers: overrides.layers,
    transitions: overrides.transitions,
    junctions: overrides.junctions,
  };
}

describe('reportModelConsistency - Deletion Closure', () => {
  it('removes requirement relationships when the requirement is deleted', () => {
    const model = fixture({
      blocks: [block('b1', 'block'), block('r1', 'requirement')],
      relationships: [relation('rel-1', 'b1', 'r1', 'satisfy')],
    });

    const next = cascadeDeleteReportElement(model, { kind: 'block', id: 'r1' });

    expect(next.blocks.map(b => b.id)).toEqual(['b1']);
    expect(next.relationships).toEqual([]);
  });

  it('removes connectors when either part endpoint is deleted', () => {
    const model = fixture({
      parts: [part('p1', 'b1'), part('p2', 'b1')],
      connectors: [connector('conn-1', 'p1', 'p2')],
    });

    const next = cascadeDeleteReportElement(model, { kind: 'part', id: 'p1' });

    expect(next.parts.map(p => p.id)).toEqual(['p2']);
    expect(next.connectors).toEqual([]);
  });

  it('recursively removes nested descendant parts and their connectors', () => {
    const model = fixture({
      blocks: [block('b1', 'block')],
      parts: [
        part('p1', 'b1'),
        part('p1_child', null, null, 'p1'),
        part('p1_grandchild', null, null, 'p1_child'),
        part('p2', 'b1'),
      ],
      connectors: [
        connector('c1', 'p1_grandchild', 'p2'),
        connector('c2', 'p1', 'p2'),
      ],
    });

    const next = cascadeDeleteReportElement(model, { kind: 'part', id: 'p1' });

    expect(next.parts.map(p => p.id)).toEqual(['p2']);
    expect(next.connectors).toEqual([]);
  });

  it('removes block and cascades through ports, parts, connectors, and relations', () => {
    const model = fixture({
      blocks: [
        block('b1', 'block', [{ id: 'port1', name: 'out', type: 'signal' }]),
        block('b2', 'block'),
      ],
      parts: [
        part('pt1', 'b1'),
        part('pt2', 'b2'),
      ],
      connectors: [
        connector('c1', 'pt1', 'pt2', 'port1', 'p_other'),
      ],
      relationships: [
        relation('rel1', 'b1', 'b2', 'association'),
      ],
    });

    const next = cascadeDeleteReportElement(model, { kind: 'block', id: 'b1' });

    expect(next.blocks.map(b => b.id)).toEqual(['b2']);
    expect(next.parts.map(p => p.id)).toEqual(['pt2']);
    expect(next.connectors).toEqual([]);
    expect(next.relationships).toEqual([]);
  });

  it('preserves part usages typed by a deleted definition when they belong to another IBD context', () => {
    const model = fixture({
      blocks: [block('owner'), block('type')],
      parts: [part('typed-usage', 'owner', null, null, 'type')],
    });

    const next = cascadeDeleteReportElement(model, { kind: 'block', id: 'type' });

    expect(next.blocks.map(b => b.id)).toEqual(['owner']);
    expect(next.parts.map(p => p.id)).toEqual(['typed-usage']);
    expect(next.parts[0].typeBlockId).toBe('type');
  });

  it('removes port and dependent connectors and relationships', () => {
    const model = fixture({
      blocks: [
        block('b1', 'block', [{ id: 'port1', name: 'out', type: 'signal' }]),
      ],
      parts: [part('pt1', 'b1'), part('pt2', 'b1')],
      connectors: [
        connector('c1', 'pt1', 'pt2', 'port1', 'port2'),
      ],
      relationships: [
        relation('r1', 'port1', 'pt2', 'dependency'),
      ],
    });

    const next = cascadeDeleteReportElement(model, { kind: 'port', id: 'port1' });

    expect(next.blocks[0].ports).toEqual([]);
    expect(next.connectors).toEqual([]);
    expect(next.relationships).toEqual([]);
  });
});

describe('reportModelConsistency - Reconciliation and Validation', () => {
  it('records and removes dangling relationships and connectors', () => {
    const result = reconcileReportModel(fixture({
      blocks: [block('b1', 'block')],
      relationships: [relation('rel-dangling', 'b1', 'missing', 'trace')],
      parts: [part('p1', 'b1')],
      connectors: [connector('conn-dangling', 'p1', 'missing-part')],
    }));

    expect(result.model.relationships).toEqual([]);
    expect(result.model.connectors).toEqual([]);
    expect(result.diagnostics.removedRelationshipIds).toEqual(['rel-dangling']);
    expect(result.diagnostics.removedConnectorIds).toEqual(['conn-dangling']);
    expect(result.diagnostics.errors.map(e => e.code)).toEqual([
      'DANGLING_RELATIONSHIP', 'DANGLING_CONNECTOR',
    ]);
  });

  it('blocks the snapshot when element IDs are duplicated', () => {
    const result = reconcileReportModel(fixture({
      blocks: [block('b1', 'block'), block('b1', 'block')],
    }));

    expect(result.diagnostics.errors[0].code).toBe('DUPLICATE_ID');
  });

  it('detects invalid context references for parts and layers', () => {
    const result = reconcileReportModel(fixture({
      blocks: [block('b1', 'block')],
      parts: [
        part('p1', null, 'missing_parent_block'),
        part('p2', 'missing_block'),
        part('p3', null, null, 'missing_parent_part'),
      ],
      layers: [
        {
          id: 'layer1',
          name: 'Layer 1',
          parentStateId: 'missing_parent_state',
          stateIds: [],
          transitionIds: [],
          junctionIds: [],
        },
      ],
    }));

    const invalidCodes = result.diagnostics.errors.filter(e => e.code === 'INVALID_CONTEXT');
    expect(invalidCodes.length).toBe(4);
  });

  it('generates deterministic revision string across identical inputs', () => {
    const modelA = fixture({
      blocks: [block('b1', 'block'), block('b2', 'requirement')],
      parts: [part('p1', 'b1')],
      relationships: [relation('r1', 'b1', 'b2', 'satisfy')],
    });

    const modelB = fixture({
      blocks: [block('b2', 'requirement'), block('b1', 'block')],
      parts: [part('p1', 'b1')],
      relationships: [relation('r1', 'b1', 'b2', 'satisfy')],
    });

    const snapshotA = buildReportSnapshot(modelA);
    const snapshotB = buildReportSnapshot(modelB);

    expect(snapshotA.revision).toBe(snapshotB.revision);
    expect(snapshotA.revision.startsWith('rev_')).toBe(true);
  });
});
