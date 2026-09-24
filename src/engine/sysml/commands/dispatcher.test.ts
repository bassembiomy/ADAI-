import { describe, expect, it } from 'vitest';
import {
  createTransactionManager,
  dispatchSysmlCommand,
  type CommandContext,
  type CreateElementCommand,
  type MoveElementCommand,
  type RenameElementCommand,
  type UpdateElementCommand,
  type CreateRelationshipCommand,
  type DeleteElementCommand,
} from './dispatcher';
import {
  createEmptyRepositoryV4,
  type Block,
  type SemanticRelationship,
} from '../domain';

describe('SysML Command and Transaction Boundary (Dispatcher)', () => {
  const uiContext: CommandContext = { source: 'ui', actor: 'engineer' };
  const aiContext: CommandContext = { source: 'ai', actor: 'copilot' };

  it('atomically creates, updates, renames, and moves an element', () => {
    let repo = createEmptyRepositoryV4();

    // 1. Create Element
    const block: Block = {
      id: 'blk-motor',
      name: 'Motor',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-root',
    };
    const createCmd: CreateElementCommand = { type: 'CreateElement', element: block };
    const createRes = dispatchSysmlCommand(repo, createCmd, uiContext);

    expect(createRes.success).toBe(true);
    expect(createRes.revision).toBe(1);
    expect(createRes.auditRecord?.command).toBe('CreateElement');
    expect(createRes.auditRecord?.actor).toBe('engineer');
    repo = createRes.state;
    expect(repo.elements['blk-motor']).toBeDefined();

    // 2. Rename Element
    const renameCmd: RenameElementCommand = {
      type: 'RenameElement',
      elementId: 'blk-motor',
      newName: 'BrushlessMotor',
    };
    const renameRes = dispatchSysmlCommand(repo, renameCmd, aiContext);

    expect(renameRes.success).toBe(true);
    expect(renameRes.revision).toBe(2);
    expect(renameRes.auditRecord?.actor).toBe('copilot');
    repo = renameRes.state;
    expect(repo.elements['blk-motor'].name).toBe('BrushlessMotor');

    // 3. Update Element
    const updateCmd: UpdateElementCommand = {
      type: 'UpdateElement',
      elementId: 'blk-motor',
      patch: { isAbstract: true },
    };
    const updateRes = dispatchSysmlCommand(repo, updateCmd, uiContext);
    expect(updateRes.success).toBe(true);
    repo = updateRes.state;
    expect((repo.elements['blk-motor'] as Block).isAbstract).toBe(true);

    // 4. Move Element Owner
    const moveCmd: MoveElementCommand = {
      type: 'MoveElement',
      elementId: 'blk-motor',
      newOwnerId: null,
    };
    const moveRes = dispatchSysmlCommand(repo, moveCmd, uiContext);
    expect(moveRes.success).toBe(true);
    repo = moveRes.state;
    expect(repo.elements['blk-motor'].ownerId).toBeNull();
  });

  it('rejects circular ownership move and preserves state/revision atomically', () => {
    let repo = createEmptyRepositoryV4();
    const pkg1: Block = { id: 'pkg-1', name: 'Pkg1', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    const pkg2: Block = { id: 'pkg-2', name: 'Pkg2', metaclass: 'Block', namespace: [], ownerId: 'pkg-1' };
    repo = dispatchSysmlCommand(repo, { type: 'CreateElement', element: pkg1 }, uiContext).state;
    repo = dispatchSysmlCommand(repo, { type: 'CreateElement', element: pkg2 }, uiContext).state;
    const revBefore = repo.revision;

    // Moving pkg-1 inside its descendant pkg-2 should be rejected
    const invalidMove: MoveElementCommand = {
      type: 'MoveElement',
      elementId: 'pkg-1',
      newOwnerId: 'pkg-2',
    };
    const res = dispatchSysmlCommand(repo, invalidMove, uiContext);

    expect(res.success).toBe(false);
    expect(res.code).toBe('CIRCULAR_OWNERSHIP');
    expect(res.revision).toBe(revBefore);
    expect(res.state.elements['pkg-1'].ownerId).toBe('pkg-root');
  });

  it('handles relationship creation and cascading deletion impact', () => {
    let repo = createEmptyRepositoryV4();
    const b1: Block = { id: 'b1', name: 'Block1', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    const b2: Block = { id: 'b2', name: 'Block2', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    repo = dispatchSysmlCommand(repo, { type: 'CreateElement', element: b1 }, uiContext).state;
    repo = dispatchSysmlCommand(repo, { type: 'CreateElement', element: b2 }, uiContext).state;

    const rel: SemanticRelationship = {
      id: 'rel-1',
      metaclass: 'Association',
      sourceId: 'b1',
      targetId: 'b2',
    };
    const relCmd: CreateRelationshipCommand = { type: 'CreateRelationship', relationship: rel };
    const relRes = dispatchSysmlCommand(repo, relCmd, uiContext);
    expect(relRes.success).toBe(true);
    repo = relRes.state;
    expect(repo.relationships['rel-1']).toBeDefined();

    // Deleting b1 should cascade deletion to rel-1
    const delCmd: DeleteElementCommand = { type: 'DeleteElement', elementId: 'b1' };
    const delRes = dispatchSysmlCommand(repo, delCmd, uiContext);
    expect(delRes.success).toBe(true);
    repo = delRes.state;
    expect(repo.elements['b1']).toBeUndefined();
    expect(repo.relationships['rel-1']).toBeUndefined();
  });

  it('supports undo and redo through transaction manager', () => {
    const initialRepo = createEmptyRepositoryV4();
    const mgr = createTransactionManager(initialRepo);

    const block: Block = {
      id: 'blk-sensor',
      name: 'Sensor',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-root',
    };

    mgr.dispatch({ type: 'CreateElement', element: block }, uiContext);
    expect(mgr.getState().elements['blk-sensor']).toBeDefined();
    expect(mgr.canUndo()).toBe(true);

    // Undo
    const undone = mgr.undo();
    expect(undone).toBe(true);
    expect(mgr.getState().elements['blk-sensor']).toBeUndefined();
    expect(mgr.canRedo()).toBe(true);

    // Redo
    const redone = mgr.redo();
    expect(redone).toBe(true);
    expect(mgr.getState().elements['blk-sensor']).toBeDefined();
  });
});
