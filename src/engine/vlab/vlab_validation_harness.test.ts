import { describe, it, expect } from 'vitest';
import { runBlockValidationHarness } from './vlabValidationHarness';
import { getValidationContract } from './vlabValidationContracts';

describe('V-Lab Validation Harness', () => {
  it('executes validation harness for resistor block and returns structured evidence', () => {
    const contract = getValidationContract('resistor');
    expect(contract).toBeDefined();

    const result = runBlockValidationHarness(contract!);
    expect(result.success).toBe(true);
    expect(result.blockId).toBe('resistor');
    expect(result.maxResidualNorm).toBeLessThanOrEqual(contract!.tolerances.maxResidualNorm);
    expect(result.maxRelError).toBeLessThanOrEqual(contract!.tolerances.rel);
    expect(result.observedConvergenceRate).toBeGreaterThanOrEqual(contract!.tolerances.convergenceOrderMin ?? 0.5);
    expect(result.diagnostics).toEqual([]);
  });

  it('executes validation harness for capacitor block and verifies dynamic transient continuity', () => {
    const contract = getValidationContract('capacitor');
    expect(contract).toBeDefined();

    const result = runBlockValidationHarness(contract!);
    expect(result.success).toBe(true);
    expect(result.blockId).toBe('capacitor');
    expect(result.maxResidualNorm).toBeLessThanOrEqual(contract!.tolerances.maxResidualNorm);
  });
});
