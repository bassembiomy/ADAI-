import { describe, it, expect } from 'vitest';
import { createEmptyRepository } from '../model';
import { fromRepository, projectNormalizedDiagram, type NormalizedSysmlStore } from '../normalizedStore';
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

  it('looks up referenced block types by identity without projecting unrelated definitions', () => {
    const store = createTwoDiagramStore();
    const lookup = projectNormalizedDiagram(store, undefined, ['blk_C']);
    expect(lookup.blocks.map(block => block.id)).toEqual(['blk_C']);
    expect(projectActiveDiagram(store, 'diag_1').blocks.map(block => block.id)).toEqual(['blk_A', 'blk_B']);
  });
  it.each(['packageImport', 'elementImport', 'packageMerge', 'conform', 'expose'] as const)('keeps the %s relationship kind in the active canvas projection', kind => {
    const repo = createEmptyRepository();
    repo.packages.source = { id: 'source', name: 'Source', kind: 'package', ownerId: 'model', namespace: [] };
    repo.packages.target = { id: 'target', name: 'Target', kind: 'package', ownerId: 'model', namespace: [] };
    repo.relationships.link = { id: 'link', kind, sourceId: 'source', targetId: 'target' };
    const store = fromRepository(repo, {}, { packageDiagram: { elementIds: ['source', 'target', 'link'], presentations: {} } });
    expect(projectActiveDiagram(store, 'packageDiagram').relationships[0].type).toBe(kind);
  });
  it('includes the owning Block frame of an IBD without displaying the Part type as a Block', () => {
    const repo = createEmptyRepository();
    repo.definitions.system = createTestBlock('system', 'System');
    repo.definitions.component = createTestBlock('component', 'Component');
    repo.diagrams.ibd = { id: 'ibd', name: 'IBD', kind: 'diagram', diagramKind: 'ibd', ownerId: 'system', contextElementId: 'system', namespace: [] };
    const store = fromRepository(repo, {}, { ibd: { elementIds: [], presentations: {} } });
    expect(projectActiveDiagram(store, 'ibd').blocks.map(block => block.id)).toEqual(['system']);
  });

  it('projects a presented Use Case and preserves its Satisfy relation on Requirements', () => {
    const repo = createEmptyRepository();
    repo.useCases.drive = { id: 'drive', name: 'Drive', kind: 'useCase', ownerId: 'model', namespace: [], extensionPointIds: [], behaviorArtifactIds: [] };
    repo.requirements.req = { id: 'req', name: 'Requirement', kind: 'requirement', namespace: [], ownerId: 'model', requirementId: 'REQ-1', text: 'Drive', status: 'draft', version: '1' };
    repo.relationships.satisfy = { id: 'satisfy', kind: 'useCaseSatisfy', sourceId: 'drive', targetId: 'req' };
    const store = fromRepository(repo, {}, { reqDiagram: { elementIds: ['drive', 'req', 'satisfy'], presentations: {} } });
    const view = projectActiveDiagram(store, 'reqDiagram');
    expect(view.blocks.find(block => block.id === 'drive')).toMatchObject({ stereotype: 'useCase', name: 'Drive' });
    expect(view.relationships.find(link => link.id === 'satisfy')).toMatchObject({ type: 'satisfy' });
  });
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
