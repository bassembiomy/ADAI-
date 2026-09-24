import { describe, expect, it } from 'vitest';
import {
  executeDisplayExistingElement,
  executeRemovePresentation,
  executeMovePresentation,
  executeResizePresentation,
  executeDeleteModelElement,
  migrateV3PresentationsToV4,
} from './presentationCommands';
import {
  createEmptyRepositoryV4,
  addSemanticElementV4,
  type Block,
  type Diagram,
} from '../domain';

describe('Repository-Owned Presentations and Presentation Commands', () => {
  it('displays one Block on two diagrams with one definition and two distinct presentations', () => {
    const repo = createEmptyRepositoryV4();

    const block: Block = {
      id: 'blk-motor',
      name: 'ElectricMotor',
      metaclass: 'Block',
      namespace: [],
      ownerId: null,
    };
    addSemanticElementV4(repo, block);

    const diagram1: Diagram = {
      id: 'diag-bdd-overview',
      name: 'System BDD',
      metaclass: 'Diagram',
      diagramKind: 'bdd',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: [],
    };
    const diagram2: Diagram = {
      id: 'diag-bdd-powertrain',
      name: 'Powertrain BDD',
      metaclass: 'Diagram',
      diagramKind: 'bdd',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: [],
    };
    addSemanticElementV4(repo, diagram1);
    addSemanticElementV4(repo, diagram2);

    const pres1 = executeDisplayExistingElement(repo, {
      type: 'DisplayExistingElement',
      diagramId: 'diag-bdd-overview',
      semanticElementId: 'blk-motor',
      bounds: { x: 50, y: 50, width: 180, height: 100 },
    });

    const pres2 = executeDisplayExistingElement(repo, {
      type: 'DisplayExistingElement',
      diagramId: 'diag-bdd-powertrain',
      semanticElementId: 'blk-motor',
      bounds: { x: 300, y: 200, width: 220, height: 140 },
    });

    // Exactly ONE semantic element definition in the repository
    expect(repo.elements['blk-motor']).toBeDefined();
    expect(Object.values(repo.elements).filter(e => e.id === 'blk-motor')).toHaveLength(1);

    // Two presentations on different diagrams with independent coordinates
    expect(pres1.id).not.toBe(pres2.id);
    expect(pres1.diagramId).toBe('diag-bdd-overview');
    expect(pres2.diagramId).toBe('diag-bdd-powertrain');
    expect(repo.presentations[pres1.id].bounds.x).toBe(50);
    expect(repo.presentations[pres2.id].bounds.x).toBe(300);

    expect(repo.indexes.byDiagram['diag-bdd-overview']).toContain(pres1.id);
    expect(repo.indexes.byDiagram['diag-bdd-powertrain']).toContain(pres2.id);
  });

  it('RemovePresentation removes presentation but preserves the semantic element', () => {
    const repo = createEmptyRepositoryV4();
    const block: Block = {
      id: 'blk-battery',
      name: 'Battery',
      metaclass: 'Block',
      namespace: [],
      ownerId: null,
    };
    addSemanticElementV4(repo, block);

    const diagram: Diagram = {
      id: 'diag-1',
      name: 'BDD 1',
      metaclass: 'Diagram',
      diagramKind: 'bdd',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: [],
    };
    addSemanticElementV4(repo, diagram);

    const pres = executeDisplayExistingElement(repo, {
      type: 'DisplayExistingElement',
      diagramId: 'diag-1',
      semanticElementId: 'blk-battery',
      bounds: { x: 10, y: 10, width: 100, height: 80 },
    });

    expect(repo.presentations[pres.id]).toBeDefined();

    // Remove presentation
    const result = executeRemovePresentation(repo, {
      type: 'RemovePresentation',
      presentationId: pres.id,
    });

    expect(result.removedPresentation.id).toBe(pres.id);
    expect(repo.presentations[pres.id]).toBeUndefined();
    expect(repo.indexes.byDiagram['diag-1']).not.toContain(pres.id);

    // Crucial: The semantic element definition MUST still exist!
    expect(repo.elements['blk-battery']).toBeDefined();
    expect(repo.elements['blk-battery'].name).toBe('Battery');
  });

  it('DeleteModelElement deletes the semantic element and cascades removal of all presentations', () => {
    const repo = createEmptyRepositoryV4();
    const block: Block = {
      id: 'blk-inverter',
      name: 'Inverter',
      metaclass: 'Block',
      namespace: [],
      ownerId: null,
    };
    addSemanticElementV4(repo, block);

    const diagram1: Diagram = {
      id: 'diag-1',
      name: 'D1',
      metaclass: 'Diagram',
      diagramKind: 'bdd',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: [],
    };
    const diagram2: Diagram = {
      id: 'diag-2',
      name: 'D2',
      metaclass: 'Diagram',
      diagramKind: 'bdd',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: [],
    };
    addSemanticElementV4(repo, diagram1);
    addSemanticElementV4(repo, diagram2);

    const pres1 = executeDisplayExistingElement(repo, {
      type: 'DisplayExistingElement',
      diagramId: 'diag-1',
      semanticElementId: 'blk-inverter',
    });
    const pres2 = executeDisplayExistingElement(repo, {
      type: 'DisplayExistingElement',
      diagramId: 'diag-2',
      semanticElementId: 'blk-inverter',
    });

    const impact = executeDeleteModelElement(repo, {
      type: 'DeleteModelElement',
      semanticElementId: 'blk-inverter',
    });

    expect(impact.deletedElement.id).toBe('blk-inverter');
    expect(impact.removedPresentations.map(p => p.id)).toEqual(expect.arrayContaining([pres1.id, pres2.id]));

    expect(repo.elements['blk-inverter']).toBeUndefined();
    expect(repo.presentations[pres1.id]).toBeUndefined();
    expect(repo.presentations[pres2.id]).toBeUndefined();
  });

  it('MovePresentation and ResizePresentation update geometric bounds without mutating semantics', () => {
    const repo = createEmptyRepositoryV4();
    const block: Block = {
      id: 'blk-wheel',
      name: 'Wheel',
      metaclass: 'Block',
      namespace: [],
      ownerId: null,
    };
    addSemanticElementV4(repo, block);

    const diagram: Diagram = {
      id: 'diag-w',
      name: 'Wheel D',
      metaclass: 'Diagram',
      diagramKind: 'bdd',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: [],
    };
    addSemanticElementV4(repo, diagram);

    const pres = executeDisplayExistingElement(repo, {
      type: 'DisplayExistingElement',
      diagramId: 'diag-w',
      semanticElementId: 'blk-wheel',
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    });

    executeMovePresentation(repo, {
      type: 'MovePresentation',
      presentationId: pres.id,
      x: 120,
      y: 240,
    });
    expect(repo.presentations[pres.id].bounds.x).toBe(120);
    expect(repo.presentations[pres.id].bounds.y).toBe(240);

    executeResizePresentation(repo, {
      type: 'ResizePresentation',
      presentationId: pres.id,
      width: 250,
      height: 180,
    });
    expect(repo.presentations[pres.id].bounds.width).toBe(250);
    expect(repo.presentations[pres.id].bounds.height).toBe(180);
  });

  it('deterministically migrates legacy v3 side-car coordinates and diagramPresentations to v4 presentations', () => {
    const legacyCoordinates = {
      'blk-1': { x: 50, y: 75, width: 160, height: 120 },
      'blk-2': { x: 300, y: 150 },
    };
    const legacyDiagramPresentations = {
      'diag-root': { elementIds: ['blk-1', 'blk-2'] },
    };

    const migrated = migrateV3PresentationsToV4(legacyCoordinates, legacyDiagramPresentations);
    expect(migrated).toHaveLength(2);

    const pres1 = migrated.find(p => p.semanticElementId === 'blk-1');
    expect(pres1).toBeDefined();
    expect(pres1?.diagramId).toBe('diag-root');
    expect(pres1?.bounds).toEqual({ x: 50, y: 75, width: 160, height: 120 });

    const pres2 = migrated.find(p => p.semanticElementId === 'blk-2');
    expect(pres2).toBeDefined();
    expect(pres2?.bounds.x).toBe(300);
    expect(pres2?.bounds.width).toBe(160); // Default fallback width
  });
});
