import { describe, expect, it } from 'vitest';
import { BlockData, ConnectorData, PartData } from '../../types/sysml_types';
import { renderIbdDiagram } from './reportDiagrams';
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


