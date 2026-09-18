import { describe, it, expect } from 'vitest';
import { RepairLoop } from './repairLoop';
import { EngineeringModelAdapter } from '../adapters/engineeringModelAdapter';

describe('RepairLoop Bounded Execution', () => {
  it('automatically remediates deterministic parameter errors in a single attempt', async () => {
    const adapter = new EngineeringModelAdapter('xbridges');

    await adapter.addBlock({
      id: 'dc_src',
      blockDefinitionId: 'Constant',
      domain: 'xbridges',
      name: 'DC Source',
      parameters: [{ blockId: 'dc_src', parameterName: 'value', value: 400 }]
    });

    await adapter.addBlock({
      id: 'inv',
      blockDefinitionId: 'THREE_PHASE_INVERTER',
      domain: 'xbridges',
      name: 'Inverter',
      // Negative Ron
      parameters: [{ blockId: 'inv', parameterName: 'Ron', value: -0.05 }]
    });

    await adapter.connectPorts({ id: 'c_p', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'vdc_p', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_n', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'vdc_n', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_ga', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'ga', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_gb', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'gb', domain: 'xbridges' });
    await adapter.connectPorts({ id: 'c_gc', fromBlockId: 'dc_src', fromPortId: 'out', toBlockId: 'inv', toPortId: 'gc', domain: 'xbridges' });

    const repairRes = await RepairLoop.run(adapter, 3);
    expect(repairRes.success).toBe(true);
    expect(repairRes.totalAttempts).toBe(1);

    // Verify parameter was fixed
    const invBlock = adapter.getBlock('inv');
    expect(Number(invBlock?.parameters.Ron)).toBeGreaterThan(0);
  });

  it('stops within 3 attempts and reports unresolved diagnostics on unrepairable faults', async () => {
    const adapter = new EngineeringModelAdapter('xbridges');

    // Unknown block is unrepairable deterministically
    adapter['blocks'].set('bad_block', {
      id: 'bad_block',
      blockDefinitionId: 'NONEXISTENT_MAGIC_BLOCK_UNKNOWN',
      domain: 'xbridges',
      name: 'Corrupted',
      parameters: {}
    });

    const repairRes = await RepairLoop.run(adapter, 3);
    expect(repairRes.success).toBe(false);
    expect(repairRes.totalAttempts).toBeLessThanOrEqual(3);
    expect(repairRes.unresolvedDiagnostics.length).toBeGreaterThan(0);
    expect(repairRes.unresolvedDiagnostics.some(d => d.code === 'UNKNOWN_BLOCK_DEFINITION')).toBe(true);
  });
});
