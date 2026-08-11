// src/utils/scopeUtils.test.ts
import { describe, it, expect } from 'vitest';
import { getVLabSignalInfo, exportScopeToCSV, VLAB_SIGNAL_COLORS } from './scopeUtils';

describe('scopeUtils', () => {
  it('resolves connected source block, port label, and data type', () => {
    const nodes = [
      { id: 'sensor1', data: { label: 'Voltage Sensor', outputs: [{ id: 'v_s', name: 'v_s', dataType: 'double' }] } },
      { id: 'scope1', data: { type: 'scope' } }
    ];
    const edges = [
      { id: 'e1', source: 'sensor1', target: 'scope1', sourceHandle: 'v_s', targetHandle: 'in1' }
    ];

    const info = getVLabSignalInfo('scope1', 0, nodes, edges, []);
    expect(info.connected).toBe(true);
    expect(info.blockLabel).toBe('Voltage Sensor');
    expect(info.portName).toBe('v_s');
    expect(info.dataType).toBe('double');
    expect(info.fullName).toBe('Channel 1: Voltage Sensor.v_s (double)');
  });

  it('handles unconnected channel gracefully', () => {
    const info = getVLabSignalInfo('scope1', 1, [], [], []);
    expect(info.connected).toBe(false);
    expect(info.blockLabel).toBe('Unconnected');
    expect(info.fullName).toBe('Channel 2: Unconnected (auto)');
  });

  it('formats scope data into CSV string', () => {
    const signalInfos = [
      { connected: true, name: 'Ch 1', dataType: 'double', portName: 'out', blockLabel: 'Sensor', fullName: 'Channel 1: Sensor.out (double)' }
    ];
    const displayData = [
      { time: 0, in1: 5.0 },
      { time: 0.1, in1: 10.0 }
    ];

    const csv = exportScopeToCSV('TestScope', displayData, signalInfos);
    expect(csv).toContain('Time (s),"Channel 1: Sensor.out (double)"');
    expect(csv).toContain('0.000,5');
    expect(csv).toContain('0.100,10');
  });

  it('provides 8 high contrast colors', () => {
    expect(VLAB_SIGNAL_COLORS.length).toBe(8);
  });
});
