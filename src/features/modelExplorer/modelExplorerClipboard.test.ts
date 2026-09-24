import { describe, expect, it } from 'vitest';
import {
  copyOwnershipForest,
  remapClipboardPayload,
} from './modelExplorerClipboard';
import type { ExplorerClipboardPayload } from './modelExplorerTypes';

describe('modelExplorerClipboard', () => {
  it('copies only top-level selected roots and omits selected descendants', () => {
    const elements: Record<string, any> = {
      parent: { id: 'parent', name: 'Parent', ownerId: 'model' },
      child: { id: 'child', name: 'Child', ownerId: 'parent' },
      grandchild: { id: 'grandchild', name: 'Grandchild', ownerId: 'child' },
    };

    const payload = copyOwnershipForest(
      'sysml',
      ['parent', 'child'], // child is already descendant of parent
      id => elements[id],
      id => (id === 'parent' ? [elements.child, elements.grandchild] : id === 'child' ? [elements.grandchild] : []),
      1
    );

    expect(payload.rootIds).toEqual(['parent']);
    expect(payload.snapshots['parent']).toBeDefined();
    expect(payload.snapshots['child']).toBeDefined();
    expect(payload.snapshots['grandchild']).toBeDefined();
  });

  it('remaps internal references and preserves external references on duplicate', () => {
    const payload: ExplorerClipboardPayload = {
      domain: 'sysml',
      rootIds: ['root'],
      snapshots: {
        root: { id: 'root', name: 'Root', ownerId: 'model', externalTypeId: 'library-block' },
        child: { id: 'child', name: 'Child', ownerId: 'root' },
      },
      copiedAtRevision: 1,
    };

    const ids = ['newRoot', 'newChild'];
    const remapped = remapClipboardPayload(payload, () => ids.shift()!);

    expect(remapped.snapshots.newRoot).toBeDefined();
    expect(remapped.snapshots.newChild).toBeDefined();
    const snapshots = remapped.snapshots as Record<string, any>;
    expect(snapshots.newChild.ownerId).toBe('newRoot');
    expect(snapshots.newRoot.externalTypeId).toBe('library-block');
  });
});
