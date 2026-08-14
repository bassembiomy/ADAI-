import { describe, expect, it } from 'vitest';
import { BlockData, ConnectorData, PartData } from '../../types/sysml_types';
import { renderIbdDiagram } from './reportDiagrams';

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
});
