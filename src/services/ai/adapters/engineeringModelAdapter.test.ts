import { describe, it, expect } from 'vitest';
import { EngineeringModelAdapter } from './engineeringModelAdapter';

describe('EngineeringModelAdapter', () => {
  it('instantiates blocks, sets parameters, and connects ports accurately', async () => {
    const adapter = new EngineeringModelAdapter('xbridges');

    // Add DC Source
    const b1Res = await adapter.addBlock({
      id: 'dc_src',
      blockDefinitionId: 'Constant',
      domain: 'xbridges',
      name: 'DC Bus Source',
      parameters: [{ blockId: 'dc_src', parameterName: 'value', value: 400 }]
    });
    expect(b1Res.success).toBe(true);

    // Add 3-Phase Inverter
    const b2Res = await adapter.addBlock({
      id: 'inv_bridge',
      blockDefinitionId: 'THREE_PHASE_INVERTER',
      domain: 'xbridges',
      name: 'Main Inverter Bridge',
      parameters: [{ blockId: 'inv_bridge', parameterName: 'Ron', value: 0.01 }]
    });
    expect(b2Res.success).toBe(true);

    // Connect DC source to inverter vdc_p
    const connRes = await adapter.connectPorts({
      id: 'c_dc_p',
      fromBlockId: 'dc_src',
      fromPortId: 'out',
      toBlockId: 'inv_bridge',
      toPortId: 'vdc_p',
      domain: 'xbridges'
    });
    expect(connRes.success).toBe(true);

    // Verification
    expect(adapter.verifyBlockExists('dc_src', 'Constant')).toBe(true);
    expect(adapter.verifyBlockExists('inv_bridge', 'THREE_PHASE_INVERTER')).toBe(true);
    expect(adapter.verifyConnectionExists('c_dc_p')).toBe(true);

    const storedBlock = adapter.getBlock('dc_src');
    expect(storedBlock?.parameters.value).toBe(400);
  });

  it('rejects nonexistent blocks and unknown ports', async () => {
    const adapter = new EngineeringModelAdapter('xbridges');

    // Unknown block definition
    const badBlockRes = await adapter.addBlock({
      id: 'ghost',
      blockDefinitionId: 'NONEXISTENT_GHOST_BLOCK_XYZ',
      domain: 'xbridges',
      name: 'Ghost',
      parameters: []
    });
    expect(badBlockRes.success).toBe(false);
    expect(badBlockRes.error).toContain('Unknown block definition');

    // Add valid block
    await adapter.addBlock({
      id: 'inv',
      blockDefinitionId: 'THREE_PHASE_INVERTER',
      domain: 'xbridges',
      name: 'Inverter',
      parameters: []
    });

    // Unknown port connection
    const badConnRes = await adapter.connectPorts({
      id: 'c_bad',
      fromBlockId: 'inv',
      fromPortId: 'port_does_not_exist',
      toBlockId: 'inv',
      toPortId: 'vdc_p',
      domain: 'xbridges'
    });
    expect(badConnRes.success).toBe(false);
    expect(badConnRes.error).toContain('Source port');
  });

  it('supports snapshots and deterministic hash rollback', async () => {
    const adapter = new EngineeringModelAdapter('xbridges');

    await adapter.addBlock({
      id: 'b1',
      blockDefinitionId: 'Constant',
      domain: 'xbridges',
      name: 'Base Block',
      parameters: []
    });

    const initialHash = adapter.getStateHash();
    const snapshot = adapter.createSnapshot();

    // Mutate state
    await adapter.addBlock({
      id: 'b2',
      blockDefinitionId: 'THREE_PHASE_PWM',
      domain: 'xbridges',
      name: 'PWM Block',
      parameters: []
    });

    expect(adapter.getStateHash()).not.toBe(initialHash);
    expect(adapter.getAllBlocks()).toHaveLength(2);

    // Restore snapshot
    await adapter.restoreSnapshot(snapshot);
    expect(adapter.getStateHash()).toBe(initialHash);
    expect(adapter.getAllBlocks()).toHaveLength(1);
    expect(adapter.getBlock('b2')).toBeUndefined();
  });
});
