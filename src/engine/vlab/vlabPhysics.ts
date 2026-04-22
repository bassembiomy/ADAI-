import { ADIADomain } from '../../types/adia';

export interface DomainDefinition {
  across: string;
  through: string;
  acrossUnit: string;
  throughUnit: string;
}

export const DOMAINS: Record<ADIADomain, DomainDefinition> = {
  Electrical: { across: 'Voltage', through: 'Current', acrossUnit: 'V', throughUnit: 'A' },
  Mechanical: { across: 'Velocity', through: 'Force', acrossUnit: 'm/s', throughUnit: 'N' },
  Thermal: { across: 'Temperature', through: 'HeatFlow', acrossUnit: 'K', throughUnit: 'W' },
  Magnetic: { across: 'MMF', through: 'Flux', acrossUnit: 'At', throughUnit: 'Wb' },
  MoistAir: { across: 'Pressure', through: 'MassFlow', acrossUnit: 'Pa', throughUnit: 'kg/s' }
};

export interface EquationContext {
  dt: number;
  time: number;
  states: number[];
  prevStates: number[];
}
