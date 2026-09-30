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
    expect(result.committed).toBe(true);
    expect(result.repository.definitions['motor-copy']).toMatchObject({ kind: 'block', name: 'Motor_1' });
    expect(result.diagramPresentations['bdd-a'].elementIds).toContain('motor-copy');
  });
});
