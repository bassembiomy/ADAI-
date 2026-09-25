import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition } from './model';
import { createTypedUsageCommand } from '../../services/sysmlCommandGateway';
import { createSysmlExplorerAdapter } from '../../features/modelExplorer/adapters/sysmlExplorerAdapter';
import { createSysmlGatewayState } from '../../services/sysmlCommandGateway';

describe('ports and typed property creation', () => {
  it('returns TYPE_NOT_FOUND when a requested PartProperty type is absent', () => {
    const repo = createEmptyRepository();
    const result = createTypedUsageCommand(repo, { ownerId: 'vehicle', name: 'leftMotor', typeId: 'missing', kind: 'part' });
    expect(result).toMatchObject({ ok: false, code: 'TYPE_NOT_FOUND', action: { type: 'CreateNewType' } });
  });

  it('does not auto-create an InterfaceBlock for ProxyPort', () => {
    const state = createSysmlGatewayState();
    const block: BlockDefinition = {
      id: 'vehicle',
      name: 'Vehicle',
      kind: 'block',
      namespace: ['model'],
      ownerId: 'model',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    state.repository.definitions['vehicle'] = block;

    const adapter = createSysmlExplorerAdapter({ getState: () => state });
    const result = adapter.execute({ type: 'createElement', ownerId: 'vehicle', elementKind: 'ProxyPort', name: 'control' });
    expect(result.committed).toBe(false);
    expect(result.diagnostics[0].code).toBe('TYPE_NOT_FOUND');
  });

  it('creates typed part usage when type is present', () => {
    const repo = createEmptyRepository();
    const motor: BlockDefinition = {
      id: 'blk-motor',
      name: 'Motor',
      kind: 'block',
      namespace: ['model'],
      ownerId: 'model',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    repo.definitions['blk-motor'] = motor;
    const result = createTypedUsageCommand(repo, { ownerId: 'vehicle', name: 'leftMotor', typeId: 'blk-motor', kind: 'part' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.type).toBe('createElement');
  });
});
