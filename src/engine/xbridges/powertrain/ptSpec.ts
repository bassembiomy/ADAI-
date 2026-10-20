// Powertrain blockset: single source of truth per block (plan §3.1).

export interface PtPortSpec {
  id: string;
  name: string;
  direction: 'input' | 'output';
  /** SI unit, '1' dimensionless, 'bus' for buses. */
  unit: string;
  /** 1-based position per direction, as in the Simulink block. */
  simulinkIndex: number;
  dimensions?: number[];
  /** e.g. 'Bus: <Name>' for bus ports. */
  dataType?: string;
  description: string;
  /** Inputs only: false when the input does not affect any output instantaneously. Default true. */
  feedthrough?: boolean;
}

export interface PtParamSpec {
  name: string;
  label: string;
  unit: string;
  default: number | number[] | number[][] | string;
  min?: number;
  max?: number;
  minExclusive?: boolean;
  maxExclusive?: boolean;
  kind: 'scalar' | 'vector' | 'table' | 'enum';
  options?: string[];
  description: string;
}

export const PT_CATEGORY_ORDER = [
  'Powertrain / Vehicle Scenarios / Drive Cycle and Maneuvers',
  'Powertrain / Vehicle Scenarios / Driver',
  'Powertrain / Vehicle Dynamics / Vehicle Body',
  'Powertrain / Drivetrain / Wheels',
  'Powertrain / Drivetrain / Couplings',
  'Powertrain / Drivetrain / Final Drive Unit',
  'Powertrain / Drivetrain / Transmissions',
  'Powertrain / Drivetrain / Transmission Controllers',
  'Powertrain / Energy Storage and Auxiliary Drive / Batteries',
  'Powertrain / Energy Storage and Auxiliary Drive / Auxiliary Drive',
  'Powertrain / Propulsion / Electric Motors and Inverters',
  'Powertrain / Propulsion / Electric Motor Controllers',
  'Powertrain / Propulsion / Combustion Engines',
  'Powertrain / Propulsion / Combustion Engine Controllers',
  'Powertrain / Propulsion / Combustion Engine Components / Fundamental Flow',
  'Powertrain / Propulsion / Combustion Engine Components / Boost',
  'Powertrain / Engine Calibration / Engine Plant',
  'Powertrain / Engine Calibration / Air Path',
  'Powertrain / Engine Calibration / Fueling and Actuation',
  'Powertrain / Engine Calibration / Control and Calibration',
  'Powertrain / Engine Calibration / Test Cell and DoE',
] as const;

export type PtCategory = typeof PT_CATEGORY_ORDER[number];

export const PT_SYMBOL_IDS = [
  'drive-cycle', 'driver', 'vehicle', 'wheel', 'clutch', 'torque-converter', 'compliance', 'inertia', 'gear',
  'planetary', 'differential', 'transfer-case', 'transmission', 'cvt', 'transmission-controller', 'battery',
  'ecm-battery', 'dcdc', 'starter', 'alternator', 'motor-mapped', 'pmsm', 'induction-motor', 'inverter',
  'motor-controller', 'engine-si', 'engine-ci', 'engine-core', 'engine-controller', 'control-volume',
  'flow-boundary', 'flow-restriction', 'heat-exchanger', 'throttle', 'compressor', 'turbine', 'boost-shaft', 'two-way',
  'cylinder-ci', 'cylinder-si', 'intake-manifold', 'turbocharger', 'fuel-injector', 'valvetrain', 'calibration-ecu',
  'calibration-map', 'dyno', 'ambient', 'doe-sweeper',
] as const;

export type PtSymbolId = typeof PT_SYMBOL_IDS[number];

export interface PtBlockSpec {
  type: string; // PT_...
  label: string;
  category: PtCategory;
  simulinkPath: string; // '' for user-spec blocks (kept required so existing blocks compile unchanged)
  source: 'simulink-docs' | 'inventory' | 'user-spec';
  specRef?: string; // doc anchor for user-spec blocks
  symbol: PtSymbolId;
  inputs: PtPortSpec[];
  outputs: PtPortSpec[];
  params: PtParamSpec[];
  variants?: { param: string; ports: Record<string, { inputs: PtPortSpec[]; outputs: PtPortSpec[] }> };
  states: string[];
  equations: string[];
  references: string[];
  description: string;
  behavior: string;
  example: string;
}
