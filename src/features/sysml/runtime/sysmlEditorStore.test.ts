import { describe, it, expect, vi } from 'vitest';
import { createEmptyRepository } from '../../../engine/sysml/model';
import { fromRepository } from '../../../engine/sysml/normalizedStore';
import {
  createSysmlEditorStore,
  type SysmlEditorStore,
  type SysmlEditorState,
} from './sysmlEditorStore';

describe('SysmlEditorStore Slice Subscriptions and Atomic Updates', () => {
  function setupTestStore(): SysmlEditorStore {
    const repo = createEmptyRepository();
    repo.definitions['block-1'] = {
      id: 'block-1',
      name: 'Engine',
      namespace: ['model'],
      ownerId: 'model',
      kind: 'block',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    repo.diagrams['diag-1'] = {
      id: 'diag-1',
      name: 'BDD 1',
      kind: 'diagram',
      diagramKind: 'bdd',
      ownerId: 'model',
      namespace: ['model'],
    };
    repo.diagrams['diag-2'] = {
      id: 'diag-2',
      name: 'BDD 2',
      kind: 'diagram',
      diagramKind: 'bdd',
      ownerId: 'model',
      namespace: ['model'],
    };

    const store = fromRepository(repo);
    return createSysmlEditorStore({
      repository: repo,
      store,
      activeDiagramId: 'diag-1',
      selectedIds: ['block-1'],
      coordinates: {},
      diagramPresentations: {},
    });
  }

  it('initializes with default revisions', () => {
    const editorStore = setupTestStore();
    const state = editorStore.getState();

    expect(state.activeDiagramId).toBe('diag-1');
    expect(state.selectedIds).toEqual(['block-1']);
    expect(state.revisions.entityRevision).toBe(0);
    expect(state.revisions.membershipRevision).toBe(0);
    expect(state.revisions.presentationRevision).toBe(0);
    expect(state.revisions.activeViewRevision).toBe(0);
    expect(state.revisions.selectionRevision).toBe(0);
  });

  it('renaming an element changes entityRevision but not membershipRevision or presentationRevision', () => {
    const editorStore = setupTestStore();
    const subscriber = vi.fn();
    editorStore.subscribe(subscriber);

    const prevRevisions = { ...editorStore.getState().revisions };

    editorStore.dispatch({
      type: 'executeCommand',
      command: {
        type: 'renameElement',
        elementId: 'block-1',
        name: 'SuperEngine',
      },
    });

    const nextState = editorStore.getState();
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(nextState.revisions.entityRevision).toBeGreaterThan(prevRevisions.entityRevision);
    expect(nextState.revisions.membershipRevision).toBe(prevRevisions.membershipRevision);
    expect(nextState.revisions.presentationRevision).toBe(prevRevisions.presentationRevision);
    expect(nextState.repository.definitions['block-1'].name).toBe('SuperEngine');
    expect(nextState.store.definitions.get('block-1')?.name).toBe('SuperEngine');
  });

  it('coordinate update changes presentationRevision only', () => {
    const editorStore = setupTestStore();
    const subscriber = vi.fn();
    editorStore.subscribe(subscriber);

    const prevRevisions = { ...editorStore.getState().revisions };

    editorStore.dispatch({
      type: 'updateCoordinates',
      diagramId: 'diag-1',
      elementId: 'block-1',
      coordinates: { x: 150, y: 250 },
    });

    const nextState = editorStore.getState();
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(nextState.revisions.presentationRevision).toBeGreaterThan(prevRevisions.presentationRevision);
    expect(nextState.revisions.entityRevision).toBe(prevRevisions.entityRevision);
    expect(nextState.revisions.membershipRevision).toBe(prevRevisions.membershipRevision);
    expect(nextState.revisions.activeViewRevision).toBe(prevRevisions.activeViewRevision);
    expect(nextState.coordinates['diag-1']?.['block-1']).toEqual({ x: 150, y: 250 });
  });

  it('switching active diagram changes activeViewRevision only', () => {
    const editorStore = setupTestStore();
    const subscriber = vi.fn();
    editorStore.subscribe(subscriber);

    const prevRevisions = { ...editorStore.getState().revisions };

    editorStore.dispatch({
      type: 'setActiveDiagram',
      diagramId: 'diag-2',
    });

    const nextState = editorStore.getState();
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(nextState.activeDiagramId).toBe('diag-2');
    expect(nextState.revisions.activeViewRevision).toBeGreaterThan(prevRevisions.activeViewRevision);
    expect(nextState.revisions.entityRevision).toBe(prevRevisions.entityRevision);
    expect(nextState.revisions.membershipRevision).toBe(prevRevisions.membershipRevision);
    expect(nextState.revisions.presentationRevision).toBe(prevRevisions.presentationRevision);
  });

  it('creating an element changes both membershipRevision and entityRevision', () => {
    const editorStore = setupTestStore();
    const subscriber = vi.fn();
    editorStore.subscribe(subscriber);

    const prevRevisions = { ...editorStore.getState().revisions };

    editorStore.dispatch({
      type: 'executeCommand',
      command: {
        type: 'createElement',
        elementKind: 'block',
        ownerId: 'model',
        name: 'Transmission',
      },
    });

    const nextState = editorStore.getState();
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(nextState.revisions.membershipRevision).toBeGreaterThan(prevRevisions.membershipRevision);
    expect(nextState.revisions.entityRevision).toBeGreaterThan(prevRevisions.entityRevision);
  });

  it('undo and redo emit exactly one atomic notification per step', () => {
    const editorStore = setupTestStore();

    // Perform rename
    editorStore.dispatch({
      type: 'executeCommand',
      command: {
        type: 'renameElement',
        elementId: 'block-1',
        name: 'V8_Engine',
      },
    });

    const subscriber = vi.fn();
    editorStore.subscribe(subscriber);

    // Undo
    editorStore.dispatch({ type: 'undo' });
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(editorStore.getState().repository.definitions['block-1'].name).toBe('Engine');

    // Redo
    subscriber.mockClear();
    editorStore.dispatch({ type: 'redo' });
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(editorStore.getState().repository.definitions['block-1'].name).toBe('V8_Engine');
  });
});
