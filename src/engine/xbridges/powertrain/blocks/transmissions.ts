// Powertrain Blockset / Drivetrain / Transmissions / Ideal Fixed Gear Transmission.
import type { XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import { powerFlowEfficiency } from '../ptMath';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';

const inp = (id: string, unit: string, simulinkIndex: number, description: string): PtPortSpec =>
  ({ id, name: id, direction: 'input', unit, simulinkIndex, description });
const out = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'output', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });
const vec = (name: string, label: string, unit: string, def: number[], description: string): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'vector', description });

const spec: PtBlockSpec = {
  type: 'PT_IDEAL_FIXED_GEAR_TRANSMISSION',
  label: 'Ideal Fixed Gear Transmission',
  category: 'Powertrain / Drivetrain / Transmissions',
  simulinkPath: 'Powertrain Blockset/Drivetrain/Transmissions/Ideal Fixed Gear Transmission',
  source: 'simulink-docs',
  symbol: 'transmission',
  inputs: [
    inp('Gear', '1', 1, 'Selected gear number; 0 is neutral.'),
    inp('InTrq', 'N*m', 2, 'Torque applied to the transmission input shaft.'),
    inp('OutSpd', 'rad/s', 3, 'Angular speed of the transmission output shaft.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with GearRatio, Eff, InPwr, OutPwr and PwrLoss.', 'Bus: IdealFixedGearTransmissionInfo'),
    out('OutTrq', 'N*m', 2, 'Torque delivered to the output shaft.'),
    out('InSpd', 'rad/s', 3, 'Angular speed of the input shaft.'),
  ],
  params: [
    vec('GearNums', 'Gear numbers', '1', [-1, 0, 1, 2, 3, 4, 5], 'Selectable gear numbers; -1 is reverse and 0 is neutral.'),
    vec('Ratios', 'Gear ratios', '1', [-3.5, 0, 3.8, 2.2, 1.4, 1, 0.8], 'Input speed over output speed for each gear number; same length as GearNums.'),
    vec('Eff', 'Gear efficiencies', '1', [0.9, 1, 0.95, 0.96, 0.97, 0.97, 0.96], 'Mechanical efficiency in (0, 1] for each gear number; same length as GearNums.'),
  ],
  states: [],
  equations: [
    'N = Ratios[index of Gear in GearNums]',
    'InSpd = N*OutSpd',
    'OutTrq = N*k*InTrq, k = Eff if InTrq*InSpd >= 0, else 1/Eff',
    'Gear = 0 (neutral): OutTrq = 0, InSpd = 0',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation, Ideal Fixed Gear Transmission',
    'Naunheimer et al., Automotive Transmissions, 2nd ed., Springer 2011',
  ],
  description: 'Fixed ratio gearbox without inertia. The selected gear sets the speed ratio and the efficiency, applied in the direction of power flow.',
  behavior: 'Static block with no states. The input speed is the gear ratio times the output speed. The output torque is the ratio times the input torque scaled by the efficiency when power flows from input to output and by its inverse when the gearbox is back-driven. Neutral gives zero torque and zero input speed. A gear number that is not in GearNums is reported as a block error.',
  example: 'With the default tables, gear 2 has ratio 2.2 and efficiency 0.96. For InTrq = 100 N*m and OutSpd = 40 rad/s the block gives InSpd = 88 rad/s and OutTrq = 211.2 N*m. Back-driven with InTrq = -100 N*m the output torque is -229.17 N*m (efficiency applied as 1/0.96).',
};

const num = (v: XValue | undefined): number => (typeof v === 'number' ? v : Array.isArray(v) ? Number(v[0]) : NaN);

const factory = definePtBlock(spec, {
  execute: (ins, p) => {
    const g = num(ins[0]), T = num(ins[1]), w = num(ins[2]);
    if (![g, T, w].every(Number.isFinite)) return { outputs: [{}, 0, 0], error: 'Gear transmission inputs must be finite' };
    const gear = Math.round(g);
    if (gear === 0) {
      return { outputs: [makeBus(['GearRatio', 'Eff', 'InPwr', 'OutPwr', 'PwrLoss'], [0, 1, 0, 0, 0]), 0, 0] };
    }
    const nums = p.GearNums as number[], ratios = p.Ratios as number[], effs = p.Eff as number[];
    if (ratios.length !== nums.length || effs.length !== nums.length) {
      return { outputs: [{}, 0, 0], error: 'Ratios and Eff must have the same length as GearNums' };
    }
    const i = nums.indexOf(gear);
    if (i < 0) return { outputs: [{}, 0, 0], error: `Gear ${gear} is not in GearNums` };
    const eta = effs[i];
    if (!(eta > 0 && eta <= 1)) return { outputs: [{}, 0, 0], error: `Eff for Gear ${gear} must be in (0, 1]` };
    const N = ratios[i];
    const spdIn = N * w;
    const k = T * spdIn === 0 ? eta : powerFlowEfficiency(T, spdIn, eta);
    const trqOut = N * k * T;
    const pIn = T * spdIn, pOut = trqOut * w;
    return { outputs: [makeBus(['GearRatio', 'Eff', 'InPwr', 'OutPwr', 'PwrLoss'], [N, k, pIn, pOut, pIn - pOut]), trqOut, spdIn] };
  },
});

export const TRANSMISSION_BLOCKS: { spec: PtBlockSpec; factory: typeof factory }[] = [{ spec, factory }];
