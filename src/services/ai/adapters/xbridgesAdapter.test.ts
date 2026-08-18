import { describe, it, expect, beforeEach } from 'vitest';
import { XBridgesModuleAdapter } from './xbridgesAdapter';
import { XBridgeDomainModel } from './xbridgeDomainModel';
import { RiskClass } from '../contracts/types';

describe('XBridgesModuleAdapter with Deep Structured Cloning and Verification', () => {
  let model: XBridgeDomainModel;
  let adapter: XBridgesModuleAdapter;

  beforeEach(() => {
    model = new XBridgeDomainModel();
    adapter = new XBridgesModuleAdapter(model);
  });

  it('should snapshot serializable deep copies and verify exact created parameters', async () => {
    const context = { projectId: 'p1', workspaceRevision: 1, isDryRun: false };

    const createAction = {
      actionId: 's1',
      actionSchemaVersion: '1.0.0',
      idempotencyKey: 'k_s1',
      type: 'XB_CREATE_BLOCK',
      targetModule: 'xbridges',
      risk: RiskClass.REVERSIBLE_MUTATION,
      dependsOn: [],
      onFailure: 'ROLLBACK_PLAN',
      payload: { blockId: 'sine1', blockType: 'WAVEFORM_GENERATOR', parameters: { frequency: { value: 50, unit: 'Hz' } } }
    };

    const prep = await adapter.prepare(createAction, context);
    expect(prep.beforeStateHash).toBeDefined();
    expect(prep.snapshot).toBeDefined();

    const res = await adapter.execute(createAction, context);
    const verifyRes = await adapter.verify(createAction, res, context);
    expect(verifyRes.isVerified).toBe(true);

    await adapter.restoreSnapshot(prep.snapshot);
    expect(adapter.getStateHash()).toBe(prep.beforeStateHash);
  });
});
