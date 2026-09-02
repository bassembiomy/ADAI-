import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import {
  VLAB_VALIDATION_CONTRACTS,
  assertBidirectionalCatalogCoverage,
  getValidationContract,
} from './vlabValidationContracts';
import { blockEquations } from './vlabEquations';

describe('V-Lab Validation Contract Registry', () => {
  it('validates 100% bidirectional catalog completeness across all VLAB_LIBRARY blocks', () => {
    const coverage = assertBidirectionalCatalogCoverage(VLAB_LIBRARY, blockEquations);
    expect(coverage.missingContracts).toEqual([]);
    expect(coverage.orphanContracts).toEqual([]);
    expect(coverage.missingEquationFactories).toEqual([]);
    expect(coverage.totalBlocks).toBe(242);
    expect(coverage.isComplete).toBe(true);
  });

  it('retrieves valid validation contract for any block in VLAB_LIBRARY', () => {
    const allBlocks = VLAB_LIBRARY.flatMap((domain) => domain.blocks);
    expect(allBlocks.length).toBe(242);

    for (const block of allBlocks) {
      const contract = getValidationContract(block.id);
      expect(contract).toBeDefined();
      expect(contract!.blockId).toBe(block.id);
      expect(contract!.domain).toBeDefined();
      expect(contract!.equationReference).toBeDefined();
      expect(contract!.tolerances.abs).toBeGreaterThan(0);
      expect(contract!.tolerances.rel).toBeGreaterThan(0);
      expect(contract!.tolerances.maxResidualNorm).toBeGreaterThan(0);
      expect(contract!.tolerances.conservationRel).toBeGreaterThan(0);
    }
  });
});
