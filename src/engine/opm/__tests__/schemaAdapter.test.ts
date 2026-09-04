import { describe, it, expect } from 'vitest';
import {
  adaptOpmDiagram,
  withExecutableDefaults,
} from '../schemaAdapter';
import { DEFAULT_OPM_TARGET_SETTINGS } from '../executableTypes';
import type { AppNode, AppEdge } from '../../../components/entropy/EntropyTypes';

const legacyNodes: AppNode[] = [
  {
    id: 'obj-1',
    type: 'opmObject',
    position: { x: 0, y: 0 },
    data: {
      name: 'Boiler',
      type: 'object',
      physical: true,
      states: [
        { id: 'st-1', name: 'off', isActive: false, isInitial: true },
        { id: 'st-2', name: 'on', isActive: false },
      ],
      attributes: [{ key: 'rating', value: '5 kW' }],
    },
  },
  {
    id: 'proc-1',
    type: 'opmProcess',
    position: { x: 220, y: 0 },
    data: { name: 'Heat Water', type: 'process', physical: false },
  },
];

const legacyEdges: AppEdge[] = [
  {
    id: 'edge-1',
    source: 'proc-1',
    target: 'obj-1',
    type: 'agent',
    data: { type: 'agent', label: 'agent' },
  },
];

describe('OPM executable schema adapter', () => {
  it('keeps a legacy conceptual diagram valid and disabled', () => {
    const result = adaptOpmDiagram(legacyNodes, legacyEdges, DEFAULT_OPM_TARGET_SETTINGS);
    expect(result.model.executionEnabled).toBe(false);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });

  it('round-trips executable metadata without changing OPL fields', () => {
    const upgraded = withExecutableDefaults(legacyNodes, legacyEdges);
    upgraded.nodes[0].data.objectExecution!.attributes.push({
      id: 'temperature', displayName: 'Temperature', cIdentifier: 'temperature',
      type: { kind: 'float32' }, initialValue: 20, access: 'readWrite', persistent: false,
    });
    expect(JSON.parse(JSON.stringify(upgraded)).nodes[0].data.objectExecution?.attributes[0].id)
      .toBe('temperature');
    expect(upgraded.nodes[0].data.name).toBe(legacyNodes[0].data.name);
  });

  it('does not mutate its inputs when upgrading or adapting', () => {
    const upgraded = withExecutableDefaults(legacyNodes, legacyEdges);
    upgraded.nodes[0].data.objectExecution!.attributes.push({
      id: 'x', displayName: 'X', cIdentifier: 'x',
      type: { kind: 'int32' }, initialValue: 0, access: 'readWrite', persistent: false,
    });
    expect(legacyNodes[0].data.objectExecution).toBeUndefined();
    expect(legacyEdges[0].data.linkExecution).toBeUndefined();
    expect(legacyNodes[0].data.states).toHaveLength(2);

    const adapted = adaptOpmDiagram(legacyNodes, legacyEdges, DEFAULT_OPM_TARGET_SETTINGS);
    expect(legacyNodes[0].data.objectExecution).toBeUndefined();
    expect(adapted.model.nodes).not.toBe(legacyNodes);
  });

  it('creates defaults for objects, processes, states and links on explicit enable', () => {
    const upgraded = withExecutableDefaults(legacyNodes, legacyEdges);
    expect(upgraded.nodes[0].data.objectExecution).toMatchObject({ enabled: true, attributes: [] });
    expect(upgraded.nodes[1].data.processExecution).toMatchObject({ enabled: true, assignments: [] });
    expect(upgraded.edges[0].data.linkExecution).toMatchObject({ enabled: true, guard: '' });
  });

  it('preserves each execution object byte-for-byte through JSON serialization', () => {
    const upgraded = withExecutableDefaults(legacyNodes, legacyEdges);
    upgraded.nodes[0].data.objectExecution!.attributes.push({
      id: 'temperature', displayName: 'Temperature', cIdentifier: 'temperature',
      type: { kind: 'float32' }, initialValue: 20, access: 'readWrite', persistent: false,
    });
    upgraded.nodes[1].data.processExecution!.assignments.push({
      id: 'a-1', target: 'temperature', operator: '=', expression: 'temperature + 1', enabled: true,
    });

    // Same persistence shape used by project save/load: entropy.json / unified project
    const serialized = JSON.stringify({ entropyNodes: upgraded.nodes, entropyEdges: upgraded.edges });
    const parsed = JSON.parse(serialized);

    expect(JSON.stringify(parsed.entropyNodes[0].data.objectExecution))
      .toBe(JSON.stringify(upgraded.nodes[0].data.objectExecution));
    expect(JSON.stringify(parsed.entropyNodes[1].data.processExecution))
      .toBe(JSON.stringify(upgraded.nodes[1].data.processExecution));
    expect(JSON.stringify(parsed.entropyEdges[0].data.linkExecution))
      .toBe(JSON.stringify(upgraded.edges[0].data.linkExecution));
    // Legacy OPL fields survive untouched alongside the execution metadata
    expect(JSON.stringify(parsed.entropyNodes[0].data.states))
      .toBe(JSON.stringify(legacyNodes[0].data.states));
    expect(JSON.stringify(parsed.entropyNodes[0].data.attributes))
      .toBe(JSON.stringify(legacyNodes[0].data.attributes));
  });

  it('reports executionEnabled with no errors for an enabled diagram', () => {
    const upgraded = withExecutableDefaults(legacyNodes, legacyEdges);
    upgraded.nodes[0].data.objectExecution!.attributes.push({
      id: 'temperature', displayName: 'Temperature', cIdentifier: 'temperature',
      type: { kind: 'float32' }, initialValue: 20, access: 'readWrite', persistent: false,
    });
    const result = adaptOpmDiagram(upgraded.nodes, upgraded.edges, DEFAULT_OPM_TARGET_SETTINGS);
    expect(result.model.executionEnabled).toBe(true);
    expect(result.model.settings).toEqual(DEFAULT_OPM_TARGET_SETTINGS);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });

  it('reports an error for a duplicate attribute cIdentifier', () => {
    const upgraded = withExecutableDefaults(legacyNodes, legacyEdges);
    const attributes = upgraded.nodes[0].data.objectExecution!.attributes;
    attributes.push({
      id: 'a', displayName: 'A', cIdentifier: 'clash',
      type: { kind: 'int32' }, initialValue: 0, access: 'readWrite', persistent: false,
    });
    attributes.push({
      id: 'b', displayName: 'B', cIdentifier: 'clash',
      type: { kind: 'int32' }, initialValue: 0, access: 'readWrite', persistent: false,
    });
    const result = adaptOpmDiagram(upgraded.nodes, upgraded.edges, DEFAULT_OPM_TARGET_SETTINGS);
    const errors = result.diagnostics.filter(d => d.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('OPM_DUPLICATE_C_IDENTIFIER');
    expect(errors[0].source.elementId).toBe('obj-1');
  });
});
