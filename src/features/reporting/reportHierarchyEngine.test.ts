import { describe, expect, it } from 'vitest';
import { buildReportHierarchy, generateDiagramScript, renderInteractiveDiagramHierarchy } from './reportHierarchyEngine';
import type { BlockData, PartData, ConnectorData, RelationshipData } from '../../types/sysml_types';
import type { StateData, Layer, TransitionData, JunctionData } from '../../types/sm_types';
import { cascadeDeleteReportElement } from '../../services/reportModelConsistency';
import { createReportSnapshot, toHierarchySource } from './reportSnapshot';

describe('reportHierarchyEngine', () => {
  const blocks: BlockData[] = [
    {
      id: 'b-sys', name: 'ThermalSystem', stereotype: 'block', x: 0, y: 0, width: 200, height: 100,
      properties: [], operations: [], constraints: [], classes: [], ports: [{ id: 'p-in', name: 'powerIn', type: 'Real' } as any],
    } as BlockData,
    {
      id: 'b-ctrl', name: 'Controller', stereotype: 'block', x: 0, y: 0, width: 160, height: 80,
      properties: [], operations: [], constraints: [], classes: [], ports: [{ id: 'p-sig', name: 'cmdOut', type: 'Real' } as any],
    } as BlockData,
    {
      id: 'b-act', name: 'Actuator', stereotype: 'block', x: 0, y: 0, width: 160, height: 80,
      properties: [], operations: [], constraints: [], classes: [], ports: [{ id: 'p-drive', name: 'driveIn', type: 'Real' } as any],
    } as BlockData,
  ];

  const parts: PartData[] = [
    { id: 'part-ctrl', name: 'ctrl', blockId: 'b-sys', typeId: 'b-ctrl', x: 50, y: 50, width: 140, height: 70 } as PartData,
    { id: 'part-act', name: 'actuator', blockId: 'b-sys', typeId: 'b-act', x: 250, y: 50, width: 140, height: 70 } as PartData,
    { id: 'subpart-pid', name: 'pidUnit', blockId: 'b-ctrl', typeId: 'b-act', x: 50, y: 50, width: 120, height: 60 } as PartData,
  ];

  const connectors: ConnectorData[] = [
    { id: 'c1', sourcePartId: 'part-ctrl', sourcePortId: 'p-sig', targetPartId: 'part-act', targetPortId: 'p-drive', itemFlow: 'ControlSignal' } as ConnectorData,
  ];

  const relationships: RelationshipData[] = [
    { id: 'r1', sourceId: 'b-sys', targetId: 'b-ctrl', type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '1' } as RelationshipData,
    { id: 'r2', sourceId: 'b-sys', targetId: 'b-act', type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '1' } as RelationshipData,
  ];

  const states: StateData[] = [
    { id: 's-root', name: 'Operational', parentId: 'root', children: ['s-sub1', 's-sub2'], x: 0, y: 0, width: 200, height: 120 } as unknown as StateData,
    { id: 's-sub1', name: 'Heating', parentId: 'layer-sub', children: [], x: 20, y: 40, width: 100, height: 60 } as unknown as StateData,
    { id: 's-sub2', name: 'Cooling', parentId: 'layer-sub', children: [], x: 140, y: 40, width: 100, height: 60 } as unknown as StateData,
  ];

  const layers: Layer[] = [
    { id: 'root', name: 'Root Layer', parentStateId: null, stateIds: ['s-root'], transitionIds: [], junctionIds: [] },
    { id: 'layer-sub', name: 'Operational Layer', parentStateId: 's-root', stateIds: ['s-sub1', 's-sub2'], transitionIds: ['t1'], junctionIds: [] },
  ];

  const transitions: TransitionData[] = [
    { id: 't1', sourceId: 's-sub1', targetId: 's-sub2', condition: 'temp > 80', action: 'fan = 1' } as TransitionData,
  ];

  const junctions: JunctionData[] = [];

  it('builds registry of drillable layers for BDD blocks, IBD parts, and States', () => {
    const hierarchy = buildReportHierarchy({
      blocks,
      parts,
      connectors,
      relationships,
      states,
      layers,
      transitions,
      junctions,
    });

    expect(hierarchy.hasChildLayer('b-sys')).toBe(true);
    expect(hierarchy.getChildLayerType('b-sys')).toBe('ibd');
    expect(hierarchy.getChildLayerId('b-sys')).toBe('ibd-b-sys');

    expect(hierarchy.hasChildLayer('part-ctrl')).toBe(true);
    expect(hierarchy.getChildLayerType('part-ctrl')).toBe('ibd');
    expect(hierarchy.getChildLayerId('part-ctrl')).toBe('ibd-b-ctrl');

    expect(hierarchy.hasChildLayer('s-root')).toBe(true);
    expect(hierarchy.getChildLayerType('s-root')).toBe('statemachine');
    expect(hierarchy.getChildLayerId('s-root')).toBe('sm-layer-sub');
  });

  it('generates self-contained interactive JavaScript runtime string', () => {
    const hierarchy = buildReportHierarchy({
      blocks,
      parts,
      connectors,
      relationships,
      states,
      layers,
      transitions,
      junctions,
    });

    const script = generateDiagramScript(hierarchy);
    expect(script).toContain('window.ADIA_DIAGRAM_NAV');
    expect(script).toContain('drillDown');
    expect(script).toContain('navBack');
    expect(script).toContain('zoomDiagram');
  });

  it('renders interactive container with root BDD, child IBD views, breadcrumbs and script', () => {
    const html = renderInteractiveDiagramHierarchy({
      blocks,
      parts,
      connectors,
      relationships,
      states,
      layers,
      transitions,
      junctions,
    }, { containerId: 'test-diag-1', title: 'System Architecture' });
    expect(html).toContain('id="test-diag-1"');
    expect(html).toContain('id="bc-test-diag-1"');
    expect(html).toContain('id="layer-bdd-root"');
    expect(html).toContain('id="layer-ibd-b-sys"');
    expect(html).toContain('ADIA_DIAGRAM_NAV.initContainer');
    expect(html).toContain('ThermalSystem');
    expect(html).toContain('ctrl');
  });

  it('omits nested IBD layer and connectors when parent block is cascade deleted', () => {
    const model = {
      blocks,
      parts,
      connectors,
      relationships,
      states,
      layers,
      transitions,
      junctions,
    };
    const updated = cascadeDeleteReportElement(model, { kind: 'block', id: 'b-sys' });
    const source = toHierarchySource(createReportSnapshot(updated));
    const html = renderInteractiveDiagramHierarchy(source, { containerId: 'test-diag-del' });

    expect(html).not.toContain('id="layer-ibd-b-sys"');
    expect(html).not.toContain('edge-c1');
  });
});

