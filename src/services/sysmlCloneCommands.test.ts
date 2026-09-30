import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition } from '../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand } from './sysmlCommandGateway';
import { buildSysmlCloneElementsCommand } from './sysmlCloneCommands';

describe('buildSysmlCloneElementsCommand', () => {
  it('creates an independent Block and presentation with fresh identity', () => {
    const repository = createEmptyRepository();
    repository.diagrams['bdd-a'] = { id: 'bdd-a', kind: 'diagram', name: 'BDD A', namespace: [], ownerId: 'model', diagramKind: 'bdd' };
    const motor: BlockDefinition = { id: 'motor', kind: 'block', name: 'Motor', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    repository.definitions.motor = motor;
    const result = executeSysmlCommand(createSysmlGatewayState(repository), buildSysmlCloneElementsCommand({
      sourceIds: ['motor'], diagramId: 'bdd-a', drop: { x: 400, y: 220 }, repository, idFactory: () => 'motor-copy',
    }));
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.repository.definitions['motor-copy']).toMatchObject({ kind: 'block', name: 'Motor_1' });
    expect(result.diagramPresentations['bdd-a'].elementIds).toContain('motor-copy');
  });

  it('recreates only relationships with two copied endpoints', () => {
    const repository = createEmptyRepository();
    repository.diagrams['bdd-a'] = { id: 'bdd-a', kind: 'diagram', name: 'BDD A', namespace: [], ownerId: 'model', diagramKind: 'bdd' };
    for (const id of ['a', 'b']) repository.definitions[id] = { id, kind: 'block', name: id, namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    repository.relationships.internal = { id: 'internal', kind: 'association', sourceId: 'a', targetId: 'b' };
    const ids = ['a-copy', 'b-copy', 'internal-copy'];
    const result = executeSysmlCommand(createSysmlGatewayState(repository), buildSysmlCloneElementsCommand({
      sourceIds: ['a', 'b'], diagramId: 'bdd-a', drop: { x: 10, y: 20 }, repository, idFactory: () => ids.shift()!,
    }));
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.repository.relationships['internal-copy']).toMatchObject({ sourceId: 'a-copy', targetId: 'b-copy' });
    expect(Object.values(result.repository.relationships)).toHaveLength(2);
  });
});
