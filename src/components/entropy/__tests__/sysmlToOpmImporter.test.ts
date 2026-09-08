import { describe, test, expect } from 'vitest';
import { importSysmlToOpm } from '../SysmlToOpmImporter';
import type { SysMLDiagramState } from '../../../types/sysml_types';

const sample: SysMLDiagramState = {
  blocks: [
    { id: 'b1', name: 'Air_Fryer', stereotype: 'block', x: 0, y: 0, width: 120, height: 60,
      properties: [], operations: [], constraints: [], classes: [], ports: [] },
    { id: 'b2', name: 'Heater', stereotype: 'block', x: 0, y: 0, width: 120, height: 60,
      properties: [], operations: [], constraints: [], classes: [], ports: [] },
  ],
  ports: [],
  parts: [],
  connectors: [],
  requirements: [
    { id: 'r1', name: 'Heat_Quickly', stereotype: 'requirement', x: 0, y: 0, width: 120, height: 60,
      properties: [], operations: [], constraints: [], classes: [], ports: [],
      reqId: 'REQ-01', description: 'Reach 200C in under 5 minutes' },
  ],
  relations: [
    { id: 'rel1', sourceId: 'b1', targetId: 'b2', type: 'composition', label: '' },
    { id: 'rel2', sourceId: 'r1', targetId: 'b2', type: 'satisfy', label: '' },
    { id: 'rel3', sourceId: 'b2', targetId: 'b1', type: 'generalization', label: '' },
  ],
};

describe('SysmlToOpmImporter', () => {
  test('converts blocks to objects and requirements to requirement nodes', () => {
    const { nodes, errors } = { ...importSysmlToOpm(sample), errors: [] as string[] };
    expect(nodes.find((n: any) => n.data.name === 'Air_Fryer')?.data.type).toBe('object');
    const r = nodes.find((n: any) => n.data.name === 'Heat_Quickly');
    expect(r?.data.type).toBe('requirement');
    expect((r?.data as any).requirementText).toBe('Reach 200C in under 5 minutes');
    expect(errors).toHaveLength(0);
  });

  test('projects composition as explicitly lossy aggregation while preserving its SysML identity', () => {
    const { edges, diagnostics } = importSysmlToOpm(sample);
    const types = edges.map((e: any) => [e.data?.type, e.source, e.target]);
    expect(types).toContainEqual(['aggregation', 'b1', 'b2']);
    expect(types).toContainEqual(['satisfies', 'r1', 'b2']);
    expect(types).toContainEqual(['generalization', 'b1', 'b2']);
    expect(edges.find(edge => edge.data?.sysmlRelationId === 'rel1')?.data).toMatchObject({
      sysmlMappingStatus: 'conceptual-only',
      sysmlSourceKind: 'composition',
    });
    expect(diagnostics.map(diagnostic => diagnostic.code)).toContain('OPM_COMPOSITION_OWNERSHIP_LOSS');
  });

  test('warns about unmapped relationship types instead of dropping them silently', () => {
    const withAllocation: SysMLDiagramState = {
      ...sample,
      relations: [{ id: 'x', sourceId: 'b1', targetId: 'b2', type: 'allocation', label: '' }],
    };
    const { edges, warnings } = importSysmlToOpm(withAllocation);
    expect(edges).toHaveLength(0);
    expect(warnings.some((w: any) => w.includes('allocation'))).toBe(true);
  });

  test('preserves explicit SysML mapping status for connectors and unsupported relations', () => {
    const withConnectors: SysMLDiagramState = {
      ...sample,
      connectors: [
        { id: 'c1', label: 'pipe', sourcePortId: 'p1', targetPortId: 'p2', sourcePartId: 'b1', targetPartId: 'b2' },
      ],
      relations: [
        { id: 'rel_alloc', sourceId: 'b1', targetId: 'b2', type: 'allocation', label: '' },
      ],
    };
    const result = importSysmlToOpm(withConnectors);
    expect(result.connectorMappings).toBeDefined();
    expect(result.connectorMappings.some((m: any) => m.sourceConnectorId === 'c1' && m.status === 'unresolved')).toBe(true);
    expect(result.connectorMappings.some((m: any) => m.sourceConnectorId === 'rel_alloc' && m.status === 'unsupported')).toBe(true);
  });
});
