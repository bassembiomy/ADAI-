import { describe, expect, it } from 'vitest';
import type { VLabEdge, VLabNode } from './VLabWorkspaceTypes';
import { normalizeLegacyVLabGraph } from './vlabModelMigration';

const node = (id: string, type: string): VLabNode => ({
  id,
  position: { x: 0, y: 0 },
  data: { type },
});

describe('normalizeLegacyVLabGraph', () => {
  it('restores universal Frame ports and axes without replacing zero damping', () => {
    const legacy = {
      ...node('joint', 'universal_joint'),
      data: {
        type: 'universal_joint',
        params: { damping: 0 },
        ports: [
          { id: 'b', pos: 'left' },
          { id: 'f', pos: 'right' },
        ],
      },
    } as VLabNode;
    const result = normalizeLegacyVLabGraph([legacy], []);
    expect(
      result.nodes[0].data.ports?.find(
        (p: { id: string; domain?: string }) => p.id === 'b',
      )?.domain,
    ).toBe('Frame');
    expect(result.nodes[0].data.params).toMatchObject({
      damping: 0,
      axis1: { value: '[1 0 0]' },
      axis2: { value: '[0 1 0]' },
    });
    expect(normalizeLegacyVLabGraph(result.nodes, [])).toEqual(result);
    expect(legacy.data.ports).toHaveLength(2);
  });
  it('removes gas_properties nodes and their incident edges', () => {
    const nodes = [
      node('legacy', 'gas_properties'),
      node('source', 'gas_pressure_source'),
    ];
    const edges: VLabEdge[] = [
      { id: 'bad', source: 'source', target: 'legacy' },
    ];

    expect(normalizeLegacyVLabGraph(nodes, edges)).toEqual({
      nodes: [nodes[1]],
      edges: [],
    });
  });

  it('preserves unrelated data without mutating the input arrays', () => {
    const nodes = [
      node('source', 'gas_pressure_source'),
      node('sink', 'gas_reservoir'),
    ];
    const edges: VLabEdge[] = [
      { id: 'valid', source: 'source', target: 'sink' },
    ];
    const originalNodes = [...nodes];
    const originalEdges = [...edges];

    const result = normalizeLegacyVLabGraph(nodes, edges);

    expect(result).toEqual({ nodes, edges });
    expect(nodes).toEqual(originalNodes);
    expect(edges).toEqual(originalEdges);
  });
  // WP-19a: the revolute / prismatic / weld joints were rewritten for 6-vector Frames with typed outputs
  it('upgrades saved revolute and prismatic joints: ports refreshed, axis added, damping (incl. 0) and label kept', () => {
    for (const [type, damping] of [['revolute_joint', 0], ['prismatic_joint', { value: 2.5, unit: 'N-s/m' }]] as const) {
      const legacy = {
        ...node('joint', type),
        data: { type, label: 'Hinge', ports: [{ id: 'b', pos: 'left' }, { id: 'f', pos: 'right' }], params: { damping } },
      } as VLabNode;
      const result = normalizeLegacyVLabGraph([legacy], []);
      const upgraded = result.nodes[0];
      const ids = (upgraded.data.ports ?? []).map((p: { id: string }) => p.id);
      expect(ids.slice(0, 2)).toEqual(['b', 'f']); // existing port ids are never renamed
      expect(ids).toEqual(expect.arrayContaining(type === 'revolute_joint' ? ['q', 'w', 't_reac'] : ['x', 'v', 'tbx']));
      expect((upgraded.data.ports ?? []).find((p: { id: string }) => p.id === 'b')?.domain).toBe('Frame');
      expect(upgraded.data.params).toMatchObject({ damping, axis: { value: '[0 0 1]' } });
      expect(upgraded.data.label).toBe('Hinge');
      expect(normalizeLegacyVLabGraph(result.nodes, [])).toEqual(result);
    }
  });
  it('upgrades a saved weld joint: the dead stiffness is dropped and the reference pose params are added', () => {
    const legacy = {
      ...node('joint', 'weld_joint'),
      data: { type: 'weld_joint', ports: [{ id: 'b', pos: 'left' }, { id: 'f', pos: 'right' }], params: { stiffness: { value: 1e9, unit: 'N/m' } } },
    } as VLabNode;
    const result = normalizeLegacyVLabGraph([legacy], []);
    const params = result.nodes[0].data.params as Record<string, any>;
    expect(params).not.toHaveProperty('stiffness');
    expect(params).toMatchObject({ offset: { value: '[0 0 0]' }, rotation: { value: '[0 0 0]' } });
    expect((result.nodes[0].data.ports ?? []).map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining(['fx', 'tbx', 'pos_err', 'rot_err']));
    expect(normalizeLegacyVLabGraph(result.nodes, [])).toEqual(result);
    expect((legacy.data.params as Record<string, any>).stiffness).toBeDefined(); // the input is not mutated
  });
  it('upgrades saved spherical joints to Frame ports and ideal measurements', () => {
    const legacy = {
      ...node('joint', 'spherical_joint'),
      data: {
        type: 'spherical_joint',
        label: 'My joint',
        ports: [
          { id: 'b', pos: 'left' },
          { id: 'f', pos: 'right' },
        ],
        params: { damping: { value: 0.05, unit: 'N-m-s/rad' } },
      },
    } as VLabNode;
    const result = normalizeLegacyVLabGraph([legacy], []);
    const upgraded = result.nodes[0];
    expect(
      upgraded.data.ports?.find(
        (p: { id: string; domain?: string }) => p.id === 'b',
      )?.domain,
    ).toBe('Frame');
    expect(
      upgraded.data.ports?.find(
        (p: { id: string; domain?: string }) => p.id === 'f',
      )?.domain,
    ).toBe('Frame');
    expect(
      upgraded.data.ports?.find(
        (p: { id: string; domain?: string }) => p.id === 'f_reac',
      )?.domain,
    ).toBe('Physical');
    expect(upgraded.data.params?.damping).toBeUndefined();
    expect(upgraded.data.label).toBe('My joint');
    expect(legacy.data.ports).toHaveLength(2);
    expect(legacy.data.params?.damping).toBeDefined();
    expect(normalizeLegacyVLabGraph(result.nodes, [])).toEqual(result);
  });
});
