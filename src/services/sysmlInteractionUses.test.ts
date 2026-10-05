import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition, type SysmlRepository } from '../engine/sysml/model';
import { interactionNestedIds, validateInteraction, wouldCreateUseCycle } from '../engine/sysml/interaction';
import { loadRepository, serializeRepository } from '../engine/sysml/persistence';
import {
  computeImpactHash, createSysmlGatewayState, executeSysmlCommand, type SysmlCommandResult, type SysmlEditorCommand, type SysmlGatewayState,
} from './sysmlCommandGateway';
import { ensureDefaultSysmlDiagrams } from './sysmlDiagramWorkspace';
import { resolveCanvasSymbolDiagramTarget } from '../features/modelExplorer/diagramTreeContext';
import {
  FIRST_MESSAGE_Y, MESSAGE_SPACING, buildSequenceDiagramView, insertionIndexForY, messageY, nearestMessageIndex,
} from '../features/sysml/sequenceDiagramView';
import {
  buildAddInteractionUseCommand, buildRemoveInteractionMessageCommand, buildRemoveInteractionUseCommand, buildRemoveLifelineCommand,
  buildUpdateInteractionUseCommand, listReferableInteractions,
} from './sysmlInteractionCommands';

const interactionDef = (id: string, name: string, extra: Partial<InteractionDefinition> = {}): InteractionDefinition => ({
  id, name, kind: 'interaction', namespace: [], ownerId: 'model', lifelines: [], messages: [], fragments: [], ...extra,
});
const lifelines = [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }, { id: 'c', name: 'c' }];
const message = (id: string, order: number, from = 'a', to = 'b') => ({ id, name: id, order, sort: 'asynchCall' as const, sourceLifelineId: from, targetLifelineId: to });

/** Main has 3 lifelines and messages m1..m3; Login, Logout and Payment are other interactions. */
function model(): SysmlRepository {
  const repo = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
  repo.definitions.main = interactionDef('main', 'Main', { lifelines, messages: [message('m1', 1), message('m2', 2), message('m3', 3)] });
  repo.definitions.login = interactionDef('login', 'Login');
  repo.definitions.logout = interactionDef('logout', 'Logout');
  repo.definitions.payment = interactionDef('payment', 'Payment');
  repo.diagrams.mainDiagram = { id: 'mainDiagram', kind: 'diagram', name: 'Main', namespace: [], ownerId: 'main', contextElementId: 'main', diagramKind: 'sequence' } as any;
  repo.diagrams.loginDiagram = { id: 'loginDiagram', kind: 'diagram', name: 'Login', namespace: [], ownerId: 'login', contextElementId: 'login', diagramKind: 'sequence' } as any;
  return repo;
}

const mainOf = (repo: SysmlRepository) => repo.definitions.main as InteractionDefinition;
const withUses = (repo: SysmlRepository, uses: InteractionDefinition['uses']): InteractionDefinition => ({ ...mainOf(repo), uses });
const codes = (repo: SysmlRepository, next: InteractionDefinition) => validateInteraction({ ...repo, definitions: { ...repo.definitions, [next.id]: next } }, next).map(d => `${d.severity}:${d.code}`);

interface Ctx { state: SysmlGatewayState }
function run(ctx: Ctx, command: SysmlEditorCommand): SysmlCommandResult {
  const result = executeSysmlCommand(ctx.state, command);
  if (result.committed) ctx.state = { ...ctx.state, ...result } as SysmlGatewayState;
  return result;
}
function apply(ctx: Ctx, plan: ReturnType<typeof buildAddInteractionUseCommand>): SysmlCommandResult {
  if (!plan.ok) throw new Error(`plan failed: ${plan.diagnostics.map(d => d.code).join(',')}`);
  const result = run(ctx, plan.command);
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(result.committed).toBe(true);
  return result;
}

describe('ref frame rules', () => {
  it('accepts a frame that refers to another interaction over existing lifelines', () => {
    const repo = model();
    expect(codes(repo, withUses(repo, [{ id: 'u', refersToId: 'login', coveredLifelineIds: ['a', 'b'], afterMessageId: 'm1' }]))).toEqual([]);
  });

  it('reports a missing target, an unknown lifeline and an unknown anchor as errors', () => {
    const repo = model();
    expect(codes(repo, withUses(repo, [{ id: 'u', refersToId: 'gone', coveredLifelineIds: ['a'] }]))).toEqual(['error:USE_TARGET_MISSING']);
    expect(codes(repo, withUses(repo, [{ id: 'u', refersToId: 'login', coveredLifelineIds: ['nope'] }]))).toEqual(['error:USE_LIFELINE_MISSING']);
    expect(codes(repo, withUses(repo, [{ id: 'u', refersToId: 'login', coveredLifelineIds: ['a'], afterMessageId: 'nope' }]))).toEqual(['error:USE_ANCHOR_MISSING']);
    expect(codes(repo, withUses(repo, [{ id: 'u', refersToId: 'main', coveredLifelineIds: ['a'] }]))).toEqual(['error:USE_CYCLE']);
  });

  it('warns about a frame that covers no lifeline', () => {
    const repo = model();
    expect(codes(repo, withUses(repo, [{ id: 'u', refersToId: 'login', coveredLifelineIds: [] }]))).toEqual(['warning:USE_WITHOUT_LIFELINES']);
  });

  it('detects loops across interactions, not just a direct self reference', () => {
    const repo = model();
    repo.definitions.login = interactionDef('login', 'Login', { uses: [{ id: 'x', refersToId: 'payment', coveredLifelineIds: [] }] });
    repo.definitions.payment = interactionDef('payment', 'Payment', { uses: [{ id: 'y', refersToId: 'main', coveredLifelineIds: [] }] });
    expect(wouldCreateUseCycle(repo, 'main', 'login')).toBe(true);
    expect(wouldCreateUseCycle(repo, 'main', 'logout')).toBe(false);
    expect(wouldCreateUseCycle(repo, 'main', 'main')).toBe(true);
  });

  it('counts a frame as nested content addressable like a lifeline', () => {
    const repo = model();
    expect(interactionNestedIds(withUses(repo, [{ id: 'u', refersToId: 'login', coveredLifelineIds: ['a'] }]))).toContain('u');
  });
});

describe('ref frame layout', () => {
  const frame = (afterMessageId?: string) => [{ id: 'u', refersToId: 'login', coveredLifelineIds: ['a', 'c'], ...(afterMessageId ? { afterMessageId } : {}) }];

  it('puts the frame in its own slot and moves the later messages down', () => {
    const repo = model();
    repo.definitions.main = withUses(repo, frame('m1'));
    const view = buildSequenceDiagramView(repo, 'mainDiagram');
    expect(view.messages.map(entry => entry.y)).toEqual([messageY(0), messageY(2), messageY(3)]);
    expect(view.uses).toHaveLength(1);
    expect(view.uses[0].y).toBe(messageY(1));
    expect(view.uses[0]).toMatchObject({ refersToLabel: 'Login', text: 'Login', coveredLifelineIds: ['a', 'c'] });
  });

  it('spans the covered lifelines', () => {
    const repo = model();
    repo.definitions.main = withUses(repo, frame('m1'));
    const view = buildSequenceDiagramView(repo, 'mainDiagram');
    const [a, , c] = view.lifelines;
    expect(view.uses[0].bounds.x).toBeLessThan(a.head.x + 1);
    expect(view.uses[0].bounds.x + view.uses[0].bounds.width).toBeGreaterThan(c.head.x + c.head.width - 1);
  });

  it('puts a frame without an anchor before the first message, and shows arguments', () => {
    const repo = model();
    repo.definitions.main = withUses(repo, [{ id: 'u', refersToId: 'login', coveredLifelineIds: ['a'], arguments: 'user' }]);
    const view = buildSequenceDiagramView(repo, 'mainDiagram');
    expect(view.uses[0].y).toBe(messageY(0));
    expect(view.uses[0].text).toBe('Login(user)');
    expect(view.messages[0].y).toBe(messageY(1));
  });

  it('treats a missing anchor like no anchor instead of dropping the frame', () => {
    const repo = model();
    repo.definitions.main = withUses(repo, frame('gone'));
    expect(buildSequenceDiagramView(repo, 'mainDiagram').uses[0].y).toBe(messageY(0));
  });

  it('is unchanged for an interaction with no frames', () => {
    const view = buildSequenceDiagramView(model(), 'mainDiagram');
    expect(view.uses).toEqual([]);
    expect(view.messages.map(entry => entry.y)).toEqual([messageY(0), messageY(1), messageY(2)]);
  });

  it('maps a click or drag height to a message index even when frames shift the rows', () => {
    const repo = model();
    repo.definitions.main = withUses(repo, frame('m1'));
    const { messages } = buildSequenceDiagramView(repo, 'mainDiagram');
    // m1 at slot 0, m2 at slot 2, m3 at slot 3.
    expect(insertionIndexForY(messages, FIRST_MESSAGE_Y - 10)).toBe(0);
    expect(insertionIndexForY(messages, messageY(1))).toBe(1);
    expect(insertionIndexForY(messages, messageY(2) + MESSAGE_SPACING * 0.6)).toBe(2);
    expect(insertionIndexForY(messages, 10_000)).toBe(3);
    expect(nearestMessageIndex(messages, messageY(2) + 5)).toBe(1);
    expect(nearestMessageIndex([], 100)).toBe(0);
  });
});

describe('ref frame commands', () => {
  const ctx = (): Ctx => ({ state: createSysmlGatewayState(model()) });

  it('adds a frame after the last message over all lifelines by default, as one undoable step', () => {
    const c = ctx();
    const plan = buildAddInteractionUseCommand(c.state.repository, { interactionId: 'main', refersToId: 'login', id: 'u1' });
    apply(c, plan);
    expect(mainOf(c.state.repository).uses).toEqual([{ id: 'u1', refersToId: 'login', coveredLifelineIds: ['a', 'b', 'c'], afterMessageId: 'm3' }]);
    const undone = run(c, { type: 'undo' });
    expect(undone.committed).toBe(true);
    expect(mainOf(undone.repository).uses ?? []).toEqual([]);
  });

  it('refuses a missing target, a loop, foreign lifelines and a foreign anchor', () => {
    const c = ctx();
    const repo = c.state.repository;
    expect(buildAddInteractionUseCommand(repo, { interactionId: 'main', refersToId: 'gone' })).toMatchObject({ ok: false, diagnostics: [{ code: 'USE_TARGET_MISSING' }] });
    expect(buildAddInteractionUseCommand(repo, { interactionId: 'main', refersToId: 'main' })).toMatchObject({ ok: false, diagnostics: [{ code: 'USE_CYCLE' }] });
    expect(buildAddInteractionUseCommand(repo, { interactionId: 'main', refersToId: 'login', coveredLifelineIds: ['zz'] })).toMatchObject({ ok: false, diagnostics: [{ code: 'USE_LIFELINE_MISSING' }] });
    expect(buildAddInteractionUseCommand(repo, { interactionId: 'main', refersToId: 'login', afterMessageId: 'zz' })).toMatchObject({ ok: false, diagnostics: [{ code: 'USE_ANCHOR_MISSING' }] });
    apply(c, buildAddInteractionUseCommand(repo, { interactionId: 'main', refersToId: 'login', id: 'u1' }));
    // login now cannot refer back to main.
    expect(buildAddInteractionUseCommand(c.state.repository, { interactionId: 'login', refersToId: 'main' })).toMatchObject({ ok: false, diagnostics: [{ code: 'USE_CYCLE' }] });
  });

  it('offers only interactions that would not form a loop', () => {
    const c = ctx();
    expect(listReferableInteractions(c.state.repository, 'main').map(option => option.id)).toEqual(['login', 'logout', 'payment']);
    apply(c, buildAddInteractionUseCommand(c.state.repository, { interactionId: 'main', refersToId: 'login', id: 'u1' }));
    expect(listReferableInteractions(c.state.repository, 'login').map(option => option.id)).toEqual(['logout', 'payment']);
  });

  it('updates the target, arguments, coverage and position', () => {
    const c = ctx();
    apply(c, buildAddInteractionUseCommand(c.state.repository, { interactionId: 'main', refersToId: 'login', id: 'u1' }));
    apply(c, buildUpdateInteractionUseCommand(c.state.repository, { interactionId: 'main', useId: 'u1', refersToId: 'payment', arguments: ' 42 ', coveredLifelineIds: ['a'], afterMessageId: 'm1' }));
    expect(mainOf(c.state.repository).uses![0]).toEqual({ id: 'u1', refersToId: 'payment', coveredLifelineIds: ['a'], afterMessageId: 'm1', arguments: '42' });
    apply(c, buildUpdateInteractionUseCommand(c.state.repository, { interactionId: 'main', useId: 'u1', afterMessageId: null, arguments: null }));
    expect(mainOf(c.state.repository).uses![0]).toEqual({ id: 'u1', refersToId: 'payment', coveredLifelineIds: ['a'] });
    expect(buildUpdateInteractionUseCommand(c.state.repository, { interactionId: 'main', useId: 'nope', arguments: 'x' })).toMatchObject({ ok: false, diagnostics: [{ code: 'USE_NOT_FOUND' }] });
  });

  it('removes a frame', () => {
    const c = ctx();
    apply(c, buildAddInteractionUseCommand(c.state.repository, { interactionId: 'main', refersToId: 'login', id: 'u1' }));
    apply(c, buildRemoveInteractionUseCommand(c.state.repository, { interactionId: 'main', useId: 'u1' }));
    expect(mainOf(c.state.repository).uses).toEqual([]);
  });

  it('moves a frame up to the earlier message when the message it follows is deleted', () => {
    const c = ctx();
    apply(c, buildAddInteractionUseCommand(c.state.repository, { interactionId: 'main', refersToId: 'login', id: 'u1', afterMessageId: 'm2' }));
    apply(c, buildRemoveInteractionMessageCommand(c.state.repository, { interactionId: 'main', messageId: 'm2' }));
    expect(mainOf(c.state.repository).uses![0].afterMessageId).toBe('m1');
    apply(c, buildRemoveInteractionMessageCommand(c.state.repository, { interactionId: 'main', messageId: 'm1' }));
    expect(mainOf(c.state.repository).uses![0].afterMessageId).toBeUndefined();
  });

  it('drops a frame that covered only a lifeline that is deleted, but keeps one that still covers another', () => {
    const c = ctx();
    apply(c, buildAddInteractionUseCommand(c.state.repository, { interactionId: 'main', refersToId: 'login', id: 'only', coveredLifelineIds: ['c'], afterMessageId: null }));
    apply(c, buildAddInteractionUseCommand(c.state.repository, { interactionId: 'main', refersToId: 'logout', id: 'two', coveredLifelineIds: ['b', 'c'], afterMessageId: null }));
    apply(c, buildRemoveLifelineCommand(c.state.repository, { interactionId: 'main', lifelineId: 'c' }));
    const uses = mainOf(c.state.repository).uses!;
    expect(uses.map(use => use.id)).toEqual(['two']);
    expect(uses[0].coveredLifelineIds).toEqual(['b']);
  });
});

describe('deleting a referenced interaction', () => {
  it('removes the frames that referred to it, lists them for review, and undoes together', () => {
    const c: Ctx = { state: createSysmlGatewayState(model()) };
    apply(c, buildAddInteractionUseCommand(c.state.repository, { interactionId: 'main', refersToId: 'login', id: 'u1' }));
    const command = { type: 'deleteElements' as const, elementIds: ['login'], authorizedBaselineIds: [] };
    const preview = run(c, command);
    expect(preview.committed).toBe(false);
    expect(preview.impact?.affectedBehaviorElementIds).toContain('u1');
    expect(preview.impact?.affectedDiagramKinds).toContain('sequence');
    const result = run(c, { ...command, confirmedImpactHash: computeImpactHash(preview.impact!) } as SysmlEditorCommand);
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(mainOf(result.repository).uses).toEqual([]);
    expect(result.repository.definitions.login).toBeUndefined();
    expect(result.repository.diagrams.loginDiagram).toBeUndefined();

    const undone = run(c, { type: 'undo' });
    expect(undone.committed).toBe(true);
    expect(mainOf(undone.repository).uses).toHaveLength(1);
    expect(undone.repository.definitions.login).toBeDefined();
  });
});

describe('opening the referenced diagram and persistence', () => {
  it('resolves the referenced interaction to its own diagram, which is what a double click opens', () => {
    const repo = model();
    expect(resolveCanvasSymbolDiagramTarget('login', repo)).toBe('loginDiagram');
  });

  it('keeps frames through save and load', () => {
    const repo = model();
    repo.definitions.main = withUses(repo, [{ id: 'u', refersToId: 'login', coveredLifelineIds: ['a'], afterMessageId: 'm1', arguments: 'x' }]);
    const loaded = loadRepository(serializeRepository(repo)).repository;
    expect((loaded.definitions.main as InteractionDefinition).uses).toEqual([{ id: 'u', refersToId: 'login', coveredLifelineIds: ['a'], afterMessageId: 'm1', arguments: 'x' }]);
  });
});
