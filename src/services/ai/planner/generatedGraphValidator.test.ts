import { describe, it, expect } from 'vitest';
import { buildXbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';
import {
  validateGeneratedGraph,
  InternalBlockSpec,
  InternalConnSpec,
} from './generatedGraphValidator';

describe('generatedGraphValidator', () => {
  const catalog = buildXbridgesCapabilityIndex();

  it('validates a correct arithmetic pipeline graph', () => {
    const blocks: InternalBlockSpec[] = [
      { id: 'c1', type: 'Constant', params: { value: 10 }, position: { x: 0, y: 0 } },
      { id: 'c2', type: 'Constant', params: { value: 100 }, position: { x: 0, y: 100 } },
      { id: 'mul', type: 'VectorMul', params: {}, position: { x: 200, y: 50 } },
      { id: 'scope', type: 'Scope', params: {}, position: { x: 400, y: 50 } },
    ];
    const connections: InternalConnSpec[] = [
      { fromBlockId: 'c1', fromPortId: 'out', toBlockId: 'mul', toPortId: 'in1' },
      { fromBlockId: 'c2', fromPortId: 'out', toBlockId: 'mul', toPortId: 'in2' },
      { fromBlockId: 'mul', fromPortId: 'out', toBlockId: 'scope', toPortId: 'in1' },
    ];

    const result = validateGeneratedGraph(blocks, connections, catalog, { requireObservableSink: true });
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('validates a correct feedback control loop', () => {
    const blocks: InternalBlockSpec[] = [
      { id: 'step', type: 'Step', params: { stepTime: 1, initialValue: 0, finalValue: 1 }, position: { x: 0, y: 0 } },
      { id: 'sum', type: 'Sum', params: { signs: '+-' }, position: { x: 150, y: 0 } },
      { id: 'integrator', type: 'Integrator', params: { initialCondition: 0 }, position: { x: 300, y: 0 } },
      { id: 'scope', type: 'Scope', params: {}, position: { x: 450, y: 0 } },
    ];
    const connections: InternalConnSpec[] = [
      { fromBlockId: 'step', fromPortId: 'out', toBlockId: 'sum', toPortId: 'in1' },
      { fromBlockId: 'sum', fromPortId: 'out', toBlockId: 'integrator', toPortId: 'in' },
      { fromBlockId: 'integrator', fromPortId: 'out', toBlockId: 'sum', toPortId: 'in2' },
      { fromBlockId: 'integrator', fromPortId: 'out', toBlockId: 'scope', toPortId: 'in1' },
    ];

    const result = validateGeneratedGraph(blocks, connections, catalog, { requireObservableSink: true });
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('rejects duplicate block IDs', () => {
    const blocks: InternalBlockSpec[] = [
      { id: 'b1', type: 'Constant', params: { value: 1 }, position: { x: 0, y: 0 } },
      { id: 'b1', type: 'Scope', params: {}, position: { x: 200, y: 0 } },
    ];
    const connections: InternalConnSpec[] = [
      { fromBlockId: 'b1', fromPortId: 'out', toBlockId: 'b1', toPortId: 'in' },
    ];

    const result = validateGeneratedGraph(blocks, connections, catalog);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'DUPLICATE_BLOCK_ID')).toBe(true);
  });

  it('rejects unknown block types', () => {
    const blocks: InternalBlockSpec[] = [
      { id: 'c1', type: 'MagicTeleporter', params: {}, position: { x: 0, y: 0 } },
      { id: 's1', type: 'Scope', params: {}, position: { x: 200, y: 0 } },
    ];
    const connections: InternalConnSpec[] = [
      { fromBlockId: 'c1', fromPortId: 'out', toBlockId: 's1', toPortId: 'in' },
    ];

    const result = validateGeneratedGraph(blocks, connections, catalog);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'UNKNOWN_BLOCK_TYPE')).toBe(true);
  });

  it('rejects unknown source ports and unknown target ports', () => {
    const blocks: InternalBlockSpec[] = [
      { id: 'c1', type: 'Constant', params: { value: 5 }, position: { x: 0, y: 0 } },
      { id: 's1', type: 'Scope', params: {}, position: { x: 200, y: 0 } },
    ];
    const connections: InternalConnSpec[] = [
      { fromBlockId: 'c1', fromPortId: 'nonexistent_out', toBlockId: 's1', toPortId: 'in' },
      { fromBlockId: 'c1', fromPortId: 'out', toBlockId: 's1', toPortId: 'nonexistent_in' },
    ];

    const result = validateGeneratedGraph(blocks, connections, catalog);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'UNKNOWN_SOURCE_PORT')).toBe(true);
    expect(result.diagnostics.some(d => d.code === 'UNKNOWN_TARGET_PORT')).toBe(true);
  });

  it('rejects reversed port directions (source is input, target is output)', () => {
    const blocks: InternalBlockSpec[] = [
      { id: 's1', type: 'Scope', params: {}, position: { x: 0, y: 0 } },
      { id: 'c1', type: 'Constant', params: { value: 1 }, position: { x: 200, y: 0 } },
    ];
    // Scope has input 'in', Constant has output 'out'. Connecting Scope.in -> Constant.out is reversed!
    const connections: InternalConnSpec[] = [
      { fromBlockId: 's1', fromPortId: 'in', toBlockId: 'c1', toPortId: 'out' },
    ];

    const result = validateGeneratedGraph(blocks, connections, catalog);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'UNKNOWN_SOURCE_PORT' || d.code === 'INVALID_PORT_DIRECTION')).toBe(true);
    expect(result.diagnostics.some(d => d.code === 'UNKNOWN_TARGET_PORT' || d.code === 'INVALID_PORT_DIRECTION')).toBe(true);
  });

  it('rejects dangling connections referencing nonexistent blocks', () => {
    const blocks: InternalBlockSpec[] = [
      { id: 'c1', type: 'Constant', params: { value: 1 }, position: { x: 0, y: 0 } },
    ];
    const connections: InternalConnSpec[] = [
      { fromBlockId: 'c1', fromPortId: 'out', toBlockId: 'ghost_block', toPortId: 'in' },
      { fromBlockId: 'phantom_block', fromPortId: 'out', toBlockId: 'c1', toPortId: 'in' },
    ];

    const result = validateGeneratedGraph(blocks, connections, catalog);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.filter(d => d.code === 'DANGLING_CONNECTION').length).toBeGreaterThanOrEqual(2);
  });

  it('rejects duplicate connections between identical ports', () => {
    const blocks: InternalBlockSpec[] = [
      { id: 'c1', type: 'Constant', params: { value: 1 }, position: { x: 0, y: 0 } },
      { id: 's1', type: 'Scope', params: {}, position: { x: 200, y: 0 } },
    ];
    const connections: InternalConnSpec[] = [
      { fromBlockId: 'c1', fromPortId: 'out', toBlockId: 's1', toPortId: 'in' },
      { fromBlockId: 'c1', fromPortId: 'out', toBlockId: 's1', toPortId: 'in' },
    ];

    const result = validateGeneratedGraph(blocks, connections, catalog);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'DUPLICATE_CONNECTION')).toBe(true);
  });

  it('rejects invalid parameters (unknown param name or non-finite values)', () => {
    const blocks: InternalBlockSpec[] = [
      { id: 'c1', type: 'Constant', params: { value: NaN }, position: { x: 0, y: 0 } },
      { id: 'c2', type: 'Constant', params: { value: Infinity }, position: { x: 0, y: 50 } },
      { id: 'c3', type: 'Constant', params: { illegalParam: 123 }, position: { x: 0, y: 100 } },
      { id: 's1', type: 'Scope', params: {}, position: { x: 200, y: 0 } },
    ];
    const connections: InternalConnSpec[] = [
      { fromBlockId: 'c1', fromPortId: 'out', toBlockId: 's1', toPortId: 'in' },
    ];

    const result = validateGeneratedGraph(blocks, connections, catalog);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'INVALID_PARAMETER')).toBe(true);
  });

  it('rejects disconnected blocks that are neither pure sources nor sinks', () => {
    const blocks: InternalBlockSpec[] = [
      { id: 'c1', type: 'Constant', params: { value: 1 }, position: { x: 0, y: 0 } },
      { id: 'gain', type: 'Gain', params: { K: 2 }, position: { x: 100, y: 0 } }, // totally isolated
      { id: 's1', type: 'Scope', params: {}, position: { x: 200, y: 0 } },
    ];
    const connections: InternalConnSpec[] = [
      { fromBlockId: 'c1', fromPortId: 'out', toBlockId: 's1', toPortId: 'in' },
    ];

    const result = validateGeneratedGraph(blocks, connections, catalog);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'DISCONNECTED_BLOCK' && d.entityId === 'gain')).toBe(true);
  });

  it('rejects missing observable sink when required', () => {
    const blocks: InternalBlockSpec[] = [
      { id: 'c1', type: 'Constant', params: { value: 1 }, position: { x: 0, y: 0 } },
      { id: 'gain', type: 'Gain', params: { K: 2 }, position: { x: 100, y: 0 } },
    ];
    const connections: InternalConnSpec[] = [
      { fromBlockId: 'c1', fromPortId: 'out', toBlockId: 'gain', toPortId: 'in' },
    ];

    const result = validateGeneratedGraph(blocks, connections, catalog, { requireObservableSink: true });
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'MISSING_OBSERVABLE_SINK')).toBe(true);
  });

  it('enforces graph size limits for blocks and connections', () => {
    const blocks: InternalBlockSpec[] = [
      { id: 'c1', type: 'Constant', params: { value: 1 }, position: { x: 0, y: 0 } },
      { id: 's1', type: 'Scope', params: {}, position: { x: 200, y: 0 } },
    ];
    const connections: InternalConnSpec[] = [
      { fromBlockId: 'c1', fromPortId: 'out', toBlockId: 's1', toPortId: 'in' },
    ];

    const smallBlockLimitResult = validateGeneratedGraph(blocks, connections, catalog, { maxBlocks: 1 });
    expect(smallBlockLimitResult.valid).toBe(false);
    expect(smallBlockLimitResult.diagnostics.some(d => d.code === 'EXCEEDS_MAX_BLOCKS')).toBe(true);

    const smallConnLimitResult = validateGeneratedGraph(blocks, connections, catalog, { maxConnections: 0 });
    expect(smallConnLimitResult.valid).toBe(false);
    expect(smallConnLimitResult.diagnostics.some(d => d.code === 'EXCEEDS_MAX_CONNECTIONS')).toBe(true);
  });
});
