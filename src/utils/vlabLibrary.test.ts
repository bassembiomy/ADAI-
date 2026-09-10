import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY, scoreVLabBlock, searchVLabBlocks } from './vlabLibrary';

describe('VLab Library Search & Scoring', () => {
  it('defines the PMSM with three-phase electrical and rotational ports', () => {
    const pmsm = VLAB_LIBRARY.flatMap(d => d.blocks).find(b => b.id === 'pmsm');

    expect(pmsm?.ports.map(port => port.id)).toEqual(['a', 'b', 'c', 'n', 'r']);
    expect(pmsm?.ports.slice(0, 4).every(port => port.domain === 'Electrical')).toBe(true);
    expect(pmsm?.ports[4]?.domain).toBe('Rotational');
  });

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
