import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition, type SysmlRepository } from '../engine/sysml/model';
import { validateInteraction } from '../engine/sysml/interaction';
import { loadRepository, serializeRepository } from '../engine/sysml/persistence';
import { createSysmlGatewayState, executeSysmlCommand, type SysmlCommandResult, type SysmlEditorCommand, type SysmlGatewayState } from './sysmlCommandGateway';
import { ensureDefaultSysmlDiagrams } from './sysmlDiagramWorkspace';
import { buildSequenceDiagramView } from '../features/sysml/sequenceDiagramView';
import {
  buildAddFragmentCommand, buildAddInteractionConstraintCommand, buildRemoveInteractionConstraintCommand, buildRemoveInteractionMessageCommand,
  buildRemoveLifelineCommand, buildUpdateInteractionConstraintCommand,
} from './sysmlInteractionCommands';

const msg = (id: string, order: number, from = 'a', to = 'b') => ({ id, name: id, order, sort: 'asynchCall' as const, sourceLifelineId: from, targetLifelineId: to });

function model(): SysmlRepository {
  const repo = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
  repo.definitions.main = {
    id: 'main', name: 'Main', kind: 'interaction', namespace: [], ownerId: 'model',
    lifelines: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }],
    messages: [msg('m1', 1), msg('m2', 2), msg('m3', 3)],
    fragments: [],
  } as InteractionDefinition;
  repo.diagrams.mainDiagram = { id: 'mainDiagram', kind: 'diagram', name: 'Main', namespace: [], ownerId: 'main', contextElementId: 'main', diagramKind: 'sequence' } as any;
  return repo;
}
const mainOf = (repo: SysmlRepository) => repo.definitions.main as InteractionDefinition;
const codes = (repo: SysmlRepository, constraints: InteractionDefinition['constraints']) => {
  const next = { ...mainOf(repo), constraints };
  return validateInteraction({ ...repo, definitions: { ...repo.definitions, main: next } }, next).map(d => `${d.severity}:${d.code}`);
};

interface Ctx { state: SysmlGatewayState }
function run(ctx: Ctx, command: SysmlEditorCommand): SysmlCommandResult {
  const result = executeSysmlCommand(ctx.state, command);
  if (result.committed) ctx.state = { ...ctx.state, ...result } as SysmlGatewayState;
  return result;
}
function apply(ctx: Ctx, plan: ReturnType<typeof buildAddInteractionConstraintCommand>): SysmlCommandResult {
  if (!plan.ok) throw new Error(`plan failed: ${plan.diagnostics.map(d => d.code).join(',')}`);
  const result = run(ctx, plan.command);
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(result.committed).toBe(true);
  return result;
}

describe('time and duration constraint rules', () => {
  it('accepts a time constraint on one message and a duration between two', () => {
    const repo = model();
    expect(codes(repo, [{ id: 't', kind: 'time', fromMessageId: 'm1', expression: 't < 5s' }, { id: 'd', kind: 'duration', fromMessageId: 'm1', toMessageId: 'm3', expression: '1..3 ms' }])).toEqual([]);
  });

  it('errors on a missing message and warns about an empty expression or a duration without an end', () => {
    const repo = model();
    expect(codes(repo, [{ id: 't', kind: 'time', fromMessageId: 'gone', expression: 'x' }])).toEqual(['error:CONSTRAINT_ANCHOR_MISSING']);
    expect(codes(repo, [{ id: 'd', kind: 'duration', fromMessageId: 'm1', toMessageId: 'gone', expression: 'x' }])).toEqual(['error:CONSTRAINT_ANCHOR_MISSING']);
    expect(codes(repo, [{ id: 't', kind: 'time', fromMessageId: 'm1', expression: ' ' }])).toEqual(['warning:CONSTRAINT_WITHOUT_EXPRESSION']);
    expect(codes(repo, [{ id: 'd', kind: 'duration', fromMessageId: 'm1', expression: 'x' }])).toEqual(['warning:DURATION_WITHOUT_END']);
  });
});

describe('constraint layout', () => {
  it('draws a bracket from the first to the last message, to the right of the lifelines, never over the lifelines', () => {
    const repo = model();
    repo.definitions.main = { ...mainOf(repo), constraints: [{ id: 'd', kind: 'duration', fromMessageId: 'm1', toMessageId: 'm3', expression: '< 10 ms' }] };
    const view = buildSequenceDiagramView(repo, 'mainDiagram');
    const [bracket] = view.constraints;
    expect(bracket).toMatchObject({ id: 'd', kind: 'duration', text: '{< 10 ms}', yFrom: view.messages[0].y, yTo: view.messages[2].y });
    const right = Math.max(...view.lifelines.map(lifeline => lifeline.head.x + lifeline.head.width));
    expect(bracket.x).toBeGreaterThan(right);
    expect(view.canvasSize.width).toBeGreaterThan(bracket.x);
  });

  it('puts overlapping brackets side by side and shows an empty expression as {…}', () => {
    const repo = model();
    repo.definitions.main = {
      ...mainOf(repo),
      constraints: [
        { id: 'c1', kind: 'duration', fromMessageId: 'm1', toMessageId: 'm3', expression: 'a' },
        { id: 'c2', kind: 'duration', fromMessageId: 'm2', toMessageId: 'm3', expression: '' },
        { id: 'c3', kind: 'time', fromMessageId: 'm3', expression: 'late' },
      ],
    };
    const [c1, c2, c3] = buildSequenceDiagramView(repo, 'mainDiagram').constraints;
    expect(c2.x).toBeGreaterThan(c1.x);
    expect(c2.text).toBe('{…}');
    expect(c3.x).toBeGreaterThan(c2.x);
    expect(c3.yFrom).toBe(c3.yTo);
  });

  it('is unchanged for an interaction without constraints', () => {
    expect(buildSequenceDiagramView(model(), 'mainDiagram').constraints).toEqual([]);
  });
});

describe('constraint commands', () => {
  const ctx = (): Ctx => ({ state: createSysmlGatewayState(model()) });

  it('adds a duration, ordering the ends, as one undo step, and keeps it through save and load', () => {
    const c = ctx();
    apply(c, buildAddInteractionConstraintCommand(c.state.repository, { interactionId: 'main', kind: 'duration', fromMessageId: 'm3', toMessageId: 'm1', expression: ' 2 ms ', id: 'c1' }));
    expect(mainOf(c.state.repository).constraints).toEqual([{ id: 'c1', kind: 'duration', fromMessageId: 'm1', toMessageId: 'm3', expression: '2 ms' }]);
    const loaded = loadRepository(serializeRepository(c.state.repository)).repository;
    expect((loaded.definitions.main as InteractionDefinition).constraints).toEqual(mainOf(c.state.repository).constraints);
    expect(mainOf(run(c, { type: 'undo' }).repository).constraints ?? []).toEqual([]);
  });

  it('refuses a missing message, a one-message duration, a same-message duration and a time constraint with an end', () => {
    const repo = ctx().state.repository;
    const code = (input: Parameters<typeof buildAddInteractionConstraintCommand>[1]) => (buildAddInteractionConstraintCommand(repo, input) as { diagnostics: Array<{ code: string }> }).diagnostics?.[0]?.code;
    expect(code({ interactionId: 'main', kind: 'time', fromMessageId: 'x' })).toBe('CONSTRAINT_ANCHOR_MISSING');
    expect(code({ interactionId: 'main', kind: 'duration', fromMessageId: 'm1' })).toBe('CONSTRAINT_ANCHOR_MISSING');
    expect(code({ interactionId: 'main', kind: 'duration', fromMessageId: 'm1', toMessageId: 'm1' })).toBe('DURATION_SAME_MESSAGE');
    expect(code({ interactionId: 'main', kind: 'time', fromMessageId: 'm1', toMessageId: 'm2' })).toBe('TIME_CONSTRAINT_HAS_END');
  });

  it('updates the expression and removes the constraint', () => {
    const c = ctx();
    apply(c, buildAddInteractionConstraintCommand(c.state.repository, { interactionId: 'main', kind: 'time', fromMessageId: 'm2', id: 'c1' }));
    apply(c, buildUpdateInteractionConstraintCommand(c.state.repository, { interactionId: 'main', constraintId: 'c1', expression: 't < 1s' }));
    expect(mainOf(c.state.repository).constraints![0].expression).toBe('t < 1s');
    expect(buildUpdateInteractionConstraintCommand(c.state.repository, { interactionId: 'main', constraintId: 'x', expression: '' })).toMatchObject({ ok: false });
    apply(c, buildRemoveInteractionConstraintCommand(c.state.repository, { interactionId: 'main', constraintId: 'c1' }));
    expect(mainOf(c.state.repository).constraints).toEqual([]);
  });

  it('drops a constraint when a message it marks is deleted, or when a lifeline of that message is deleted', () => {
    const c = ctx();
    apply(c, buildAddInteractionConstraintCommand(c.state.repository, { interactionId: 'main', kind: 'duration', fromMessageId: 'm1', toMessageId: 'm2', id: 'c1' }));
    apply(c, buildAddInteractionConstraintCommand(c.state.repository, { interactionId: 'main', kind: 'time', fromMessageId: 'm3', id: 'c2' }));
    apply(c, buildRemoveInteractionMessageCommand(c.state.repository, { interactionId: 'main', messageId: 'm2' }));
    expect(mainOf(c.state.repository).constraints!.map(constraint => constraint.id)).toEqual(['c2']);
    apply(c, buildRemoveLifelineCommand(c.state.repository, { interactionId: 'main', lifelineId: 'b' }));
    expect(mainOf(c.state.repository).constraints).toEqual([]);
  });
});

describe('execution bars for asynchronous calls', () => {
  it('are off by default and, when on, run until the receiver sends its next message', () => {
    const repo = model();
    repo.definitions.main = { ...mainOf(repo), messages: [msg('m1', 1, 'a', 'b'), msg('m2', 2, 'b', 'a'), msg('m3', 3, 'a', 'b')] };
    expect(buildSequenceDiagramView(repo, 'mainDiagram').activations).toEqual([]);
    const view = buildSequenceDiagramView(repo, 'mainDiagram', undefined, { asyncExecutionBars: true });
    const [first, last] = view.activations;
    expect(view.activations.map(bar => bar.callId)).toEqual(['m1', 'm2', 'm3']);
    // m1 is received by b, which sends m2: the bar spans m1 to m2.
    expect(first.bounds.y).toBe(view.messages[0].y);
    expect(first.bounds.y + first.bounds.height).toBe(view.messages[1].y);
    // m3 has no later message from b, so it gets the short default bar.
    expect(last.bounds.height).toBeGreaterThan(0);
  });
});
describe('nested combined fragments', () => {
  it('encloses messages that already sit in a fragment, in an inner or an outer fragment, and draws them nested', () => {
    const c: Ctx = { state: createSysmlGatewayState(model()) };
    const add = (operator: 'opt' | 'loop', messageIds: string[], id: string) => {
      const plan = buildAddFragmentCommand(c.state.repository, { interactionId: 'main', operator, messageIds, id });
      if (!plan.ok) throw new Error(plan.diagnostics.map(d => d.code).join(','));
      const result = run(c, plan.command);
      expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
      expect(result.committed).toBe(true);
    };
    add('loop', ['m1', 'm2', 'm3'], 'outer');
    add('opt', ['m2'], 'inner');
    const view = buildSequenceDiagramView(c.state.repository, 'mainDiagram');
    const depth = (id: string) => view.fragments.find(fragment => fragment.id === id)!.depth;
    expect(depth('outer')).toBe(0);
    expect(depth('inner')).toBe(1);
    const outer = view.fragments.find(fragment => fragment.id === 'outer')!.bounds;
    const inner = view.fragments.find(fragment => fragment.id === 'inner')!.bounds;
    expect(inner.x).toBeGreaterThan(outer.x);
    expect(inner.y).toBeGreaterThanOrEqual(outer.y);
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
  });
});