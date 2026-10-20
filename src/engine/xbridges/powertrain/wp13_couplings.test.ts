// WP-13 acceptance tests: couplings (Powertrain Blockset / Drivetrain / Couplings) and WP-15a Ideal Fixed Gear Transmission.
// Port names follow the Powertrain Blockset documentation as recalled (source 'simulink-docs'; to be confirmed by the MATLAB
// inventory). Documented forms:
//  Rotational Inertia:    J dw/dt = InTrq - LoadTrq - b w
//  Torsional Compliance:  dtheta/dt = InSpd - OutSpd;  Trq = k theta + b (InSpd - OutSpd)
//  Disc Clutch:           Reff = 2/3 (Ro^3 - Ri^3)/(Ro^2 - Ri^2); Tk = muk max(P,0) Ap Reff Nf; Ts = mus max(P,0) Ap Reff Nf
//                         slipping: Tc = Tk sign(w_in - w_out); J_in dw_in = InTrq - Tc - b_in w_in; J_out dw_out = Tc - LoadTrq - b_out w_out
//                         locked (|w_in - w_out| <= omega_tol and |T_lock| <= Ts): a = (InTrq - LoadTrq - b_in w_in - b_out w_out)/(J_in + J_out),
//                           T_lock = InTrq - b_in w_in - J_in a, both speeds accelerate at a; zero crossing on w_in - w_out
//  Torque Converter:      SR = clamp(TurbSpd/ImpSpd, 0, 1); ImpTrq = (ImpSpd_rpm / K(SR))^2; TurbTrq = TR(SR) ImpTrq (ImpSpd <= 0 -> 0)
//  Planetary Gear:        states (w_c, w_s); w_r = (w_c (Ns + Nr) - w_s Ns)/Nr; with a = (Ns+Nr)/Nr, b = Ns/Nr:
//                         [[Jc + Jr a^2, -Jr a b], [-Jr a b, Js + Jr b^2]] [dw_c, dw_s] = [CarrierTrq + a RingTrq, SunTrq - b RingTrq]
//  Ideal Fixed Gear Transmission: N = Ratios[index of Gear in GearNums]; InSpd = N OutSpd; OutTrq = N k InTrq, k = eff when InTrq*InSpd >= 0
//                         else 1/eff; Gear 0 (neutral): OutTrq = 0, InSpd = 0; a gear not in GearNums is a block error.
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { getPowertrainSpec } from './index';

const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
function sim(type: string, params: any, consts: Record<string, number>, stop: number, dt = 1e-3, solver = 'ode4') {
  const blocks: any[] = [BLOCK_LIBRARY[type]('x', params)];
  const conns: any[] = [];
  for (const [port, v] of Object.entries(consts)) {
    blocks.push(BLOCK_LIBRARY.Constant(`c_${port}`, { value: v }));
    conns.push({ sourceBlock: `c_${port}`, sourcePort: 'out', targetBlock: 'x', targetPort: port });
  }
  const e = new XbridgesEngine({ blocks, connections: conns } as any);
  Solvers.runFixedStep(e, { solver, startTime: 0, stopTime: stop, fixedStep: dt } as any);
  return e;
}
const v = (e: XbridgesEngine, port: string) => e.getSignalValue('x', port) as number;

describe('PT_ROTATIONAL_INERTIA', () => {
  it('ports and the exact exponential response with damping', () => {
    expect(getPowertrainSpec('PT_ROTATIONAL_INERTIA')!.simulinkPath).toBe('Powertrain Blockset/Drivetrain/Couplings/Rotational Inertia');
    const b = BLOCK_LIBRARY.PT_ROTATIONAL_INERTIA('x', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['InTrq', 'N*m'], ['LoadTrq', 'N*m']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['Spd', 'rad/s']]);
    const e = sim('PT_ROTATIONAL_INERTIA', { J: 0.5, b: 0.2, omega_o: 10 }, { InTrq: 30, LoadTrq: 10 }, 2);
    const wInf = 20 / 0.2;
    rel(v(e, 'Spd'), wInf + (10 - wInf) * Math.exp(-0.2 / 0.5 * 2), 1e-9);
  });
});

describe('PT_TORSIONAL_COMPLIANCE', () => {
  it('ports and the shaft torque from twist and damping', () => {
    expect(getPowertrainSpec('PT_TORSIONAL_COMPLIANCE')!.simulinkPath).toBe('Powertrain Blockset/Drivetrain/Couplings/Torsional Compliance');
    const b = BLOCK_LIBRARY.PT_TORSIONAL_COMPLIANCE('x', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['InSpd', 'rad/s'], ['OutSpd', 'rad/s']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['Trq', 'N*m']]);
    const e = sim('PT_TORSIONAL_COMPLIANCE', { k: 5000, b: 10, theta_o: 0.01 }, { InSpd: 52, OutSpd: 50 }, 0.5);
    rel(v(e, 'Trq'), 5000 * (0.01 + 2 * 0.5) + 10 * 2, 1e-9);
  });
});

describe('PT_DISC_CLUTCH', () => {
  const P = { muk: 0.3, mus: 0.35, Ro: 0.15, Ri: 0.1, Nf: 2, Ap: 0.01, J_in: 0.2, J_out: 0.1, b_in: 0, b_out: 0, omega_tol: 1e-2, w_in_o: 100, w_out_o: 0 };
  const Reff = 2 / 3 * (0.15 ** 3 - 0.1 ** 3) / (0.15 ** 2 - 0.1 ** 2);

  it('ports and parameters', () => {
    expect(getPowertrainSpec('PT_DISC_CLUTCH')!.simulinkPath).toBe('Powertrain Blockset/Drivetrain/Couplings/Disc Clutch');
    const b = BLOCK_LIBRARY.PT_DISC_CLUTCH('x', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['P', 'Pa'], ['InTrq', 'N*m'], ['LoadTrq', 'N*m']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['InSpd', 'rad/s'], ['OutSpd', 'rad/s'], ['Locked', '1']]);
  });

  it('open clutch: both sides accelerate independently', () => {
    const e = sim('PT_DISC_CLUTCH', { ...P, w_in_o: 0 }, { P: 0, InTrq: 20, LoadTrq: 5 }, 1);
    rel(v(e, 'InSpd'), 20 / 0.2, 1e-9);
    rel(v(e, 'OutSpd'), -5 / 0.1, 1e-9);
    expect(v(e, 'Locked')).toBe(0);
  });

  it('engagement: linear slip decay, lock at t*, common speed from conservation of angular momentum', () => {
    const p = 2e5;
    const Tk = 0.3 * p * 0.01 * Reff * 2;
    const tStar = 100 / (Tk * (1 / 0.2 + 1 / 0.1));
    const mid = sim('PT_DISC_CLUTCH', P, { P: p, InTrq: 0, LoadTrq: 0 }, tStar / 2, 1e-4);
    rel(v(mid, 'InSpd') - v(mid, 'OutSpd'), 50, 1e-6);
    const after = sim('PT_DISC_CLUTCH', P, { P: p, InTrq: 0, LoadTrq: 0 }, tStar * 1.5, 1e-4);
    expect(v(after, 'Locked')).toBe(1);
    rel(v(after, 'InSpd'), 0.2 * 100 / 0.3, 1e-3);
    rel(v(after, 'OutSpd'), 0.2 * 100 / 0.3, 1e-3);
    expect((after.getSignalValue('x', 'Info') as any).SlipPwr).toBe(0);
  });

  it('locked clutch breaks away when the transmitted torque exceeds the static capacity', () => {
    const p = 2e5, Ts = 0.35 * p * 0.01 * Reff * 2;
    const below = Ts * 0.9 * 0.3 / 0.1; // T_lock = InTrq * J_out/(J_in+J_out)
    const hold = sim('PT_DISC_CLUTCH', { ...P, w_in_o: 50, w_out_o: 50 }, { P: p, InTrq: below, LoadTrq: 0 }, 0.2, 1e-4);
    expect(v(hold, 'Locked')).toBe(1);
    rel(v(hold, 'InSpd'), 50 + below / 0.3 * 0.2, 1e-6);
    const slip = sim('PT_DISC_CLUTCH', { ...P, w_in_o: 50, w_out_o: 50 }, { P: p, InTrq: below * 1.5, LoadTrq: 0 }, 0.2, 1e-4);
    expect(v(slip, 'Locked')).toBe(0);
    expect(v(slip, 'InSpd')).toBeGreaterThan(v(slip, 'OutSpd'));
  });
});

describe('PT_TORQUE_CONVERTER', () => {
  const P = { SR_bp: [0, 0.5, 0.8, 0.9, 1], K_tbl: [150, 155, 170, 200, 400], TR_tbl: [2.2, 1.6, 1.1, 1.0, 1.0] };
  const exec = (ins: number[]) => { const b = BLOCK_LIBRARY.PT_TORQUE_CONVERTER('x', P); return b.execute(ins, b.params, b.state, 0).outputs; };
  it('ports', () => {
    expect(getPowertrainSpec('PT_TORQUE_CONVERTER')!.simulinkPath).toBe('Powertrain Blockset/Drivetrain/Couplings/Torque Converter');
    const b = BLOCK_LIBRARY.PT_TORQUE_CONVERTER('x', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['ImpSpd', 'rad/s'], ['TurbSpd', 'rad/s']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['ImpTrq', 'N*m'], ['TurbTrq', 'N*m']]);
  });
  it('K-factor and torque ratio from the speed ratio', () => {
    const wi = 2000 * 2 * Math.PI / 60;
    const o = exec([wi, 0.65 * wi]);
    const K = 155 + (170 - 155) * 0.5, TR = 1.6 + (1.1 - 1.6) * 0.5;
    rel(o[1] as number, (2000 / K) ** 2, 1e-12);
    rel(o[2] as number, TR * (2000 / K) ** 2, 1e-12);
    const stall = exec([wi, 0]);
    rel(stall[2] as number, 2.2 * (2000 / 150) ** 2, 1e-12);
    expect(exec([0, 10])[1]).toBe(0);
  });
});

describe('PT_PLANETARY_GEAR', () => {
  const P = { Ns: 30, Nr: 78, Jc: 0.05, Js: 0.01, Jr: 0.08, wc_o: 10, ws_o: 20 };
  it('ports, the Willis constraint and the exact constant-acceleration response', () => {
    expect(getPowertrainSpec('PT_PLANETARY_GEAR')!.simulinkPath).toBe('Powertrain Blockset/Drivetrain/Couplings/Planetary Gear');
    const b = BLOCK_LIBRARY.PT_PLANETARY_GEAR('x', {});
    expect(b.inputs.map(p => p.id)).toEqual(['CarrierTrq', 'SunTrq', 'RingTrq']);
    expect(b.outputs.map(p => p.id)).toEqual(['Info', 'CarrierSpd', 'SunSpd', 'RingSpd']);
    const Tc = 50, Ts = -12, Tr = 5;
    const e = sim('PT_PLANETARY_GEAR', P, { CarrierTrq: Tc, SunTrq: Ts, RingTrq: Tr }, 0.5);
    const a = (30 + 78) / 78, bb = 30 / 78;
    const M = [[0.05 + 0.08 * a * a, -0.08 * a * bb], [-0.08 * a * bb, 0.01 + 0.08 * bb * bb]];
    const Q = [Tc + a * Tr, Ts - bb * Tr];
    const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    const ac = (M[1][1] * Q[0] - M[0][1] * Q[1]) / det, as = (M[0][0] * Q[1] - M[1][0] * Q[0]) / det;
    rel(v(e, 'CarrierSpd'), 10 + ac * 0.5, 1e-9);
    rel(v(e, 'SunSpd'), 20 + as * 0.5, 1e-9);
    rel(v(e, 'RingSpd'), (v(e, 'CarrierSpd') * 108 - v(e, 'SunSpd') * 30) / 78, 1e-12);
  });
});

describe('PT_IDEAL_FIXED_GEAR_TRANSMISSION (WP-15a)', () => {
  const P = { GearNums: [-1, 0, 1, 2, 3], Ratios: [-4, 0, 4, 2.5, 1.5], Eff: [0.9, 1, 0.95, 0.96, 0.97] };
  const exec = (params: any, ins: number[]) => { const b = BLOCK_LIBRARY.PT_IDEAL_FIXED_GEAR_TRANSMISSION('x', params); return b.execute(ins, b.params, b.state, 0); };
  it('ports', () => {
    expect(getPowertrainSpec('PT_IDEAL_FIXED_GEAR_TRANSMISSION')!.simulinkPath).toBe('Powertrain Blockset/Drivetrain/Transmissions/Ideal Fixed Gear Transmission');
    const b = BLOCK_LIBRARY.PT_IDEAL_FIXED_GEAR_TRANSMISSION('x', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['Gear', '1'], ['InTrq', 'N*m'], ['OutSpd', 'rad/s']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['OutTrq', 'N*m'], ['InSpd', 'rad/s']]);
  });
  it('ratio, efficiency by power direction, neutral and unknown gears', () => {
    const r = exec(P, [2, 100, 40]).outputs;
    rel(r[1] as number, 2.5 * 0.96 * 100, 1e-14);
    rel(r[2] as number, 2.5 * 40, 1e-14);
    const back = exec(P, [2, -100, 40]).outputs;
    rel(back[1] as number, 2.5 * -100 / 0.96, 1e-14);
    const rev = exec(P, [-1, 100, -10]).outputs;
    rel(rev[1] as number, -4 * 0.9 * 100, 1e-14);
    expect(exec(P, [0, 100, 40]).outputs.slice(1)).toEqual([0, 0]);
    expect(exec(P, [7, 100, 40]).error).toMatch(/Gear/);
  });
});
