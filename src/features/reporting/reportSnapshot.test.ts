import { describe, it, expect } from 'vitest';
import type { ReportModelInput } from '../../services/reportModelConsistency';
import type { BlockData, ConnectorData, PartData, RelationshipData } from '../../types/sysml_types';
import { createReportSnapshot, toHierarchySource } from './reportSnapshot';

function block(id: string, stereotype = 'block'): BlockData {
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
    ports: [],
  };
}

function relation(id: string, sourceId: string, targetId: string): RelationshipData {
  return {
    id,
    sourceId,
    targetId,
    type: 'satisfy',
    label: '',
  };
}

function part(id: string, blockId: string): PartData {
  return {
    id,
    name: id,
    blockId,
    x: 0,
    y: 0,
    width: 60,
    height: 40,
  };
}

function connector(id: string, sourcePartId: string, targetPartId: string): ConnectorData {
  return {
    id,
    sourcePartId,
    targetPartId,
    sourcePortId: 'p1',
    targetPortId: 'p2',
  };
}

function modelWithCrossDiagramLinks(): ReportModelInput {
  return {
    blocks: [block('b1'), block('b2')],
    parts: [part('p1', 'b1'), part('p2', 'b2')],
    relationships: [relation('r1', 'b1', 'b2')],
    connectors: [
      connector('c1', 'p1', 'p2'),
      connector('dangling-1', 'p1', 'missing-p'),
    ],
  };
}

describe('reportSnapshot', () => {
  it('returns one revision and one reconciled connection set for every renderer', () => {
    const snapshot = createReportSnapshot(modelWithCrossDiagramLinks());
    const source = toHierarchySource(snapshot);

    expect(source.relationships.map(r => r.id)).toEqual(snapshot.relationships.map(r => r.id));
    expect(source.connectors.map(c => c.id)).toEqual(snapshot.connectors.map(c => c.id));
    expect(snapshot.revision).toBeTruthy();
    expect(snapshot.diagnostics.removedConnectorIds).toContain('dangling-1');
  });

  it('passes arrays by reference to avoid unnecessary memory duplication', () => {
    const snapshot = createReportSnapshot(modelWithCrossDiagramLinks());
    const source = toHierarchySource(snapshot);

    expect(source.blocks).toBe(snapshot.blocks);
    expect(source.parts).toBe(snapshot.parts);
    expect(source.relationships).toBe(snapshot.relationships);
    expect(source.connectors).toBe(snapshot.connectors);
  });
});
