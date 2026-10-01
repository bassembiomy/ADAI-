import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand } from './sysmlCommandGateway';
import { buildCreateNewTypeCommand } from './sysmlTypeCreationCommands';

describe('explicit CreateNewType command', () => {
  it('uses actionKind and creates a canonical Block only when explicitly dispatched', () => {
    const repository = createEmptyRepository();
    const state = createSysmlGatewayState(repository);
    const action = { actionKind: 'CreateNewType' as const, suggestedName: 'Motor', targetOwnerId: 'model' };
    const command = buildCreateNewTypeCommand(action, repository, () => 'motor');

    expect(command).toMatchObject({ type: 'createElement', element: { id: 'motor', kind: 'block', name: 'Motor' } });
    expect(command).not.toHaveProperty('type', 'CreateNewType');
    expect(repository.definitions.motor).toBeUndefined();
    const result = executeSysmlCommand(state, command);
    expect(result.committed).toBe(true);
    expect(result.repository.definitions.motor).toMatchObject({ kind: 'block', name: 'Motor' });
  });
});
