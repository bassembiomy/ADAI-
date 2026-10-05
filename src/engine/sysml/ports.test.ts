import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition } from './model';
import { createTypedUsageCommand } from '../../services/sysmlCommandGateway';
import { createSysmlExplorerAdapter } from '../../features/modelExplorer/adapters/sysmlExplorerAdapter';
import { createSysmlGatewayState } from '../../services/sysmlCommandGateway';

describe('ports and typed property creation', () => {
  it('returns TYPE_NOT_FOUND when a requested PartProperty type is absent', () => {
    const repo = createEmptyRepository();
    const result = createTypedUsageCommand(repo, { ownerId: 'vehicle', name: 'leftMotor', typeId: 'missing', kind: 'part' });
    expect(result).toMatchObject({ ok: false, code: 'TYPE_NOT_FOUND', action: { actionKind: 'CreateNewType' } });
    if (!result.ok) expect(result.action).not.toHaveProperty('type');
  });

  it('creates an untyped ProxyPort directly without auto-creating an InterfaceBlock', () => {
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

    const harness = { state, getState: () => harness.state };
    const adapter = createSysmlExplorerAdapter(harness);
    const definitionCount = Object.keys(state.repository.definitions).length;
    const result = adapter.execute({ type: 'createElement', ownerId: 'vehicle', elementKind: 'ProxyPort', name: 'control' });
    expect(result.committed).toBe(true);
    const vehicle = harness.state.repository.definitions['vehicle'] as BlockDefinition;
    expect(vehicle.ports).toContainEqual(expect.objectContaining({ name: 'control', portKind: 'proxyPort', typeId: '' }));
    expect(Object.keys(harness.state.repository.definitions)).toHaveLength(definitionCount);
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
    // Format 5: the typed part is a property of its owner Block, created through createOwnedFeature.
    expect(result.command.type).toBe('createOwnedFeature');
  });
});
