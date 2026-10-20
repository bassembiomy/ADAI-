// WP-10 acceptance tests: Drive Cycle Source and Longitudinal Driver (Powertrain Blockset / Vehicle Scenarios).
// Drive cycles: EPA public-domain data (UDDS, HWFET, US06; FTP-75 = UDDS 0..1369 s, 600 s soak at 0, UDDS 0..505 s).
// Longitudinal Driver (PI with feed-forward and anti-windup, documented form; to be confirmed against goldens):
//   e = VelRef - VelFdbk
//   y = (Kff*VelRef + Kp*e + Ki*z)/vnom + Kg*Grade,   dz/dt = e + Kaw*(ysat - y)*vnom/Ki  (back-calculation)
//   ysat = clamp(y, -1, 1);  AccelCmd = max(ysat, 0);  DecelCmd = max(-ysat, 0)
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { getPowertrainSpec } from './index';
import { isBus } from '../bus/busCore';

const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const exec = (type: string, params: any, ins: any[], t: number) => {
  const b = BLOCK_LIBRARY[type]('x', params);
  return b.execute(ins, b.params, b.state, t);
};

function sampleCycle(params: any, tEnd: number, dt = 1) {
  const b = BLOCK_LIBRARY.PT_DRIVE_CYCLE_SOURCE('dc', params);
  const out: number[] = [];
  for (let t = 0; t <= tEnd + 1e-9; t += dt) out.push(b.execute([], b.params, b.state, t).outputs[b.outputs.findIndex(p => p.id === 'VelRef')] as number);
  return out;
}
const trapz = (v: number[], dt: number) => v.slice(1).reduce((s, x, i) => s + (x + v[i]) / 2 * dt, 0);

describe('PT_DRIVE_CYCLE_SOURCE', () => {
  it('ports, path and defaults (FTP75 in m/s, continuous output)', () => {
    const s = getPowertrainSpec('PT_DRIVE_CYCLE_SOURCE')!;
    expect(s.simulinkPath).toBe('Powertrain Blockset/Vehicle Scenarios/Drive Cycle and Maneuvers/Drive Cycle Source');
    const b = BLOCK_LIBRARY.PT_DRIVE_CYCLE_SOURCE('dc', {});
    expect(b.inputs).toEqual([]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['VelRef', 'm/s']]);
    expect(b.params.cycleVar).toBe('FTP75');
    expect(b.params.outUnit).toBe('m/s');
    expect(b.params.Ts).toBe(0);
    expect(b.params.repeatCycle).toBe('off');
  });

  it.each([
    ['UDDS', 1369, 11.99, 91.25],
    ['HWFET', 765, 16.51, 96.40],
    ['US06', 600, 12.89, 129.23],
    ['FTP75', 2474, 17.77, 91.25],
  ])('%s has the published duration, distance and top speed', (cycle, dur, km, vmaxKmh) => {
    const v = sampleCycle({ cycleVar: cycle }, dur);
    rel(trapz(v, 1) / 1000, km, 0.005);
    rel(Math.max(...v) * 3.6, vmaxKmh, 0.001);
    expect(v[0]).toBe(0);
  });

  it('FTP75 soaks at zero between 1369 s and 1969 s and repeats the UDDS start after it', () => {
    const ftp = BLOCK_LIBRARY.PT_DRIVE_CYCLE_SOURCE('a', { cycleVar: 'FTP75' });
    const udds = BLOCK_LIBRARY.PT_DRIVE_CYCLE_SOURCE('b', { cycleVar: 'UDDS' });
    const at = (b: any, t: number) => b.execute([], b.params, b.state, t).outputs[0] as number;
    for (const t of [1400, 1700, 1968]) expect(at(ftp, t)).toBe(0);
    for (const t of [10.5, 200, 1300]) expect(at(ftp, t)).toBe(at(udds, t));
    for (const tau of [20, 100.25, 505]) expect(at(ftp, 1969 + tau)).toBe(at(udds, tau));
  });

  it('interpolates linearly between 1 s samples when Ts = 0, holds with Ts > 0', () => {
    const b = BLOCK_LIBRARY.PT_DRIVE_CYCLE_SOURCE('a', { cycleVar: 'UDDS' });
    const at = (t: number, p = b.params) => b.execute([], p, b.state, t).outputs[0] as number;
    const v20 = at(20), v21 = at(21);
    rel(at(20.25), v20 + 0.25 * (v21 - v20), 1e-12);
    const held = BLOCK_LIBRARY.PT_DRIVE_CYCLE_SOURCE('h', { cycleVar: 'UDDS', Ts: 1 });
    expect(held.execute([], held.params, held.state, 20.75).outputs[0]).toBe(v20);
  });

  it('converts output units and repeats or holds the last value after the end', () => {
    const ms = exec('PT_DRIVE_CYCLE_SOURCE', { cycleVar: 'US06' }, [], 300).outputs[0] as number;
    rel(exec('PT_DRIVE_CYCLE_SOURCE', { cycleVar: 'US06', outUnit: 'km/h' }, [], 300).outputs[0] as number, ms * 3.6, 1e-12);
    rel(exec('PT_DRIVE_CYCLE_SOURCE', { cycleVar: 'US06', outUnit: 'mph' }, [], 300).outputs[0] as number, ms / 0.44704, 1e-12);
    const v100 = exec('PT_DRIVE_CYCLE_SOURCE', { cycleVar: 'US06' }, [], 100).outputs[0] as number;
    rel(exec('PT_DRIVE_CYCLE_SOURCE', { cycleVar: 'US06', repeatCycle: 'on' }, [], 700).outputs[0] as number, v100, 1e-12);
    expect(exec('PT_DRIVE_CYCLE_SOURCE', { cycleVar: 'US06', repeatCycle: 'off' }, [], 700).outputs[0]).toBe(exec('PT_DRIVE_CYCLE_SOURCE', { cycleVar: 'US06' }, [], 600).outputs[0]);
  });

  it('Workspace variable: a user [t v] table, validated', () => {
    const p = { cycleVar: 'Workspace variable', wsVar: '[0 0; 10 5; 20 5; 30 0]' };
    rel(exec('PT_DRIVE_CYCLE_SOURCE', p, [], 5).outputs[0] as number, 2.5, 1e-12);
    rel(exec('PT_DRIVE_CYCLE_SOURCE', p, [], 15).outputs[0] as number, 5, 1e-12);
    expect(exec('PT_DRIVE_CYCLE_SOURCE', { cycleVar: 'Workspace variable', wsVar: '[0 0; 10 5; 5 5]' }, [], 1).error).toMatch(/increasing/i);
    expect(exec('PT_DRIVE_CYCLE_SOURCE', { cycleVar: 'NEDC' }, [], 1).error).toMatch(/NEDC.*Workspace variable/);
  });
});

describe('PT_LONGITUDINAL_DRIVER', () => {
  const P = { Kp: 0.6, Ki: 0.05, Kff: 0.02, Kg: 0.01, Kaw: 1, vnom: 30 };

  it('ports, path and parameters', () => {
    const s = getPowertrainSpec('PT_LONGITUDINAL_DRIVER')!;
    expect(s.simulinkPath).toBe('Powertrain Blockset/Vehicle Scenarios/Driver/Longitudinal Driver');
    const b = BLOCK_LIBRARY.PT_LONGITUDINAL_DRIVER('d', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['VelRef', 'm/s'], ['VelFdbk', 'm/s'], ['Grade', 'deg']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['AccelCmd', '1'], ['DecelCmd', '1']]);
    for (const k of ['Kp', 'Ki', 'Kff', 'Kg', 'Kaw', 'vnom']) expect(b.params, k).toHaveProperty(k);
  });

  it('with zero integrator state the command is the proportional + feed-forward + grade term, split into accel/decel', () => {
    const y = (P.Kff * 20 + P.Kp * (20 - 15)) / P.vnom + P.Kg * 2;
    const r = exec('PT_LONGITUDINAL_DRIVER', P, [20, 15, 2], 0);
    const b = BLOCK_LIBRARY.PT_LONGITUDINAL_DRIVER('d', P);
    const iA = b.outputs.findIndex(p => p.id === 'AccelCmd'), iD = b.outputs.findIndex(p => p.id === 'DecelCmd');
    rel(r.outputs[iA] as number, y, 1e-12);
    expect(r.outputs[iD]).toBe(0);
    const r2 = exec('PT_LONGITUDINAL_DRIVER', P, [10, 20, 0], 0);
    rel(r2.outputs[iD] as number, -(P.Kff * 10 + P.Kp * (10 - 20)) / P.vnom, 1e-12);
    expect(r2.outputs[iA]).toBe(0);
    const big = exec('PT_LONGITUDINAL_DRIVER', P, [100, 0, 0], 0);
    expect(big.outputs[iA]).toBe(1);
    expect(isBus(r.outputs[b.outputs.findIndex(p => p.id === 'Info')])).toBe(true);
  });

  it('closes the loop on a first-order plant and removes steady-state error (integral action)', () => {
    // Plant: dv/dt = (AccelCmd - DecelCmd) * 3 - 0.05 * v  (simple vehicle), reference 15 m/s.
    const blocks = [
      BLOCK_LIBRARY.Constant('ref', { value: 15 }),
      BLOCK_LIBRARY.Constant('grade', { value: 0 }),
      BLOCK_LIBRARY.PT_LONGITUDINAL_DRIVER('drv', P),
      BLOCK_LIBRARY.VectorSub('net', {}),
      BLOCK_LIBRARY.GAIN('gainA', { gain: 3 }),
      BLOCK_LIBRARY.GAIN('drag', { gain: -0.05 }),
      BLOCK_LIBRARY.Sum('sum', { signs: '++' }),
      BLOCK_LIBRARY.Integrator('v', { initialCondition: 0 }),
    ];
    const c = (s: string, sp: string, t: string, tp: string) => ({ sourceBlock: s, sourcePort: sp, targetBlock: t, targetPort: tp });
    const sum = blocks.find(b => b.id === 'sum')!;
    const sub = blocks.find(b => b.id === 'net')!;
    const engine = new XbridgesEngine({ blocks, connections: [
      c('ref', 'out', 'drv', 'VelRef'), c('v', 'out', 'drv', 'VelFdbk'), c('grade', 'out', 'drv', 'Grade'),
      c('drv', 'AccelCmd', 'net', sub.inputs[0].id), c('drv', 'DecelCmd', 'net', sub.inputs[1].id),
      c('net', sub.outputs[0].id, 'gainA', 'u'), c('gainA', 'y', 'sum', sum.inputs[0].id),
      c('v', 'out', 'drag', 'u'), c('drag', 'y', 'sum', sum.inputs[1].id),
      c('sum', sum.outputs[0].id, 'v', 'in'),
    ] } as any);
    Solvers.runFixedStep(engine, { solver: 'ode4', startTime: 0, stopTime: 200, fixedStep: 0.05 } as any);
    rel(engine.getSignalValue('v', 'out') as number, 15, 2e-3);
  });
});
