// WP-10 acceptance tests, controller (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §3 WP-10
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { linkedSimTargets, simulationCases, runSimCriterion, verifyRequirementBySimulation, simEvidenceStatusFor, simCandidates } from './simVerification';
import type { SimCriterion } from './simCriterion';
import { createEmptyRepository } from '../sysml/model';

const heater = JSON.parse(readFileSync(new URL('../../../inductance_heater.json', import.meta.url), 'utf8'));
const POWER = 'sim:sm/var/6178d014-831f-4339-8dac-f275360b1222';
const UP = 'sim:sm/var/1d1ef5eb-3e8d-4e62-9f78-10f3eeb228a3';
const HEATER = 'sim:sm/var/a002ce43-8aaa-4ebe-b84b-b872033fb4ea';
const HEATER_UP = 'bda23ddc-8487-44aa-9274-5be8dba8298b';

const xbNode = (id: string, type: string, params: Record<string, unknown>) => ({ id, type: 'xbridgesBlock', position: { x: 0, y: 0 }, data: { id, type, params } });
const vlNode = (id: string, type: string, params: Record<string, unknown> = {}) => ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } });
const project = {
  ...heater,
  globalXBridgesNodes: [xbNode('c1', 'Constant', { value: 5 }), xbNode('i1', 'INTEGRATOR_CONTINUOUS', { initial_condition: 2 })],
  globalXBridgesEdges: [{ id: 'e1', source: 'c1', sourceHandle: 'out', target: 'i1', targetHandle: 'u' }],
  vlabNodes: [vlNode('c', 'ps_constant', { value: 2 }), vlNode('i', 'ps_integrator')],
  vlabEdges: [{ id: 'v1', source: 'c', sourceHandle: 'y_s', target: 'i', targetHandle: 'u_t' }],
};

const smCrit: SimCriterion = {
  id: 'crit-sm', requirementId: 'req1', verificationCaseId: 'vc1',
  stimuli: [
    { target: POWER, profile: { kind: 'step', before: 0, after: 1, at: 0.005 } },
    { target: UP, profile: { kind: 'step', before: 0, after: 1, at: 0.03 } },
  ],
  observe: HEATER, check: { kind: 'reaches', value: 60, by: 0.1 }, duration: 0.1, step: 0.01,
};
const xbCrit: SimCriterion = {
  id: 'crit-xb', requirementId: 'req1', verificationCaseId: 'vc2', stimuli: [],
  observe: 'sim:xb/global/i1/y', check: { kind: '>=', value: 2, window: [0, 1] }, duration: 1, step: 0.1,
};
const vlCrit: SimCriterion = {
  id: 'crit-vl', requirementId: 'req1', verificationCaseId: 'vc3', stimuli: [],
  observe: 'sim:vlab/global/i/y', check: { kind: '<=', value: 2.5, window: [0, 1] }, duration: 1, step: 0.1,
};

const repo = () => {
  const r = createEmptyRepository();
  r.requirements.req1 = { id: 'req1', name: 'Heat up', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'Heater reaches 60', status: 'draft', version: '1' } as any;
  r.requirements.req2 = { id: 'req2', name: 'Other', namespace: [], kind: 'requirement', requirementId: 'REQ-2', text: 'x', status: 'draft', version: '1' } as any;
  const vc = (id: string, method: string, c?: SimCriterion) => ({ id, name: `Case ${id}`, namespace: [], kind: 'verificationCase', method, verifiesRequirementIds: ['req1'], ...(c ? { simulationCriterion: c } : {}) } as any);
  r.verificationCases.vc1 = vc('vc1', 'simulation', smCrit);
  r.verificationCases.vc2 = vc('vc2', 'simulation', xbCrit);
  r.verificationCases.vc3 = vc('vc3', 'simulation', vlCrit);
  r.verificationCases.vc4 = vc('vc4', 'inspection');
  r.verificationCases.vc5 = vc('vc5', 'simulation');
  r.relationships.a = { id: 'a', kind: 'satisfy', sourceId: HEATER, targetId: 'req1' } as any;
  r.relationships.b = { id: 'b', kind: 'satisfy', sourceId: HEATER_UP, targetId: 'req1' } as any;
  r.relationships.c = { id: 'c', kind: 'trace', sourceId: 'req1', targetId: 'sim:xb/global/i1/y' } as any;
  r.relationships.d = { id: 'd', kind: 'satisfy', sourceId: 'sim:vlab/global/i/y', targetId: 'req2' } as any;
  return r;
};

describe('linkedSimTargets', () => {
  it('lists the simulation targets and states linked to a requirement, with names and the relationship kind', () => {
    const t = linkedSimTargets(repo(), 'req1', project);
    expect(t.map(x => x.target).sort()).toEqual([HEATER, HEATER_UP, 'sim:xb/global/i1/y'].sort());
    expect(t.find(x => x.target === HEATER)).toMatchObject({ name: 'HEATER', kind: 'variable', relationship: 'satisfy', engine: 'sm' });
    expect(t.find(x => x.target === HEATER_UP)).toMatchObject({ name: 'HEATER_UP', kind: 'state', engine: 'sm' });
    expect(t.find(x => x.target === 'sim:xb/global/i1/y')).toMatchObject({ relationship: 'trace', engine: 'xb' });
  });

  it('marks a link whose target no longer exists in the project', () => {
    const r = repo();
    r.relationships.z = { id: 'z', kind: 'satisfy', sourceId: 'sim:xb/global/gone/y', targetId: 'req1' } as any;
    expect(linkedSimTargets(r, 'req1', project).find(x => x.target === 'sim:xb/global/gone/y')).toMatchObject({ missing: true });
  });
});

describe('simulationCases', () => {
  it('returns the simulation verification cases of a requirement, criterion or not', () => {
    expect(simulationCases(repo(), 'req1').map(c => c.id)).toEqual(['vc1', 'vc2', 'vc3', 'vc5']);
    expect(simulationCases(repo(), 'req2')).toEqual([]);
  });
});

describe('simCandidates', () => {
  it('offers stimulus and observe candidates from all three engines', () => {
    const c = simCandidates(project);
    const obs = c.observe.map(x => x.target);
    expect(obs).toEqual(expect.arrayContaining([HEATER, HEATER_UP, 'sim:xb/global/i1/y', 'sim:vlab/global/i/y']));
    const stim = c.stimulus.map(x => x.target);
    expect(stim).toEqual(expect.arrayContaining([POWER, 'sim:xb/global/c1/$param/value', 'sim:vlab/global/c/$param/value']));
    expect(stim).not.toContain('sim:xb/global/i1/y');
    expect(c.observe.find(x => x.target === HEATER)?.name).toBe('HEATER');
  });
});

describe('runSimCriterion', () => {
  it.each([[smCrit, 'sm'], [xbCrit, 'xb'], [vlCrit, 'vlab']] as const)('runs %# on the engine of its observed target', (crit, engine) => {
    const r = runSimCriterion(project, crit);
    expect(r.engine).toBe(engine);
    expect(r.run.diagnostics).toEqual([]);
    expect(r.run.evaluation.passed).toBe(true);
    expect(r.modelFingerprint).toMatch(/\S/);
  });

  it('fingerprints only the model it ran, so editing X-Bridges does not change an SM fingerprint', () => {
    const edited = { ...project, globalXBridgesNodes: [xbNode('c1', 'Constant', { value: 6 }), project.globalXBridgesNodes[1]] };
    expect(runSimCriterion(edited, smCrit).modelFingerprint).toBe(runSimCriterion(project, smCrit).modelFingerprint);
    expect(runSimCriterion(edited, xbCrit).modelFingerprint).not.toBe(runSimCriterion(project, xbCrit).modelFingerprint);
  });
});

describe('verifyRequirementBySimulation', () => {
  it('runs the case criterion and records current evidence', () => {
    const out = verifyRequirementBySimulation(repo(), project, 'vc1', { id: 'ev1', executedAt: '2026-10-14T00:00:00.000Z' });
    expect(out.error).toBeUndefined();
    expect(out.evidence).toMatchObject({ id: 'ev1', result: 'passed', requirementId: 'req1' });
    expect(out.repository.evidence.ev1).toBeDefined();
    expect(simEvidenceStatusFor(out.repository, 'ev1', project)).toBe('current');
  });

  it('reports stale evidence after the simulated model changes', () => {
    const out = verifyRequirementBySimulation(repo(), project, 'vc1', { id: 'ev1', executedAt: '2026-10-14T00:00:00.000Z' });
    const edited = { ...project, states: project.states.map((s: any) => s.name === 'HEATER_UP' ? { ...s, entry: 'UP=false;HEATER=HEATER+20;' } : s) };
    expect(simEvidenceStatusFor(out.repository, 'ev1', edited)).toBe('stale');
  });

  it('records nothing and explains why when the case has no criterion or the run did not execute', () => {
    const r = repo();
    const none = verifyRequirementBySimulation(r, project, 'vc5', { id: 'ev2', executedAt: 'x' });
    expect(none.error).toMatch(/criterion/i);
    expect(none.repository).toBe(r);
    const broken = repo();
    (broken.verificationCases.vc1 as any).simulationCriterion = { ...smCrit, observe: 'sim:sm/var/gone' };
    const out = verifyRequirementBySimulation(broken, project, 'vc1', { id: 'ev3', executedAt: 'x' });
    expect(out.error).toMatch(/UNKNOWN_TARGET/);
    expect(out.repository).toBe(broken);
    expect(out.run?.diagnostics.length).toBeGreaterThan(0);
  });
});
