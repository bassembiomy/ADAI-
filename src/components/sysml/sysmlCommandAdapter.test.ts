import { describe, expect, it } from 'vitest';
import { sysmlCommandToEditorCommand } from './sysmlCommandAdapter';

describe('sysmlCommandToEditorCommand', () => {
  it('maps UpdateElement to gateway updateElement command', () => {
    const editorCmd = sysmlCommandToEditorCommand({
      type: 'UpdateElement',
      elementId: 'blk-1',
      patch: { name: 'Engine' },
    });
    expect(editorCmd).toEqual({
      type: 'updateElement',
      elementId: 'blk-1',
      patch: { name: 'Engine' },
      coalesceKey: 'update-element-blk-1',
    });
  });

  it('maps MoveElement to gateway moveElements command', () => {
    const editorCmd = sysmlCommandToEditorCommand({
      type: 'MoveElement',
      elementId: 'blk-1',
      newOwnerId: 'pkg-2',
    });
    expect(editorCmd).toEqual({
      type: 'moveElements',
      elementIds: ['blk-1'],
      targetOwnerId: 'pkg-2',
    });
  });

  it('maps DeleteElement to gateway deleteElements command', () => {
    const editorCmd = sysmlCommandToEditorCommand({
      type: 'DeleteElement',
      elementId: 'blk-1',
    });
    expect(editorCmd).toEqual({
      type: 'deleteElements',
      elementIds: ['blk-1'],
    });
  });

  it('maps UpdateRelationship to gateway updateElement command', () => {
    const editorCmd = sysmlCommandToEditorCommand({
      type: 'UpdateRelationship',
      relationshipId: 'rel-1',
      patch: { sourceId: 'p2' },
    });
    expect(editorCmd).toEqual({
      type: 'updateElement',
      elementId: 'rel-1',
      patch: { sourceId: 'p2' },
      coalesceKey: 'update-relationship-rel-1',
    });
  });

  it('maps DeleteRelationship to gateway deleteElements command', () => {
    const editorCmd = sysmlCommandToEditorCommand({
      type: 'DeleteRelationship',
      relationshipId: 'rel-1',
    });
    expect(editorCmd).toEqual({
      type: 'deleteElements',
      elementIds: ['rel-1'],
    });
  });
});
