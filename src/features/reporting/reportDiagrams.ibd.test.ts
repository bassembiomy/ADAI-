import { describe, expect, it } from 'vitest';
import { BlockData, ConnectorData, PartData } from '../../types/sysml_types';
import { renderIbdDiagram } from './reportDiagrams';
import { figurePageFit } from './reportDiagramModel';
import { edgeNodeCollisions, figuresOf, labelCollisions, outsideViewBox, parseFigure } from './figureGeometry.testutil';
import { createReportSnapshot, toHierarchySource } from './reportSnapshot';

const blocks: BlockData[] = [
  {
    id: 'ctrl', name: 'Controller', stereotype: 'block', x: 0, y: 0, width: 160, height: 80,
    properties: [], operations: [], constraints: [], classes: [],
    ports: [{ id: 'p-in', name: 'sensorIn', type: 'Real', direction: 'in' } as never],
  } as BlockData,
  {
    id: 'act', name: 'Actuator', stereotype: 'block', x: 0, y: 0, width: 160, height: 80,
    properties: [], operations: [], constraints: [], classes: [],
    ports: [{ id: 'p-out', name: 'driveOut', type: 'Real', direction: 'out' } as never],
  } as BlockData,
];

const parts: PartData[] = [
  { id: 'part1', name: 'controller', blockId: 'sys', typeId: 'ctrl', x: 0, y: 0, width: 140, height: 70 } as PartData,
  { id: 'part2', name: 'actuator', blockId: 'sys', typeId: 'act', x: 300, y: 0, width: 140, height: 70 } as PartData,
];

const connectors: ConnectorData[] = [
  { id: 'c1', sourcePartId: 'part1', sourcePortId: 'p-in', targetPartId: 'part2', targetPortId: 'p-out', itemFlow: 'temperatureSignal' } as ConnectorData,
];

const contextBlock = {
  id: 'sys', name: 'ThermalSystem', stereotype: 'block', x: 0, y: 0, width: 400, height: 300,
  properties: [], operations: [], constraints: [], classes: [], ports: [],
} as unknown as BlockData;

describe('renderIbdDiagram', () => {
  it('renders the context frame, parts, ports, and connector item flow', () => {
    const html = renderIbdDiagram({ contextBlock, parts, connectors, blocks });
    expect(html).toContain('ibd [Block] ThermalSystem');
    expect(html).toContain('controller');
    expect(html).toContain('actuator');
    expect(html).toContain('sensorIn');
    expect(html).toContain('temperatureSignal');
    expect(html).toContain('report-figure-caption');
  });

  it('offsets parallel connectors so they do not coincide', () => {
    const parallel: ConnectorData[] = [
      ...connectors,
      { id: 'c2', sourcePartId: 'part1', sourcePortId: 'p-in', targetPartId: 'part2', targetPortId: 'p-out' } as ConnectorData,
    ];
    const html = renderIbdDiagram({ contextBlock, parts, connectors: parallel, blocks });
    const paths = [...html.matchAll(/<path id="edge-[^"]*" d="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('renders a formal empty figure when the context has no parts', () => {
    expect(renderIbdDiagram({ contextBlock, parts: [], connectors: [], blocks }))
      .toContain('No internal parts');
  });

  it('renders connectors between parts from different parent blocks', () => {
    const crossBlocks: BlockData[] = [
      { id: 'ctrl', name: 'Controller', stereotype: 'block', x: 0, y: 0, width: 160, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [{ id: 'p1', name: 'out', type: 'Real', direction: 'out' } as never] } as BlockData,
      { id: 'act', name: 'Actuator', stereotype: 'block', x: 0, y: 0, width: 160, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [{ id: 'p2', name: 'in', type: 'Real', direction: 'in' } as never] } as BlockData,
    ];
    const crossParts: PartData[] = [
      { id: 'cp1', name: 'ctrl_inst', blockId: 'otherBlock', typeId: 'ctrl', x: 0, y: 0, width: 140, height: 70 } as PartData,
      { id: 'cp2', name: 'act_inst', blockId: 'anotherBlock', typeId: 'act', x: 300, y: 0, width: 140, height: 70 } as PartData,
    ];
    const crossConns: ConnectorData[] = [
      { id: 'cc1', sourcePartId: 'cp1', sourcePortId: 'p1', targetPartId: 'cp2', targetPortId: 'p2', itemFlow: 'signal' } as ConnectorData,
    ];
    const html = renderIbdDiagram({ contextBlock, parts: crossParts, connectors: crossConns, blocks: crossBlocks });
    expect(html).toContain('edge-cc1');
    expect(html).toContain('signal');
  });

  it('falls back to part center anchor when port is not found', () => {
    const fallbackParts: PartData[] = [
      { id: 'fp1', name: 'part_a', blockId: 'sys', x: 0, y: 0, width: 140, height: 70 } as PartData,
      { id: 'fp2', name: 'part_b', blockId: 'sys', x: 300, y: 0, width: 140, height: 70 } as PartData,
    ];
    const fallbackConns: ConnectorData[] = [
      { id: 'fc1', sourcePartId: 'fp1', sourcePortId: 'unknown_p1', targetPartId: 'fp2', targetPortId: 'unknown_p2', itemFlow: 'fallback_flow' } as ConnectorData,
    ];
    const html = renderIbdDiagram({ contextBlock, parts: fallbackParts, connectors: fallbackConns, blocks: [] });
    expect(html).toContain('edge-fc1');
    expect(html).toContain('fallback_flow');
  });

  it('renders interactive double-click attributes for parts that have nested sub-parts', () => {
    const subParts: PartData[] = [
      { id: 'p1', name: 'ctrl', blockId: 'sys', typeId: 'ctrlBlock', x: 0, y: 0, width: 140, height: 70 } as PartData,
      { id: 'sp1', name: 'sub_chip', blockId: 'ctrlBlock', typeId: 'chipBlock', x: 0, y: 0, width: 100, height: 50 } as PartData,
    ];
    const ctrlBlock = { id: 'ctrlBlock', name: 'Controller', stereotype: 'block', ports: [] } as unknown as BlockData;
    const html = renderIbdDiagram({
      contextBlock,
      parts: subParts.filter(p => p.blockId === 'sys'),
      connectors: [],
      blocks: [contextBlock, ctrlBlock],
      allParts: subParts,
      containerId: 'diag-main',
    });
    expect(html).toContain('has-child-layer');
    expect(html).toContain('ondblclick="window.ADIA_DIAGRAM_NAV.drillDown(\'diag-main\', \'ibd-ctrlBlock\', \'Internal Sub-Structure · ctrl (Controller)\')"');
  });

  it('renders a connector only in the IBD context containing both parts', () => {
    const model = {
      blocks: [
        { id: 'context-a', name: 'ContextA', stereotype: 'block', x: 0, y: 0, width: 200, height: 100, properties: [], operations: [], constraints: [], classes: [], ports: [] } as BlockData,
        { id: 'context-b', name: 'ContextB', stereotype: 'block', x: 0, y: 0, width: 200, height: 100, properties: [], operations: [], constraints: [], classes: [], ports: [] } as BlockData,
      ],
      parts: [
        { id: 'p-a1', name: 'PartA1', blockId: 'context-a', x: 0, y: 0, width: 100, height: 50 } as PartData,
        { id: 'p-a2', name: 'PartA2', blockId: 'context-a', x: 150, y: 0, width: 100, height: 50 } as PartData,
        { id: 'p-b1', name: 'PartB1', blockId: 'context-b', x: 0, y: 0, width: 100, height: 50 } as PartData,
      ],
      relationships: [],
      connectors: [
        { id: 'context-a-conn', sourcePartId: 'p-a1', targetPartId: 'p-a2', sourcePortId: 'p1', targetPortId: 'p2' } as ConnectorData,
        { id: 'cross-context-conn', sourcePartId: 'p-a1', targetPartId: 'p-b1', sourcePortId: 'p1', targetPortId: 'p2' } as ConnectorData,
      ],
    };
    const source = toHierarchySource(createReportSnapshot(model));
    const contextA = source.blocks.find(b => b.id === 'context-a')!;
    const partsA = source.parts.filter(p => p.blockId === contextA.id);
    const connectorsA = source.connectors.filter(c => {
      const sourcePart = source.parts.find(p => p.id === c.sourcePartId);
      const targetPart = source.parts.find(p => p.id === c.targetPartId);
      return sourcePart?.blockId === contextA.id && targetPart?.blockId === contextA.id;
    });

    expect(renderIbdDiagram({ contextBlock: contextA, parts: partsA, connectors: connectorsA, blocks: source.blocks })).toContain('edge-context-a-conn');
    // If external connectors are passed in, renderIbdDiagram filters invalid endpoints
    expect(renderIbdDiagram({ contextBlock: contextA, parts: partsA, connectors: source.connectors, blocks: source.blocks })).not.toContain('edge-cross-context-conn');
  });
});



describe('renderIbdDiagram page fit', () => {
  const mkBlock = (id: string, name: string, ports: { id: string; name: string; direction: 'in' | 'out' | 'inout' }[]) =>
    ({ id, name, stereotype: 'block', x: 0, y: 0, width: 160, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: ports.map(p => ({ ...p, type: 'Real' })) }) as unknown as BlockData;
  const ctx = (ports: { id: string; name: string; direction: 'in' | 'out'; side?: 'left' | 'right' }[] = []) =>
    ({ ...contextBlock, ports: ports.map(p => ({ ...p, type: 'Real' })) }) as unknown as BlockData;
  const figureOf = (html: string) => {
    const figure = figuresOf(html)[0];
    const g = parseFigure(figure);
    return { figure, g, fit: figurePageFit(g.viewBox, Number(/data-min-font="([0-9.]+)"/.exec(figure)![1])) };
  };

  it('fits a 10-part / 20-connector IBD with ports legibly, without overlaps', () => {
    const blocks10 = Array.from({ length: 10 }, (_, i) => mkBlock(`b${i}`, `Module${i}Controller`, [
      { id: `b${i}-in1`, name: `supply${i}`, direction: 'in' }, { id: `b${i}-in2`, name: 'canBus', direction: 'in' },
      { id: `b${i}-out1`, name: 'status', direction: 'out' }, { id: `b${i}-out2`, name: `drive${i}`, direction: 'out' },
    ]));
    const parts10 = blocks10.map((b, i) => ({ id: `q${i}`, name: `module${i}`, blockId: 'sys', typeId: b.id, multiplicity: '1', x: 0, y: 0, width: 140, height: 70 }) as PartData);
    const conns: ConnectorData[] = [];
    for (let i = 0; i < 10; i++) {
      conns.push({ id: `k${i}a`, sourcePartId: `q${i}`, sourcePortId: `b${i}-out1`, targetPartId: `q${(i + 1) % 10}`, targetPortId: `b${(i + 1) % 10}-in1`, itemFlow: `flow${i}` } as ConnectorData);
      conns.push({ id: `k${i}b`, sourcePartId: `q${i}`, sourcePortId: `b${i}-out2`, targetPartId: `q${(i + 3) % 10}`, targetPortId: `b${(i + 3) % 10}-in2` } as ConnectorData);
    }
    const envPorts = [{ id: 'e1', name: 'KL30', direction: 'in' as const }, { id: 'e2', name: 'canH', direction: 'in' as const }, { id: 'e3', name: 'fan', direction: 'out' as const }];
    const html = renderIbdDiagram({ contextBlock: ctx(envPorts), parts: parts10, connectors: conns, blocks: blocks10 });
    const { g, fit } = figureOf(html);
    expect(html).toContain('10 parts, 20 connectors');
    expect(fit.legible).toBe(true);
    expect(fit.orientation).toBe('portrait');
    expect(edgeNodeCollisions(g)).toEqual([]);
    expect(labelCollisions(g)).toEqual([]);
    expect(outsideViewBox(g)).toEqual([]);
  });

  it('wraps a 7-part IBD with long names and no connectors into rows that print legibly in portrait', () => {
    const longBlocks = Array.from({ length: 7 }, (_, i) => mkBlock(`t${i}`, `ExtraordinarilyDescriptiveSubsystemType${i} with trailing words`, [
      { id: `t${i}-p`, name: 'interfaceSignal', direction: 'inout' },
    ]));
    const longParts = longBlocks.map((b, i) => ({ id: `lp${i}`, name: `component_with_a_long_instance_name_${i}`, blockId: 'sys', typeId: b.id, x: 0, y: 0, width: 140, height: 70 }) as PartData);
    const html = renderIbdDiagram({ contextBlock, parts: longParts, connectors: [], blocks: longBlocks });
    const { g, fit } = figureOf(html);
    expect(html).toContain('7 parts, 0 connectors');
    expect(fit.orientation).toBe('portrait');
    expect(fit.legible).toBe(true);
    expect(g.nodes).toHaveLength(7);
    g.nodes.forEach(n => expect(n.width).toBeLessThan(260));
    expect(labelCollisions(g)).toEqual([]);
    expect(outsideViewBox(g)).toEqual([]);
  });

  it('still accounts for connectors that are not drawn after wrapping into rows', () => {
    const outside = [{ id: 'x1', sourcePartId: 'part1', sourcePortId: 'p-in', targetPartId: 'ghost', targetPortId: 'nope' } as ConnectorData];
    const html = renderIbdDiagram({ contextBlock, parts, connectors: [...connectors, ...outside], blocks });
    expect(html).toContain('data-drawn-edges="1" data-omitted-edges="1"');
  });
});
