// src/utils/hydraulicUnits.ts

export type PressureUnit = 'Pa' | 'kPa' | 'MPa' | 'bar' | 'psi' | 'atm';
export type ElevationUnit = 'm' | 'cm' | 'mm' | 'km' | 'ft' | 'in';
export type PressureType = 'absolute' | 'gauge';

export const PRESSURE_FACTORS: Record<PressureUnit, number> = {
  Pa: 1,
  kPa: 1e3,
  MPa: 1e6,
  bar: 1e5,
  psi: 6894.757293168,
  atm: 101325,
};

export const ELEVATION_FACTORS: Record<ElevationUnit, number> = {
  m: 1,
  cm: 0.01,
  mm: 0.001,
  km: 1e3,
  ft: 0.3048,
  in: 0.0254,
};

export const GRAVITY = 9.80665;
export const STANDARD_LIQUID_DENSITY = 1000; // kg/m^3 (water reference)

export function convertPressureToSI(value: number, unit: PressureUnit): number {
  const factor = PRESSURE_FACTORS[unit] ?? 1;
  return value * factor;
}

export function convertPressureFromSI(siValue: number, unit: PressureUnit): number {
  const factor = PRESSURE_FACTORS[unit] ?? 1;
  return siValue / factor;
}

export function convertElevationToSI(value: number, unit: ElevationUnit): number {
  const factor = ELEVATION_FACTORS[unit] ?? 1;
  return value * factor;
}

export function convertElevationFromSI(siValue: number, unit: ElevationUnit): number {
  const factor = ELEVATION_FACTORS[unit] ?? 1;
  return siValue / factor;
}

export function computeAbsoluteReferencePressure(
  pRef: number,
  pRefUnit: PressureUnit,
  pType: PressureType,
  pAtm: number,
  pAtmUnit: PressureUnit
): number {
  const pRefPa = convertPressureToSI(pRef, pRefUnit);
  if (String(pType).toLowerCase() === 'gauge') {
    const pAtmPa = convertPressureToSI(pAtm, pAtmUnit);
    return pAtmPa + pRefPa;
  }
  return pRefPa;
}

export function computeEffectivePortPressure(
  pAbsPa: number,
  elevationCorrection: boolean,
  zRef: number,
  zRefUnit: ElevationUnit,
  zA: number,
  zAUnit: ElevationUnit,
  rho: number = STANDARD_LIQUID_DENSITY
): number {
  if (!elevationCorrection) return pAbsPa;
  const zRefM = convertElevationToSI(zRef, zRefUnit);
  const zAM = convertElevationToSI(zA, zAUnit);
  return pAbsPa + rho * GRAVITY * (zRefM - zAM);
}
