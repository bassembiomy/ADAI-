// WP-31 electric-vehicle reference model, built only from registered X-Bridges block factories.
// Not imported by powertrain/index.ts or the registry (it needs BlockDefinitions, which loads the registry).
//
// Topology:
//   Drive Cycle Source -> Longitudinal Driver -> TrqCmd = (AccelCmd - DecelCmd)*Tpeak -> Mapped Motor
//   Mapped Motor MotTrq -> Open Differential -> front Longitudinal Wheel (one wheel represents the symmetric axle)
//   rear wheel free rolling (AxlTrq = 0); wheel Fx -> Vehicle Body 1DOF; xdot -> wheels Vx and driver VelFdbk
//   friction brakes BrkPrs = DecelCmd*BrkPrsMax on both wheels
//   Mapped Motor BattAmp -> Datasheet Battery BattCurr; battery BattVolt -> Memory (breaks the algebraic loop) -> motor BattVolt
import type { XBlock } from '../../types';
import { BLOCK_LIBRARY } from '../../BlockDefinitions';

export const EV_REFERENCE_IDS = {
  cycle: 'cycle', driver: 'driver', motor: 'motor', diff: 'diff',
  wheelF: 'wheelF', wheelR: 'wheelR', vehicle: 'vehicle', battery: 'battery', voltMem: 'voltMem',
} as const;

/** All numeric choices of the reference model (compact EV, ~80 kW single-speed drive). */
export const EV_REFERENCE_DEFAULTS = {
  // Vehicle body
  M: 1600,          // kg, total mass
  Af: 2.3,          // m^2, frontal area
  Cd: 0.28,         // -, drag coefficient
  a: 1.2,           // m, front axle to CG
  b: 1.5,           // m, rear axle to CG
  h: 0.5,           // m, CG height
  xdot_o: 0,        // m/s, initial speed
  // Wheels (each block represents the two wheels of an axle: NF = NR = 2)
  Re: 0.31,         // m, rolling radius
  Iyy: 1.2,         // kg*m^2, wheel inertia
  omega_o: 0,       // rad/s, initial wheel speed
  // Disc brake: 0.8 g total = 0.8*1600*9.81*0.31 = 3893 N*m over 4 wheels = 973 N*m each;
  // torque per Pa = mu*pi*d^2/4*Rm*pads = 0.3*1.9635e-3*0.15*2 = 1.767e-4 N*m/Pa -> 5.5 MPa
  BrkPrsMax: 5.5e6, // Pa, brake pressure at DecelCmd = 1
  // Motor (80 kW peak): 300 N*m to 266.7 rad/s (2547 rpm), then constant power to 1257 rad/s (12000 rpm)
  Tpeak: 300,       // N*m, torque command scale (DecelCmd/AccelCmd = 1)
  w_t: [0, 266.7, 400, 700, 1257] as number[],        // rad/s
  T_t: [300, 300, 200, 114.3, 63.6] as number[],      // N*m (80 kW / w beyond base speed)
  // Loss map generated as loss = lossConst + (lossIronLin*w + lossIronQuad*w^2) + lossCu*T^2 + lossInv*T*w  [W]
  // (iron, copper and inverter switching loss); gives 90-95 % efficiency over the loaded operating area.
  w_eff_bp: [0, 100, 267, 600, 1257] as number[],     // rad/s
  T_eff_bp: [0, 50, 150, 300] as number[],            // N*m
  lossConst: 100,       // W
  lossIronLin: 1.0,     // W/(rad/s)
  lossIronQuad: 0.0006, // W/(rad/s)^2
  lossCu: 0.04,         // W/(N*m)^2
  lossInv: 0.02,        // W per W of mechanical power
  Tc: 0.02,             // s, torque response
  // Final drive
  Ndiff: 9.0,       // single-speed reduction
  eta: 0.97,        // gear efficiency
  // Battery (96s1p, default Em / RInt tables)
  Ns: 96, Np: 1,
  BattChargeMax: 60,  // A*h
  BattCapInit: 54,    // A*h (SOC 0.9)
  nominalOcv: 384,    // V, 96*4.0 V (Em at SOC 0.9, 298.15 K); initial value of the voltage memory
  BattTemp: 298.15,   // K, also ambient air temperature
  // Driver (command = (Kff*ref + Kp*e + Ki*z)/vnom + Kg*grade)
  Kp: 7, Ki: 1.5, Kff: 0.06, Kg: 0.03, Kaw: 1, vnom: 30,
};

type Defaults = typeof EV_REFERENCE_DEFAULTS;
type Conn = { sourceBlock: string; sourcePort: string; targetBlock: string; targetPort: string };

function lossTable(d: Defaults): number[][] {
  return d.w_eff_bp.map(w => d.T_eff_bp.map(T =>
    d.lossConst + d.lossIronLin * w + d.lossIronQuad * w * w + d.lossCu * T * T + d.lossInv * T * w));
}

export function buildEvReference(opts: { cycle?: 'UDDS' | 'HWFET' | 'US06' | 'FTP75'; overrides?: Partial<Defaults> } = {}):
  { blocks: XBlock[]; connections: Conn[] } {
  const d: Defaults = { ...EV_REFERENCE_DEFAULTS, ...(opts.overrides ?? {}) };
  const ID = EV_REFERENCE_IDS;
  const L = BLOCK_LIBRARY as Record<string, (id: string, params?: any) => XBlock>;
  const wheel = (id: string) => L.PT_LONGITUDINAL_WHEEL(id, { Re: d.Re, Iyy: d.Iyy, omega_o: d.omega_o, brakeType: 'Disc' });

  const blocks: XBlock[] = [
    L.PT_DRIVE_CYCLE_SOURCE(ID.cycle, { cycleVar: opts.cycle ?? 'UDDS' }),
    L.PT_LONGITUDINAL_DRIVER(ID.driver, { Kp: d.Kp, Ki: d.Ki, Kff: d.Kff, Kg: d.Kg, Kaw: d.Kaw, vnom: d.vnom }),
    L.Constant('grade', { value: 0 }),
    L.VectorSub('trqSub'),
    L.GAIN('trqGain', { gain: d.Tpeak }),
    L.GAIN('brkGain', { gain: d.BrkPrsMax }),
    L.PT_MAPPED_MOTOR(ID.motor, {
      Tc: d.Tc, w_t: [...d.w_t], T_t: [...d.T_t], w_eff_bp: [...d.w_eff_bp], T_eff_bp: [...d.T_eff_bp], losses_table: lossTable(d),
    }),
    L.MEMORY(ID.voltMem, { initialCondition: d.nominalOcv }),
    L.PT_OPEN_DIFFERENTIAL(ID.diff, { Ndiff: d.Ndiff, eta: d.eta }),
    wheel(ID.wheelF),
    wheel(ID.wheelR),
    L.Constant('rearTrq', { value: 0 }),
    L.PT_VEHICLE_BODY_1DOF(ID.vehicle, { M: d.M, Af: d.Af, Cd: d.Cd, a: d.a, b: d.b, h: d.h, xdot_o: d.xdot_o }),
    L.Constant('wind', { value: '[0 0 0]' }),
    L.Constant('temp', { value: d.BattTemp }),
    L.PT_DATASHEET_BATTERY(ID.battery, { Ns: d.Ns, Np: d.Np, BattChargeMax: d.BattChargeMax, BattCapInit: d.BattCapInit }),
  ];

  const c = (sourceBlock: string, sourcePort: string, targetBlock: string, targetPort: string): Conn =>
    ({ sourceBlock, sourcePort, targetBlock, targetPort });
  const connections: Conn[] = [
    c(ID.cycle, 'VelRef', ID.driver, 'VelRef'),
    c(ID.vehicle, 'xdot', ID.driver, 'VelFdbk'),
    c('grade', 'out', ID.driver, 'Grade'),
    c('grade', 'out', ID.vehicle, 'Grade'),
    c(ID.driver, 'AccelCmd', 'trqSub', 'in1'),
    c(ID.driver, 'DecelCmd', 'trqSub', 'in2'),
    c('trqSub', 'out', 'trqGain', 'u'),
    c('trqGain', 'y', ID.motor, 'TrqCmd'),
    c(ID.driver, 'DecelCmd', 'brkGain', 'u'),
    c('brkGain', 'y', ID.wheelF, 'BrkPrs'),
    c('brkGain', 'y', ID.wheelR, 'BrkPrs'),
    c(ID.diff, 'DriveshftSpd', ID.motor, 'Spd'),
    c(ID.voltMem, 'y', ID.motor, 'BattVolt'),
    c(ID.battery, 'BattVolt', ID.voltMem, 'u'),
    c(ID.motor, 'MotTrq', ID.diff, 'DriveshftTrq'),
    c(ID.wheelF, 'Omega', ID.diff, 'Axl1Spd'),
    c(ID.wheelF, 'Omega', ID.diff, 'Axl2Spd'),
    c(ID.diff, 'Axl1Trq', ID.wheelF, 'AxlTrq'),
    c('rearTrq', 'out', ID.wheelR, 'AxlTrq'),
    c(ID.vehicle, 'xdot', ID.wheelF, 'Vx'),
    c(ID.vehicle, 'xdot', ID.wheelR, 'Vx'),
    c(ID.vehicle, 'FzF', ID.wheelF, 'Fz'),
    c(ID.vehicle, 'FzR', ID.wheelR, 'Fz'),
    c(ID.wheelF, 'Fx', ID.vehicle, 'FwF'),
    c(ID.wheelR, 'Fx', ID.vehicle, 'FwR'),
    c('wind', 'out', ID.vehicle, 'WindXYZ'),
    c('temp', 'out', ID.vehicle, 'Temp'),
    c('temp', 'out', ID.battery, 'BattTemp'),
    c(ID.motor, 'BattAmp', ID.battery, 'BattCurr'),
  ];
  return { blocks, connections };
}
