import { describe, expect, it } from 'vitest';
import type { BlockData } from '../../types/sysml_types';
import { computeBlockDisplayBounds } from './blockLayout';

const block = (overrides: Partial<BlockData> = {}): BlockData => ({
  id: 'b', name: 'NewBlock', stereotype: 'block', x: 0, y: 0, width: 150, height: 100,
  properties: [], operations: [], constraints: [], classes: [], ports: [], ...overrides,
});

describe('computeBlockDisplayBounds', () => {
  it('expands width to contain long visible property text', () => {
    const bounds = computeBlockDisplayBounds(block({
      properties: [{ id: 'p', name: 'identifier', type: 'UUID', defaultValue: '41c3b6a9-04fc-4307-add5-e4e656f7bbf4 [1] {unique} <value>' }],
    }));
    expect(bounds.width).toBeGreaterThan(150);
  });

  it('expands height for rows and ports instead of drawing them outside the frame', () => {
    const bounds = computeBlockDisplayBounds(block({
      height: 60,
      properties: [{ id: 'p1', name: 'a', type: 'int' }, { id: 'p2', name: 'b', type: 'int' }, { id: 'p3', name: 'c', type: 'int' }],
      operations: ['op1()', 'op2()'],
      constraints: ['a > 0', 'b > 0'],
      ports: Array.from({ length: 5 }, (_, i) => ({ id: `port-${i}`, name: `p${i}`, type: 'Signal' })),
    }));
    expect(bounds.height).toBeGreaterThan(100);
  });

  it('keeps every owned property visible instead of truncating the Block compartment', () => {
    const bounds = computeBlockDisplayBounds(block({
      height: 60,
      properties: Array.from({ length: 8 }, (_, index) => ({ id: `p-${index}`, name: `part${index}`, type: 'Motor', kind: 'part' as const })),
    }));
    expect(bounds.height).toBeGreaterThanOrEqual(145);
  });
});
