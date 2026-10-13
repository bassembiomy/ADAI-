import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition, type RequirementDefinition, type SysmlRelationship, type SysmlRepository } from '../engine/sysml/model';
import { computeImpactHash, createSysmlGatewayState, executeSysmlCommand, type SysmlCommandResult, type SysmlEditorCommand, type SysmlGatewayState } from './sysmlCommandGateway';
import { buildTraceabilityMatrix } from '../engine/sysml/rtm';
import { allocationNamesByElement, resolveAllocationElement } from '../engine/sysml/allocation';
import { validateSysmlRepository } from '../engine/sysml/validation';
import { ensureDefaultSysmlDiagrams } from './sysmlDiagramWorkspace';
import { buildSequenceDiagramView } from '../features/sysml/sequenceDiagramView';
import { loadRepository, serializeRepository } from '../engine/sysml/persistence';
import { buildSetVerificationBehaviorCommand, listTestProcedures } from './sysmlVerificationCommands';

function model(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions.main = {
    id: 'main', name: 'Main', kind: 'interaction', namespace: [], ownerId: 'model',
    lifelines: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }],
    messages: [{ id: 'm1', name: 'go', order: 1, sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b' }],
    fragments: [],
  } as InteractionDefinition;
  repo.requirements.req1 = {
    id: 'req1', name: 'REQ-1', kind: 'requirement', namespace: [], requirementId: 'REQ-1', text: 'Shall go',
    status: 'approved', version: '1', priority: 'high', risk: 'medium',
  } as RequirementDefinition;
  return repo;
}

function create(state: SysmlGatewayState, relationship: SysmlRelationship): SysmlCommandResult {
  return executeSysmlCommand(state, { type: 'createElement', element: relationship } as SysmlEditorCommand);
}

describe('an interaction as the client of requirement relationships', () => {
  const state = createSysmlGatewayState(model());

  it.each([
    ['satisfy', 'main'],
    ['satisfy', 'a'],
    ['satisfy', 'm1'],
    ['verify', 'main'],
    ['verify', 'm1'],
    ['refine', 'main'],
    ['trace', 'a'],
  ] as const)('accepts «%s» from %s to a Requirement', (kind, sourceId) => {
    const result = create(state, { id: `rel-${kind}-${sourceId}`, kind, sourceId, targetId: 'req1' } as SysmlRelationship);
    expect(result.diagnostics.filter(d => d.severity === 'error'), JSON.stringify(result.diagnostics)).toEqual([]);
    expect(result.committed).toBe(true);
  });

  it('still refuses «satisfy» from a Requirement to the interaction', () => {
    const result = create(state, { id: 'rel-bad', kind: 'satisfy', sourceId: 'req1', targetId: 'main' } as SysmlRelationship);
    expect(result.committed).toBe(false);
  });

  it('accepts «allocate» from a message to a Block or an interaction to a Block', () => {
    const repo = model();
    repo.definitions.Vehicle = { id: 'Vehicle', kind: 'block', name: 'Vehicle', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    const withBlock = createSysmlGatewayState(repo);
    expect(create(withBlock, { id: 'al1', kind: 'allocation', sourceId: 'm1', targetId: 'Vehicle' } as SysmlRelationship).committed).toBe(true);
    expect(create(withBlock, { id: 'al2', kind: 'allocation', sourceId: 'main', targetId: 'Vehicle' } as SysmlRelationship).committed).toBe(true);
  });
});

function withVehicle(): SysmlRepository {
  const repo = ensureDefaultSysmlDiagrams(model()).repository;
  repo.definitions.Vehicle = { id: 'Vehicle', kind: 'block', name: 'Vehicle', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
  repo.diagrams.mainDiagram = { id: 'mainDiagram', kind: 'diagram', name: 'Main', namespace: [], ownerId: 'main', contextElementId: 'main', diagramKind: 'sequence' } as any;
  return repo;
}

describe('traceability rows for nested interaction elements', () => {
  it('lists a message that satisfies a requirement by a readable name and counts the requirement as covered', () => {
    const repo = withVehicle();
    repo.relationships.s1 = { id: 's1', kind: 'satisfy', sourceId: 'm1', targetId: 'req1' } as SysmlRelationship;
    repo.relationships.s2 = { id: 's2', kind: 'trace', sourceId: 'a', targetId: 'req1' } as SysmlRelationship;
    const [row] = buildTraceabilityMatrix(repo).rows;
    expect(row.status).toBe('covered');
    expect(row.unresolvedEndpointIds).toEqual([]);
    expect(row.satisfiedBy.map(item => item.name)).toEqual(['Main ▸ message 1: go']);
    expect(row.tracedElements.map(item => item.name)).toEqual(['Main ▸ lifeline a']);
  });
});

describe('allocation of messages and lifelines', () => {
  it('resolves interactions, lifelines and messages as allocatable elements', () => {
    const repo = withVehicle();
    expect(resolveAllocationElement(repo, 'main')).toMatchObject({ kind: 'interaction', name: 'Main' });
    expect(resolveAllocationElement(repo, 'a')).toMatchObject({ kind: 'lifeline' });
    expect(resolveAllocationElement(repo, 'm1')).toMatchObject({ kind: 'message', name: 'go' });
  });

  it('draws «allocate» names on the message and the lifeline', () => {
    const repo = withVehicle();
    repo.relationships.al1 = { id: 'al1', kind: 'allocation', sourceId: 'm1', targetId: 'Vehicle' } as SysmlRelationship;
    repo.relationships.al2 = { id: 'al2', kind: 'allocation', sourceId: 'a', targetId: 'Vehicle' } as SysmlRelationship;
    expect(allocationNamesByElement(repo).get('m1')?.allocatedTo).toEqual(['Vehicle']);
    const view = buildSequenceDiagramView(repo, 'mainDiagram');
    expect(view.messages[0].allocatedTo).toEqual(['Vehicle']);
    expect(view.lifelines[0].allocatedTo).toEqual(['Vehicle']);
  });
});

describe('verification case test procedure', () => {
  function withCase(): SysmlRepository {
    const repo = withVehicle();
    repo.verificationCases.vc1 = { id: 'vc1', kind: 'verificationCase', name: 'Go test', namespace: [], ownerId: 'model', method: 'Test', verifiesRequirementIds: ['req1'] } as any;
    return repo;
  }

  it('lists activities and interactions, and sets the procedure with one updateElement', () => {
    const repo = withCase();
    expect(listTestProcedures(repo).map(option => option.id)).toEqual(['main']);
    const plan = buildSetVerificationBehaviorCommand(repo, { verificationCaseId: 'vc1', behaviorId: 'main' });
    expect(plan.ok).toBe(true);
    const state = createSysmlGatewayState(repo);
    const result = executeSysmlCommand(state, (plan as { command: SysmlEditorCommand }).command);
    expect(result.committed).toBe(true);
    expect(result.repository.verificationCases.vc1.behaviorId).toBe('main');
    expect(executeSysmlCommand({ ...state, ...result } as SysmlGatewayState, { type: 'undo' }).repository.verificationCases.vc1.behaviorId).toBeUndefined();
  });

  it('refuses something that is not an Activity or Interaction, and an unknown case', () => {
    const repo = withCase();
    expect(buildSetVerificationBehaviorCommand(repo, { verificationCaseId: 'vc1', behaviorId: 'Vehicle' })).toMatchObject({ ok: false, diagnostics: [{ code: 'VERIFICATION_BEHAVIOR_MISSING' }] });
    expect(buildSetVerificationBehaviorCommand(repo, { verificationCaseId: 'nope' })).toMatchObject({ ok: false, diagnostics: [{ code: 'VERIFICATION_CASE_NOT_FOUND' }] });
  });

  it('only warns about a procedure that is missing', () => {
    const repo = withCase();
    (repo.verificationCases.vc1 as any).behaviorId = 'gone';
    const found = validateSysmlRepository(repo).diagnostics.filter(d => d.code === 'VERIFICATION_BEHAVIOR_MISSING');
    expect(found).toMatchObject([{ severity: 'warning', elementId: 'vc1' }]);
  });

  it('keeps the case and clears the procedure when the interaction is deleted, and undoes it', () => {
    const repo = withCase();
    repo.verificationCases.vc1 = { ...repo.verificationCases.vc1, behaviorId: 'main' } as any;
    const state = createSysmlGatewayState(repo);
    const command = { type: 'deleteElements' as const, elementIds: ['main'], authorizedBaselineIds: [] };
    const preview = executeSysmlCommand(state, command);
    expect(preview.committed).toBe(false);
    expect(preview.impact?.affectedBehaviorElementIds).toContain('vc1');
    const done = executeSysmlCommand(state, { ...command, confirmedImpactHash: computeImpactHash(preview.impact!) } as SysmlEditorCommand);
    expect(done.committed, JSON.stringify(done.diagnostics)).toBe(true);
    expect(done.repository.verificationCases.vc1).toBeDefined();
    expect(done.repository.verificationCases.vc1.behaviorId).toBeUndefined();
    expect(done.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const undone = executeSysmlCommand({ ...state, ...done } as SysmlGatewayState, { type: 'undo' });
    expect(undone.repository.verificationCases.vc1.behaviorId).toBe('main');
  });

  it('clears the procedure and the requirement link when both are deleted together, and undoes both', () => {
    const repo = withCase();
    repo.verificationCases.vc1 = { ...repo.verificationCases.vc1, behaviorId: 'main' } as any;
    const state = createSysmlGatewayState(repo);
    const command = { type: 'deleteElements' as const, elementIds: ['main', 'req1'], authorizedBaselineIds: [] };
    const preview = executeSysmlCommand(state, command);
    const done = executeSysmlCommand(state, { ...command, confirmedImpactHash: computeImpactHash(preview.impact!) } as SysmlEditorCommand);
    expect(done.committed, JSON.stringify(done.diagnostics)).toBe(true);
    expect(done.repository.verificationCases.vc1.behaviorId).toBeUndefined();
    expect(done.repository.verificationCases.vc1.verifiesRequirementIds).toEqual([]);
    const undone = executeSysmlCommand({ ...state, ...done } as SysmlGatewayState, { type: 'undo' });
    expect(undone.repository.verificationCases.vc1.behaviorId).toBe('main');
    expect(undone.repository.verificationCases.vc1.verifiesRequirementIds).toEqual(['req1']);
  });

  it('keeps the procedure through save and load', () => {
    const repo = withCase();
    repo.verificationCases.vc1 = { ...repo.verificationCases.vc1, behaviorId: 'main' } as any;
    const loaded = loadRepository(serializeRepository(repo)).repository;
    expect(loaded.verificationCases.vc1.behaviorId).toBe('main');
  });
});