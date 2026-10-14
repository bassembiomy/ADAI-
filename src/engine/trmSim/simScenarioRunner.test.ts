// WP-18b acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §7.7
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSimScenario, scenarioModelFingerprint } from './simScenarioRunner';
import { criterionToScenario, type SimScenario } from './simScenario';
import { runXbVerification } from './xbRunner';
import { runVlabVerification } from './vlabRunner';
import { runSmVerification } from './smRunner';
import { TAU_S, thermostatProject, thermostatReference, thermostatScenario, T } from './__fixtures__/thermostatProject';

const scn = (over: Record<string, unknown> = {}) => thermostatScenario(over) as unknown as SimScenario;
const close = (a: (number | null)[], b: (number | null)[]) => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, k) => {
    if (b[k] === null) expect(v, `sample ${k}`).toBeNull();
    else expect(Math.abs((v as number) - (b[k] as number)), `sample ${k}: ${v} vs ${b[k]}`).toBeLessThanOrEqual(1e-9);
  });
};

describe('coupled thermostat run (SM -> X-Bridges -> V-Lab)', () => {
  const project = thermostatProject();
  const run = runSimScenario(project, scn());
  const ref = thermostatReference();

  it('runs without diagnostics on the documented time grid', () => {
    expect(run.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(run.engines).toEqual(['sm', 'xb', 'vlab']);
    expect(run.series.times).toHaveLength(3001);
    run.series.times.forEach((t, k) => expect(t).toBe(k * 0.01));
    expect(run.schedule.couplings.map(c => c.delayed)).toEqual([false, false, true]);
  });

  it('matches the independent reference at every sample', () => {
    close(run.series.values.dT, ref.dT);
    close(run.series.values.heaterOn, ref.heaterOn);
    close(run.series.values.power, ref.power);
    close(run.series.values.heating, ref.heating);
  });

  it('verifies all five requirements with the expected witnesses', () => {
    const by = Object.fromEntries(run.assertions.map(a => [a.assertionId, a]));
    expect(Object.values(by).map(a => a.verdict)).toEqual(['passed', 'passed', 'passed', 'passed', 'passed']);
    const first60 = ref.dT.findIndex(v => v !== null && v >= 60);
    expect(by['as-t1'].at?.t).toBe(first60 * 0.01);
    // closed form of the backward-Euler LPF from rest under a constant 100 % command
    const a = 0.01 / (TAU_S + 0.01);
    expect(first60).toBe(Math.ceil(Math.log(0.4) / Math.log(1 - a)));
    expect(by['as-t1'].at?.t).toBeCloseTo(4.59, 9);
    expect(by['as-t5'].at?.t).toBe(0.01);
    expect(run.requirements).toEqual({
      'req-t1': { verdict: 'passed', assertionIds: ['as-t1'] },
      'req-t2': { verdict: 'passed', assertionIds: ['as-t2'] },
      'req-t3': { verdict: 'passed', assertionIds: ['as-t3'] },
      'req-t4': { verdict: 'passed', assertionIds: ['as-t4'] },
      'req-t5': { verdict: 'passed', assertionIds: ['as-t5'] },
    });
  });

  it('is deterministic and never mutates the project', () => {
    const before = JSON.stringify(project);
    const again = runSimScenario(project, scn());
    expect(again).toEqual(run);
    expect(JSON.stringify(project)).toBe(before);
  });

  it('fingerprints exactly the participating models, ignoring layout', () => {
    expect(run.modelFingerprint).toBe(scenarioModelFingerprint(project, ['sm', 'xb', 'vlab']));
    const moved: any = thermostatProject(); moved.vlabNodes[0].position = { x: 999, y: 999 };
    expect(scenarioModelFingerprint(moved, ['sm', 'xb', 'vlab'])).toBe(run.modelFingerprint);
    const retuned: any = thermostatProject(); retuned.vlabNodes[1].data.params.f_cut = 1;
    expect(scenarioModelFingerprint(retuned, ['sm', 'xb', 'vlab'])).not.toBe(run.modelFingerprint);
    expect(scenarioModelFingerprint(retuned, ['sm', 'xb'])).toBe(scenarioModelFingerprint(project, ['sm', 'xb']));
  });
});

describe('the execution order is respected (Gauss-Seidel)', () => {
  it('V-Lab -> X-Bridges -> SM: forward couplings use this step, backward ones the previous step', () => {
    const run = runSimScenario(thermostatProject(), scn({ order: ['vlab', 'xb', 'sm'] }));
    expect(run.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(run.schedule.couplings.map(c => c.delayed)).toEqual([true, true, false]);
    // Reference for this order: VLab uses p(k-1), XB uses on(k-1), SM sees dT(k) of the same step.
    const a = 0.01 / (TAU_S + 0.01);
    let y = 0, p = 0, on = 0;
    const dT: (number | null)[] = [null], heaterOn = [0], power = [0];
    for (let k = 1; k <= 3000; k++) {
      y = a * p + (1 - a) * y;
      p = 100 * on;
      if (on === 0 && y < 55) on = 1; else if (on === 1 && y >= 65) on = 0;
      dT.push(y); heaterOn.push(on); power.push(p);
    }
    close(run.series.values.dT, dT);
    close(run.series.values.heaterOn, heaterOn);
    close(run.series.values.power, power);
  });
});

describe('stimuli', () => {
  it('holds a stimulus value over each step (applied at t = (k-1)*step)', () => {
    const run = runSimScenario(thermostatProject(), scn({ duration: 2, stimuli: [{ target: T.enable, profile: { kind: 'step', before: 0, after: 1, at: 1 } }] }));
    const firstOn = run.series.values.heaterOn.findIndex(v => v === 1);
    expect(firstOn).toBe(101);
  });
});

describe('failures', () => {
  it('fails REQ-T2 and REQ-T3 when the upper threshold is 75, at the reference times', () => {
    const run = runSimScenario(thermostatProject({ upper: 75 }), scn());
    const ref = thermostatReference({ upper: 75 });
    close(run.series.values.dT, ref.dT);
    const by = Object.fromEntries(run.assertions.map(a => [a.assertionId, a]));
    const over70 = ref.dT.findIndex((v, k) => k >= 1500 && v !== null && v > 70);
    expect(by['as-t2'].verdict).toBe('failed');
    expect(by['as-t2'].at?.t).toBe(over70 * 0.01);
    const edge = ref.dT.findIndex(v => v !== null && v >= 65);
    expect(by['as-t3'].verdict).toBe('failed');
    expect(by['as-t3'].at?.t).toBeCloseTo(edge * 0.01 + 0.2, 9);
    expect(run.requirements['req-t1'].verdict).toBe('passed');
    expect(run.requirements['req-t2'].verdict).toBe('failed');
  });

  it('does not run an invalid scenario', () => {
    const run = runSimScenario(thermostatProject(), scn({ step: 0.3 }));
    expect(run.diagnostics.map(d => d.code)).toContain('STEP');
    expect(run.series.times).toEqual([]);
    expect(run.assertions).toEqual([]);
    expect(run.requirements).toEqual({});
  });

  it('stops on a bound violation written through a coupling, without verdicts', () => {
    const run = runSimScenario(thermostatProject(), scn({
      couplings: [{ from: T.heaterOn, to: T.gainIn }, { from: T.gainOut, to: 'sim:vlab/global/chamber/$param/f_cut' }],
      signals: [{ alias: 'dT', target: T.chamberOut }],
      assertions: [{ id: 'as-t1', requirementId: 'req-t1', condition: 'dT >= 60', temporal: { kind: 'eventually' } }],
    }));
    expect(run.diagnostics.map(d => d.code)).toContain('OUT_OF_BOUNDS');
    expect(run.assertions).toEqual([]);
    expect(run.requirements).toEqual({});
  });
});

describe('a single-engine scenario equals the WP-08 runner (parity)', () => {
  it('X-Bridges', () => {
    const nodes = [
      { id: 'c1', type: 'xbridgesBlock', position: { x: 0, y: 0 }, data: { id: 'c1', type: 'Constant', params: { value: 5 } } },
      { id: 'i1', type: 'xbridgesBlock', position: { x: 0, y: 0 }, data: { id: 'i1', type: 'INTEGRATOR_CONTINUOUS', params: { initial_condition: 2 } } },
    ];
    const edges = [{ id: 'e1', source: 'c1', sourceHandle: 'out', target: 'i1', targetHandle: 'u' }];
    const criterion: any = { id: 'c', requirementId: 'r', verificationCaseId: 'v', duration: 1, step: 0.1, observe: 'sim:xb/global/i1/y',
      stimuli: [{ target: 'sim:xb/global/c1/$param/value', profile: { kind: 'step', before: 5, after: -5, at: 0.5 } }],
      check: { kind: 'reaches', value: 4.5, by: 0.5 } };
    const legacy = runXbVerification({ canvas: 'global', nodes, edges }, criterion);
    const run = runSimScenario({ globalXBridgesNodes: nodes, globalXBridgesEdges: edges }, criterionToScenario(criterion));
    expect(run.series.values.y).toEqual(legacy.trace.map(s => s.value));
    expect(run.assertions[0].verdict).toBe(legacy.evaluation.passed ? 'passed' : 'failed');
  });

  it('V-Lab (no t = 0 sample)', () => {
    const p = thermostatProject();
    const criterion: any = { id: 'c', requirementId: 'r', verificationCaseId: 'v', duration: 1, step: 0.1, observe: T.chamberOut,
      stimuli: [{ target: T.powerValue, profile: { kind: 'constant', value: 100 } }], check: { kind: '>=', value: 1, window: [0, 1] } };
    const legacy = runVlabVerification({ canvas: 'global', nodes: p.vlabNodes, edges: p.vlabEdges }, criterion);
    const run = runSimScenario(p, criterionToScenario(criterion));
    expect(run.series.values.y[0]).toBeNull();
    expect(run.series.values.y.slice(1)).toEqual(legacy.trace.map(s => s.value));
    expect(run.assertions[0].verdict).toBe('passed');
    expect(legacy.evaluation.passed).toBe(true);
  });

  it('state machine (inductance heater, WP-11 criterion)', () => {
    const heater = JSON.parse(readFileSync(join(process.cwd(), 'inductance_heater.json'), 'utf8'));
    const criterion: any = {
      id: 'crit-1', requirementId: 'req1', verificationCaseId: 'vc1', duration: 0.1, step: 0.01,
      stimuli: [
        { target: 'sim:sm/var/6178d014-831f-4339-8dac-f275360b1222', profile: { kind: 'step', before: 0, after: 1, at: 0.005 } },
        { target: 'sim:sm/var/1d1ef5eb-3e8d-4e62-9f78-10f3eeb228a3', profile: { kind: 'step', before: 0, after: 1, at: 0.03 } },
      ],
      observe: 'sim:sm/var/a002ce43-8aaa-4ebe-b84b-b872033fb4ea', check: { kind: 'reaches', value: 60, by: 0.1 },
    };
    const legacy = runSmVerification(heater, criterion);
    const run = runSimScenario(heater, criterionToScenario(criterion));
    expect(run.series.values.y).toEqual(legacy.trace.map(s => s.value));
    expect(run.assertions[0].verdict).toBe('passed');
  });
});
