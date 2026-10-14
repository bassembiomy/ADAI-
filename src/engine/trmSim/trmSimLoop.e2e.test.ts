// WP-11 end-to-end acceptance test (planner-owned): the whole TRM <-> simulation loop through the real SysML gateway,
// exactly as App.tsx commits panel changes (repositoryChangeCommands -> executeSysmlCommand with the external endpoints).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeImpactHash, createSysmlGatewayState, executeSysmlCommand, loadCanonicalSysmlProject, type SysmlGatewayState } from '../../services/sysmlCommandGateway';
import { createEmptyRepository, type SysmlRepository } from '../sysml/model';
import { serializeSysmlProjectState } from '../sysml/persistence';
import { projectExternalEndpoints } from './simEndpoints';
import { repositoryChangeCommands, verifyRequirementBySimulation, simEvidenceStatusFor, linkedSimTargets } from './simVerification';
import { smRequirementLinks } from './smRequirementLinks';
import { generateMISRACCode } from '../../utils/stateMachineCodeGenerator';
import type { SimCriterion } from './simCriterion';

const heater = JSON.parse(readFileSync(join(process.cwd(), 'inductance_heater.json'), 'utf8'));
const POWER = 'sim:sm/var/6178d014-831f-4339-8dac-f275360b1222';
const UP = 'sim:sm/var/1d1ef5eb-3e8d-4e62-9f78-10f3eeb228a3';
const HEATER = 'sim:sm/var/a002ce43-8aaa-4ebe-b84b-b872033fb4ea';
const HEATER_UP = 'bda23ddc-8487-44aa-9274-5be8dba8298b';

const criterion: SimCriterion = {
  id: 'crit-1', requirementId: 'req1', verificationCaseId: 'vc1',
  stimuli: [
    { target: POWER, profile: { kind: 'step', before: 0, after: 1, at: 0.005 } },
    { target: UP, profile: { kind: 'step', before: 0, after: 1, at: 0.03 } },
  ],
  observe: HEATER, check: { kind: 'reaches', value: 60, by: 0.1 }, duration: 0.1, step: 0.01,
};

const seed = (): SysmlRepository => {
  const r = createEmptyRepository();
  r.requirements.req1 = { id: 'req1', name: 'Heat up', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'Heater reaches 60', status: 'draft', version: '1' } as any;
  r.verificationCases.vc1 = { id: 'vc1', name: 'Heat test', namespace: [], kind: 'verificationCase', method: 'simulation', verifiesRequirementIds: ['req1'] } as any;
  return r;
};

/** What App.tsx handleSimVerificationRepositoryChange does, without React. */
const commit = (state: SysmlGatewayState, next: SysmlRepository, project: unknown): SysmlGatewayState => {
  const context = { externalEndpoints: projectExternalEndpoints(project) };
  let current = state;
  for (const command of repositoryChangeCommands(current.repository, next)) {
    // deleteElements goes through the same preflight + confirmed-impact step as App's executeConfirmedDeletion.
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

describe('TRM simulation loop end to end', () => {
  const context = { externalEndpoints: projectExternalEndpoints(heater) };
  let state = createSysmlGatewayState(seed(), {}, {}, undefined, context);

  it('1. links the requirement to a state machine variable and a state through the gateway', () => {
    const next = structuredClone(state.repository);
    next.relationships.l1 = { id: 'l1', kind: 'satisfy', sourceId: HEATER, targetId: 'req1' } as any;
    next.relationships.l2 = { id: 'l2', kind: 'satisfy', sourceId: HEATER_UP, targetId: 'req1' } as any;
    expect(repositoryChangeCommands(state.repository, next)).toHaveLength(2);
    state = commit(state, next, heater);
    expect(linkedSimTargets(state.repository, 'req1', heater).map(t => t.target).sort()).toEqual([HEATER, HEATER_UP].sort());
  });

  it('2. stores the criterion on the verification case with exactly one update', () => {
    const next = structuredClone(state.repository);
    (next.verificationCases.vc1 as any).simulationCriterion = criterion;
    expect(repositoryChangeCommands(state.repository, next)).toHaveLength(1);
    state = commit(state, next, heater);
    expect((state.repository.verificationCases.vc1 as any).simulationCriterion).toEqual(criterion);
  });

  it('3. runs the simulation and records passing, current evidence through the gateway', () => {
    const out = verifyRequirementBySimulation(state.repository, heater, 'vc1', { id: 'ev1', executedAt: '2026-10-14T00:00:00.000Z' });
    expect(out.error).toBeUndefined();
    state = commit(state, out.repository, heater);
    expect(state.repository.evidence.ev1).toMatchObject({ result: 'passed', requirementId: 'req1', verificationCaseId: 'vc1' });
    expect(state.repository.evidence.ev1.simulation?.trace.length).toBe(11);
    expect(simEvidenceStatusFor(state.repository, 'ev1', heater)).toBe('current');
  });

  it('4. marks the evidence stale when the simulated state machine changes', () => {
    const edited = { ...heater, states: heater.states.map((s: any) => s.name === 'HEATER_UP' ? { ...s, entry: 'UP=false;HEATER=HEATER+20;' } : s) };
    expect(simEvidenceStatusFor(state.repository, 'ev1', edited)).toBe('stale');
  });

  it('5. keeps links, criterion and evidence through save and load', () => {
    const saved = serializeSysmlProjectState(state.repository);
    const payload = { ...heater, sysmlRepository: saved.sysmlRepository };
    const loaded = loadCanonicalSysmlProject(payload, { externalEndpoints: projectExternalEndpoints(payload) });
    expect(loaded.quarantinedRelationshipIds).toEqual([]);
    expect(Object.values(loaded.repository.relationships).filter(r => r.targetId === 'req1').map(r => r.sourceId).sort()).toEqual([HEATER, HEATER_UP].sort());
    expect((loaded.repository.verificationCases.vc1 as any).simulationCriterion).toEqual(criterion);
    expect(simEvidenceStatusFor(loaded.repository, 'ev1', heater)).toBe('current');
  });

  it('6. carries the requirement id into the generated C of the linked state', () => {
    const { files, errors } = generateMISRACCode(heater, { requirementLinks: smRequirementLinks(state.repository, heater) });
    expect(errors).toEqual([]);
    const c = files.filter(f => f.name.endsWith('.c')).map(f => f.content).join('\n');
    expect(c).toMatch(/TRACE-BEGIN: traceId=TRACE-STATE-BDA23DDC\w* symbol=\w+ requirements=REQ-1 \*\//);
  });

  it('7. removes a link through the gateway', () => {
    const next = structuredClone(state.repository);
    delete next.relationships.l2;
    const cmds = repositoryChangeCommands(state.repository, next);
    expect(cmds).toEqual([{ type: 'deleteElements', elementIds: ['l2'] }]);
    state = commit(state, next, heater);
    expect(state.repository.relationships.l2).toBeUndefined();
  });
});
