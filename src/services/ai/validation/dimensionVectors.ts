export type DimensionVector = readonly [number, number, number, number, number, number, number];

export interface UnitSpec {
  readonly scale: number;
  readonly baseUnit: string;
  readonly dimensionName: string;
  readonly dimensionVector: DimensionVector;
}

export const CANONICAL_DIMENSIONS: Record<string, DimensionVector> = {
  Dimensionless: [0, 0, 0, 0, 0, 0, 0],
  Voltage: [1, 2, -3, -1, 0, 0, 0],
  Current: [0, 0, 0, 1, 0, 0, 0],
  Resistance: [1, 2, -3, -2, 0, 0, 0],
  Inductance: [1, 2, -2, -2, 0, 0, 0],
  Capacitance: [-1, -2, 4, 2, 0, 0, 0],
  Frequency: [0, 0, -1, 0, 0, 0, 0],
  Time: [0, 0, 1, 0, 0, 0, 0]
};

export const UNIT_TABLE: Record<string, UnitSpec> = {
  '1': { scale: 1, baseUnit: '1', dimensionName: 'Dimensionless', dimensionVector: CANONICAL_DIMENSIONS.Dimensionless },
  '%': { scale: 0.01, baseUnit: '1', dimensionName: 'Dimensionless', dimensionVector: CANONICAL_DIMENSIONS.Dimensionless },
  'V': { scale: 1, baseUnit: 'V', dimensionName: 'Voltage', dimensionVector: CANONICAL_DIMENSIONS.Voltage },
  'kV': { scale: 1e3, baseUnit: 'V', dimensionName: 'Voltage', dimensionVector: CANONICAL_DIMENSIONS.Voltage },
  'mV': { scale: 1e-3, baseUnit: 'V', dimensionName: 'Voltage', dimensionVector: CANONICAL_DIMENSIONS.Voltage },
  'A': { scale: 1, baseUnit: 'A', dimensionName: 'Current', dimensionVector: CANONICAL_DIMENSIONS.Current },
  'mA': { scale: 1e-3, baseUnit: 'A', dimensionName: 'Current', dimensionVector: CANONICAL_DIMENSIONS.Current },
  'Ohm': { scale: 1, baseUnit: 'Ohm', dimensionName: 'Resistance', dimensionVector: CANONICAL_DIMENSIONS.Resistance },
  'kOhm': { scale: 1e3, baseUnit: 'Ohm', dimensionName: 'Resistance', dimensionVector: CANONICAL_DIMENSIONS.Resistance },
  'H': { scale: 1, baseUnit: 'H', dimensionName: 'Inductance', dimensionVector: CANONICAL_DIMENSIONS.Inductance },
  'mH': { scale: 1e-3, baseUnit: 'H', dimensionName: 'Inductance', dimensionVector: CANONICAL_DIMENSIONS.Inductance },
  'uH': { scale: 1e-6, baseUnit: 'H', dimensionName: 'Inductance', dimensionVector: CANONICAL_DIMENSIONS.Inductance },
  'F': { scale: 1, baseUnit: 'F', dimensionName: 'Capacitance', dimensionVector: CANONICAL_DIMENSIONS.Capacitance },
  'uF': { scale: 1e-6, baseUnit: 'F', dimensionName: 'Capacitance', dimensionVector: CANONICAL_DIMENSIONS.Capacitance },
  'nF': { scale: 1e-9, baseUnit: 'F', dimensionName: 'Capacitance', dimensionVector: CANONICAL_DIMENSIONS.Capacitance },
  'pF': { scale: 1e-12, baseUnit: 'F', dimensionName: 'Capacitance', dimensionVector: CANONICAL_DIMENSIONS.Capacitance },
  'Hz': { scale: 1, baseUnit: 'Hz', dimensionName: 'Frequency', dimensionVector: CANONICAL_DIMENSIONS.Frequency },
  'kHz': { scale: 1e3, baseUnit: 'Hz', dimensionName: 'Frequency', dimensionVector: CANONICAL_DIMENSIONS.Frequency },
  's': { scale: 1, baseUnit: 's', dimensionName: 'Time', dimensionVector: CANONICAL_DIMENSIONS.Time },
  'ms': { scale: 1e-3, baseUnit: 's', dimensionName: 'Time', dimensionVector: CANONICAL_DIMENSIONS.Time },
  'us': { scale: 1e-6, baseUnit: 's', dimensionName: 'Time', dimensionVector: CANONICAL_DIMENSIONS.Time }
};
