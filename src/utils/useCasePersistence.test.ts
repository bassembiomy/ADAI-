import { describe, it, expect } from 'vitest';
import {
  createDefaultUseCaseDiagram,
  toUseCaseRelationships,
  serializeUseCaseDiagram,
  updateDiagramInList,
} from './useCasePersistence';
import type { UseCaseDiagram, UseCaseNode } from '../types/usecase_types';

describe('useCasePersistence', () => {
  it('creates default use case diagram', () => {
    const diag = createDefaultUseCaseDiagram('d-test', 'Test Diagram');
    expect(diag.id).toBe('d-test');
    expect(diag.name).toBe('Test Diagram');
    expect(diag.nodes).toEqual([]);
    expect(diag.edges).toEqual([]);
  });

  it('converts raw reactflow edges to UseCaseRelationship and prunes dangling edges', () => {
    const nodes: UseCaseNode[] = [
      { id: 'node-1', type: 'actor', position: { x: 10, y: 20 }, data: { label: 'Driver' } },
      { id: 'node-2', type: 'useCase', position: { x: 100, y: 150 }, data: { label: 'Brake' } },
    ];

    const rawEdges = [
      {
        id: 'e-1',
        source: 'node-1',
        target: 'node-2',
        type: 'useCaseEdge',
        data: { type: 'association' },
      },
      {
        id: 'e-dangling',
        source: 'node-1',
        target: 'non-existent',
        type: 'useCaseEdge',
        data: { type: 'include' },
      },
    ];

    const baseDiagram: UseCaseDiagram = {
      id: 'd-1',
      name: 'Vehicle Control',
      nodes: [],
      edges: [],
    };

    const serialized = serializeUseCaseDiagram(baseDiagram, nodes, rawEdges);
    expect(serialized.nodes.length).toBe(2);
    expect(serialized.nodes[0].data.label).toBe('Driver');
    expect(serialized.edges.length).toBe(1);
    expect(serialized.edges[0].id).toBe('e-1');
    expect(serialized.edges[0].type).toBe('association');
  });

  it('updates diagram list preserving other diagrams', () => {
    const diag1: UseCaseDiagram = { id: 'd-1', name: 'Diag 1', nodes: [], edges: [] };
    const diag2: UseCaseDiagram = { id: 'd-2', name: 'Diag 2', nodes: [], edges: [] };
    const list = [diag1, diag2];

    const updatedDiag2: UseCaseDiagram = {
      ...diag2,
      nodes: [{ id: 'n-1', type: 'actor', position: { x: 0, y: 0 }, data: { label: 'Pilot' } }],
    };

    const nextList = updateDiagramInList(list, updatedDiag2);
    expect(nextList.length).toBe(2);
    expect(nextList[1].nodes.length).toBe(1);
    expect(nextList[1].nodes[0].data.label).toBe('Pilot');
    expect(nextList[0]).toBe(diag1);
  });

  it('appends diagram to list when not found', () => {
    const diag1: UseCaseDiagram = { id: 'd-1', name: 'Diag 1', nodes: [], edges: [] };
    const diagNew: UseCaseDiagram = { id: 'd-new', name: 'New Diag', nodes: [], edges: [] };

    const nextList = updateDiagramInList([diag1], diagNew);
    expect(nextList.length).toBe(2);
    expect(nextList[1].id).toBe('d-new');
  });
});
