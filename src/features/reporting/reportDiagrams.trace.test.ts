import { describe, expect, it } from 'vitest';
import { renderBddDiagram, renderRequirementsDiagram, renderTraceabilityDiagram } from './reportDiagrams';
import { cascadeDeleteReportElement } from '../../services/reportModelConsistency';
import { createReportSnapshot, toHierarchySource } from './reportSnapshot';

const traceBlocks = [
  { id: 'b1', name: 'Engine', stereotype: 'block' },
  { id: 'b2', name: 'Sensor', stereotype: 'block' },
];
const traceReqs = [
  { id: 'r1', name: 'Temp Limit', stereotype: 'requirement', reqId: 'REQ-001' },
  { id: 'r2', name: 'Fan Ctrl', stereotype: 'requirement', reqId: 'REQ-002' },
];
const traceRels = [
  { id: 'sr1', sourceId: 'b1', targetId: 'r1', type: 'satisfy', label: '', sourceMultiplicity: '', targetMultiplicity: '' },
  { id: 'vr1', sourceId: 'b2', targetId: 'r2', type: 'verify', label: '', sourceMultiplicity: '', targetMultiplicity: '' },
];

describe('renderTraceabilityDiagram', () => {
  it('renders all blocks, requirements, and traceability edges', () => {
    const html = renderTraceabilityDiagram({
      blocks: traceBlocks as never,
      requirements: traceReqs as never,
      states: [],
      relationships: traceRels as never,
      transitions: [],
    });
    expect(html).toContain('Engine');
    expect(html).toContain('Temp Limit');
    expect(html).toContain('edge-sr1');
    expect(html).toContain('edge-vr1');
    expect(html).toContain('«satisfy»');
    expect(html).toContain('«verify»');
    expect(html).toContain('Traceability diagram');
  });

  it('renders state machine states and their implementing blocks', () => {
    const html = renderTraceabilityDiagram({
      blocks: [{ id: 'b1', name: 'FSM', stereotype: 'block' }] as never,
      requirements: [],
      states: [
        { id: 's1', name: 'Idle', x: 0, y: 0, width: 100, height: 50, entry: '', during: '', exit: '', isActive: false, color: '#fff', parentId: null, children: [], priority: 0, isParallel: false, regionId: null, autostart: false },
        { id: 's2', name: 'Running', x: 0, y: 0, width: 100, height: 50, entry: '', during: '', exit: '', isActive: false, color: '#fff', parentId: null, children: [], priority: 0, isParallel: false, regionId: null, autostart: false },
      ],
      relationships: [],
      transitions: [
        { id: 't1', sourceId: 's1', targetId: 's2', condition: 'start', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 0 },
      ],
    });
    expect(html).toContain('Idle');
    expect(html).toContain('Running');
    expect(html).toContain('edge-t1');
  });

  it('renders empty figure when no data', () => {
    const html = renderTraceabilityDiagram({
      blocks: [],
      requirements: [],
      states: [],
      relationships: [],
      transitions: [],
    });
    expect(html).toContain('No traceability');
  });
});

describe('renderTraceabilityDiagram — deletion closure', () => {
  const model = {
    blocks: [
      { id: 'b1', name: 'Engine', stereotype: 'block', x: 0, y: 0, width: 100, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [] },
      { id: 'r1', name: 'Temp Limit', stereotype: 'requirement', reqId: 'REQ-001', x: 0, y: 0, width: 100, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [] },
    ],
    parts: [],
    connectors: [],
    relationships: [
      { id: 'rel-trace-1', sourceId: 'b1', targetId: 'r1', type: 'satisfy' as const, label: '' },
    ],
  };

  it('omits relationship from traceability, BDD, and requirements when requirement is deleted', () => {
    const afterDelete = cascadeDeleteReportElement(model, { kind: 'requirement', id: 'r1' });
    const source = toHierarchySource(createReportSnapshot(afterDelete));

    const traceHtml = renderTraceabilityDiagram({
      blocks: source.blocks,
      requirements: source.blocks.filter(b => b.stereotype === 'requirement'),
      states: [],
      relationships: source.relationships,
      transitions: [],
    });
    expect(traceHtml).not.toContain('edge-rel-trace-1');

    const bddHtml = renderBddDiagram({ blocks: source.blocks, relationships: source.relationships });
    expect(bddHtml).not.toContain('edge-rel-trace-1');

    const reqHtml = renderRequirementsDiagram({ blocks: source.blocks, relationships: source.relationships });
    expect(reqHtml).not.toContain('edge-rel-trace-1');
  });

  it('omits relationship from traceability, BDD, and requirements when source block is deleted', () => {
    const afterDelete = cascadeDeleteReportElement(model, { kind: 'block', id: 'b1' });
    const source = toHierarchySource(createReportSnapshot(afterDelete));

    const traceHtml = renderTraceabilityDiagram({
      blocks: source.blocks,
      requirements: source.blocks.filter(b => b.stereotype === 'requirement'),
      states: [],
      relationships: source.relationships,
      transitions: [],
    });
    expect(traceHtml).not.toContain('edge-rel-trace-1');

    const bddHtml = renderBddDiagram({ blocks: source.blocks, relationships: source.relationships });
    expect(bddHtml).not.toContain('edge-rel-trace-1');
  });
});
