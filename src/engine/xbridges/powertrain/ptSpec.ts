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
] as const;

export type PtCategory = typeof PT_CATEGORY_ORDER[number];

export const PT_SYMBOL_IDS = [
  'drive-cycle', 'driver', 'vehicle', 'wheel', 'clutch', 'torque-converter', 'compliance', 'inertia', 'gear',
  'planetary', 'differential', 'transfer-case', 'transmission', 'cvt', 'transmission-controller', 'battery',
  'ecm-battery', 'dcdc', 'starter', 'alternator', 'motor-mapped', 'pmsm', 'induction-motor', 'inverter',
  'motor-controller', 'engine-si', 'engine-ci', 'engine-core', 'engine-controller', 'control-volume',
  'flow-boundary', 'flow-restriction', 'heat-exchanger', 'throttle', 'compressor', 'turbine', 'boost-shaft', 'two-way',
] as const;

export type PtSymbolId = typeof PT_SYMBOL_IDS[number];

export interface PtBlockSpec {
  type: string; // PT_...
  label: string;
  category: PtCategory;
  simulinkPath: string;
  source: 'simulink-docs' | 'inventory';
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
