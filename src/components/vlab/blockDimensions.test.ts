import { describe, it, expect } from 'vitest';
import { getBlockDimensions, BLOCK_DIMENSIONS } from './blockDimensions';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

describe('blockDimensions', () => {
  it('returns known overrides', () => {
    expect(getBlockDimensions('resistor')).toEqual({ width: 60, height: 30 });
    expect(getBlockDimensions('ground')).toEqual({ width: 40, height: 30 });
    expect(getBlockDimensions('im_foc_ctrl')).toEqual({ width: 80, height: 80 });
  });

  it('falls back to the default box for unknown types', () => {
    expect(getBlockDimensions('definitely_not_a_type')).toEqual({ width: 60, height: 60 });
    expect(getBlockDimensions(undefined)).toEqual({ width: 60, height: 60 });
  });

  it('resolves every library icon id to positive integer dimensions', () => {
    const ids = VLAB_LIBRARY.flatMap(d => d.blocks.map(b => b.id));
    expect(ids.length).toBeGreaterThan(100);
    for (const id of ids) {
      const d = getBlockDimensions(id);
      expect(Number.isInteger(d.width)).toBe(true);
      expect(Number.isInteger(d.height)).toBe(true);
      expect(d.width).toBeGreaterThan(0);
      expect(d.height).toBeGreaterThan(0);
    }
    for (const [id, d] of Object.entries(BLOCK_DIMENSIONS)) {
      expect(d.width).toBeGreaterThan(0);
      expect(d.height).toBeGreaterThan(0);
      expect(id).toMatch(/^[a-z0-9_]+$/);
    }
  });
});
