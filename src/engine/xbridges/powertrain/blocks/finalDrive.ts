// Powertrain Blockset / Drivetrain / Final Drive Unit / Open Differential.
import type { XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import { powerFlowEfficiency } from '../ptMath';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';

const inp = (id: string, unit: string, simulinkIndex: number, description: string): PtPortSpec =>
  ({ id, name: id, direction: 'input', unit, simulinkIndex, description });
const out = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'output', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });
const par = (name: string, label: string, unit: string, def: number, description: string,
  min?: number, minExclusive?: boolean, max?: number): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'scalar', description, ...(min !== undefined ? { min } : {}), ...(minExclusive ? { minExclusive } : {}), ...(max !== undefined ? { max } : {}) });

const spec: PtBlockSpec = {
  type: 'PT_OPEN_DIFFERENTIAL',
  label: 'Open Differential',
  category: 'Powertrain / Drivetrain / Final Drive Unit',
  simulinkPath: 'Powertrain Blockset/Drivetrain/Final Drive Unit/Open Differential',
  source: 'simulink-docs',
  symbol: 'differential',
  inputs: [
    inp('DriveshftTrq', 'N*m', 1, 'Torque applied to the driveshaft (pinion) side of the differential.'),
    inp('Axl1Spd', 'rad/s', 2, 'Angular speed of axle 1.'),
    inp('Axl2Spd', 'rad/s', 3, 'Angular speed of axle 2.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with DriveshftPwr, AxlPwr, PwrLoss and Eff.', 'Bus: OpenDifferentialInfo'),
    out('Axl1Trq', 'N*m', 2, 'Torque delivered to axle 1.'),
    out('Axl2Trq', 'N*m', 3, 'Torque delivered to axle 2.'),
    out('DriveshftSpd', 'rad/s', 4, 'Driveshaft angular speed.'),
  ],
  params: [
    par('Ndiff', 'Final drive ratio', '1', 3.08, 'Ratio of driveshaft speed to mean axle speed (ring gear to pinion ratio).', 0, true),
    par('eta', 'Efficiency', '1', 0.98, 'Mechanical efficiency of the gear mesh, applied in the direction of power flow; in (0, 1].', 0, true, 1),
    par('bw', 'Axle viscous damping', 'N*m*s/rad', 0, 'Viscous damping coefficient on each axle; subtracts bw times axle speed from the axle torque.', 0),
    { name: 'shaftSide', label: 'Crown wheel located', unit: '', kind: 'enum', default: 'Right', options: ['Right', 'Left'],
      description: 'Side of the center-line on which the crown wheel sits; Left reverses the sign of the driveshaft torque and speed.' },
  ],
  states: [],
  equations: [
    'DriveshftSpd = s*Ndiff*(Axl1Spd + Axl2Spd)/2, s = +1 (Right) or -1 (Left)',
    'Axl1Trq = Axl2Trq = Ndiff*s*DriveshftTrq*k/2 - bw*Axl_i_Spd',
    'k = eta if (s*DriveshftTrq)*(Ndiff*mean axle speed) >= 0 else 1/eta',
    'DriveshftPwr = DriveshftTrq*DriveshftSpd, AxlPwr = Axl1Trq*Axl1Spd + Axl2Trq*Axl2Spd, PwrLoss = DriveshftPwr - AxlPwr, Eff = k',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation, Open Differential',
    'Naunheimer et al., Automotive Transmissions, 2nd ed., Springer 2011',
  ],
  description: 'Open differential final drive. It splits the driveshaft torque equally between two axles and sets the driveshaft speed from the mean axle speed, with a gear ratio and a power-direction dependent efficiency.',
  behavior: 'Static block with no states. Driveshaft speed is the ratio times the mean axle speed. Each axle receives half the ratio-multiplied driveshaft torque scaled by eta when driving or 1/eta when back-driven, minus optional viscous damping. The crown wheel side flips the sign of the driveshaft quantities. Info reports shaft power, axle power, loss and efficiency factor.',
  example: 'With Ndiff = 4, eta = 0.95, bw = 0, a 100 N*m driveshaft torque and axle speeds of 50 and 60 rad/s gives DriveshftSpd = 4*55 = 220 rad/s and Axl1Trq = Axl2Trq = 4*100*0.95/2 = 190 N*m.',
};

const num = (v: XValue | undefined): number => (typeof v === 'number' ? v : Array.isArray(v) ? Number(v[0]) : NaN);

const factory = definePtBlock(spec, {
  execute: (ins, p) => {
    const T = num(ins[0]), w1 = num(ins[1]), w2 = num(ins[2]);
    if (![T, w1, w2].every(Number.isFinite)) return { outputs: [{}, 0, 0, 0], error: 'Open differential inputs must be finite' };
    const s = p.shaftSide === 'Left' ? -1 : 1;
    const spd = s * p.Ndiff * (w1 + w2) / 2;
    const trqS = s * T;
    const pwrS = trqS * (p.Ndiff * (w1 + w2) / 2);
    const k = pwrS === 0 ? p.eta : powerFlowEfficiency(trqS, p.Ndiff * (w1 + w2) / 2, p.eta);
    const base = p.Ndiff * trqS * k / 2;
    const a1 = base - p.bw * w1, a2 = base - p.bw * w2;
    const shaftPwr = T * spd;
    const axlPwr = a1 * w1 + a2 * w2;
    const info = makeBus(['DriveshftPwr', 'AxlPwr', 'PwrLoss', 'Eff'], [shaftPwr, axlPwr, shaftPwr - axlPwr, k]);
    return { outputs: [info, a1, a2, spd] };
  },
});

export const FINAL_DRIVE_BLOCKS: { spec: PtBlockSpec; factory: typeof factory }[] = [{ spec, factory }];
