import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { blockEquations } from './vlabEquations';
import {
  VLAB_VALIDATION_CONTRACTS,
  assertBidirectionalCatalogCoverage,
} from './vlabValidationContracts';
import { runBlockValidationHarness } from './vlabValidationHarness';

describe('V-Lab Engineering Readiness Gate', () => {
  it('GATE-01: Bidirectional Catalog & Equation Factory Completeness (242 Blocks)', () => {
    const coverage = assertBidirectionalCatalogCoverage(VLAB_LIBRARY, blockEquations);

    expect(coverage.missingContracts).toEqual([]);
    expect(coverage.orphanContracts).toEqual([]);
    expect(coverage.missingEquationFactories).toEqual([]);
    expect(coverage.totalBlocks).toBe(242);
    expect(coverage.isComplete).toBe(true);
  });

  it('GATE-02: Block Contract Certification (Zero Silent Fallbacks, Finite Trajectories)', { timeout: 120_000 }, () => {
    const allBlocks = VLAB_LIBRARY.flatMap((domain) => domain.blocks);
    const failedBlocks: string[] = [];

    for (const block of allBlocks) {
      const contract = VLAB_VALIDATION_CONTRACTS[block.id];
      if (!contract) {
        failedBlocks.push(`${block.id} (missing contract)`);
        continue;
      }

      const result = runBlockValidationHarness(contract);
      if (!result.success) {
        failedBlocks.push(`${block.id}: ${result.diagnostics.join('; ')}`);
      }
    }

    expect(failedBlocks).toEqual([]);
  });

  it('GATE-03: Numerical Precision & Tolerance Verification Policy', () => {
    const sampleBlockIds = ['resistor', 'capacitor', 'inductor', 'conductive_heat', 'mass'];

    for (const id of sampleBlockIds) {
      const contract = VLAB_VALIDATION_CONTRACTS[id];
      expect(contract).toBeDefined();

      const result = runBlockValidationHarness(contract!);
      expect(result.maxResidualNorm).toBeLessThanOrEqual(contract!.tolerances.maxResidualNorm);
      expect(result.observedConvergenceRate).toBeGreaterThanOrEqual(contract!.tolerances.convergenceOrderMin ?? 0.5);
    }
  });
});
