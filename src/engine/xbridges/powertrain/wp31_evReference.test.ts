// WP-31 acceptance tests: electric-vehicle reference model built only from X-Bridges block factories.
// Topology (documented in src/engine/xbridges/powertrain/examples/evReference.ts):
//   Drive Cycle Source -> Longitudinal Driver -> TrqCmd = (AccelCmd - DecelCmd)*Tpeak -> Mapped Motor
//   Mapped Motor MotTrq -> Open Differential -> front Longitudinal Wheel; rear wheel free rolling
//   wheel Fx -> Vehicle Body 1DOF (FwF/FwR); vehicle xdot -> wheels Vx and driver VelFdbk; vehicle FzF/FzR -> wheels Fz
//   friction brakes BrkPrs = DecelCmd*BrkPrsMax on both wheels
//   Mapped Motor BattAmp -> Datasheet Battery BattCurr; battery BattVolt -> Memory -> motor BattVolt
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { buildEvReference, EV_REFERENCE_IDS as ID } from './examples/evReference';

function instrumented(stop: number) {
  const { blocks, connections } = buildEvReference({ cycle: 'UDDS' });
  // Test-side probes: a lightweight recorder (one sample per macro step, O(1) per call; the Scope block
  // copies its whole history on each call, which is quadratic over long runs) and a charge integrator.
  const byT = new Map<number, { t: number; y1: number; y2: number; y3: number; y4: number }>();
  const probe: any = {
    id: 'probe', type: 'TestProbe', params: {}, outputs: [],
    inputs: [1, 2, 3, 4].map(i => ({ id: `in${i}`, name: `in${i}`, type: 'auto', direction: 'input', value: 0 })),
    execute: (ins: any[], _p: any, _s: any, t: number) => {
      // the last evaluation at a given step time wins: the post-step output pass comes after the solver stages
      byT.set(Math.round(t * 100), { t, y1: ins[0], y2: ins[1], y3: ins[2], y4: ins[3] });
      return { outputs: [] };
    },
  };
  blocks.push(probe);
  blocks.push(BLOCK_LIBRARY.Integrator('ampSec', { initialCondition: 0 }));
  const c = (s: string, sp: string, t: string, tp: string) => ({ sourceBlock: s, sourcePort: sp, targetBlock: t, targetPort: tp });
  connections.push(
    c(ID.cycle, 'VelRef', 'probe', 'in1'), c(ID.vehicle, 'xdot', 'probe', 'in2'),
    c(ID.motor, 'BattAmp', 'probe', 'in3'), c(ID.battery, 'BattSoc', 'probe', 'in4'),
    c(ID.motor, 'BattAmp', 'ampSec', 'in'),
  );
  const e = new XbridgesEngine({ blocks, connections } as any);
  Solvers.runFixedStep(e, { solver: 'ode14x', startTime: 0, stopTime: stop, fixedStep: 0.01 } as any);
  const samples = [...byT.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s);
  return { e, samples };
}

describe('EV reference model', () => {
  it('is built only from registered blocks, with the documented block ids', () => {
    const { blocks, connections } = buildEvReference({ cycle: 'UDDS' });
    for (const b of blocks) expect(BLOCK_LIBRARY[b.type], b.type).toBeTypeOf('function');
    for (const id of Object.values(ID)) expect(blocks.some(b => b.id === id), id).toBe(true);
    const ids = new Set(blocks.map(b => b.id));
    for (const cn of connections) {
      expect(ids.has(cn.sourceBlock), cn.sourceBlock).toBe(true);
      expect(ids.has(cn.targetBlock), cn.targetBlock).toBe(true);
      const src = blocks.find(b => b.id === cn.sourceBlock)!;
      const dst = blocks.find(b => b.id === cn.targetBlock)!;
      expect(src.outputs.some(p => p.id === cn.sourcePort), `${cn.sourceBlock}.${cn.sourcePort}`).toBe(true);
      expect(dst.inputs.some(p => p.id === cn.targetPort), `${cn.targetBlock}.${cn.targetPort}`).toBe(true);
    }
    // every input port of every powertrain block is wired
    for (const b of blocks.filter(b => b.type.startsWith('PT_'))) {
      for (const p of b.inputs) expect(connections.some(cn => cn.targetBlock === b.id && cn.targetPort === p.id), `${b.id}.${p.id}`).toBe(true);
    }
  });

  it('follows the first 120 s of UDDS, conserves charge, regenerates and uses a plausible amount of energy', () => {
    const T = 120;
    const { e, samples } = instrumented(T);
    expect(e.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(samples.length).toBeGreaterThan(T * 100 * 0.9);

    // speed tracking
    const err = samples.map(s => s.y1 - s.y2);
    const rms = Math.sqrt(err.reduce((a, x) => a + x * x, 0) / err.length);
    expect(rms).toBeLessThan(0.5);
    expect(Math.max(...err.map(Math.abs))).toBeLessThan(1.5);

    // charge conservation: battery charge lost = integral of motor current / 3600
    const bat = e.getBlock(ID.battery)!;
    const q0 = (bat.params as any).BattCapInit as number;
    const info = e.getSignalValue(ID.battery, 'Info') as any;
    const ampSec = e.getSignalValue('ampSec', 'out') as number;
    expect(Math.abs((q0 - info.BattCharge) - ampSec / 3600)).toBeLessThan(1e-9 * Math.max(1, Math.abs(ampSec)));

    // regeneration happens on the decelerations of the window
    expect(Math.min(...samples.map(s => s.y3))).toBeLessThan(0);
    expect(samples[samples.length - 1].y4).toBeLessThan(samples[0].y4);

    // energy per distance in a plausible EV range (incl. motor losses, our default maps)
    const dist = samples.reduce((a, s, i) => i ? a + (s.y2 + samples[i - 1].y2) / 2 * 0.01 : 0, 0);
    expect(dist).toBeGreaterThan(500);
    const v = e.getSignalValue(ID.battery, 'BattVolt') as number;
    const whPerKm = (ampSec / 3600) * v / (dist / 1000);
    expect(whPerKm).toBeGreaterThan(60);
    expect(whPerKm).toBeLessThan(300);
  }, 300_000);
});
