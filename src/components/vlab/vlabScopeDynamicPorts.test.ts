// src/components/vlab/vlabScopeDynamicPorts.test.ts
import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

describe('VLab Scope specs', () => {
  it('contains full XBridges parameter suite in vlabLibrary', () => {
    const scopeItem = VLAB_LIBRARY.flatMap(cat => cat.blocks).find(b => b.id === 'scope');
    expect(scopeItem).toBeDefined();
    expect(scopeItem?.params.numSignals).toBeDefined();
    expect(scopeItem?.params.buffer_size).toBeDefined();
    expect(scopeItem?.params.limit_data_points).toBeDefined();
    expect(scopeItem?.params.decimation).toBeDefined();
    expect(scopeItem?.params.sample_time).toBeDefined();
    expect(scopeItem?.params.show_grid).toBeDefined();
    expect(scopeItem?.params.show_legend).toBeDefined();
  });
});
