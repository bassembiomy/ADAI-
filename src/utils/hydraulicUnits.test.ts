import { describe, it, expect } from 'vitest';
import {
  convertPressureToSI,
  convertPressureFromSI,
  convertElevationToSI,
  convertElevationFromSI,
  computeAbsoluteReferencePressure,
  computeEffectivePortPressure,
  type PressureUnit,
  type ElevationUnit
} from './hydraulicUnits';

describe('Hydraulic Unit Conversion Engine', () => {
  it('converts pressure between Pa, bar, and psi accurately', () => {
    expect(convertPressureToSI(1, 'bar')).toBeCloseTo(100000, 5);
    expect(convertPressureToSI(1, 'atm')).toBeCloseTo(101325, 5);
    expect(convertPressureToSI(14.6959, 'psi')).toBeCloseTo(101325, 0);
    expect(convertPressureFromSI(100000, 'bar')).toBeCloseTo(1, 5);
    expect(convertPressureFromSI(1000, 'kPa')).toBeCloseTo(1, 5);
    expect(convertPressureFromSI(1e6, 'MPa')).toBeCloseTo(1, 5);
  });

  it('computes absolute pressure for absolute and gauge types', () => {
    // Absolute mode: p_abs = p_ref
    const absRes = computeAbsoluteReferencePressure(2, 'bar', 'absolute', 1, 'atm');
    expect(absRes).toBeCloseTo(200000, 5);

    // Gauge mode: p_abs = p_atm + p_ref
    const gaugeRes = computeAbsoluteReferencePressure(2, 'bar', 'gauge', 1, 'atm');
    expect(gaugeRes).toBeCloseTo(200000 + 101325, 5);
  });

  it('converts elevation units correctly', () => {
    expect(convertElevationToSI(10, 'm')).toBe(10);
    expect(convertElevationToSI(100, 'cm')).toBeCloseTo(1, 5);
    expect(convertElevationToSI(1000, 'mm')).toBeCloseTo(1, 5);
    expect(convertElevationToSI(1, 'km')).toBe(1000);
    expect(convertElevationToSI(1, 'ft')).toBeCloseTo(0.3048, 4);
    expect(convertElevationToSI(12, 'in')).toBeCloseTo(0.3048, 4);
    expect(convertElevationFromSI(10, 'm')).toBe(10);
  });

  it('computes elevation hydrostatic correction when enabled', () => {
    const pAbsPa = 100000;
    // With elevation correction disabled
    expect(computeEffectivePortPressure(pAbsPa, false, 10, 'm', 0, 'm')).toBe(100000);

    // With elevation correction enabled: p_A = p_abs + rho * g * (z_ref - z_A)
    // rho = 1000, g = 9.80665, dz = 10 m -> dp = 98066.5 Pa
    const pEff = computeEffectivePortPressure(pAbsPa, true, 10, 'm', 0, 'm', 1000);
    expect(pEff).toBeCloseTo(100000 + 1000 * 9.80665 * 10, 2);
  });
});
