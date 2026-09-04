import { describe, it, expect } from 'vitest';
import { normalizeOpmModel, sanitizeCIdentifier } from '../schemaAdapter';
import { makeApplianceFixture, nodesWithNames } from '../fixtures';
import { DEFAULT_OPM_TARGET_SETTINGS } from '../executableTypes';
import type { AppNode, AppEdge } from '../../../components/entropy/EntropyTypes';

describe('OPM deterministic normalization', () => {
  it('normalizes independently of React Flow array order', () => {
    const fixture = makeApplianceFixture();
    const a = normalizeOpmModel(fixture.nodes, fixture.edges, fixture.config);
    const b = normalizeOpmModel([...fixture.nodes].reverse(), [...fixture.edges].reverse(), fixture.config);
    expect(b).toEqual(a);
  });

  it('sanitizes symbols and reports collisions at both sources', () => {
    const nodes = nodesWithNames('fan-speed', 'fan speed');
    const result = normalizeOpmModel(nodes, [], DEFAULT_OPM_TARGET_SETTINGS);
    expect(result.diagnostics.map(d => d.code)).toContain('OPM_SYMBOL_COLLISION');
    expect(result.diagnostics.filter(d => d.code === 'OPM_SYMBOL_COLLISION')).toHaveLength(2);
  });

  it('sanitizes identifiers with digit prefix and reserved C keywords', () => {
    expect(sanitizeCIdentifier('123abc')).toBe('_123abc');
    expect(sanitizeCIdentifier('while')).toBe('_while');
    expect(sanitizeCIdentifier('int')).toBe('_int');
    expect(sanitizeCIdentifier('opm_test')).toBe('u_opm_test');
    expect(sanitizeCIdentifier('OPM_STATE')).toBe('u_OPM_STATE');
    expect(sanitizeCIdentifier('my-custom-var')).toBe('my_custom_var');
  });

  it('reports missing endpoints on links', () => {
    const edge: AppEdge = {
      id: 'bad_edge',
      source: 'missing_source',
      target: 'missing_target',
      type: 'agent',
      data: { type: 'agent' },
    };
    const result = normalizeOpmModel([], [edge], DEFAULT_OPM_TARGET_SETTINGS);
    const missingErrors = result.diagnostics.filter(d => d.code === 'OPM_LINK_MISSING_ENDPOINT');
    expect(missingErrors).toHaveLength(2);
  });

  it('reports duplicate node and edge IDs', () => {
    const nodes: AppNode[] = [
      { id: 'dup_node', type: 'opmObject', position: { x: 0, y: 0 }, data: { name: 'A', type: 'object', physical: false } },
      { id: 'dup_node', type: 'opmObject', position: { x: 10, y: 10 }, data: { name: 'B', type: 'object', physical: false } },
    ];
    const edges: AppEdge[] = [
      { id: 'dup_edge', source: 'dup_node', target: 'dup_node', type: 'agent', data: { type: 'agent' } },
      { id: 'dup_edge', source: 'dup_node', target: 'dup_node', type: 'agent', data: { type: 'agent' } },
    ];
    const result = normalizeOpmModel(nodes, edges, DEFAULT_OPM_TARGET_SETTINGS);
    const dupErrors = result.diagnostics.filter(d => d.code === 'OPM_DUPLICATE_ID');
    expect(dupErrors.length).toBeGreaterThanOrEqual(2);
  });

  it('reports orphan states and parent mismatch', () => {
    const orphanState: AppNode = {
      id: 'st_orphan',
      type: 'opmState',
      position: { x: 0, y: 0 },
      data: { name: 'Orphan', type: 'state', physical: false },
    };
    const mismatchState: AppNode = {
      id: 'st_mismatch',
      type: 'opmState',
      parentId: 'obj_1',
      position: { x: 0, y: 0 },
      data: { name: 'Mismatch', type: 'state', physical: false, parentId: 'obj_2' },
    };
    const obj1: AppNode = {
      id: 'obj_1',
      type: 'opmObject',
      position: { x: 0, y: 0 },
      data: { name: 'Object 1', type: 'object', physical: false },
    };
    const result = normalizeOpmModel([orphanState, mismatchState, obj1], [], DEFAULT_OPM_TARGET_SETTINGS);
    expect(result.diagnostics.map(d => d.code)).toContain('OPM_STATE_ORPHAN');
    expect(result.diagnostics.map(d => d.code)).toContain('OPM_STATE_PARENT_MISMATCH');
  });

  it('freezes normalized compilation input tables', () => {
    const fixture = makeApplianceFixture();
    const result = normalizeOpmModel(fixture.nodes, fixture.edges, fixture.config);
    expect(result.input).toBeDefined();
    expect(Object.isFrozen(result.input)).toBe(true);
    expect(Object.isFrozen(result.input!.objects)).toBe(true);
    expect(Object.isFrozen(result.input!.states)).toBe(true);
    expect(Object.isFrozen(result.input!.processes)).toBe(true);
    expect(Object.isFrozen(result.input!.links)).toBe(true);
  });
});

describe('OPM compiler-boundary gates: graph tables (RED)', () => {
  it('rejects duplicate event ids', () => {
    const fixture = makeApplianceFixture();
    fixture.config.events.push({ id: 'ev_start', displayName: 'Start Again', cIdentifier: 'ev_start_again' });
    const result = normalizeOpmModel(fixture.nodes, fixture.edges, fixture.config);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'OPM_DUPLICATE_EVENT',
        source: expect.objectContaining({
          propertyPath: 'events[3].id',
        }),
      }),
    );
  });

  it('rejects duplicate enum members', () => {
    const fixture = makeApplianceFixture();
    fixture.config.enums[0].members.push(
      { id: 'mode_idle', displayName: 'Idle Again', cIdentifier: 'OPM_MODE_IDLE_AGAIN', value: 9 },
    );
    const result = normalizeOpmModel(fixture.nodes, fixture.edges, fixture.config);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'OPM_DUPLICATE_ENUM_MEMBER',
        source: expect.objectContaining({
          propertyPath: 'enums[0].members[3].id',
        }),
      }),
    );
  });

  it('rejects a hostile attribute C identifier', () => {
    const fixture = makeApplianceFixture();
    (fixture.nodes[0].data as any).objectExecution.attributes[0].cIdentifier = 'while';
    const result = normalizeOpmModel(fixture.nodes, fixture.edges, fixture.config);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'OPM_INVALID_C_IDENTIFIER',
        source: expect.objectContaining({
          elementId: 'obj_boiler',
          propertyPath: 'objectExecution.attributes[0].cIdentifier',
        }),
      }),
    );
  });

  it.each(['aggregation', 'generalization', 'exhibition', 'satisfies', 'verifies'] as const)(
    'accepts valid requirement structural link %s without errors',
    linkType => {
      const fixture = makeApplianceFixture();
      fixture.edges.push({
        id: `edge_struct_${linkType}`,
        source: 'obj_boiler',
        target: 'proc_heat',
        type: linkType as string,
        data: { type: linkType },
      } as unknown as AppEdge);
      const result = normalizeOpmModel(fixture.nodes, fixture.edges, fixture.config);
      expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    },
  );

  it('rejects a reversed procedural link direction', () => {
    const fixture = makeApplianceFixture();
    const effect = fixture.edges.find(e => e.id === 'edge_heat_effect')!;
    effect.source = 'obj_boiler';
    effect.target = 'proc_heat';
    const result = normalizeOpmModel(fixture.nodes, fixture.edges, fixture.config);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'OPM_INVALID_LINK_DIRECTION',
        source: expect.objectContaining({ elementId: 'edge_heat_effect', propertyPath: 'source' }),
      }),
    );
  });
});

