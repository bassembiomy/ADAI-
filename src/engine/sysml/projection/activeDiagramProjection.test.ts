import { describe, it, expect } from 'vitest';
import { createEmptyRepository } from '../model';
import { fromRepository, type NormalizedSysmlStore } from '../normalizedStore';
import { projectActiveDiagram } from './activeDiagramProjection';
import type { BlockDefinition, SysmlRelationship, ModelDiagramDefinition } from '../model';
import type { DiagramPresentationInput } from '../presentationState';

function createTestBlock(id: string, name: string): BlockDefinition {
  return {
    id,
    name,
    kind: 'block',
    ownerId: 'model',
    namespace: ['model'],
    isAbstract: false,
    isLeaf: false,
    properties: [],
    ports: [],
    operations: [],
    constraints: [],
  };
}

describe('projectActiveDiagram', () => {
  function createTwoDiagramStore(): NormalizedSysmlStore {
    const repo = createEmptyRepository();

    const d1: ModelDiagramDefinition = {
      id: 'diag_1',
      name: 'Diagram 1',
      kind: 'diagram',
      ownerId: 'model',
      namespace: ['model'],
      diagramKind: 'bdd',
    };
    const d2: ModelDiagramDefinition = {
      id: 'diag_2',
      name: 'Diagram 2',
      kind: 'diagram',
      ownerId: 'model',
      namespace: ['model'],
      diagramKind: 'bdd',
    };

    repo.diagrams = { diag_1: d1, diag_2: d2 };

    const blkA = createTestBlock('blk_A', 'Block A');
    const blkB = createTestBlock('blk_B', 'Block B');
    const blkC = createTestBlock('blk_C', 'Block C');
    const blkD = createTestBlock('blk_D', 'Block D');

    repo.definitions = {
      blk_A: blkA,
      blk_B: blkB,
      blk_C: blkC,
      blk_D: blkD,
    };

    const rel1: SysmlRelationship = {
      id: 'rel_1',
      name: 'rel1',
      kind: 'association',
      sourceId: 'blk_A',
      targetId: 'blk_B',
    };
    const rel2: SysmlRelationship = {
      id: 'rel_2',
      name: 'rel2',
      kind: 'association',
      sourceId: 'blk_C',
      targetId: 'blk_D',
    };

    repo.relationships = {
      rel_1: rel1,
      rel_2: rel2,
    };

    const coordinates = {
      blk_A: { x: 10, y: 20 },
      blk_B: { x: 100, y: 200 },
      blk_C: { x: 300, y: 400 },
      blk_D: { x: 500, y: 600 },
    };

    const diagramPresentations: Record<string, DiagramPresentationInput> = {
      diag_1: {
        elementIds: ['blk_A', 'blk_B', 'rel_1'],
        presentations: {
          blk_A: { id: 'p_blk_A', diagramId: 'diag_1', semanticElementId: 'blk_A', bounds: { x: 15, y: 25, width: 160, height: 100 } },
          blk_B: { id: 'p_blk_B', diagramId: 'diag_1', semanticElementId: 'blk_B', bounds: { x: 105, y: 205, width: 160, height: 100 } },
        },
      },
      diag_2: {
        elementIds: ['blk_C', 'blk_D', 'rel_2'],
        presentations: {
          blk_C: { id: 'p_blk_C', diagramId: 'diag_2', semanticElementId: 'blk_C', bounds: { x: 305, y: 405, width: 160, height: 100 } },
          blk_D: { id: 'p_blk_D', diagramId: 'diag_2', semanticElementId: 'blk_D', bounds: { x: 505, y: 605, width: 160, height: 100 } },
        },
      },
    };

    return fromRepository(repo, coordinates, diagramPresentations);
  }

  it('projects only the active diagram elements, links, and presentations', () => {
    const store = createTwoDiagramStore();

    const proj1 = projectActiveDiagram(store, 'diag_1');
    expect(proj1.blocks.map(b => b.id)).toEqual(['blk_A', 'blk_B']);
    expect(proj1.relationships.map(r => r.id)).toEqual(['rel_1']);
    expect(proj1.blocks[0].x).toBe(15);
    expect(proj1.blocks[0].y).toBe(25);

    const proj2 = projectActiveDiagram(store, 'diag_2');
    expect(proj2.blocks.map(b => b.id)).toEqual(['blk_C', 'blk_D']);
    expect(proj2.relationships.map(r => r.id)).toEqual(['rel_2']);
    expect(proj2.blocks[0].x).toBe(305);
    expect(proj2.blocks[0].y).toBe(405);
  });

  it('exposes diagramElementIdsByDiagramId index on normalized store', () => {
    const store = createTwoDiagramStore();
    expect(store.diagramElementIdsByDiagramId).toBeDefined();
    expect(store.diagramElementIdsByDiagramId['diag_1']).toEqual(['blk_A', 'blk_B', 'rel_1']);
    expect(store.diagramElementIdsByDiagramId['diag_2']).toEqual(['blk_C', 'blk_D', 'rel_2']);
  });

  it('reuses unchanged entity projection objects across calls for stable rendering', () => {
    const store = createTwoDiagramStore();

    const proj1a = projectActiveDiagram(store, 'diag_1');
    const proj2 = projectActiveDiagram(store, 'diag_2');
    const proj1b = projectActiveDiagram(store, 'diag_1');

    // Same block instances preserved across diagram switches
    expect(proj1a.blocks[0]).toBe(proj1b.blocks[0]);
    expect(proj1a.blocks[1]).toBe(proj1b.blocks[1]);
    expect(proj1a.relationships[0]).toBe(proj1b.relationships[0]);
  });

  it('does not scan unrelated repository definitions when projecting active diagram', () => {
    const store = createTwoDiagramStore();

    // Add 10,000 unpresented blocks
    for (let i = 0; i < 10_000; i++) {
      const id = `unrelated_${i}`;
      store.definitions.set(id, createTestBlock(id, `Unrelated ${i}`));
      store.indexes.byId.set(id, { collection: 'definitions', id });
    }

    const start = performance.now();
    const proj = projectActiveDiagram(store, 'diag_1');
    const duration = performance.now() - start;

    expect(proj.blocks.length).toBe(2);
    expect(duration).toBeLessThan(15); // Fast indexed lookup, no 10k traversal
  });
});
