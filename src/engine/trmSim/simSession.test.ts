// WP-16 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §7.4
import { describe, expect, it } from 'vitest';
import { createSimSession, engineModelOf, engineOfSimTarget } from './simSession';
import { thermostatProject, T } from './__fixtures__/thermostatProject';

const DT = 0.01;
const ALPHA = DT / (5 + DT); // ps_lpf backward Euler, T = 5 s

const open = (engine: 'sm' | 'xb' | 'vlab', project: any, observe: string[], drive: string[], step = DT) => {
  const { session, diagnostics } = createSimSession(engine, project, { observe, drive, step });
  expect(diagnostics).toEqual([]);
  if (!session) throw new Error('no session');
  return session;
};

describe('engineOfSimTarget / engineModelOf', () => {
  it('maps targets to engines (raw state ids belong to the state machine)', () => {
    expect(engineOfSimTarget(T.heating)).toBe('sm');
    expect(engineOfSimTarget(T.dT)).toBe('sm');
    expect(engineOfSimTarget(T.gainOut)).toBe('xb');
    expect(engineOfSimTarget(T.chamberOut)).toBe('vlab');
  });

  it('returns only the slice of the project that an engine simulates', () => {
    const p = thermostatProject();
    expect(Object.keys(engineModelOf(p, 'xb') as object).sort()).toEqual(['globalXBridgesEdges', 'globalXBridgesNodes']);
    expect(Object.keys(engineModelOf(p, 'vlab') as object).sort()).toEqual(['vlabEdges', 'vlabNodes']);
    expect((engineModelOf(p, 'sm') as any).states).toHaveLength(2);
  });
});

describe('state machine session', () => {
  it('reads null before initialize, then variables and states as numbers', () => {
    const s = open('sm', thermostatProject(), [T.heaterOn, T.heating], [T.enable, T.dT]);
    expect(s.engine).toBe('sm');
    expect(s.hasInitialSample).toBe(true);
    expect(s.read(T.heaterOn)).toBeNull();
    expect(s.write(T.enable, 1)).toBeNull();
    expect(s.write(T.dT, 0)).toBeNull();
    expect(s.initialize()).toBeNull();
    expect(s.read(T.heaterOn)).toBe(0);
    expect(s.read(T.heating)).toBe(0);
    expect(s.step(0, DT)).toBeNull();
    expect(s.read(T.heaterOn)).toBe(1);
    expect(s.read(T.heating)).toBe(1);
  });

  it('refuses a step that is not a whole number of chart ticks', () => {
    const r = createSimSession('sm', thermostatProject(), { observe: [T.heaterOn], drive: [], step: 0.015 });
    expect(r.session).toBeNull();
    expect(r.diagnostics.map(d => d.code)).toEqual(['STEP_NOT_TICK_MULTIPLE']);
  });

  it('resolves targets with the WP-08 codes', () => {
    const r = createSimSession('sm', thermostatProject(), { observe: ['sim:sm/var/nope'], drive: [T.gainIn], step: DT });
    expect(r.session).toBeNull();
    expect(r.diagnostics.map(d => d.code).sort()).toEqual(['UNKNOWN_TARGET', 'UNSUPPORTED_TARGET']);
  });

  it('describes discrete and continuous signals', () => {
    const s = open('sm', thermostatProject(), [T.heaterOn, T.dT, T.heating], []);
    expect(s.signalInfo(T.heaterOn).discrete).toBe(true);
    expect(s.signalInfo(T.heating).discrete).toBe(true);
    expect(s.signalInfo(T.dT).discrete).toBe(false);
  });
});

describe('X-Bridges session', () => {
  it('computes initial outputs in initialize and advances one step at a time', () => {
    const s = open('xb', thermostatProject(), [T.gainOut], [T.gainIn, T.gainParam]);
    expect(s.hasInitialSample).toBe(true);
    expect(s.read(T.gainOut)).toBeNull();
    expect(s.write(T.gainIn, 1)).toBeNull();
    expect(s.initialize()).toBeNull();
    expect(s.read(T.gainOut)).toBe(100);
    expect(s.write(T.gainParam, 50)).toBeNull();
    expect(s.step(0, DT)).toBeNull();
    expect(s.read(T.gainOut)).toBe(50);
    expect(s.signalInfo(T.gainOut).discrete).toBe(false);
  });

  it('refuses to drive an output port', () => {
    const r = createSimSession('xb', thermostatProject(), { observe: [], drive: [T.gainOut], step: DT });
    expect(r.session).toBeNull();
    expect(r.diagnostics.map(d => d.code)).toEqual(['NOT_STIMULABLE']);
  });
});

describe('V-Lab session', () => {
  it('has no t = 0 value and follows the backward-Euler low-pass filter', () => {
    const s = open('vlab', thermostatProject(), [T.chamberOut], [T.powerValue]);
    expect(s.hasInitialSample).toBe(false);
    expect(s.initialize()).toBeNull();
    expect(s.read(T.chamberOut)).toBeNull();
    expect(s.write(T.powerValue, 100)).toBeNull();
    expect(s.step(0, DT)).toBeNull();
    expect(s.read(T.chamberOut)).toBeCloseTo(100 * ALPHA, 12);
    expect(s.step(DT, DT)).toBeNull();
    expect(s.read(T.chamberOut)).toBeCloseTo(100 * (1 - (1 - ALPHA) ** 2), 12);
  });

  it('checks library bounds on every write', () => {
    const s = open('vlab', thermostatProject(), [T.chamberOut], ['sim:vlab/global/chamber/$param/f_cut']);
    expect(s.write('sim:vlab/global/chamber/$param/f_cut', 0)).toMatchObject({ code: 'OUT_OF_BOUNDS' });
  });

  it('asks for a sensor instead of observing a conserving port', () => {
    const p: any = thermostatProject();
    p.vlabNodes.push({ id: 'r', type: 'default', position: { x: 0, y: 0 }, data: { type: 'resistor', params: { R: 10 } } });
    const r = createSimSession('vlab', p, { observe: ['sim:vlab/global/r/p'], drive: [], step: DT });
    expect(r.session).toBeNull();
    expect(r.diagnostics.map(d => d.code)).toEqual(['NOT_OBSERVABLE']);
  });
});

describe('sessions never mutate the project', () => {
  it('leaves the project byte-identical after use of all three engines', () => {
    const p = thermostatProject();
    const before = JSON.stringify(p);
    const sm = open('sm', p, [T.heaterOn], [T.enable, T.dT]);
    const xb = open('xb', p, [T.gainOut], [T.gainIn, T.gainParam]);
    const vl = open('vlab', p, [T.chamberOut], [T.powerValue]);
    sm.write(T.enable, 1); sm.initialize(); xb.write(T.gainParam, 7); xb.initialize(); vl.initialize();
    for (let k = 0; k < 5; k++) {
      sm.step(k * DT, DT); xb.write(T.gainIn, sm.read(T.heaterOn)!); xb.step(k * DT, DT);
      vl.write(T.powerValue, xb.read(T.gainOut)!); vl.step(k * DT, DT);
    }
    expect(JSON.stringify(p)).toBe(before);
  });
});
