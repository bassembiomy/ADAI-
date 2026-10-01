import { describe, expect, it } from 'vitest';
import type { SysmlRepositoryV4 } from '../../engine/sysml/domain';
import { createEmptyRepositoryV4 } from '../../engine/sysml/domain';
import { planContextualCreation } from './contextualCreation';

describe('planContextualCreation', () => {
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
      controller: {
        id: 'controller',
        name: 'Controller',
        metaclass: 'Block',
        namespace: [],
        ownerId: 'pkg-1',
        isAbstract: false,
        isLeaf: false,
      },
      'control-if': {
        id: 'control-if',
        name: 'ControlIF',
        metaclass: 'InterfaceBlock',
        namespace: [],
        ownerId: 'pkg-1',
        isAbstract: false,
        isLeaf: false,
      },
    },
    diagrams: {},
  };

  it.each(['tree', 'canvas', 'propertyPanel'] as const)(
    'creates a proxy port under the resolved block from %s',
    (source) => {
      const plan = planContextualCreation({
        repository,
        source,
        selectedId: 'controller',
        intent: { metaclass: 'Port', portKind: 'proxyPort', typeId: 'control-if' },
      });
      expect(plan).toMatchObject({
        kind: 'command',
        command: {
          type: 'createOwnedPort',
          ownerBlockId: 'controller',
          portKind: 'proxyPort',
          typeId: 'control-if',
        },
      });
    }
  );

  it('does not request a parent when the property panel is bound to a block', () => {
    expect(
      planContextualCreation({
        repository,
        source: 'propertyPanel',
        selectedId: 'controller',
        intent: { metaclass: 'Port', portKind: 'standardPort' },
      }).kind
    ).not.toBe('parentSelection');
  });

  it('returns disabled when no legal owner is selected', () => {
    const plan = planContextualCreation({
      repository,
      source: 'canvas',
      intent: { metaclass: 'Port', portKind: 'standardPort' },
    });
    expect(plan).toEqual({
      kind: 'disabled',
      code: 'LEGAL_OWNER_REQUIRED',
      reason: 'Select a Block to add a Port.',
    });
  });

  it('requests type selection for typed port when typeId is missing', () => {
    const plan = planContextualCreation({
      repository,
      source: 'propertyPanel',
      selectedId: 'controller',
      intent: { metaclass: 'Port', portKind: 'proxyPort' },
    });
    expect(plan.kind).toBe('typeSelection');
  });
});
