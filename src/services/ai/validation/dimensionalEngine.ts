import { UNIT_TABLE, CANONICAL_DIMENSIONS, DimensionVector } from './dimensionVectors';
import { Diagnostic } from '../contracts/diagnostics';

export interface EngineeringQuantity {
  value: number;
  unit: string;
}

export class DimensionalEngine {
  public static normalize(q: EngineeringQuantity): { normalizedValue: number; baseUnit: string; dimensionVector: DimensionVector } {
    if (!Number.isFinite(q.value)) {
      throw new Error(`NON_FINITE_QUANTITY: Value '${q.value}' is not a finite number.`);
    }
    const spec = UNIT_TABLE[q.unit];
    if (!spec) {
      throw new Error(`Unregistered unit: ${q.unit}`);
    }
    return {
      normalizedValue: q.value * spec.scale,
      baseUnit: spec.baseUnit,
      dimensionVector: spec.dimensionVector
    };
  }

  public static validateCompatibility(q: EngineeringQuantity, expectedDimensionName: string): { isValid: boolean; diagnostics: Diagnostic[] } {
    if (!Number.isFinite(q.value)) {
      return {
        isValid: false,
        diagnostics: [{ code: 'NON_FINITE_VALUE', severity: 'ERROR', message: `Quantity value is not finite: ${q.value}` }]
      };
    }
    const spec = UNIT_TABLE[q.unit];
    if (!spec) {
      return {
        isValid: false,
        diagnostics: [{ code: 'UNKNOWN_UNIT', severity: 'ERROR', message: `Unknown engineering unit: ${q.unit}` }]
      };
    }
    const expectedVector = CANONICAL_DIMENSIONS[expectedDimensionName];
    if (!expectedVector) {
      return {
        isValid: false,
        diagnostics: [{ code: 'UNKNOWN_DIMENSION', severity: 'ERROR', message: `Unknown dimension: ${expectedDimensionName}` }]
      };
    }
    const match = spec.dimensionVector.every((val, idx) => val === expectedVector[idx]);
    if (!match) {
      return {
        isValid: false,
        diagnostics: [{
          code: 'DIMENSION_MISMATCH',
          severity: 'ERROR',
          message: `Parameter with unit '${q.unit}' (${spec.dimensionName}) does not match expected dimension '${expectedDimensionName}'.`
        }]
      };
    }
    return { isValid: true, diagnostics: [] };
  }
}
