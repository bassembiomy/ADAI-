import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition } from '../engine/sysml/model';
import { createTypedUsageCommand } from './sysmlCommandGateway';
import { planOwnedPortCreation } from './sysmlOwnedFeatureCommands';

function blockFixture(id: string, name: string): BlockDefinition {
  return {
    id,
    name,
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
}

/**
 * Review follow-up Finding 2: IBD "Create New Type" resume must resolve the
 * just-created type against the fresh `res.repository`, never the stale
 * render-closure repository. These tests simulate the stale closure (a repo
 * snapshot taken before the CreateNewType commit) alongside the fresh
 * repository and prove type resolution uses whichever repository is passed —
 * so passing the stale snapshot fails with TYPE_NOT_FOUND while passing the
 * fresh repository commits the Part (and Port).
 */
describe('IBD CreateNewType resume uses the fresh repository (Finding 2)', () => {
  it('resolves a just-created part type from the fresh repo while the stale closure repo reports TYPE_NOT_FOUND', () => {
    const stale = createEmptyRepository();
    stale.definitions['vehicle'] = blockFixture('vehicle', 'Vehicle');

    // Fresh repository as returned by the CreateNewType gateway commit.
    const fresh = createEmptyRepository();
    fresh.definitions['vehicle'] = blockFixture('vehicle', 'Vehicle');
    fresh.definitions['blk-new'] = blockFixture('blk-new', 'Block_1');

    const staleOutcome = createTypedUsageCommand(stale, {
      ownerId: 'vehicle',
      name: 'part_1',
      typeId: 'blk-new',
      kind: 'part',
    });
    expect(staleOutcome.ok).toBe(false);
    if (staleOutcome.ok) return;
    expect(staleOutcome.code).toBe('TYPE_NOT_FOUND');

    const freshOutcome = createTypedUsageCommand(fresh, {
      ownerId: 'vehicle',
      name: 'part_1',
      typeId: 'blk-new',
      kind: 'part',
    });
    expect(freshOutcome.ok).toBe(true);
  });

  it('plans a just-created port type from the fresh repo while the stale closure repo errors', () => {
    const stale = createEmptyRepository();
    stale.definitions['vehicle'] = blockFixture('vehicle', 'Vehicle');

    const fresh = createEmptyRepository();
    fresh.definitions['vehicle'] = blockFixture('vehicle', 'Vehicle');
    fresh.definitions['blk-new'] = blockFixture('blk-new', 'Block_1');

    const stalePlan = planOwnedPortCreation(stale, {
      ownerBlockId: 'vehicle',
      portKind: 'fullPort',
      typeId: 'blk-new',
      diagramId: 'bdd',
    });
    expect(stalePlan.outcome).toBe('error');
    if (stalePlan.outcome !== 'error') return;
    expect(stalePlan.diagnostics[0]?.code).toBe('TYPE_NOT_FOUND');

    const freshPlan = planOwnedPortCreation(fresh, {
      ownerBlockId: 'vehicle',
      portKind: 'fullPort',
      typeId: 'blk-new',
      diagramId: 'bdd',
    });
    expect(freshPlan.outcome).toBe('command');
  });
});
