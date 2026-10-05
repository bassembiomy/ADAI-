import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition, type SysmlRepository } from '../engine/sysml/model';
import { validateInteraction } from '../engine/sysml/interaction';
import {
  computeImpactHash, createSysmlGatewayState, executeSysmlCommand, type SysmlCommandResult, type SysmlEditorCommand, type SysmlGatewayState,
} from './sysmlCommandGateway';
import { ensureDefaultSysmlDiagrams } from './sysmlDiagramWorkspace';
import { createSysmlExplorerAdapter } from '../features/modelExplorer/adapters/sysmlExplorerAdapter';
import { createModelExplorerCommandBus } from '../features/modelExplorer/modelExplorerCommandBus';
import { resolveCanvasSymbolDiagramTarget, resolveCanvasSymbolDiagramTargets } from '../features/modelExplorer/diagramTreeContext';
import { buildSequenceDiagramView } from '../features/sysml/sequenceDiagramView';
import { buildAddLifelineCommand, listLifelineCandidates } from './sysmlInteractionCommands';

const one = { lower: 1, upper: 1, ordered: false, unique: true };

/** A Use Case "Withdraw" with actors Customer (associated), Clerk (a Customer specialization of nothing), Auditor (unrelated). */
function model(): SysmlRepository {
  const repo = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
  repo.useCases.withdraw = { id: 'withdraw', kind: 'useCase', name: 'Withdraw', namespace: ['model'], ownerId: 'model', extensionPointIds: [], behaviorArtifactIds: [] } as any;
  repo.actors.customer = { id: 'customer', kind: 'actor', name: 'Customer', namespace: ['model'], ownerId: 'model', isExternal: true, generalizationIds: [] } as any;
  repo.actors.premium = { id: 'premium', kind: 'actor', name: 'PremiumCustomer', namespace: ['model'], ownerId: 'model', isExternal: true, generalizationIds: ['customer'] } as any;
  repo.actors.auditor = { id: 'auditor', kind: 'actor', name: 'Auditor', namespace: ['model'], ownerId: 'model', isExternal: true, generalizationIds: [] } as any;
  repo.definitions.atm = {
    id: 'atm', name: 'ATM', kind: 'block', namespace: ['model'], ownerId: 'model',
    isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
  } as any;
  repo.relationships.assoc = { id: 'assoc', kind: 'useCaseAssociation', sourceId: 'customer', targetId: 'withdraw' } as any;
  return repo;
}

interface Ctx { state: SysmlGatewayState }
function run(ctx: Ctx, command: SysmlEditorCommand): SysmlCommandResult {
  const result = executeSysmlCommand(ctx.state, command);
  if (result.committed) ctx.state = { ...ctx.state, ...result } as SysmlGatewayState;
  return result;
}
const bus = (ctx: Ctx) => createModelExplorerCommandBus(createSysmlExplorerAdapter({ getState: () => ctx.state, executeCommand: command => run(ctx, command) }));

/** Creates the scenario and its diagram the way the model tree does. */
function withScenario() {
  const ctx: Ctx = { state: createSysmlGatewayState(model()) };
  const created = bus(ctx).dispatch({ type: 'createElement', ownerId: 'withdraw', elementKind: 'Interaction', name: 'Cash withdrawal' });
  expect(created.committed, JSON.stringify(created.diagnostics)).toBe(true);
  const interactionId = created.selectedIds![0];
  const diagram = bus(ctx).dispatch({ type: 'createDiagram', ownerId: interactionId, diagramKind: 'sequence' });
  expect(diagram.committed, JSON.stringify(diagram.diagnostics)).toBe(true);
  return { ctx, interactionId, diagramId: diagram.selectedIds![0] };
}

const interactionOf = (ctx: Ctx, id: string) => ctx.state.repository.definitions[id] as InteractionDefinition;
const codes = (repo: SysmlRepository, interaction: InteractionDefinition) => validateInteraction(repo, interaction).map(d => `${d.severity}:${d.code}`);
const asLifelines = (repo: SysmlRepository, id: string, ...represents: string[]): InteractionDefinition => ({
  ...(repo.definitions[id] as InteractionDefinition),
  lifelines: represents.map((representsId, index) => ({ id: `l${index + 1}`, name: '', representsId })),
});

describe('an Interaction owned by a Use Case', () => {
  it('is offered and created under the use case, qualified by it', () => {
    const ctx: Ctx = { state: createSysmlGatewayState(model()) };
    const adapter = createSysmlExplorerAdapter({ getState: () => ctx.state, executeCommand: command => run(ctx, command) });
    expect(adapter.capabilities(['withdraw']).some(cap => cap.id === 'create:Interaction' && cap.enabled)).toBe(true);
    const { interactionId } = withScenario();
    expect(interactionId).toBeTruthy();
    const scenario = withScenario();
    const created = interactionOf(scenario.ctx, scenario.interactionId);
    expect(created).toMatchObject({ kind: 'interaction', ownerId: 'withdraw', name: 'Cash withdrawal', namespace: ['model', 'Withdraw'] });
  });

  it('is still refused under an Actor', () => {
    const ctx: Ctx = { state: createSysmlGatewayState(model()) };
    const denied = bus(ctx).dispatch({ type: 'createElement', ownerId: 'customer', elementKind: 'Interaction' });
    expect(denied.committed).toBe(false);
  });

  it('gives the use case its scenario diagram to navigate to', () => {
    const { ctx, diagramId } = withScenario();
    const repo = ctx.state.repository;
    expect(resolveCanvasSymbolDiagramTargets('withdraw', repo)).toEqual([diagramId]);
    expect(resolveCanvasSymbolDiagramTarget('withdraw', repo)).toBe(diagramId);
    // Blocks keep navigating only to the diagrams they own.
    expect(resolveCanvasSymbolDiagramTargets('atm', repo)).toEqual([]);
  });

  it('is deleted, with its diagram, when the use case is deleted', () => {
    const { ctx, interactionId, diagramId } = withScenario();
    const command = { type: 'deleteElements' as const, elementIds: ['withdraw'], authorizedBaselineIds: [] };
    const preview = run(ctx, command);
    expect(preview.committed).toBe(false);
    expect(preview.impact?.deletedElementIds).toEqual(expect.arrayContaining(['withdraw', interactionId, diagramId]));
    const result = run(ctx, { ...command, confirmedImpactHash: computeImpactHash(preview.impact!) } as SysmlEditorCommand);
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.repository.definitions[interactionId]).toBeUndefined();
    expect(result.repository.diagrams[diagramId]).toBeUndefined();
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });
});

describe('an activity action that calls a behavior', () => {
  const withActivity = (calls: string) => {
    const scenario = withScenario();
    scenario.ctx.state.repository.definitions.flow = {
      id: 'flow', kind: 'activity', name: 'Flow', namespace: ['model'], ownerId: 'model', parameters: [], edges: [], partitions: [],
      nodes: [{ id: 'a1', kind: 'action', name: 'Do it', behaviorId: calls }],
    } as any;
    return scenario;
  };

  it('may call an Interaction, and is labelled as a call to it', async () => {
    const { ctx, interactionId } = withActivity('placeholder');
    ctx.state.repository.definitions.flow = { ...(ctx.state.repository.definitions.flow as any), nodes: [{ id: 'a1', kind: 'action', name: 'Do it', behaviorId: interactionId }] };
    const { validateActivity } = await import('../engine/sysml/activity');
    const { buildActivityDiagramView } = await import('../features/sysml/activityDiagramView');
    const flow = ctx.state.repository.definitions.flow as any;
    expect(validateActivity(ctx.state.repository, flow).filter(d => d.severity === 'error')).toEqual([]);
    const diagram = { id: 'ad', kind: 'diagram', name: 'AD', namespace: [], ownerId: 'flow', contextElementId: 'flow', diagramKind: 'activity' };
    ctx.state.repository.diagrams.ad = diagram as any;
    const view = buildActivityDiagramView(ctx.state.repository, 'ad', { elementIds: ['a1'], presentations: {} });
    expect(view.nodes.find(node => node.id === 'a1')?.detail).toBe('«call» Cash withdrawal');
  });

  it('still rejects a call to something that is neither an Activity nor an Interaction', async () => {
    const { ctx } = withActivity('customer');
    const { validateActivity } = await import('../engine/sysml/activity');
    const diagnostics = validateActivity(ctx.state.repository, ctx.state.repository.definitions.flow as any);
    expect(diagnostics.map(d => d.code)).toContain('MISSING_CALLED_BEHAVIOR');
  });

  it('becomes opaque, not dangling, when the called Interaction is deleted', () => {
    const { ctx, interactionId } = withActivity('placeholder');
    ctx.state.repository.definitions.flow = { ...(ctx.state.repository.definitions.flow as any), nodes: [{ id: 'a1', kind: 'action', name: 'Do it', behaviorId: interactionId }] };
    const command = { type: 'deleteElements' as const, elementIds: [interactionId], authorizedBaselineIds: [] };
    const preview = run(ctx, command);
    expect(preview.impact?.affectedBehaviorElementIds).toContain('a1');
    const result = run(ctx, { ...command, confirmedImpactHash: computeImpactHash(preview.impact!) } as SysmlEditorCommand);
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const action = (result.repository.definitions.flow as any).nodes[0];
    expect(action).toMatchObject({ id: 'a1', name: 'Do it' });
    expect(action.behaviorId).toBeUndefined();

    const undone = run(ctx, { type: 'undo' });
    expect(undone.committed).toBe(true);
    expect((undone.repository.definitions.flow as any).nodes[0].behaviorId).toBe(interactionId);
  });

  it('becomes opaque when the called Activity is deleted, which used to leave an error behind', () => {
    const ctx: Ctx = { state: createSysmlGatewayState(model()) };
    const repo = ctx.state.repository;
    repo.definitions.callee = { id: 'callee', kind: 'activity', name: 'Callee', namespace: ['model'], ownerId: 'model', parameters: [], edges: [], partitions: [], nodes: [] } as any;
    repo.definitions.caller = { id: 'caller', kind: 'activity', name: 'Caller', namespace: ['model'], ownerId: 'model', parameters: [], edges: [], partitions: [], nodes: [{ id: 'call', kind: 'action', name: 'Call', behaviorId: 'callee' }] } as any;
    const command = { type: 'deleteElements' as const, elementIds: ['callee'], authorizedBaselineIds: [] };
    const preview = run(ctx, command);
    const result = preview.committed ? preview : run(ctx, { ...command, confirmedImpactHash: computeImpactHash(preview.impact!) } as SysmlEditorCommand);
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect((result.repository.definitions.caller as any).nodes[0].behaviorId).toBeUndefined();
  });

  it('opens the called interaction diagram from the action', () => {
    const { ctx, interactionId, diagramId } = withActivity('placeholder');
    // The activity workspace navigates to the called behavior id; for an Interaction that resolves to its diagram.
    expect(resolveCanvasSymbolDiagramTarget(interactionId, ctx.state.repository)).toBe(diagramId);
  });
});

describe('actors as lifelines', () => {
  it('draws an actor lifeline with its name and the actor keyword', () => {
    const { ctx, interactionId, diagramId } = withScenario();
    const plan = buildAddLifelineCommand(ctx.state.repository, { interactionId, representsId: 'customer', id: 'll-actor' });
    expect(plan.ok).toBe(true);
    expect(run(ctx, (plan as any).command).committed).toBe(true);
    const lifeline = buildSequenceDiagramView(ctx.state.repository, diagramId).lifelines.find(candidate => candidate.id === 'll-actor');
    expect(lifeline).toMatchObject({ label: 'Customer', isActor: true });
  });

  it('accepts an associated actor, or one that specializes an associated actor, without a warning', () => {
    const repo = model();
    repo.definitions.scenario = { id: 'scenario', kind: 'interaction', name: 'S', namespace: [], ownerId: 'withdraw', lifelines: [], messages: [], fragments: [] } as InteractionDefinition;
    expect(codes(repo, asLifelines(repo, 'scenario', 'customer', 'premium'))).toEqual([]);
  });

  it('warns, never errors, about an actor the use case does not involve', () => {
    const repo = model();
    repo.definitions.scenario = { id: 'scenario', kind: 'interaction', name: 'S', namespace: [], ownerId: 'withdraw', lifelines: [], messages: [], fragments: [] } as InteractionDefinition;
    expect(codes(repo, asLifelines(repo, 'scenario', 'auditor'))).toEqual(['warning:SCENARIO_ACTOR_NOT_ASSOCIATED']);
  });

  it('does not apply the scenario rule to an interaction that is not a use case scenario', () => {
    const repo = model();
    repo.definitions.free = { id: 'free', kind: 'interaction', name: 'F', namespace: [], ownerId: 'model', lifelines: [], messages: [], fragments: [] } as InteractionDefinition;
    expect(codes(repo, asLifelines(repo, 'free', 'auditor'))).toEqual([]);
  });

  it('does not call an actor outside a Block context', () => {
    const repo = model();
    repo.definitions.blockOwned = { id: 'blockOwned', kind: 'interaction', name: 'B', namespace: [], ownerId: 'atm', lifelines: [], messages: [], fragments: [] } as InteractionDefinition;
    expect(codes(repo, asLifelines(repo, 'blockOwned', 'auditor', 'atm'))).toEqual([]);
  });

  it('keeps the lifeline but forgets the actor when the actor is deleted', () => {
    const { ctx, interactionId } = withScenario();
    run(ctx, (buildAddLifelineCommand(ctx.state.repository, { interactionId, representsId: 'customer', id: 'll-actor' }) as any).command);
    const command = { type: 'deleteElements' as const, elementIds: ['customer'], authorizedBaselineIds: [] };
    const preview = run(ctx, command);
    expect(preview.impact?.affectedBehaviorElementIds).toContain('ll-actor');
    const result = run(ctx, { ...command, confirmedImpactHash: computeImpactHash(preview.impact!) } as SysmlEditorCommand);
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const lifeline = interactionOf(ctx, interactionId).lifelines.find(candidate => candidate.id === 'll-actor');
    expect(lifeline).toBeDefined();
    expect(lifeline?.representsId).toBeUndefined();
    // An actor that specialized the deleted one no longer points at it.
    expect(result.repository.actors.premium.generalizationIds).toEqual([]);
  });

  it('refuses a lifeline for something that is neither a Block, a part nor an Actor', () => {
    const { ctx, interactionId } = withScenario();
    const plan = buildAddLifelineCommand(ctx.state.repository, { interactionId, representsId: 'withdraw' });
    expect(plan).toMatchObject({ ok: false, diagnostics: [{ code: 'MISSING_LIFELINE_REPRESENTS' }] });
  });

  it('leads the picker with the actors of the use case and lists the others last', () => {
    const { ctx, interactionId } = withScenario();
    const candidates = listLifelineCandidates(ctx.state.repository, interactionId);
    expect(candidates.filter(candidate => candidate.group === 'actor').map(candidate => candidate.id).sort()).toEqual(['customer', 'premium']);
    expect(candidates[0].group).toBe('actor');
    expect(candidates.filter(candidate => candidate.group === 'otherActor').map(candidate => candidate.id)).toEqual(['auditor']);
    expect(candidates[candidates.length - 1].group).toBe('otherActor');
    expect(new Set(candidates.map(candidate => candidate.id)).size).toBe(candidates.length);
  });
});
