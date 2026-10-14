// WP-17 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §7.5
import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../sysml/model';
import { DEFAULT_ENGINE_ORDER, criterionToScenario, scenarioSchedule, validateScenario, type SimScenario } from './simScenario';
import { thermostatProject, thermostatScenario, THERMO_REQUIREMENTS, T } from './__fixtures__/thermostatProject';

const project = thermostatProject();
const vc = { id: 'vc-thermo', name: 'Thermostat', namespace: [], kind: 'verificationCase', method: 'simulation', verifiesRequirementIds: THERMO_REQUIREMENTS.map(r => r.id) } as any;
const scn = (over: Record<string, unknown> = {}) => thermostatScenario(over) as unknown as SimScenario;
const codes = (s: SimScenario, ctx: Record<string, unknown> = {}) => validateScenario(s, { project, verificationCase: vc, ...ctx });
const errors = (s: SimScenario, ctx: Record<string, unknown> = {}) => codes(s, ctx).filter(d => d.severity === 'error').map(d => d.code);

describe('validateScenario: the §9 thermostat scenario is valid', () => {
  it('has no errors and no warnings', () => {
    expect(codes(scn())).toEqual([]);
  });
});

describe('validateScenario: run settings', () => {
  it('checks duration, whole-multiple step, the step limit and the chart tick', () => {
    expect(errors(scn({ duration: 0 }))).toContain('DURATION');
    expect(errors(scn({ duration: 1, step: 0.3 }))).toContain('STEP');
    expect(errors(scn({ duration: 30, step: 0.001 }))).toContain('STEP');
    expect(errors(scn({ step: 0.015, duration: 30.0 }))).toContain('STEP_NOT_TICK_MULTIPLE');
  });

  it('checks the engine order', () => {
    expect(errors(scn({ order: ['sm', 'xb'] }))).toContain('ORDER');
    expect(errors(scn({ order: ['sm', 'sm', 'xb', 'vlab'] }))).toContain('ORDER');
    expect(errors(scn({ order: ['sm', 'xb', 'vlab', 'hmi'] }))).toContain('ORDER');
    expect(DEFAULT_ENGINE_ORDER).toEqual(['sm', 'xb', 'vlab']);
    const noOrder = scn(); delete (noOrder as any).order;
    expect(errors(noOrder)).toEqual([]);
  });
});

describe('validateScenario: signals and conditions', () => {
  it('checks alias syntax, reserved words and duplicates', () => {
    const bad = (alias: string) => errors(scn({ signals: [...scn().signals, { alias, target: T.enable }] }));
    expect(bad('1x')).toContain('ALIAS');
    expect(bad('abs')).toContain('ALIAS');
    expect(bad('true')).toContain('ALIAS');
    expect(bad('dT')).toContain('ALIAS');
  });

  it('resolves every signal against the models', () => {
    const s = scn({ signals: [...scn().signals, { alias: 'ghost', target: 'sim:xb/global/nope/y' }] });
    const d = codes(s).find(x => x.code === 'SIGNAL');
    expect(d?.severity).toBe('error');
    expect(d?.message).toMatch(/UNKNOWN_TARGET/);
  });

  it('reports parse errors and unknown aliases with the assertion path', () => {
    const s = scn();
    s.assertions[0] = { ...s.assertions[0], condition: 'dT = 60' };
    s.assertions[1] = { ...s.assertions[1], condition: 'temp > 3' };
    const d = codes(s).filter(x => x.code === 'EXPRESSION');
    expect(d.map(x => x.path)).toEqual(['assertions[0].condition', 'assertions[1].condition']);
    expect(d[1].message).toMatch(/temp/);
  });

  it('warns about == on a continuous signal but not on a discrete one', () => {
    const s = scn();
    s.assertions[0] = { ...s.assertions[0], condition: 'dT == 60' };
    const d = codes(s);
    expect(d.filter(x => x.severity === 'error')).toEqual([]);
    expect(d.filter(x => x.code === 'FLOAT_EQUALITY').map(x => x.path)).toEqual(['assertions[0].condition']);
    // heaterOn (bool) and heating (state) are discrete: assertions 3 and 5 use == and raise nothing.
  });
});

describe('validateScenario: windows and response', () => {
  it('checks window order, range and that it contains a grid sample', () => {
    const w = (window: [number, number]) => { const s = scn(); s.assertions[0] = { ...s.assertions[0], temporal: { kind: 'eventually', window } }; return errors(s); };
    expect(w([5, 4])).toContain('WINDOW');
    expect(w([0, 31])).toContain('WINDOW');
    expect(w([-1, 3])).toContain('WINDOW');
    expect(w([1.001, 1.009])).toContain('WINDOW');
    expect(w([0.3, 0.3])).toEqual([]);
  });

  it('checks the response deadline and trigger', () => {
    const r = (temporal: any) => { const s = scn(); s.assertions[2] = { ...s.assertions[2], temporal }; return errors(s); };
    expect(r({ kind: 'response', trigger: 'dT >= 65', within: 0 })).toContain('RESPONSE');
    expect(r({ kind: 'response', trigger: 'dT >= 65', within: Number.NaN })).toContain('RESPONSE');
    expect(r({ kind: 'response', trigger: 'dT >', within: 0.2 })).toContain('RESPONSE');
  });
});

describe('validateScenario: drives and couplings', () => {
  it('refuses a target driven twice', () => {
    const s = scn({ stimuli: [...scn().stimuli, { target: T.dT, profile: { kind: 'constant', value: 0 } }] });
    expect(errors(s)).toContain('DRIVE_CONFLICT');
  });

  it('refuses a coupling inside one model', () => {
    const s = scn({ couplings: [...scn().couplings, { from: T.heaterOn, to: T.enable }] });
    expect(errors(s)).toContain('SAME_ENGINE_COUPLING');
  });

  it('refuses a coupling into something that cannot be driven, or from something that cannot be observed', () => {
    expect(errors(scn({ couplings: [{ from: T.heaterOn, to: T.chamberOut }] }))).toContain('COUPLING');
    expect(errors(scn({ couplings: [{ from: 'sim:vlab/global/power/$param/value', to: T.dT }] }))).toContain('COUPLING');
  });

  it('checks stimulus numbers', () => {
    expect(errors(scn({ stimuli: [{ target: T.enable, profile: { kind: 'constant', value: Number.NaN } }] }))).toContain('STIMULUS');
  });
});

describe('validateScenario: requirements', () => {
  it('needs at least one assertion', () => {
    expect(errors(scn({ assertions: [] }))).toContain('NO_ASSERTIONS');
  });

  it('only accepts requirements that the verification case verifies', () => {
    const s = scn(); s.assertions[0] = { ...s.assertions[0], requirementId: 'req-other' };
    expect(errors(s)).toContain('REQUIREMENT');
  });

  it('warns when an assertion uses a signal that is not linked to its requirement', () => {
    const repo = createEmptyRepository();
    repo.relationships.l1 = { id: 'l1', kind: 'verify', sourceId: T.chamberOut, targetId: 'req-t1' } as any;
    const d = codes(scn(), { repository: repo }).filter(x => x.code === 'UNLINKED_SIGNAL');
    expect(d.every(x => x.severity === 'warning')).toBe(true);
    // req-t1 uses only dT, which is linked; every other assertion uses unlinked signals.
    expect(d.map(x => x.path)).not.toContain('assertions[0]');
    expect(d.map(x => x.path)).toContain('assertions[1]');
  });
});

describe('scenarioSchedule', () => {
  it('orders the participating engines and marks backward couplings as delayed', () => {
    const s = scenarioSchedule(scn());
    expect(s.order).toEqual(['sm', 'xb', 'vlab']);
    expect(s.steps).toBe(3000);
    expect(s.couplings.map(c => [c.fromEngine, c.toEngine, c.delayed])).toEqual([
      ['sm', 'xb', false], ['xb', 'vlab', false], ['vlab', 'sm', true],
    ]);
  });

  it('follows a custom order and drops engines that do not take part', () => {
    const s = scenarioSchedule(scn({ order: ['vlab', 'xb', 'sm'] }));
    expect(s.couplings.map(c => c.delayed)).toEqual([true, true, false]);
    const smOnly = scenarioSchedule(scn({ signals: [{ alias: 'heaterOn', target: T.heaterOn }], stimuli: [], couplings: [] }));
    expect(smOnly.order).toEqual(['sm']);
    expect(smOnly.engines).toEqual(['sm']);
  });
});

describe('criterionToScenario', () => {
  const base = { id: 'c1', requirementId: 'r1', verificationCaseId: 'v1', stimuli: [], observe: T.gainOut, duration: 1, step: 0.1 };
  const one = (check: any) => criterionToScenario({ ...base, check } as any);

  it('keeps run settings, stimuli and the observed signal as alias y', () => {
    const s = one({ kind: '<=', value: 3, window: [0, 1] });
    expect(s).toMatchObject({ verificationCaseId: 'v1', duration: 1, step: 0.1, signals: [{ alias: 'y', target: T.gainOut }], couplings: [] });
    expect(s.assertions).toHaveLength(1);
    expect(s.assertions[0].requirementId).toBe('r1');
  });

  it('maps every check to a condition and a temporal mode', () => {
    expect(one({ kind: '<=', value: 3, window: [0, 1] }).assertions[0]).toMatchObject({ condition: 'y <= 3', temporal: { kind: 'always', window: [0, 1] } });
    expect(one({ kind: '>=', value: -2, window: [0.2, 0.5] }).assertions[0]).toMatchObject({ condition: 'y >= -2', temporal: { kind: 'always', window: [0.2, 0.5] } });
    expect(one({ kind: 'within', value: 5, tolerance: 0.1, window: [0, 1] }).assertions[0]).toMatchObject({ condition: 'abs(y - 5) <= 0.1', temporal: { kind: 'always' } });
    expect(one({ kind: 'reaches', value: 4.5, by: 0.5 }).assertions[0]).toMatchObject({ condition: 'y >= 4.5', temporal: { kind: 'eventually', window: [0, 0.5] } });
    expect(one({ kind: 'reaches', value: 1, by: 0.5, direction: 'falling' }).assertions[0]).toMatchObject({ condition: 'y <= 1' });
    expect(one({ kind: 'settles', value: 2, tolerance: 0.05, by: 0.7 }).assertions[0]).toMatchObject({ condition: 'abs(y - 2) <= 0.05', temporal: { kind: 'always', window: [0.7, 1] } });
  });
});
