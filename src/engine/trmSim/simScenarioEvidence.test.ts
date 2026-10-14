// WP-19 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §7.8
import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type SysmlRepository } from '../sysml/model';
import { buildTraceabilityMatrix } from '../sysml/rtm';
import { recordScenarioEvidence } from './simEvidence';
import { runSimScenario } from './simScenarioRunner';
import {
  createSimulationCase, repositoryChangeCommands, runAllSimulationCases, simEvidenceStatusFor, verifyRequirementsByScenario,
} from './simVerification';
import { thermostatProject, thermostatScenario, THERMO_REQUIREMENTS, T } from './__fixtures__/thermostatProject';

const AT = '2026-10-14T12:00:00.000Z';
const seed = (scenario: any = thermostatScenario()): SysmlRepository => {
  const r = createEmptyRepository();
  for (const q of THERMO_REQUIREMENTS) {
    r.requirements[q.id] = { ...q, namespace: ['Thermostat'], ownerId: 'pkg-thermo', kind: 'requirement', status: 'approved', version: '1' } as any;
  }
  r.verificationCases['vc-thermo'] = {
    id: 'vc-thermo', name: 'Thermostat closed loop', namespace: ['Thermostat'], kind: 'verificationCase', method: 'simulation',
    verifiesRequirementIds: THERMO_REQUIREMENTS.map(q => q.id), simulationScenario: scenario,
  } as any;
  return r;
};
const ids = (prefix: string) => (requirementId: string) => `${prefix}-${requirementId}`;
const currency = (repo: SysmlRepository, project: unknown) => (e: any) => (e.simulation && simEvidenceStatusFor(repo, e.id, project) === 'stale' ? 'stale' : 'current') as 'stale' | 'current';
const statuses = (repo: SysmlRepository, project: unknown) =>
  Object.fromEntries(buildTraceabilityMatrix(repo, {}, undefined, [], { evidenceCurrency: currency(repo, project) }).rows.map(r => [r.requirement.id, r.status]));

describe('createSimulationCase', () => {
  it('creates a simulation case for the requirement, in its owner and namespace, without mutating the input', () => {
    const repo = seed();
    const before = JSON.stringify(repo);
    const next = createSimulationCase(repo, 'req-t1', { id: 'vc-new' });
    expect(JSON.stringify(repo)).toBe(before);
    expect(next.verificationCases['vc-new']).toMatchObject({
      id: 'vc-new', kind: 'verificationCase', method: 'simulation', verifiesRequirementIds: ['req-t1'],
      ownerId: 'pkg-thermo', namespace: ['Thermostat'],
    });
    expect(next.verificationCases['vc-new'].name).toMatch(/REQ-T1/);
    expect(createSimulationCase(repo, 'req-t1', { id: 'vc-n2', name: 'Custom' }).verificationCases['vc-n2'].name).toBe('Custom');
  });

  it('throws for an unknown requirement or a used id', () => {
    expect(() => createSimulationCase(seed(), 'nope', { id: 'x' })).toThrow();
    expect(() => createSimulationCase(seed(), 'req-t1', { id: 'vc-thermo' })).toThrow();
  });
});

describe('verifyRequirementsByScenario', () => {
  const project = thermostatProject();
  const out = verifyRequirementsByScenario(seed(), project, 'vc-thermo', { newId: ids('ev1'), executedAt: AT });

  it('records one passing evidence per requirement', () => {
    expect(out.error).toBeUndefined();
    expect(out.skipped).toEqual([]);
    expect(out.evidence.map(e => [e.id, e.requirementId, e.result])).toEqual(THERMO_REQUIREMENTS.map(q => [`ev1-${q.id}`, q.id, 'passed']));
    for (const e of out.evidence) expect(out.repository.evidence[e.id]).toEqual(e);
  });

  it('stores the scenario, engines, the requirement\'s assertions and a reduced series of its own signals', () => {
    const e1 = out.repository.evidence['ev1-req-t1'];
    expect(e1.simulation).toMatchObject({ scenarioId: 'scn-thermostat', criterionId: 'scn-thermostat', engines: ['sm', 'xb', 'vlab'], decimated: true, trace: [] });
    expect(e1.simulation!.assertions!.map(a => a.assertionId)).toEqual(['as-t1']);
    expect(Object.keys(e1.simulation!.series!.values)).toEqual(['dT']);
    const times = e1.simulation!.series!.times;
    expect(times.length).toBeLessThanOrEqual(2000);
    expect(times[0]).toBe(0);
    expect(times[times.length - 1]).toBe(3000 * 0.01);
    expect(times).toContain(459 * 0.01); // the witness sample is kept
    const e3 = out.repository.evidence['ev1-req-t3'];
    expect(Object.keys(e3.simulation!.series!.values).sort()).toEqual(['dT', 'heaterOn']);
  });

  it('is current, goes stale on a model change, and ignores layout', () => {
    const repo = out.repository;
    expect(simEvidenceStatusFor(repo, 'ev1-req-t1', project)).toBe('current');
    const moved: any = thermostatProject(); moved.globalXBridgesNodes[0].position = { x: 50, y: 50 };
    expect(simEvidenceStatusFor(repo, 'ev1-req-t1', moved)).toBe('current');
    expect(simEvidenceStatusFor(repo, 'ev1-req-t1', thermostatProject({ gain: 90 }))).toBe('stale');
    expect(statuses(repo, project)).toEqual({ 'req-t1': 'verified', 'req-t2': 'verified', 'req-t3': 'verified', 'req-t4': 'verified', 'req-t5': 'verified' });
    expect(Object.values(statuses(repo, thermostatProject({ gain: 90 })))).toEqual(['stale', 'stale', 'stale', 'stale', 'stale']);
  });

  it('a later failing run on a changed model replaces the earlier pass in the RTM', () => {
    const broken = thermostatProject({ upper: 75 });
    const fail = verifyRequirementsByScenario(out.repository, broken, 'vc-thermo', { newId: ids('ev2'), executedAt: '2026-10-14T13:00:00.000Z' });
    expect(fail.evidence.map(e => e.result)).toEqual(['passed', 'failed', 'failed', 'passed', 'passed']);
    expect(fail.repository.evidence['ev2-req-t2'].simulation?.firstViolation?.t).toBeGreaterThanOrEqual(15);
    expect(statuses(fail.repository, broken)).toEqual({ 'req-t1': 'verified', 'req-t2': 'failed', 'req-t3': 'failed', 'req-t4': 'verified', 'req-t5': 'verified' });
    // fixed again -> re-run -> verified (latest evidence wins)
    const again = verifyRequirementsByScenario(fail.repository, project, 'vc-thermo', { newId: ids('ev3'), executedAt: '2026-10-14T14:00:00.000Z' });
    expect(Object.values(statuses(again.repository, project))).toEqual(['verified', 'verified', 'verified', 'verified', 'verified']);
  });
});

describe('inconclusive and invalid runs record nothing for the affected requirement', () => {
  it('skips a requirement whose response trigger never rises', () => {
    const scenario = thermostatScenario();
    (scenario.assertions as any[])[2] = { ...scenario.assertions[2], temporal: { kind: 'response', trigger: 'dT >= 200', within: 0.2 } };
    const out = verifyRequirementsByScenario(seed(scenario), thermostatProject(), 'vc-thermo', { newId: ids('ev'), executedAt: AT });
    expect(out.skipped).toEqual([{ requirementId: 'req-t3', reason: expect.stringMatching(/inconclusive/i) }]);
    expect(out.repository.evidence['ev-req-t3']).toBeUndefined();
    expect(out.evidence).toHaveLength(4);
  });

  it('skips a requirement of the case that has no assertion', () => {
    const scenario = thermostatScenario({ assertions: thermostatScenario().assertions.slice(0, 1) });
    const out = verifyRequirementsByScenario(seed(scenario), thermostatProject(), 'vc-thermo', { newId: ids('ev'), executedAt: AT });
    expect(out.evidence.map(e => e.requirementId)).toEqual(['req-t1']);
    expect(out.skipped.map(s => s.requirementId)).toEqual(['req-t2', 'req-t3', 'req-t4', 'req-t5']);
  });

  it('returns an error and an unchanged repository for an invalid scenario', () => {
    const repo = seed(thermostatScenario({ step: 0.3 }));
    const out = verifyRequirementsByScenario(repo, thermostatProject(), 'vc-thermo', { newId: ids('ev'), executedAt: AT });
    expect(out.error).toMatch(/STEP/);
    expect(out.repository).toEqual(repo);
    expect(out.evidence).toEqual([]);
  });

  it('recordScenarioEvidence refuses a run that did not complete', () => {
    const scenario = thermostatScenario({ step: 0.3 }) as any;
    const run = runSimScenario(thermostatProject(), scenario);
    expect(() => recordScenarioEvidence(seed(scenario), { newId: ids('x'), scenario, run, executedAt: AT })).toThrow();
  });
});

describe('runAllSimulationCases', () => {
  it('runs scenarios first, legacy criteria second, and skips empty cases', () => {
    const repo = seed();
    repo.verificationCases['vc-legacy'] = {
      id: 'vc-legacy', name: 'Gain check', namespace: [], kind: 'verificationCase', method: 'simulation', verifiesRequirementIds: ['req-t4'],
      simulationCriterion: {
        id: 'crit-l', requirementId: 'req-t4', verificationCaseId: 'vc-legacy', observe: T.gainOut, duration: 0.1, step: 0.01,
        stimuli: [{ target: T.gainIn, profile: { kind: 'constant', value: 1 } }], check: { kind: '<=', value: 100, window: [0, 0.1] },
      },
    } as any;
    repo.verificationCases['vc-empty'] = { id: 'vc-empty', name: 'Empty', namespace: [], kind: 'verificationCase', method: 'simulation', verifiesRequirementIds: ['req-t5'] } as any;
    let n = 0;
    const out = runAllSimulationCases(repo, thermostatProject(), { newId: () => `ev-${++n}`, executedAt: AT });
    const byCase = Object.fromEntries(out.results.map(r => [r.caseId, r]));
    expect(byCase['vc-thermo']).toMatchObject({ kind: 'scenario', outcome: 'passed' });
    expect(byCase['vc-legacy']).toMatchObject({ kind: 'criterion', outcome: 'passed' });
    expect(byCase['vc-empty']).toMatchObject({ kind: 'none', outcome: 'skipped' });
    expect(Object.keys(out.repository.evidence)).toHaveLength(6);
  });
});

describe('repositoryChangeCommands', () => {
  it('emits a create for a new verification case and an update for a scenario change', () => {
    const repo = seed();
    const created = createSimulationCase(repo, 'req-t2', { id: 'vc-new' });
    expect(repositoryChangeCommands(repo, created)).toEqual([{ type: 'createElement', element: created.verificationCases['vc-new'] }]);
    const edited = structuredClone(created);
    (edited.verificationCases['vc-thermo'] as any).simulationScenario = thermostatScenario({ duration: 20 });
    expect(repositoryChangeCommands(created, edited)).toEqual([
      { type: 'updateElement', elementId: 'vc-thermo', patch: { simulationScenario: (edited.verificationCases['vc-thermo'] as any).simulationScenario } },
    ]);
  });

  it('puts every changed field of one case into one update (scenario + verified requirements)', () => {
    const repo = createSimulationCase(seed(), 'req-t1', { id: 'vc-new' });
    const next = structuredClone(repo);
    const vc = next.verificationCases['vc-new'] as any;
    vc.verifiesRequirementIds = ['req-t1', 'req-t2'];
    vc.simulationScenario = thermostatScenario({ verificationCaseId: 'vc-new' });
    expect(repositoryChangeCommands(repo, next)).toEqual([
      { type: 'updateElement', elementId: 'vc-new', patch: { simulationScenario: vc.simulationScenario, verifiesRequirementIds: ['req-t1', 'req-t2'] } },
    ]);
  });
});
