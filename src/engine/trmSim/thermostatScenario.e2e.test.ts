// WP-21 end-to-end acceptance test (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §9.
// The full user flow through the real SysML gateway, exactly as App.tsx commits panel changes:
// requirements -> new simulation test case -> link model signals -> coupled scenario -> run -> TRM verdicts,
// then model change (stale), regression (failed), fix (verified again), save/load and determinism.
import { describe, expect, it } from 'vitest';
import { computeImpactHash, createSysmlGatewayState, executeSysmlCommand, loadCanonicalSysmlProject, type SysmlGatewayState } from '../../services/sysmlCommandGateway';
import { createEmptyRepository, type SysmlRepository } from '../sysml/model';
import { buildTraceabilityMatrix } from '../sysml/rtm';
import { serializeSysmlProjectState } from '../sysml/persistence';
import { projectExternalEndpoints } from './simEndpoints';
import { validateScenario } from './simScenario';
import {
  createSimulationCase, linkedSimTargets, repositoryChangeCommands, runAllSimulationCases, simEvidenceStatusFor, verifyRequirementsByScenario,
} from './simVerification';
import { thermostatProject, thermostatScenario, THERMO_REQUIREMENTS, T } from './__fixtures__/thermostatProject';

const project = thermostatProject();

const seed = (): SysmlRepository => {
  const r = createEmptyRepository();
  for (const q of THERMO_REQUIREMENTS) r.requirements[q.id] = { ...q, namespace: [], kind: 'requirement', status: 'approved', version: '1' } as any;
  return r;
};

/** What App.tsx handleSimVerificationRepositoryChange does, without React. */
const commit = (state: SysmlGatewayState, next: SysmlRepository, proj: unknown = project): SysmlGatewayState => {
  const context = { externalEndpoints: projectExternalEndpoints(proj) };
  let current = state;
  for (const command of repositoryChangeCommands(current.repository, next)) {
    let result = executeSysmlCommand(current, command as any, undefined, context);
    if (command.type === 'deleteElements' && !result.committed && result.impact) {
      result = executeSysmlCommand(current, { ...command, confirmedImpactHash: computeImpactHash(result.impact) } as any, undefined, context);
    }
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(result.committed).toBe(true);
    current = { ...current, ...result, context } as SysmlGatewayState;
  }
  return current;
};

const currencyFor = (repo: SysmlRepository, proj: unknown) => (e: any) =>
  (e.simulation && simEvidenceStatusFor(repo, e.id, proj) === 'stale' ? 'stale' : 'current') as 'stale' | 'current';
const trm = (repo: SysmlRepository, proj: unknown = project) => Object.fromEntries(
  buildTraceabilityMatrix(repo, {}, undefined, [], { evidenceCurrency: currencyFor(repo, proj) }).rows.map(r => [r.requirement.requirementId, r.status]),
);
const ALL = (status: string) => Object.fromEntries(THERMO_REQUIREMENTS.map(q => [q.requirementId, status]));

describe('Thermostat closed loop: the full TRM simulation scenario', () => {
  let state = createSysmlGatewayState(seed(), {}, {}, undefined, { externalEndpoints: projectExternalEndpoints(project) });
  let caseId = '';
  let n = 0;
  const newId = (prefix: string) => (requirementId?: string) => `${prefix}-${requirementId ?? ++n}`;

  it('1. creates a simulation test case for REQ-T1 through the gateway', () => {
    const next = createSimulationCase(state.repository, 'req-t1', { id: 'vc-thermo', name: 'Thermostat closed loop' });
    state = commit(state, next);
    caseId = 'vc-thermo';
    expect(state.repository.verificationCases[caseId]).toMatchObject({ method: 'simulation', verifiesRequirementIds: ['req-t1'] });
  });

  it('2. assigns model signals to each requirement (SM variable, SM state, X-Bridges port, V-Lab port)', () => {
    const next = structuredClone(state.repository);
    const link = (id: string, sourceId: string, targetId: string, kind = 'verify') => { next.relationships[id] = { id, kind, sourceId, targetId } as any; };
    link('l1', T.chamberOut, 'req-t1'); link('l2', T.chamberOut, 'req-t2'); link('l3', T.chamberOut, 'req-t3');
    link('l4', T.heaterOn, 'req-t3'); link('l5', T.gainOut, 'req-t4'); link('l6', T.heating, 'req-t5');
    link('l7', T.heaterOn, 'req-t5', 'satisfy');
    state = commit(state, next);
    expect(linkedSimTargets(state.repository, 'req-t3', project).map(t => t.target).sort()).toEqual([T.chamberOut, T.heaterOn].sort());
  });

  it('3. stores the coupled scenario and extends the case to all five requirements in one update', () => {
    const next = structuredClone(state.repository);
    const vc = next.verificationCases[caseId] as any;
    vc.simulationScenario = thermostatScenario({ verificationCaseId: caseId });
    vc.verifiesRequirementIds = THERMO_REQUIREMENTS.map(q => q.id);
    const cmds = repositoryChangeCommands(state.repository, next);
    expect(cmds).toHaveLength(1);
    state = commit(state, next);
    const saved = state.repository.verificationCases[caseId] as any;
    // every signal is linked to its requirement, so the scenario is clean: no errors and no warnings
    expect(validateScenario(saved.simulationScenario, { project, repository: state.repository, verificationCase: saved })).toEqual([]);
  });

  it('4. runs SM -> X-Bridges -> V-Lab and verifies all five requirements in the TRM', () => {
    const out = verifyRequirementsByScenario(state.repository, project, caseId, { newId: newId('run1'), executedAt: '2026-10-14T12:00:00.000Z' });
    expect(out.error).toBeUndefined();
    expect(out.evidence.map(e => e.result)).toEqual(['passed', 'passed', 'passed', 'passed', 'passed']);
    expect(out.run?.schedule.couplings.map(c => c.delayed)).toEqual([false, false, true]);
    const t1 = out.run!.assertions.find(a => a.assertionId === 'as-t1')!;
    expect(t1.at?.t).toBeCloseTo(4.59, 9);
    state = commit(state, out.repository);
    expect(trm(state.repository)).toEqual(ALL('verified'));
  });

  it('5. a change to any simulated model makes every result stale, in the panel and in the TRM', () => {
    const retuned = thermostatProject({ gain: 90 });
    expect(simEvidenceStatusFor(state.repository, 'run1-req-t1', retuned)).toBe('stale');
    expect(trm(state.repository, retuned)).toEqual(ALL('stale'));
    const moved: any = thermostatProject(); moved.vlabNodes[1].position = { x: 1, y: 2 };
    expect(trm(state.repository, moved)).toEqual(ALL('verified'));
  });

  it('6. a regression (upper threshold 75) fails REQ-T2 and REQ-T3 and the TRM shows it', () => {
    const broken = thermostatProject({ upper: 75 });
    const out = verifyRequirementsByScenario(state.repository, broken, caseId, { newId: newId('run2'), executedAt: '2026-10-14T13:00:00.000Z' });
    state = commit(state, out.repository, broken);
    expect(trm(state.repository, broken)).toEqual({ ...ALL('verified'), 'REQ-T2': 'failed', 'REQ-T3': 'failed' });
    const v = state.repository.evidence['run2-req-t2'].simulation!;
    expect(v.firstViolation!.t).toBeGreaterThanOrEqual(15);
    expect(v.firstViolation!.value).toBeGreaterThan(70);
  });

  it('7. fixing the model and re-running verifies everything again (only the latest result counts)', () => {
    const out = verifyRequirementsByScenario(state.repository, project, caseId, { newId: newId('run3'), executedAt: '2026-10-14T14:00:00.000Z' });
    state = commit(state, out.repository);
    expect(trm(state.repository)).toEqual(ALL('verified'));
    expect(Object.keys(state.repository.evidence)).toHaveLength(15); // the history is kept
  });

  it('8. keeps the case, scenario, links and evidence through save and load', () => {
    const saved = serializeSysmlProjectState(state.repository);
    const payload = { ...project, sysmlRepository: saved.sysmlRepository };
    const loaded = loadCanonicalSysmlProject(payload, { externalEndpoints: projectExternalEndpoints(payload) });
    expect(loaded.quarantinedRelationshipIds).toEqual([]);
    expect((loaded.repository.verificationCases[caseId] as any).simulationScenario).toEqual((state.repository.verificationCases[caseId] as any).simulationScenario);
    expect(loaded.repository.evidence['run3-req-t4'].simulation?.assertions?.[0].verdict).toBe('passed');
    expect(trm(loaded.repository)).toEqual(ALL('verified'));
  });

  it('9. "Run all simulation tests" reproduces the same verdicts (deterministic)', () => {
    let k = 0;
    const out = runAllSimulationCases(state.repository, project, { newId: () => `all-${++k}`, executedAt: '2026-10-14T15:00:00.000Z' });
    expect(out.results).toEqual([expect.objectContaining({ caseId, kind: 'scenario', outcome: 'passed' })]);
    const a = verifyRequirementsByScenario(state.repository, project, caseId, { newId: newId('x'), executedAt: '2026-10-14T16:00:00.000Z' }).run;
    const b = verifyRequirementsByScenario(state.repository, project, caseId, { newId: newId('y'), executedAt: '2026-10-14T16:00:00.000Z' }).run;
    expect(a).toEqual(b);
  });
});
