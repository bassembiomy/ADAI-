// WP-19 (part 1) acceptance tests: Mapped Motor (Powertrain Blockset / Propulsion / Electric Motors and Inverters).
// Documented form (to be confirmed against goldens):
//   Tlim(w) = interp1(w_t, T_t, |w|) (clip);  Tsat = clamp(TrqCmd, -Tlim, Tlim)
//   dMotTrq/dt = (Tsat - MotTrq)/Tc            (first-order torque response)
//   Pmech = MotTrq*w;  Ploss = interp2(w_eff_bp, T_eff_bp, losses_table, |w|, |MotTrq|) (clip)
//   Pelec = Pmech + Ploss;  BattAmp = Pelec / BattVolt
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { getPowertrainSpec } from './index';
import { isBus } from '../bus/busCore';

const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const T = 'PT_MAPPED_MOTOR';
const P = {
  Tc: 0.02,
  w_t: [0, 500, 1000], T_t: [300, 300, 150],
  w_eff_bp: [0, 1000], T_eff_bp: [0, 300],
  losses_table: [[200, 2000], [1200, 6000]],
};

function run(params: any, cmd: number, w: number, volt: number, stop: number, dt = 0.001) {
  const blocks = [
    BLOCK_LIBRARY.Constant('cmd', { value: cmd }),
    BLOCK_LIBRARY.Constant('w', { value: w }),
    BLOCK_LIBRARY.Constant('v', { value: volt }),
    BLOCK_LIBRARY[T]('m', params)
  ];
  const c = (s: string, t: string) => ({ sourceBlock: s, sourcePort: 'out', targetBlock: 'm', targetPort: t });
  const e = new XbridgesEngine({ blocks, connections: [c('cmd', 'TrqCmd'), c('w', 'Spd'), c('v', 'BattVolt')] } as any);
  Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: stop, fixedStep: dt } as any);
  return e;
}
const loss = (w: number, t: number) => {
  const fw = Math.min(Math.max(Math.abs(w), 0), 1000) / 1000, ft = Math.min(Math.max(Math.abs(t), 0), 300) / 300;
  const L = P.losses_table;
  return (1 - fw) * ((1 - ft) * L[0][0] + ft * L[0][1]) + fw * ((1 - ft) * L[1][0] + ft * L[1][1]);
};

describe('PT_MAPPED_MOTOR', () => {
  it('ports, path and parameters', () => {
    expect(getPowertrainSpec(T)!.simulinkPath).toBe('Powertrain Blockset/Propulsion/Electric Motors and Inverters/Mapped Motor');
    const b = BLOCK_LIBRARY[T]('m', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['TrqCmd', 'N*m'], ['Spd', 'rad/s'], ['BattVolt', 'V']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['MotTrq', 'N*m'], ['BattAmp', 'A']]);
    for (const k of Object.keys(P)) expect(b.params, k).toHaveProperty(k);
  });

  it('torque follows the first-order response to an in-range command', () => {
    const e = run(P, 100, 200, 400, 0.05);
    rel(e.getSignalValue('m', 'MotTrq') as number, 100 * (1 - Math.exp(-0.05 / 0.02)), 1e-7);
  });

  it('command is limited by the speed-dependent envelope (both motoring and regenerating)', () => {
    const tlim = 300 + (150 - 300) * (750 - 500) / 500; // 225 N*m at 750 rad/s
    rel(run(P, 400, 750, 400, 0.5).getSignalValue('m', 'MotTrq') as number, tlim, 1e-9);
    rel(run(P, -400, 750, 400, 0.5).getSignalValue('m', 'MotTrq') as number, -tlim, 1e-9);
    rel(run(P, 400, -750, 400, 0.5).getSignalValue('m', 'MotTrq') as number, tlim, 1e-9);
  });

  it('battery current = (T*w + losses)/V, negative when regenerating more than the losses', () => {
    const e = run(P, 150, 400, 350, 0.5);
    const t = e.getSignalValue('m', 'MotTrq') as number;
    rel(t, 150, 1e-9);
    rel(e.getSignalValue('m', 'BattAmp') as number, (150 * 400 + loss(400, 150)) / 350, 1e-9);
    const r = run(P, -150, 400, 350, 0.5);
    const amp = r.getSignalValue('m', 'BattAmp') as number;
    rel(amp, (-150 * 400 + loss(400, -150)) / 350, 1e-9);
    expect(amp).toBeLessThan(0);
  });

  it('Info bus carries mechanical, electrical and loss power that balance exactly', () => {
    const e = run(P, 120, 300, 300, 0.5);
    const info = e.getSignalValue('m', 'Info') as any;
    expect(isBus(info)).toBe(true);
    rel(info.MechPwr + info.PwrLoss, info.ElecPwr, 1e-12);
    rel(info.ElecPwr, (e.getSignalValue('m', 'BattAmp') as number) * 300, 1e-12);
  });

  it('zero or negative battery voltage is a block error, never an infinite current', () => {
    const e = run(P, 50, 100, 0, 0.01);
    expect(e.diagnostics.some(d => d.code === 'BLOCK_RUNTIME_FAULT' && d.blockIds?.includes('m'))).toBe(true);
  });
});
