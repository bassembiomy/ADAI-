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
      (id: string) => elements[id],
      (id: string) => (id === 'parent' ? [elements.child, elements.grandchild] : id === 'child' ? [elements.grandchild] : []),
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

  it('remaps nested feature identities and inheritance references', () => {
    const payload: ExplorerClipboardPayload = {
      domain: 'sysml', rootIds: ['base', 'child'], copiedAtRevision: 1,
      snapshots: {
        base: {
          id: 'base', kind: 'block', name: 'Base', ownerId: 'model', supertypeIds: [],
          properties: [{ id: 'base-prop', name: 'motor', typeId: 'external-type' }],
          ports: [{ id: 'base-port', name: 'power', typeId: 'external-interface' }],
        },
        child: {
          id: 'child', kind: 'block', name: 'Child', ownerId: 'model', supertypeIds: ['base'],
          properties: [{ id: 'child-prop', name: 'motor', typeId: 'external-type', redefinesId: 'base-prop', inheritedFromId: 'base-prop' }],
          ports: [{ id: 'child-port', name: 'power', typeId: 'external-interface', inheritedFromId: 'base-port' }],
        },
      },
    };

    const remapped = remapClipboardPayload(payload, oldId => `new-${oldId}`);
    const child = remapped.snapshots['new-child'] as any;
    expect(child.supertypeIds).toEqual(['new-base']);
    expect(child.properties[0]).toMatchObject({ id: 'new-child-prop', redefinesId: 'new-base-prop', inheritedFromId: 'new-base-prop' });
    expect(child.ports[0]).toMatchObject({ id: 'new-child-port', inheritedFromId: 'new-base-port' });
    expect(child.properties[0].typeId).toBe('external-type');
  });
});
