import { describe, expect, it } from 'vitest';
import {
  createEmptyRepositoryV4,
  type Block,
  type SysmlRepositoryV4,
} from './domain';
import { createTransactionManager, type TransactionManager } from './commands/dispatcher';

describe('One Writable Semantic Repository Across Integrations (Task 14)', () => {
  it('ensures UI, AI, reports, and scripts observe the exact same revision and IDs', () => {
    let repo = createEmptyRepositoryV4();
    const mgr: TransactionManager = createTransactionManager(repo);

    // 1. Script creates root subsystem
    const bSubsys: Block = {
      id: 'subsys-powertrain',
      name: 'PowertrainSubsystem',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-root',
    };
    const scriptRes = mgr.dispatch(
      { type: 'CreateElement', element: bSubsys },
      { source: 'script', actor: 'ci-pipeline' }
    );
    expect(scriptRes.success).toBe(true);
    expect(scriptRes.revision).toBe(1);

    // 2. AI suggests renaming
    const aiRes = mgr.dispatch(
      {
        type: 'RenameElement',
        elementId: 'subsys-powertrain',
        newName: 'ElectricPowertrainSubsystem',
      },
      { source: 'ai', actor: 'copilot-agent' }
    );
    expect(aiRes.success).toBe(true);
    expect(aiRes.revision).toBe(2);

    // 3. UI engineer marks abstract
    const uiRes = mgr.dispatch(
      {
        type: 'UpdateElement',
        elementId: 'subsys-powertrain',
        patch: { isAbstract: true },
      },
      { source: 'ui', actor: 'lead-architect' }
    );
    expect(uiRes.success).toBe(true);
    expect(uiRes.revision).toBe(3);

    // 4. Report generator reads the authoritative state
    const authoritativeState: SysmlRepositoryV4 = mgr.getState();
    expect(authoritativeState.revision).toBe(3);
    const element = authoritativeState.elements['subsys-powertrain'] as Block;
    expect(element.id).toBe('subsys-powertrain');
    expect(element.name).toBe('ElectricPowertrainSubsystem');
    expect(element.isAbstract).toBe(true);
  });
});
