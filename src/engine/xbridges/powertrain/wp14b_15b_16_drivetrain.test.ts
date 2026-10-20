// WP-14b (Limited Slip Differential, Transfer Case), WP-15b (AMT, DCT, CVT) and WP-16 (AMT / DCT / CVT controllers) acceptance tests.
// Port names follow the Powertrain Blockset documentation as recalled (source 'simulink-docs'; to be confirmed by the MATLAB
// inventory). Equations the blocks must implement:
//  Limited Slip Differential (states w1, w2; driveshaft rigidly geared to the mean axle speed):
//    Reff = 2/3 (Ro^3 - Ri^3)/(Ro^2 - Ri^2); CplTrq = Fc Np Reff muc tanh(4 (w1 - w2))
//    M = [[Jw1 + Jd N^2/4, Jd N^2/4], [Jd N^2/4, Jw2 + Jd N^2/4]]
//    Q1 = N k DriveshftTrq/2 - bd N^2 (w1 + w2)/4 - Axl1Trq - bw1 w1 - CplTrq
//    Q2 = N k DriveshftTrq/2 - bd N^2 (w1 + w2)/4 - Axl2Trq - bw2 w2 + CplTrq ;  M dw/dt = Q
//    DriveshftSpd = N (w1 + w2)/2 ; k = eta when DriveshftTrq*DriveshftSpd >= 0 else 1/eta
//  Transfer Case (static): DriveshftSpd = N (TSR FrntShftSpd + (1 - TSR) RearShftSpd); FrntShftTrq = N k TSR DriveshftTrq;
//    RearShftTrq = N k (1 - TSR) DriveshftTrq ; k by power direction as above.
//  AMT: input-shaft inertia J_in (state w_in) behind one dry clutch; output kinematically tied to DiffSpd (w_t = N(gear) DiffSpd).
//    A GearCmd different from the engaged gear starts a shift: clutch capacity ramps Tc_max -> 0 over t_dis, stays 0 for t_syn
//    (gear change), ramps 0 -> Tc_max over t_eng. Slipping: Tc = cap sign(w_in - w_t), J_in dw_in = EngTrq - b_in w_in - Tc,
//    DiffTrq = N k Tc. Locked (|w_in - w_t| <= omega_tol and |EngTrq - b_in w_in| <= cap): EngSpd = w_t, DiffTrq = N k (EngTrq - b_in EngSpd).
//    Info: Gear (engaged), Locked, ClutchCap, ClutchTrq.
//  DCT: two clutches (odd / even shaft). A shift is a torque handover over t_x: cap_off = Tc_max (1 - f), cap_on = Tc_max f,
//    f = (t - t0)/t_x. The on-coming clutch slips with Tc_on = cap_on sign(w_in - N_on DiffSpd); while the off-going clutch is
//    locked (|T_lock| <= cap_off, T_lock = EngTrq - b_in w_in - Tc_on) DiffTrq = N_off k (EngTrq - b_in w_in - Tc_on) + N_on k Tc_on.
//    After the handover the on-coming clutch synchronises and locks. Info: Gear, HandoverFrac (f, 0 outside a shift), Locked.
//  CVT: ratio state N = InSpd/OutSpd, dN/dt = (clamp(RatioCmd, Nmin, Nmax) - N)/tau; InSpd = N OutSpd; OutTrq = N k InTrq.
//  AMT / DCT Controller: gear state g; at most one shift per tHold seconds; upshift when VehSpd > interp(PdlBp, UpSpd[g row], AccelPdl)
//    (g below the top gear), downshift when VehSpd < interp(PdlBp, DnSpd[g-1 row], AccelPdl) (g above the first gear);
//    DnSpd must lie below UpSpd element-wise (hysteresis). Output GearCmd = g.
//  CVT Controller: RatioCmd = clamp(interp(PdlBp, EngSpdTgt, AccelPdl) / max(OutSpd, wMin), Nmin, Nmax).
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { getPowertrainSpec } from './index';

const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
type Src = number | { step: [number, number, number] }; // constant, or Step [stepTime, initialValue, finalValue]
function sim(type: string, params: any, srcs: Record<string, Src>, stop: number, dt = 1e-3) {
  const blocks: any[] = [BLOCK_LIBRARY[type]('x', params)];
  const conns: any[] = [];
  for (const [port, s] of Object.entries(srcs)) {
    blocks.push(typeof s === 'number' ? BLOCK_LIBRARY.Constant(`c_${port}`, { value: s })
      : BLOCK_LIBRARY.Step(`c_${port}`, { stepTime: s.step[0], initialValue: s.step[1], finalValue: s.step[2] }));
    conns.push({ sourceBlock: `c_${port}`, sourcePort: 'out', targetBlock: 'x', targetPort: port });
  }
  const e = new XbridgesEngine({ blocks, connections: conns } as any);
  Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: stop, fixedStep: dt } as any);
  expect(e.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  return e;
}
const v = (e: XbridgesEngine, port: string) => e.getSignalValue('x', port) as number;
const info = (e: XbridgesEngine) => e.getSignalValue('x', 'Info') as any;
const ports = (type: string) => { const b = BLOCK_LIBRARY[type]('x', {}); return [b.inputs.map(p => [p.id, p.unit]), b.outputs.map(p => [p.id, p.unit])]; };
const path = (type: string) => getPowertrainSpec(type)!.simulinkPath;

describe('PT_LIMITED_SLIP_DIFFERENTIAL', () => {
  const P = { Ndiff: 3, eta: 1, Jd: 0.1, bd: 0, Jw1: 1.2, bw1: 0, Jw2: 1.0, bw2: 0, Fc: 0, Np: 4, Ro: 0.08, Ri: 0.05, muc: 0.12, w1_o: 10, w2_o: 10 };
  const Reff = 2 / 3 * (0.08 ** 3 - 0.05 ** 3) / (0.08 ** 2 - 0.05 ** 2);
  const m = 0.1 * 9 / 4, M = [[1.2 + m, m], [m, 1.0 + m]];

  it('ports', () => {
    expect(path('PT_LIMITED_SLIP_DIFFERENTIAL')).toBe('Powertrain Blockset/Drivetrain/Final Drive Unit/Limited Slip Differential');
    expect(ports('PT_LIMITED_SLIP_DIFFERENTIAL')).toEqual([
      [['DriveshftTrq', 'N*m'], ['Axl1Trq', 'N*m'], ['Axl2Trq', 'N*m']],
      [['Info', 'bus'], ['DriveshftSpd', 'rad/s'], ['Axl1Spd', 'rad/s'], ['Axl2Spd', 'rad/s']],
    ]);
  });

  it('without clutch force it is an open differential with inertias (exact constant acceleration)', () => {
    const e = sim('PT_LIMITED_SLIP_DIFFERENTIAL', P, { DriveshftTrq: 100, Axl1Trq: 50, Axl2Trq: 80 }, 0.5);
    const Q = [150 - 50, 150 - 80], det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    const a1 = (M[1][1] * Q[0] - M[0][1] * Q[1]) / det, a2 = (M[0][0] * Q[1] - M[1][0] * Q[0]) / det;
    rel(v(e, 'Axl1Spd'), 10 + a1 * 0.5, 1e-9);
    rel(v(e, 'Axl2Spd'), 10 + a2 * 0.5, 1e-9);
    rel(v(e, 'DriveshftSpd'), 3 * (v(e, 'Axl1Spd') + v(e, 'Axl2Spd')) / 2, 1e-12);
  });

  it('coupling torque at the start and the clutch locks the axles with momentum conserved', () => {
    const p = { ...P, Fc: 5000, w1_o: 20, w2_o: 10 };
    const b = BLOCK_LIBRARY.PT_LIMITED_SLIP_DIFFERENTIAL('x', p);
    const r = b.execute([0, 0, 0], b.params, b.state, 0);
    rel((r.outputs[0] as any).CplTrq, 5000 * 4 * Reff * 0.12 * Math.tanh(40), 1e-12);
    const e = sim('PT_LIMITED_SLIP_DIFFERENTIAL', p, { DriveshftTrq: 0, Axl1Trq: 0, Axl2Trq: 0 }, 1, 1e-4);
    const w1 = v(e, 'Axl1Spd'), w2 = v(e, 'Axl2Spd');
    expect(Math.abs(w1 - w2)).toBeLessThan(1e-6);
    const mom = (a: number, c: number) => (M[0][0] + M[1][0]) * a + (M[0][1] + M[1][1]) * c;
    rel(mom(w1, w2), mom(20, 10), 1e-9);
  });
});

describe('PT_TRANSFER_CASE', () => {
  const P = { Ntc: 2, TrqSplitRatio: 0.4, eta: 0.97 };
  const exec = (ins: number[]) => { const b = BLOCK_LIBRARY.PT_TRANSFER_CASE('x', P); return b.execute(ins, b.params, b.state, 0).outputs; };
  it('ports', () => {
    expect(path('PT_TRANSFER_CASE')).toBe('Powertrain Blockset/Drivetrain/Final Drive Unit/Transfer Case');
    expect(ports('PT_TRANSFER_CASE')).toEqual([
      [['DriveshftTrq', 'N*m'], ['FrntShftSpd', 'rad/s'], ['RearShftSpd', 'rad/s']],
      [['Info', 'bus'], ['FrntShftTrq', 'N*m'], ['RearShftTrq', 'N*m'], ['DriveshftSpd', 'rad/s']],
    ]);
  });
  it('torque split, speed from the weighted shaft speeds, efficiency by power direction', () => {
    const o = exec([100, 40, 50]);
    rel(o[3] as number, 2 * (0.4 * 40 + 0.6 * 50), 1e-14);
    rel(o[1] as number, 2 * 0.97 * 0.4 * 100, 1e-14);
    rel(o[2] as number, 2 * 0.97 * 0.6 * 100, 1e-14);
    const back = exec([-100, 40, 50]);
    rel(back[1] as number, 2 * 0.4 * -100 / 0.97, 1e-14);
    rel((o[0] as any).PwrLoss, 100 * 92 - (o[1] as number) * 40 - (o[2] as number) * 50, 1e-12);
  });
});

describe('PT_AUTOMATED_MANUAL_TRANSMISSION', () => {
  const P = { GearNums: [1, 2, 3], Ratios: [3.5, 2.1, 1.4], Eff: [1, 1, 1], J_in: 0.2, b_in: 0, Tc_max: 300, t_dis: 0.1, t_syn: 0.2, t_eng: 0.1,
    omega_tol: 1e-2, Gear_o: 1, w_in_o: 105 };
  it('ports', () => {
    expect(path('PT_AUTOMATED_MANUAL_TRANSMISSION')).toBe('Powertrain Blockset/Drivetrain/Transmissions/Automated Manual Transmission');
    expect(ports('PT_AUTOMATED_MANUAL_TRANSMISSION')).toEqual([
      [['GearCmd', '1'], ['EngTrq', 'N*m'], ['DiffSpd', 'rad/s']],
      [['Info', 'bus'], ['EngSpd', 'rad/s'], ['DiffTrq', 'N*m']],
    ]);
  });
  it('locked in gear: kinematic engine speed and geared torque', () => {
    const e = sim('PT_AUTOMATED_MANUAL_TRANSMISSION', { ...P, Eff: [0.95, 0.95, 0.95], Gear_o: 2, w_in_o: 63 }, { GearCmd: 2, EngTrq: 50, DiffSpd: 30 }, 0.5);
    expect(info(e).Gear).toBe(2);
    expect(info(e).Locked).toBe(1);
    rel(v(e, 'EngSpd'), 63, 1e-12);
    rel(v(e, 'DiffTrq'), 2.1 * 0.95 * 50, 1e-12);
  });
  it('a shift interrupts the torque while the clutch is open, then locks in the new gear', () => {
    const src = { GearCmd: { step: [1, 1, 2] as [number, number, number] }, EngTrq: 20, DiffSpd: 30 };
    const open = sim('PT_AUTOMATED_MANUAL_TRANSMISSION', P, src, 1.2);
    expect(info(open).ClutchCap).toBe(0);
    expect(v(open, 'DiffTrq')).toBe(0);
    const done = sim('PT_AUTOMATED_MANUAL_TRANSMISSION', P, src, 2);
    expect(info(done).Gear).toBe(2);
    expect(info(done).Locked).toBe(1);
    rel(v(done, 'EngSpd'), 2.1 * 30, 1e-12);
    rel(v(done, 'DiffTrq'), 2.1 * 20, 1e-12);
  });
});

describe('PT_DUAL_CLUTCH_TRANSMISSION', () => {
  const P = { GearNums: [1, 2, 3], Ratios: [3.5, 2.1, 1.4], Eff: [1, 1, 1], J_in: 0.2, b_in: 0, Tc_max: 400, t_x: 0.2, omega_tol: 1e-2, Gear_o: 1, w_in_o: 105 };
  const src = { GearCmd: { step: [1, 1, 2] as [number, number, number] }, EngTrq: 100, DiffSpd: 30 };
  it('ports', () => {
    expect(path('PT_DUAL_CLUTCH_TRANSMISSION')).toBe('Powertrain Blockset/Drivetrain/Transmissions/Dual Clutch Transmission');
    expect(ports('PT_DUAL_CLUTCH_TRANSMISSION')).toEqual([
      [['GearCmd', '1'], ['EngTrq', 'N*m'], ['DiffSpd', 'rad/s']],
      [['Info', 'bus'], ['EngSpd', 'rad/s'], ['DiffTrq', 'N*m']],
    ]);
  });
  it('torque handover without interruption, then locked in the new gear', () => {
    const mid = sim('PT_DUAL_CLUTCH_TRANSMISSION', P, src, 1.1);
    const f = info(mid).HandoverFrac;
    expect(f).toBeGreaterThan(0.4);
    expect(f).toBeLessThan(0.6);
    rel(v(mid, 'EngSpd'), 105, 1e-12);
    rel(v(mid, 'DiffTrq'), 3.5 * (100 - 400 * f) + 2.1 * 400 * f, 1e-9);
    expect(v(mid, 'DiffTrq')).toBeGreaterThan(0);
    const done = sim('PT_DUAL_CLUTCH_TRANSMISSION', P, src, 2);
    expect(info(done).Gear).toBe(2);
    expect(info(done).Locked).toBe(1);
    expect(info(done).HandoverFrac).toBe(0);
    rel(v(done, 'EngSpd'), 63, 1e-12);
    rel(v(done, 'DiffTrq'), 210, 1e-12);
  });
});

describe('PT_CONTINUOUSLY_VARIABLE_TRANSMISSION', () => {
  const P = { Nmin: 0.5, Nmax: 2.5, tau: 0.2, eta: 0.9, N_o: 2 };
  it('ports', () => {
    expect(path('PT_CONTINUOUSLY_VARIABLE_TRANSMISSION')).toBe('Powertrain Blockset/Drivetrain/Transmissions/Continuously Variable Transmission');
    expect(ports('PT_CONTINUOUSLY_VARIABLE_TRANSMISSION')).toEqual([
      [['RatioCmd', '1'], ['InTrq', 'N*m'], ['OutSpd', 'rad/s']],
      [['Info', 'bus'], ['OutTrq', 'N*m'], ['InSpd', 'rad/s']],
    ]);
  });
  it('first-order ratio response, geared torque and speed, ratio limits', () => {
    const e = sim('PT_CONTINUOUSLY_VARIABLE_TRANSMISSION', P, { RatioCmd: 1, InTrq: 100, OutSpd: 50 }, 0.3);
    const N = 1 + (2 - 1) * Math.exp(-0.3 / 0.2);
    rel(info(e).Ratio, N, 1e-9);
    rel(v(e, 'InSpd'), N * 50, 1e-9);
    rel(v(e, 'OutTrq'), N * 0.9 * 100, 1e-9);
    const sat = sim('PT_CONTINUOUSLY_VARIABLE_TRANSMISSION', P, { RatioCmd: 5, InTrq: 100, OutSpd: 50 }, 4, 1e-2);
    rel(info(sat).Ratio, 2.5, 1e-6);
  });
});

describe('transmission controllers (WP-16)', () => {
  const SCHED = { GearNums: [1, 2, 3, 4], PdlBp: [0, 50, 100], UpSpd: [[5, 8, 10], [10, 15, 20], [15, 22, 30]],
    DnSpd: [[3, 5, 7], [7, 11, 15], [12, 17, 24]], Gear_o: 1, tHold: 0.5 };
  /** Runs the controller with its own state for t = 0, dt, ..., returns GearCmd per step. */
  function drive(type: string, params: any, vehSpd: (t: number) => number, pdl: number, tEnd: number, dt = 0.01) {
    const b = BLOCK_LIBRARY[type]('x', params);
    let st = b.state;
    const out: { t: number; g: number }[] = [];
    for (let k = 0; k * dt <= tEnd + 1e-9; k++) {
      const t = k * dt;
      const r = b.execute([pdl, vehSpd(t)], b.params, st, t);
      expect(r.error).toBeUndefined();
      if (r.nextState !== undefined) st = r.nextState;
      out.push({ t, g: r.outputs[1] as number });
    }
    return out;
  }
  const firstTime = (rows: { t: number; g: number }[], g: number) => rows.find(r => r.g === g)!.t;

  it('ports', () => {
    expect(path('PT_AMT_CONTROLLER')).toBe('Powertrain Blockset/Drivetrain/Transmission Controllers/AMT Controller');
    expect(path('PT_DCT_CONTROLLER')).toBe('Powertrain Blockset/Drivetrain/Transmission Controllers/DCT Controller');
    expect(path('PT_CVT_CONTROLLER')).toBe('Powertrain Blockset/Drivetrain/Transmission Controllers/CVT Controller');
    for (const t of ['PT_AMT_CONTROLLER', 'PT_DCT_CONTROLLER']) {
      expect(ports(t)).toEqual([[['AccelPdl', '%'], ['VehSpd', 'm/s']], [['Info', 'bus'], ['GearCmd', '1']]]);
    }
    expect(ports('PT_CVT_CONTROLLER')).toEqual([[['AccelPdl', '%'], ['OutSpd', 'rad/s']], [['Info', 'bus'], ['RatioCmd', '1']]]);
  });

  it('shift schedule with hysteresis: upshifts on the up line, downshifts on the down line', () => {
    const up = (t: number) => (t <= 30 ? t : 60 - t); // 1 m/s^2 up to 30 m/s, then back down
    const rows = drive('PT_AMT_CONTROLLER', SCHED, up, 50, 60);
    // up lines at 50 % pedal: 8, 15, 22 m/s ; down lines: 5, 11, 17 m/s
    for (const [g, tUp] of [[2, 8], [3, 15], [4, 22]]) rel(firstTime(rows, g), tUp + 0.01, 1e-9);
    const down = rows.filter(r => r.t > 30);
    for (const [g, tDn] of [[3, 60 - 17], [2, 60 - 11], [1, 60 - 5]]) rel(firstTime(down, g), tDn + 0.01, 1e-9);
    const dct = drive('PT_DCT_CONTROLLER', SCHED, up, 50, 60);
    expect(dct.map(r => r.g)).toEqual(rows.map(r => r.g));
  });

  it('no hunting inside the hysteresis band and at most one shift per tHold', () => {
    const osc = drive('PT_AMT_CONTROLLER', { ...SCHED, Gear_o: 2 }, t => 8 + Math.sin(5 * t), 50, 10);
    expect(new Set(osc.map(r => r.g))).toEqual(new Set([2]));
    const jump = drive('PT_AMT_CONTROLLER', SCHED, () => 30, 50, 2);
    const at = (t: number) => jump.find(r => Math.abs(r.t - t) < 1e-9)!.g;
    expect([at(0), at(0.45), at(0.55), at(0.95), at(1.05), at(2)]).toEqual([2, 2, 3, 3, 4, 4]);
  });

  it('a down line at or above the up line is a parameter error', () => {
    const b = BLOCK_LIBRARY.PT_AMT_CONTROLLER('x', { ...SCHED, DnSpd: [[9, 5, 7], [7, 11, 15], [12, 17, 24]] });
    expect(b.execute([50, 1], b.params, b.state, 0).error).toMatch(/DnSpd/);
  });

  it('CVT controller: ratio for the target engine speed, clamped', () => {
    const P = { PdlBp: [0, 50, 100], EngSpdTgt: [100, 200, 400], Nmin: 0.5, Nmax: 2.5, wMin: 1 };
    const b = BLOCK_LIBRARY.PT_CVT_CONTROLLER('x', P);
    const cmd = (pdl: number, w: number) => b.execute([pdl, w], b.params, b.state, 0).outputs[1] as number;
    rel(cmd(75, 200), 1.5, 1e-14);
    expect(cmd(75, 50)).toBe(2.5);
    expect(cmd(75, 0)).toBe(2.5);
    expect(cmd(0, 1000)).toBe(0.5);
  });
});
