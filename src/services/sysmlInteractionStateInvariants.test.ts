import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition, type SysmlRepository } from '../engine/sysml/model';
import { validateInteraction } from '../engine/sysml/interaction';
import { signalTriggerCoverage } from '../engine/sysml/interactionTriggers';
import { loadRepository, serializeRepository } from '../engine/sysml/persistence';
import type { SemanticEndpointContext } from '../engine/sysml/semanticEndpointIndex';
import { createSysmlGatewayState, executeSysmlCommand, type SysmlCommandResult, type SysmlEditorCommand, type SysmlGatewayState } from './sysmlCommandGateway';
import { ensureDefaultSysmlDiagrams } from './sysmlDiagramWorkspace';
import { buildSequenceDiagramView, messageY } from '../features/sysml/sequenceDiagramView';
import {
  buildAddStateInvariantCommand, buildRemoveInteractionMessageCommand, buildRemoveLifelineCommand, buildRemoveStateInvariantCommand,
  buildUpdateStateInvariantCommand,
} from './sysmlInteractionCommands';

const message = (id: string, order: number, from = 'a', to = 'b', sort: 'asynchCall' | 'asynchSignal' = 'asynchCall', extra = {}) =>
  ({ id, name: id, order, sort, sourceLifelineId: from, targetLifelineId: to, ...extra });

function model(): SysmlRepository {
  const repo = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
  repo.definitions.main = {
    id: 'main', name: 'Main', kind: 'interaction', namespace: [], ownerId: 'model',
    lifelines: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }],
    messages: [message('m1', 1), message('m2', 2), message('m3', 3)],
    fragments: [],
  } as InteractionDefinition;
  repo.diagrams.mainDiagram = { id: 'mainDiagram', kind: 'diagram', name: 'Main', namespace: [], ownerId: 'main', contextElementId: 'main', diagramKind: 'sequence' } as any;
  return repo;
}
const mainOf = (repo: SysmlRepository) => repo.definitions.main as InteractionDefinition;
const states = (...ids: string[]): SemanticEndpointContext => ({ externalEndpoints: new Map(ids.map(id => [id, { id, name: id.toUpperCase(), family: 'state' as const }])) });
const codes = (repo: SysmlRepository, next: InteractionDefinition, endpoints?: SemanticEndpointContext) =>
  validateInteraction({ ...repo, definitions: { ...repo.definitions, main: next } }, next, endpoints).map(d => `${d.severity}:${d.code}`);
const withInv = (repo: SysmlRepository, stateInvariants: InteractionDefinition['stateInvariants']): InteractionDefinition => ({ ...mainOf(repo), stateInvariants });

interface Ctx { state: SysmlGatewayState }
function run(ctx: Ctx, command: SysmlEditorCommand): SysmlCommandResult {
  const result = executeSysmlCommand(ctx.state, command);
  if (result.committed) ctx.state = { ...ctx.state, ...result } as SysmlGatewayState;
  return result;
}
function apply(ctx: Ctx, plan: ReturnType<typeof buildAddStateInvariantCommand>): SysmlCommandResult {
  if (!plan.ok) throw new Error(`plan failed: ${plan.diagnostics.map(d => d.code).join(',')}`);
  const result = run(ctx, plan.command);
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(result.committed).toBe(true);
  return result;
}

describe('state invariant rules', () => {
  it('accepts an invariant on an existing lifeline for a known state', () => {
    const repo = model();
    expect(codes(repo, withInv(repo, [{ id: 'i', lifelineId: 'a', stateId: 's1', afterMessageId: 'm1' }]), states('s1'))).toEqual([]);
  });

  it('errors on a missing lifeline or anchor', () => {
    const repo = model();
    expect(codes(repo, withInv(repo, [{ id: 'i', lifelineId: 'x', stateId: 's1' }]))).toEqual(['error:STATE_INVARIANT_LIFELINE_MISSING']);
    expect(codes(repo, withInv(repo, [{ id: 'i', lifelineId: 'a', stateId: 's1', afterMessageId: 'x' }]))).toEqual(['error:STATE_INVARIANT_ANCHOR_MISSING']);
  });

  it('only warns when the state machine no longer has the state, and only when the states are known', () => {
    const repo = model();
    const next = withInv(repo, [{ id: 'i', lifelineId: 'a', stateId: 'gone' }]);
    expect(codes(repo, next, states('s1'))).toEqual(['warning:STATE_INVARIANT_UNRESOLVED']);
    expect(codes(repo, next)).toEqual([]);
  });
});

describe('state invariant layout', () => {
  it('draws a box on the lifeline in its own slot, named from the state machine', () => {
    const repo = model();
    repo.definitions.main = withInv(repo, [{ id: 'i', lifelineId: 'b', stateId: 's1', afterMessageId: 'm1' }]);
    const view = buildSequenceDiagramView(repo, 'mainDiagram', states('s1'));
    expect(view.messages.map(entry => entry.y)).toEqual([messageY(0), messageY(2), messageY(3)]);
    const [box] = view.stateInvariants;
    expect(box).toMatchObject({ id: 'i', lifelineId: 'b', text: 'S1', resolved: true, y: messageY(1) });
    const lifeline = view.lifelines.find(candidate => candidate.id === 'b')!;
    expect(box.bounds.x + box.bounds.width / 2).toBeCloseTo(lifeline.centerX);
  });

  it('shows Unknown state, never an id, when the state is gone', () => {
    const repo = model();
    repo.definitions.main = withInv(repo, [{ id: 'i', lifelineId: 'a', stateId: 'state-123' }]);
    const [box] = buildSequenceDiagramView(repo, 'mainDiagram', states('other')).stateInvariants;
    expect(box).toMatchObject({ text: 'Unknown state', resolved: false });
  });

  it('shares slots with ref frames and keeps the order of anchors', () => {
    const repo = model();
    repo.definitions.main = {
      ...mainOf(repo),
      stateInvariants: [{ id: 'i', lifelineId: 'a', stateId: 's1', afterMessageId: 'm1' }],
      uses: [{ id: 'u', refersToId: 'main', coveredLifelineIds: ['a'], afterMessageId: 'm1' }],
    };
    const view = buildSequenceDiagramView(repo, 'mainDiagram', states('s1'));
    expect(view.stateInvariants[0].y).toBe(messageY(2));
    expect(view.uses[0].y).toBe(messageY(1));
    expect(view.messages[1].y).toBe(messageY(3));
  });

  it('leaves a diagram without invariants unchanged', () => {
    const view = buildSequenceDiagramView(model(), 'mainDiagram');
    expect(view.stateInvariants).toEqual([]);
    expect(view.messages.map(entry => entry.y)).toEqual([messageY(0), messageY(1), messageY(2)]);
  });
});

describe('state invariant commands', () => {
  const ctx = (): Ctx => ({ state: createSysmlGatewayState(model()) });

  it('adds after the last message by default, as one undo step, and survives save and load', () => {
    const c = ctx();
    apply(c, buildAddStateInvariantCommand(c.state.repository, { interactionId: 'main', lifelineId: 'a', stateId: 's1', id: 'i1' }));
    expect(mainOf(c.state.repository).stateInvariants).toEqual([{ id: 'i1', lifelineId: 'a', stateId: 's1', afterMessageId: 'm3' }]);
    const loaded = loadRepository(serializeRepository(c.state.repository)).repository;
    expect((loaded.definitions.main as InteractionDefinition).stateInvariants).toEqual([{ id: 'i1', lifelineId: 'a', stateId: 's1', afterMessageId: 'm3' }]);
    const undone = run(c, { type: 'undo' });
    expect(mainOf(undone.repository).stateInvariants ?? []).toEqual([]);
  });

  it('refuses a foreign lifeline, an empty state and a foreign anchor', () => {
    const repo = ctx().state.repository;
    expect(buildAddStateInvariantCommand(repo, { interactionId: 'main', lifelineId: 'x', stateId: 's' })).toMatchObject({ ok: false, diagnostics: [{ code: 'STATE_INVARIANT_LIFELINE_MISSING' }] });
    expect(buildAddStateInvariantCommand(repo, { interactionId: 'main', lifelineId: 'a', stateId: ' ' })).toMatchObject({ ok: false, diagnostics: [{ code: 'STATE_INVARIANT_STATE_MISSING' }] });
    expect(buildAddStateInvariantCommand(repo, { interactionId: 'main', lifelineId: 'a', stateId: 's', afterMessageId: 'x' })).toMatchObject({ ok: false, diagnostics: [{ code: 'STATE_INVARIANT_ANCHOR_MISSING' }] });
  });

  it('updates the state, lifeline and position, and removes', () => {
    const c = ctx();
    apply(c, buildAddStateInvariantCommand(c.state.repository, { interactionId: 'main', lifelineId: 'a', stateId: 's1', id: 'i1' }));
    apply(c, buildUpdateStateInvariantCommand(c.state.repository, { interactionId: 'main', invariantId: 'i1', stateId: 's2', lifelineId: 'b', afterMessageId: null }));
    expect(mainOf(c.state.repository).stateInvariants).toEqual([{ id: 'i1', lifelineId: 'b', stateId: 's2' }]);
    expect(buildUpdateStateInvariantCommand(c.state.repository, { interactionId: 'main', invariantId: 'nope', stateId: 's' })).toMatchObject({ ok: false, diagnostics: [{ code: 'STATE_INVARIANT_NOT_FOUND' }] });
    apply(c, buildRemoveStateInvariantCommand(c.state.repository, { interactionId: 'main', invariantId: 'i1' }));
    expect(mainOf(c.state.repository).stateInvariants).toEqual([]);
  });

  it('moves an invariant up when its message is deleted, and drops it with its lifeline', () => {
    const c = ctx();
    apply(c, buildAddStateInvariantCommand(c.state.repository, { interactionId: 'main', lifelineId: 'a', stateId: 's1', id: 'i1', afterMessageId: 'm2' }));
    apply(c, buildAddStateInvariantCommand(c.state.repository, { interactionId: 'main', lifelineId: 'b', stateId: 's1', id: 'i2', afterMessageId: 'm2' }));
    apply(c, buildRemoveInteractionMessageCommand(c.state.repository, { interactionId: 'main', messageId: 'm2' }));
    expect(mainOf(c.state.repository).stateInvariants!.map(invariant => invariant.afterMessageId)).toEqual(['m1', 'm1']);
    apply(c, buildRemoveLifelineCommand(c.state.repository, { interactionId: 'main', lifelineId: 'b' }));
    expect(mainOf(c.state.repository).stateInvariants!.map(invariant => invariant.id)).toEqual(['i1']);
  });
});

describe('signal trigger coverage', () => {
  const signalModel = (): { repo: SysmlRepository; interaction: InteractionDefinition } => {
    const repo = model();
    repo.definitions.start = { id: 'start', name: 'StartCommand', kind: 'signal', namespace: [], ownerId: 'model' } as any;
    repo.definitions.main = {
      ...mainOf(repo),
      messages: [message('m1', 1, 'a', 'b', 'asynchSignal', { signatureId: 'start' }), message('m2', 2, 'a', 'b', 'asynchSignal', { name: 'stop' }), message('m3', 3, 'b', 'a', 'asynchSignal', { name: 'ack' })],
      stateInvariants: [{ id: 'i', lifelineId: 'b', stateId: 'idle' }, { id: 'j', lifelineId: 'b', stateId: 'running', afterMessageId: 'm1' }],
    };
    return { repo, interaction: mainOf(repo) };
  };

  it('matches the signal name against the transitions leaving the state the receiver is in', () => {
    const { repo, interaction } = signalModel();
    const result = signalTriggerCoverage(repo, interaction, [
      { sourceId: 'idle', condition: 'rx == start_command || startcommand' },
      { sourceId: 'idle', condition: 'stop' },
      { sourceId: 'running', condition: 'no match here' },
    ]);
    // m1 arrives while idle (before the second invariant); m2 while running; m3 goes to a lifeline with no invariant.
    expect(result.map(entry => [entry.messageId, entry.stateId, entry.covered])).toEqual([['m1', 'idle', true], ['m2', 'running', false]]);
    expect(result[0].signalName).toBe('StartCommand');
  });

  it('does not match on a part of a word and ignores case', () => {
    const { repo, interaction } = signalModel();
    const [first] = signalTriggerCoverage(repo, interaction, [{ sourceId: 'idle', condition: 'restartcommands' }]);
    expect(first.covered).toBe(false);
    expect(signalTriggerCoverage(repo, interaction, [{ sourceId: 'idle', condition: 'STARTCOMMAND' }])[0].covered).toBe(true);
  });

  it('reports nothing for an interaction without state invariants', () => {
    const repo = model();
    expect(signalTriggerCoverage(repo, mainOf(repo), [])).toEqual([]);
  });
});
