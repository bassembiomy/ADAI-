// Powertrain Blockset / Drivetrain / Final Drive Unit: Open Differential, Limited Slip Differential and Transfer Case.
import type { XBlock, XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import { powerFlowEfficiency, smoothSign } from '../ptMath';
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


// ---------------------------------------------------------------- Limited Slip Differential
const lsdSpec: PtBlockSpec = {
  type: 'PT_LIMITED_SLIP_DIFFERENTIAL',
  label: 'Limited Slip Differential',
  category: 'Powertrain / Drivetrain / Final Drive Unit',
  simulinkPath: 'Powertrain Blockset/Drivetrain/Final Drive Unit/Limited Slip Differential',
  source: 'simulink-docs',
  symbol: 'differential',
  inputs: [
    inp('DriveshftTrq', 'N*m', 1, 'Torque applied to the driveshaft (pinion) side of the differential.'),
    inp('Axl1Trq', 'N*m', 2, 'Load torque acting on axle 1 (opposes its rotation).'),
    inp('Axl2Trq', 'N*m', 3, 'Load torque acting on axle 2 (opposes its rotation).'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with DriveshftPwr, AxlPwr, GearPwrLoss, CplPwrLoss, CplTrq and Eff.', 'Bus: LimitedSlipDifferentialInfo'),
    out('DriveshftSpd', 'rad/s', 2, 'Driveshaft angular speed.'),
    out('Axl1Spd', 'rad/s', 3, 'Angular speed of axle 1.'),
    out('Axl2Spd', 'rad/s', 4, 'Angular speed of axle 2.'),
  ],
  params: [
    par('Ndiff', 'Final drive ratio', '1', 3.5, 'Ratio of driveshaft speed to mean axle speed (ring gear to pinion ratio).', 0, true),
    par('eta', 'Efficiency', '1', 0.98, 'Mechanical efficiency of the gear mesh, applied in the direction of power flow; in (0, 1].', 0, true, 1),
    par('Jd', 'Driveshaft inertia', 'kg*m^2', 0.05, 'Rotational inertia of the driveshaft and pinion, reflected to the axles through the final drive ratio.', 0),
    par('bd', 'Driveshaft damping', 'N*m*s/rad', 0, 'Viscous damping coefficient on the driveshaft.', 0),
    par('Jw1', 'Axle 1 inertia', 'kg*m^2', 1.5, 'Rotational inertia of axle 1 and its attached wheel.', 0, true),
    par('bw1', 'Axle 1 damping', 'N*m*s/rad', 0, 'Viscous damping coefficient on axle 1.', 0),
    par('Jw2', 'Axle 2 inertia', 'kg*m^2', 1.5, 'Rotational inertia of axle 2 and its attached wheel.', 0, true),
    par('bw2', 'Axle 2 damping', 'N*m*s/rad', 0, 'Viscous damping coefficient on axle 2.', 0),
    par('Fc', 'Clutch preload force', 'N', 500, 'Axial force pressing the clutch pack together; 0 gives an open differential.', 0),
    par('Np', 'Number of friction surfaces', '1', 6, 'Number of friction surface pairs of the coupling clutch.', 0),
    par('Ro', 'Clutch outer radius', 'm', 0.09, 'Outer radius of the friction annulus; must exceed Ri.', 0, true),
    par('Ri', 'Clutch inner radius', 'm', 0.05, 'Inner radius of the friction annulus.', 0),
    par('muc', 'Clutch friction coefficient', '1', 0.1, 'Friction coefficient of the coupling clutch.', 0),
    par('w1_o', 'Initial axle 1 speed', 'rad/s', 0, 'Speed of axle 1 at the start of the simulation.'),
    par('w2_o', 'Initial axle 2 speed', 'rad/s', 0, 'Speed of axle 2 at the start of the simulation.'),
  ],
  states: ['w1', 'w2'],
  equations: [
    'Reff = 2/3*(Ro^3 - Ri^3)/(Ro^2 - Ri^2), CplTrq = Fc*Np*Reff*muc*tanh(4*(w1 - w2))',
    'DriveshftSpd = Ndiff*(w1 + w2)/2, k = eta if DriveshftTrq*DriveshftSpd >= 0 else 1/eta',
    'M = [[Jw1 + Jd*N^2/4, Jd*N^2/4], [Jd*N^2/4, Jw2 + Jd*N^2/4]], N = Ndiff',
    'Q1 = N*k*DriveshftTrq/2 - bd*N^2*(w1 + w2)/4 - Axl1Trq - bw1*w1 - CplTrq',
    'Q2 = N*k*DriveshftTrq/2 - bd*N^2*(w1 + w2)/4 - Axl2Trq - bw2*w2 + CplTrq',
    'M*[dw1/dt, dw2/dt] = [Q1, Q2]',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation, Limited Slip Differential',
    'Naunheimer et al., Automotive Transmissions, 2nd ed., Springer 2011',
  ],
  description: 'Differential with a friction clutch between the two axles. The clutch transmits a torque that opposes the speed difference of the axles, so the faster axle is slowed down and the slower axle is driven.',
  behavior: 'Two states, the axle speeds. The driveshaft is rigidly geared to the mean axle speed, so its inertia is reflected into a 2x2 mass matrix. The driveshaft torque is split equally between the axles, scaled by eta when driving and by 1/eta when back-driven. The coupling torque is the clutch capacity from the preload force and the effective friction radius times a smooth sign of the axle speed difference, tanh(4*(w1 - w2)), and acts with opposite signs on the two axles. With Fc = 0 the block is an open differential with inertias. The axle load torques are inputs and the axle speeds are outputs. Info reports shaft power, load power, gear loss, clutch slip loss and the coupling torque.',
  example: 'With the default parameters (Ndiff = 3.5, equal axle inertias of 1.5 kg*m^2), no torques, w1_o = 20 rad/s and w2_o = 10 rad/s, the clutch drags the faster axle down and the slower axle up while the total angular momentum is conserved. After 0.5 s both axles turn at 15.0 rad/s, CplTrq is below 1e-6 N*m and DriveshftSpd = 3.5*15 = 52.5 rad/s. With Fc = 0, DriveshftTrq = 100 N*m, Axl1Trq = 50 N*m and Axl2Trq = 80 N*m the block behaves as an open differential with inertias.',
};

const lsdMatrix = (p: Record<string, any>) => {
  const m = p.Jd * p.Ndiff * p.Ndiff / 4;
  return { m11: p.Jw1 + m, m12: m, m22: p.Jw2 + m };
};

interface LsdEval { T: number; Ta1: number; Ta2: number; spd: number; k: number; cpl: number; q1: number; q2: number }
function lsdEval(ins: XValue[], p: Record<string, any>, s: { w1: number; w2: number }): LsdEval | string {
  const T = num(ins[0]), Ta1 = num(ins[1]), Ta2 = num(ins[2]);
  if (![T, Ta1, Ta2, s.w1, s.w2].every(Number.isFinite)) return 'Limited slip differential inputs must be finite';
  if (!(p.Ro > p.Ri)) return 'Limited slip differential needs Ro > Ri';
  const Reff = (2 / 3) * (p.Ro ** 3 - p.Ri ** 3) / (p.Ro ** 2 - p.Ri ** 2);
  const cpl = p.Fc * p.Np * Reff * p.muc * smoothSign(s.w1 - s.w2, 1);
  const sum = s.w1 + s.w2;
  const spd = p.Ndiff * sum / 2;
  const k = T * spd >= 0 ? p.eta : 1 / p.eta;
  const drive = p.Ndiff * k * T / 2 - p.bd * p.Ndiff * p.Ndiff * sum / 4;
  return { T, Ta1, Ta2, spd, k, cpl, q1: drive - Ta1 - p.bw1 * s.w1 - cpl, q2: drive - Ta2 - p.bw2 * s.w2 + cpl };
}

const lsdFactory = definePtBlock(lsdSpec, {
  init: p => ({ w1: p.w1_o, w2: p.w2_o }),
  derivatives: (ins, p, s) => {
    const e = lsdEval(ins, p, s);
    if (typeof e === 'string') return { w1: 0, w2: 0 };
    const { m11, m12, m22 } = lsdMatrix(p);
    const det = m11 * m22 - m12 * m12;
    return { w1: (m22 * e.q1 - m12 * e.q2) / det, w2: (m11 * e.q2 - m12 * e.q1) / det };
  },
  execute: (ins, p, s) => {
    const e = lsdEval(ins, p, s);
    if (typeof e === 'string') return { outputs: [{}, 0, 0, 0], error: e };
    const shaftPwr = e.T * e.spd;
    const axlPwr = e.Ta1 * s.w1 + e.Ta2 * s.w2;
    const gearLoss = shaftPwr - e.k * shaftPwr;
    const info = makeBus(['DriveshftPwr', 'AxlPwr', 'GearPwrLoss', 'CplPwrLoss', 'CplTrq', 'Eff'],
      [shaftPwr, axlPwr, gearLoss, e.cpl * (s.w1 - s.w2), e.cpl, e.k]);
    return { outputs: [info, e.spd, s.w1, s.w2] };
  },
});

// ---------------------------------------------------------------- Transfer Case
const transferSpec: PtBlockSpec = {
  type: 'PT_TRANSFER_CASE',
  label: 'Transfer Case',
  category: 'Powertrain / Drivetrain / Final Drive Unit',
  simulinkPath: 'Powertrain Blockset/Drivetrain/Final Drive Unit/Transfer Case',
  source: 'simulink-docs',
  symbol: 'transfer-case',
  inputs: [
    inp('DriveshftTrq', 'N*m', 1, 'Torque applied to the transfer case input shaft.'),
    inp('FrntShftSpd', 'rad/s', 2, 'Angular speed of the front output shaft.'),
    inp('RearShftSpd', 'rad/s', 3, 'Angular speed of the rear output shaft.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with DriveshftPwr, FrntPwr, RearPwr, PwrLoss and Eff.', 'Bus: TransferCaseInfo'),
    out('FrntShftTrq', 'N*m', 2, 'Torque delivered to the front output shaft.'),
    out('RearShftTrq', 'N*m', 3, 'Torque delivered to the rear output shaft.'),
    out('DriveshftSpd', 'rad/s', 4, 'Angular speed of the input shaft.'),
  ],
  params: [
    par('Ntc', 'Gear ratio', '1', 1, 'Ratio of input shaft speed to output shaft speed.', 0, true),
    par('TrqSplitRatio', 'Front torque split', '1', 0.5, 'Fraction of the input torque sent to the front shaft, in [0, 1]; the rest goes to the rear shaft.', 0, false, 1),
    par('eta', 'Efficiency', '1', 0.98, 'Mechanical efficiency, applied in the direction of power flow; in (0, 1].', 0, true, 1),
  ],
  states: [],
  equations: [
    'DriveshftSpd = Ntc*(TSR*FrntShftSpd + (1 - TSR)*RearShftSpd), TSR = TrqSplitRatio',
    'FrntShftTrq = Ntc*k*TSR*DriveshftTrq, RearShftTrq = Ntc*k*(1 - TSR)*DriveshftTrq',
    'k = eta if DriveshftTrq*DriveshftSpd >= 0 else 1/eta',
    'PwrLoss = DriveshftTrq*DriveshftSpd - FrntShftTrq*FrntShftSpd - RearShftTrq*RearShftSpd',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation, Transfer Case',
    'Naunheimer et al., Automotive Transmissions, 2nd ed., Springer 2011',
  ],
  description: 'Fixed-split transfer case that distributes the input torque between a front and a rear output shaft.',
  behavior: 'Static block with no states. The input shaft speed is the ratio times the split-weighted mean of the two output speeds. The front shaft receives the split fraction of the ratio-multiplied input torque and the rear shaft the remainder, both scaled by eta when power flows from the input to the outputs and by 1/eta when back-driven. Info reports the shaft powers and the power loss.',
  example: 'With Ntc = 2, TrqSplitRatio = 0.4 and eta = 0.97, a 100 N*m input torque and front and rear shaft speeds of 40 and 50 rad/s give DriveshftSpd = 2*(0.4*40 + 0.6*50) = 92 rad/s, FrntShftTrq = 2*0.97*0.4*100 = 77.6 N*m and RearShftTrq = 116.4 N*m. The power loss is 9200 - 77.6*40 - 116.4*50 = 276 W.',
};

const transferFactory = definePtBlock(transferSpec, {
  execute: (ins, p) => {
    const T = num(ins[0]), wf = num(ins[1]), wr = num(ins[2]);
    if (![T, wf, wr].every(Number.isFinite)) return { outputs: [{}, 0, 0, 0], error: 'Transfer case inputs must be finite' };
    const tsr = p.TrqSplitRatio;
    const spd = p.Ntc * (tsr * wf + (1 - tsr) * wr);
    const k = T * spd >= 0 ? p.eta : 1 / p.eta;
    const front = p.Ntc * k * tsr * T, rear = p.Ntc * k * (1 - tsr) * T;
    const pIn = T * spd;
    const info = makeBus(['DriveshftPwr', 'FrntPwr', 'RearPwr', 'PwrLoss', 'Eff'], [pIn, front * wf, rear * wr, pIn - front * wf - rear * wr, k]);
    return { outputs: [info, front, rear, spd] };
  },
});

export const FINAL_DRIVE_BLOCKS: { spec: PtBlockSpec; factory: (id: string, params?: Record<string, any>) => XBlock }[] = [
  { spec, factory },
  { spec: lsdSpec, factory: lsdFactory },
  { spec: transferSpec, factory: transferFactory },
];
