import { describe, expect, it } from 'vitest';
import type { SysmlRepositoryV4 } from '../../engine/sysml/domain';
import { createEmptyRepositoryV4 } from '../../engine/sysml/domain';
import { resolveInteractionContext } from './interactionContext';

describe('resolveInteractionContext', () => {
  const repository: SysmlRepositoryV4 = {
    ...createEmptyRepositoryV4(),
    elements: {
      'pkg-1': {
        id: 'pkg-1',
        name: 'Package1',
        metaclass: 'Package',
        namespace: [],
        ownerId: 'pkg-root',
      },
      'block-a': {
        id: 'block-a',
        name: 'BlockA',
        metaclass: 'Block',
        namespace: [],
        ownerId: 'pkg-1',
      },
      'block-b': {
        id: 'block-b',
        name: 'BlockB',
        metaclass: 'Block',
        namespace: [],
        ownerId: 'pkg-1',
      },
      'block-c': {
        id: 'block-c',
        name: 'BlockC',
        metaclass: 'Block',
        namespace: [],
        ownerId: 'pkg-1',
      },
    },
    diagrams: {
      'pkg-diagram': {
        id: 'pkg-diagram',
        name: 'PackageDiagram',
        diagramKind: 'package',
        ownerId: 'pkg-1',
        elementIds: ['block-a'],
        relationshipIds: [],
      } as any,
    },
  };

  it.each([
    [{ source: 'propertyPanel', inspectorElementId: 'block-b', canvasElementId: 'block-a', treeElementId: 'block-c' }, 'block-b'],
    [{ source: 'canvas', canvasElementId: 'block-a', treeElementId: 'block-c' }, 'block-a'],
    [{ source: 'tree', treeElementId: 'block-c' }, 'block-c'],
  ] as const)('resolves %o to %s', (selection, ownerId) => {
    expect(resolveInteractionContext({ repository, requestedMetaclass: 'Port', ...selection }))
      .toMatchObject({ status: 'resolved', ownerId });
  });

  it('delegates a diagram row to the diagram semantic owner', () => {
    expect(resolveInteractionContext({ repository, source: 'tree', treeElementId: 'pkg-diagram', requestedMetaclass: 'Block' }))
      .toMatchObject({ status: 'resolved', ownerId: 'pkg-1', diagramId: 'pkg-diagram' });
  });

  it('returns disabled guidance instead of requesting a parent', () => {
    expect(resolveInteractionContext({ repository, source: 'canvas', requestedMetaclass: 'Port' }))
      .toEqual({ status: 'disabled', code: 'LEGAL_OWNER_REQUIRED', reason: 'Select a Block to add a Port.' });
  });
});
