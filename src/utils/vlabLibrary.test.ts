import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY, scoreVLabBlock, searchVLabBlocks } from './vlabLibrary';

describe('VLab Library Search & Scoring', () => {
  it('prioritizes exact name/id match "constant" over description matches', () => {
    const allBlocks = VLAB_LIBRARY.flatMap(d => d.blocks);
    const results = searchVLabBlocks(allBlocks, 'constant');

    expect(results.length).toBeGreaterThan(0);
    // The top result must be the Constant block
    expect(results[0].name).toBe('Constant');
    expect(results[0].id).toBe('constant');
  });

  it('scores exact matches higher than substring or description matches', () => {
    const constantBlock = VLAB_LIBRARY.flatMap(d => d.blocks).find(b => b.id === 'constant')!;
    const dcVoltageBlock = VLAB_LIBRARY.flatMap(d => d.blocks).find(b => b.id === 'dc_voltage')!;

    const constantScore = scoreVLabBlock(constantBlock, 'constant');
    const dcVoltageScore = scoreVLabBlock(dcVoltageBlock, 'constant');

    expect(constantScore).toBeGreaterThan(dcVoltageScore);
    expect(constantScore).toBe(1000);
  });
});
