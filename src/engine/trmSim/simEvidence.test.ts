// WP-09 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §3 WP-09
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { simModelFingerprint, recordSimulationEvidence, deriveSimEvidenceStatus } from './simEvidence';
import { runSmVerification } from './smRunner';
import type { SimCriterion } from './simCriterion';
import { createEmptyRepository } from '../sysml/model';
import { serializeSysmlProjectState } from '../sysml/persistence';
import { loadCanonicalSysmlProject } from '../../services/sysmlCommandGateway';

const heater = JSON.parse(readFileSync(new URL('../../../inductance_heater.json', import.meta.url), 'utf8'));
const POWER = 'sim:sm/var/6178d014-831f-4339-8dac-f275360b1222';
const UP = 'sim:sm/var/1d1ef5eb-3e8d-4e62-9f78-10f3eeb228a3';
const HEATER = 'sim:sm/var/a002ce43-8aaa-4ebe-b84b-b872033fb4ea';

const criterion = (over: Partial<SimCriterion> = {}): SimCriterion => ({
  id: 'crit-1', requirementId: 'req1', verificationCaseId: 'vc1',
  stimuli: [
    { target: POWER, profile: { kind: 'step', before: 0, after: 1, at: 0.005 } },
    { target: UP, profile: { kind: 'step', before: 0, after: 1, at: 0.03 } },
  ],
  observe: HEATER, check: { kind: 'reaches', value: 60, by: 0.1 }, duration: 0.1, step: 0.01, ...over,
});

const repo = (method = 'simulation') => {
  const r = createEmptyRepository();
  r.requirements.req1 = { id: 'req1', name: 'Heat up', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'Heater reaches 60', status: 'draft', version: '1' } as any;
  r.verificationCases.vc1 = { id: 'vc1', name: 'Heat test', namespace: [], kind: 'verificationCase', method, verifiesRequirementIds: ['req1'], simulationCriterion: criterion() } as any;
  return r;
};

const record = (r = repo(), c = criterion()) => recordSimulationEvidence(r, {
  id: 'ev1', criterion: c, run: runSmVerification(heater, c), modelFingerprint: simModelFingerprint(heater), executedAt: '2026-10-14T00:00:00.000Z',
});

describe('simModelFingerprint', () => {
  it('ignores layout and view-only fields', () => {
    const moved = { ...heater, view: { x: 9 }, states: heater.states.map((s: any) => ({ ...s, x: s.x + 50, y: s.y + 5, width: 1, height: 1, color: '#000' })), transitions: heater.transitions.map((t: any) => ({ ...t, hasControlPoint: true })) };
    expect(simModelFingerprint(moved)).toBe(simModelFingerprint(heater));
  });

  it('changes when behaviour changes', () => {
    const edited = { ...heater, states: heater.states.map((s: any) => s.name === 'HEATER_UP' ? { ...s, entry: 'UP=false;HEATER=HEATER+20;' } : s) };
    expect(simModelFingerprint(edited)).not.toBe(simModelFingerprint(heater));
  });

  it('still sees block parameters that happen to share a layout key name', () => {
    const pulse = (width: number) => ({ canvas: 'global', nodes: [{ id: 'p', position: { x: 0, y: 0 }, data: { type: 'PULSE', params: { width, x: 1, color: 2 } } }], edges: [] });
    expect(simModelFingerprint(pulse(2))).not.toBe(simModelFingerprint(pulse(1)));
    const withParam = (x: number) => ({ ...pulse(1), nodes: [{ id: 'p', data: { type: 'PULSE', params: { width: 1, x, color: 2 } } }] });
    expect(simModelFingerprint(withParam(5))).not.toBe(simModelFingerprint(withParam(6)));
  });

  it('works for canvas sources too', () => {
    const canvas = { canvas: 'global', nodes: [{ id: 'g', position: { x: 0, y: 0 }, data: { type: 'GAIN', params: { gain: 2 } } }], edges: [] };
    const movedCanvas = { ...canvas, nodes: [{ ...canvas.nodes[0], position: { x: 40, y: 1 }, selected: true }] };
    expect(simModelFingerprint(movedCanvas)).toBe(simModelFingerprint(canvas));
    expect(simModelFingerprint({ ...canvas, nodes: [{ ...canvas.nodes[0], data: { type: 'GAIN', params: { gain: 3 } } }] })).not.toBe(simModelFingerprint(canvas));
  });
});

describe('recordSimulationEvidence', () => {
  it('records a passing run as current evidence with its trace', () => {
    const { repository, evidence } = record();
    expect(evidence).toMatchObject({ id: 'ev1', requirementId: 'req1', verificationCaseId: 'vc1', result: 'passed', status: 'current' });
    expect(evidence.simulation).toMatchObject({ criterionId: 'crit-1', modelFingerprint: simModelFingerprint(heater) });
    expect(evidence.simulation?.trace).toHaveLength(11);
    expect(repository.evidence.ev1).toEqual(evidence);
    expect(repository.revision).toBe(repo().revision + 1);
  });

  it('records a failing run as failed, keeping the first violation', () => {
    const c = criterion({ check: { kind: '<=', value: 55, window: [0, 0.1] } });
    const { evidence } = record(repo(), c);
    expect(evidence.result).toBe('failed');
    expect(evidence.simulation?.firstViolation?.value).toBe(60);
  });

  it('refuses a run that did not execute, a non-simulation case, or a criterion for another case', () => {
    const notRun = criterion({ observe: 'sim:sm/var/nope' });
    expect(() => record(repo(), notRun)).toThrow(/did not run|diagnostic/i);
    expect(() => record(repo('test'))).toThrow(/simulation/);
    expect(() => record(repo(), criterion({ verificationCaseId: 'other' }))).toThrow();
  });
});

describe('deriveSimEvidenceStatus', () => {
  const { repository } = record();

  it('is current while requirement and simulated model are unchanged', () => {
    expect(deriveSimEvidenceStatus(repository, 'ev1', simModelFingerprint(heater))).toBe('current');
  });

  it('goes stale when the simulated model changes', () => {
    const edited = { ...heater, variables: heater.variables.map((v: any) => v.name === 'HEATER' ? { ...v, initialValue: '5' } : v) };
    expect(deriveSimEvidenceStatus(repository, 'ev1', simModelFingerprint(edited))).toBe('stale');
  });

  it('goes stale when the requirement changes', () => {
    const changed = structuredClone(repository);
    changed.requirements.req1.text = 'Heater reaches 70';
    expect(deriveSimEvidenceStatus(changed, 'ev1', simModelFingerprint(heater))).toBe('stale');
  });

  it('goes stale when the criterion of the verification case is edited', () => {
    const changed = structuredClone(repository);
    (changed.verificationCases.vc1 as any).simulationCriterion = criterion({ check: { kind: 'reaches', value: 50, by: 0.1 } });
    expect(deriveSimEvidenceStatus(changed, 'ev1', simModelFingerprint(heater))).toBe('stale');
  });

  it('is missing for unknown evidence', () => {
    expect(deriveSimEvidenceStatus(repository, 'nope', simModelFingerprint(heater))).toBe('missing');
  });
});

describe('persistence', () => {
  it('keeps the criterion on the verification case and the simulation record on the evidence through save and load', () => {
    const { repository } = record();
    const saved = serializeSysmlProjectState(repository);
    const loaded = loadCanonicalSysmlProject({ sysmlRepository: saved.sysmlRepository });
    expect((loaded.repository.verificationCases.vc1 as any).simulationCriterion).toEqual(criterion());
    expect(loaded.repository.evidence.ev1.simulation?.trace).toHaveLength(11);
    expect(loaded.repository.evidence.ev1.simulation?.modelFingerprint).toBe(simModelFingerprint(heater));
  });
});
