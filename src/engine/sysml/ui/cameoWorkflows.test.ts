import { describe, expect, it } from 'vitest';
import {
  handleBrowserDragDropToDiagram,
  handleRemoveFromDiagramVsDeleteFromModel,
  handleTypeSelectionWorkflow,
} from './cameoWorkflows';
import {
  createEmptyRepositoryV4,
  addSemanticElementV4,
  type Block,
  type Diagram,
  type DiagramPresentation,
} from '../domain';
import { createTransactionManager } from '../commands/dispatcher';

describe('Cameo-Style Command-Only UI Workflows (Task 12)', () => {
  it('emits DisplayExistingElement when dragging from browser and creates zero duplicate semantic elements', () => {
    let repo = createEmptyRepositoryV4();
    const blk: Block = {
      id: 'blk-battery',
      name: 'Battery',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-root',
    };
    addSemanticElementV4(repo, blk);
    const diagram: Diagram = {
      id: 'bdd-powertrain',
      name: 'Powertrain BDD',
      metaclass: 'Diagram',
      diagramKind: 'bdd',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: [],
    };
    addSemanticElementV4(repo, diagram);
    const initialElementCount = Object.keys(repo.elements).length;

    const mgr = createTransactionManager(repo);

    // Engineer drags 'blk-battery' onto 'bdd-powertrain'
    const result = handleBrowserDragDropToDiagram(mgr, {
      elementId: 'blk-battery',
      diagramId: 'bdd-powertrain',
      dropCoordinates: { x: 250, y: 180 },
    });

    expect(result.success).toBe(true);
    expect(result.presentationId).toBeDefined();

    const updatedRepo = mgr.getState();
    // Verify no duplicate semantic element was created
    expect(Object.keys(updatedRepo.elements).length).toBe(initialElementCount);
    expect(updatedRepo.elements['blk-battery']).toBeDefined();

    // Verify presentation was created and indexed
    const pres = updatedRepo.presentations[result.presentationId!];
    expect(pres).toBeDefined();
    expect(pres.diagramId).toBe('bdd-powertrain');
    expect(pres.semanticElementId).toBe('blk-battery');
    expect(pres.bounds.x).toBe(250);
    expect(pres.bounds.y).toBe(180);
  });

  it('separates Remove from Diagram from Delete from Model with impact preview', () => {
    let repo = createEmptyRepositoryV4();
    const blk: Block = {
      id: 'blk-wheel',
      name: 'Wheel',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-root',
    };
    repo.elements[blk.id] = blk;

    // Displayed on BDD-A and BDD-B
    const presA: DiagramPresentation = {
      id: 'pres-a',
      diagramId: 'bdd-a',
      semanticElementId: 'blk-wheel',
      bounds: { x: 10, y: 10, width: 100, height: 100 },
    };
    const presB: DiagramPresentation = {
      id: 'pres-b',
      diagramId: 'bdd-b',
      semanticElementId: 'blk-wheel',
      bounds: { x: 20, y: 20, width: 100, height: 100 },
    };
    repo.presentations[presA.id] = presA;
    repo.presentations[presB.id] = presB;
    repo.indexes.byDiagram['bdd-a'] = [presA.id];
    repo.indexes.byDiagram['bdd-b'] = [presB.id];

    const mgr = createTransactionManager(repo);

    // 1. Remove from Diagram (only removes pres-a)
    const removeRes = handleRemoveFromDiagramVsDeleteFromModel(mgr, {
      action: 'removeFromDiagram',
      presentationId: 'pres-a',
      elementId: 'blk-wheel',
    });
    expect(removeRes.success).toBe(true);
    let state = mgr.getState();
    expect(state.presentations['pres-a']).toBeUndefined();
    expect(state.presentations['pres-b']).toBeDefined();
    expect(state.elements['blk-wheel']).toBeDefined(); // Semantic model intact

    // 2. Delete from Model (impact preview & deletes semantic entity + pres-b)
    const preview = handleRemoveFromDiagramVsDeleteFromModel(mgr, {
      action: 'previewDeleteImpact',
      elementId: 'blk-wheel',
    });
    expect(preview.impact?.affectedPresentations).toContain('pres-b');

    const deleteRes = handleRemoveFromDiagramVsDeleteFromModel(mgr, {
      action: 'deleteFromModel',
      elementId: 'blk-wheel',
    });
    expect(deleteRes.success).toBe(true);
    state = mgr.getState();
    expect(state.elements['blk-wheel']).toBeUndefined();
    expect(state.presentations['pres-b']).toBeUndefined();
  });

  it('implements explicit Use Existing Type and Create New Type workflows with candidates', () => {
    let repo = createEmptyRepositoryV4();
    const blkEngine: Block = {
      id: 'blk-eng',
      name: 'V8Engine',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-root',
    };
    repo.elements[blkEngine.id] = blkEngine;

    const mgr = createTransactionManager(repo);

    // Searching for unknown type returns TYPE_NOT_FOUND with candidates and explicit CreateNewType action
    const searchOutcome = handleTypeSelectionWorkflow(mgr, 'Engine');
    expect(searchOutcome.status).toBe('TYPE_NOT_FOUND');
    expect(searchOutcome.candidates.length).toBeGreaterThan(0);
    expect(searchOutcome.candidates[0].id).toBe('blk-eng');
    expect(searchOutcome.createNewTypeAction).toBeDefined();

    // Selecting 'Use Existing Type'
    const useExisting = handleTypeSelectionWorkflow(mgr, 'blk-eng', { action: 'useExisting' });
    expect(useExisting.status).toBe('RESOLVED');
    expect(useExisting.typeId).toBe('blk-eng');

    // Selecting 'Create New Type'
    const createNew = handleTypeSelectionWorkflow(mgr, 'ElectricEngine', {
      action: 'createNew',
      metaclass: 'Block',
    });
    expect(createNew.status).toBe('CREATED');
    expect(createNew.typeId).toBeDefined();
    expect(mgr.getState().elements[createNew.typeId!].name).toBe('ElectricEngine');
  });
});
