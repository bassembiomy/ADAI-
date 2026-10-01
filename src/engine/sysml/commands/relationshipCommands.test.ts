import { describe, expect, it } from 'vitest';
import {
  createConnectorTransaction,
  handleCreateRelationship,
  handleUpdateRelationship,
  handleDeleteRelationship,
} from './relationshipCommands';
import {
  createEmptyRepositoryV4,
  type Block,
  type Port,
  type PartProperty,
  type Signal,
  type SemanticRelationship,
} from '../domain';

describe('relationshipCommands: First-Class Relationships & Connections', () => {
  it('creates connector ends and item flow atomically', () => {
    const repository = createEmptyRepositoryV4();
    repository.elements['system'] = { id: 'system', name: 'System', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' } as Block;
    repository.elements['sensor'] = { id: 'sensor', name: 'sensor', metaclass: 'PartProperty', namespace: [], ownerId: 'system' } as unknown as PartProperty;
    repository.elements['controller'] = { id: 'controller', name: 'controller', metaclass: 'PartProperty', namespace: [], ownerId: 'system' } as unknown as PartProperty;
    repository.elements['out'] = { id: 'out', name: 'out', metaclass: 'Port', namespace: [], ownerId: 'sensor' } as unknown as Port;
    repository.elements['in'] = { id: 'in', name: 'in', metaclass: 'Port', namespace: [], ownerId: 'controller' } as unknown as Port;
    repository.elements['signal'] = { id: 'signal', name: 'Signal', metaclass: 'Signal', namespace: [], ownerId: 'pkg-root' } as Signal;

    const result = createConnectorTransaction(repository, {
      ownerId: 'system',
      sourceEnd: { roleId: 'out', nestedPath: ['sensor', 'out'] },
      targetEnd: { roleId: 'in', nestedPath: ['controller', 'in'] },
      conveyedClassifierIds: ['signal'],
    });

    expect(result.success).toBe(true);
    expect(result.state.relationships[result.relationshipId]).toBeDefined();
    expect(result.state.itemFlows![result.itemFlowId!].realizingRelationshipId).toBe(result.relationshipId);
  });

  it('rejects connector transaction when endpoint role does not exist', () => {
    const repository = createEmptyRepositoryV4();
    repository.elements['system'] = { id: 'system', name: 'System', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' } as Block;

    const result = createConnectorTransaction(repository, {
      ownerId: 'system',
      sourceEnd: { roleId: 'nonexistent-source' },
      targetEnd: { roleId: 'nonexistent-target' },
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('ROLE_ELEMENT_NOT_FOUND');
  });

  it('rejects connector transaction when nested path element does not exist', () => {
    const repository = createEmptyRepositoryV4();
    repository.elements['system'] = { id: 'system', name: 'System', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' } as Block;
    repository.elements['out'] = { id: 'out', name: 'out', metaclass: 'Port', namespace: [], ownerId: 'system' } as unknown as Port;
    repository.elements['in'] = { id: 'in', name: 'in', metaclass: 'Port', namespace: [], ownerId: 'system' } as unknown as Port;

    const result = createConnectorTransaction(repository, {
      ownerId: 'system',
      sourceEnd: { roleId: 'out', nestedPath: ['missingPart', 'out'] },
      targetEnd: { roleId: 'in' },
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('NESTED_PATH_ELEMENT_NOT_FOUND');
  });

  it('rejects connector transaction when owner element does not exist', () => {
    const repository = createEmptyRepositoryV4();
    repository.elements['out'] = { id: 'out', name: 'out', metaclass: 'Port', namespace: [], ownerId: 'pkg-root' } as unknown as Port;
    repository.elements['in'] = { id: 'in', name: 'in', metaclass: 'Port', namespace: [], ownerId: 'pkg-root' } as unknown as Port;

    const result = createConnectorTransaction(repository, {
      ownerId: 'missing-owner',
      sourceEnd: { roleId: 'out' },
      targetEnd: { roleId: 'in' },
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('OWNER_ELEMENT_NOT_FOUND');
  });

  it('deleting a relationship removes its realized item flow from the repository', () => {
    const repository = createEmptyRepositoryV4();
    repository.elements['system'] = { id: 'system', name: 'System', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' } as Block;
    repository.elements['out'] = { id: 'out', name: 'out', metaclass: 'Port', namespace: [], ownerId: 'system' } as unknown as Port;
    repository.elements['in'] = { id: 'in', name: 'in', metaclass: 'Port', namespace: [], ownerId: 'system' } as unknown as Port;
    repository.elements['signal'] = { id: 'signal', name: 'Signal', metaclass: 'Signal', namespace: [], ownerId: 'pkg-root' } as Signal;

    const created = createConnectorTransaction(repository, {
      ownerId: 'system',
      sourceEnd: { roleId: 'out' },
      targetEnd: { roleId: 'in' },
      conveyedClassifierIds: ['signal'],
    });

    expect(created.success).toBe(true);
    const relId = created.relationshipId;
    const ifId = created.itemFlowId!;
    expect(created.state.relationships[relId]).toBeDefined();
    expect(created.state.itemFlows![ifId]).toBeDefined();

    const deleteRes = handleDeleteRelationship(created.state, {
      type: 'DeleteRelationship',
      relationshipId: relId,
    });

    expect(deleteRes.success).toBe(true);
    expect(deleteRes.nextState.relationships[relId]).toBeUndefined();
    expect(deleteRes.nextState.itemFlows?.[ifId]).toBeUndefined();
  });
});
