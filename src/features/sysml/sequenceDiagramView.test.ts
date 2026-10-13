import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition, type InteractionMessage, type SysmlRepository } from '../../engine/sysml/model';
import {
  ACTIVATION_WIDTH, FIRST_MESSAGE_Y, HEAD_HEIGHT, LIFELINE_SPACING, MESSAGE_SPACING, buildSequenceDiagramView, interactionOfDiagram,
  messageIndexForY, messageSentence, messageY,
} from './sequenceDiagramView';

const DIAGRAM = 'sd';

const msg = (id: string, order: number, sort: InteractionMessage['sort'], from: string, to: string, extra: Partial<InteractionMessage> = {}): InteractionMessage =>
  ({ id, name: '', sort, sourceLifelineId: from, targetLifelineId: to, order, ...extra });

function repoWith(interaction: Partial<InteractionDefinition> = {}): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions.Vehicle = { id: 'Vehicle', kind: 'block', name: 'Vehicle', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: ['start()'], constraints: [] };
  repo.definitions.Ignite = { id: 'Ignite', kind: 'signal', name: 'Ignite', namespace: [], ownerId: 'model' };
  repo.definitions.int = {
    id: 'int', kind: 'interaction', name: 'Start', namespace: [], ownerId: 'model',
    lifelines: [{ id: 'a', name: 'driver' }, { id: 'b', name: 'car', representsId: 'Vehicle' }, { id: 'c', name: '' }],
    messages: [], fragments: [], ...interaction,
  };
  repo.diagrams[DIAGRAM] = { id: DIAGRAM, kind: 'diagram', name: 'Start', namespace: [], ownerId: 'int', contextElementId: 'int', diagramKind: 'sequence' };
  return repo;
}

describe('buildSequenceDiagramView', () => {
  it('is empty for a diagram that has no interaction', () => {
    const repo = createEmptyRepository();
    expect(buildSequenceDiagramView(repo, 'nope')).toMatchObject({ lifelines: [], messages: [], fragments: [], activations: [] });
    expect(interactionOfDiagram(repo, 'nope')).toBeUndefined();
  });

  it('lays lifelines out left to right with readable labels and a type line for a typed lifeline', () => {
    const view = buildSequenceDiagramView(repoWith(), DIAGRAM);
    expect(view.interactionLabel).toBe('Start');
    expect(view.lifelines.map(l => l.label)).toEqual(['driver', 'car', 'Lifeline']);
    expect(view.lifelines.map(l => l.centerX)).toEqual([110, 110 + LIFELINE_SPACING, 110 + 2 * LIFELINE_SPACING]);
    expect(view.lifelines[1]).toMatchObject({ typeLabel: 'Vehicle', representsLabel: 'Vehicle' });
    expect(view.lifelines[0].typeLabel).toBeUndefined();
    expect(view.lifelines[0].head.height).toBe(HEAD_HEIGHT);
    // An unnamed lifeline is labelled by what it represents, with no redundant ": Block".
    const unnamed = buildSequenceDiagramView(repoWith({ lifelines: [{ id: 'x', name: '', representsId: 'Vehicle' }] }), DIAGRAM);
    expect(unnamed.lifelines[0]).toMatchObject({ label: 'Vehicle' });
    expect(unnamed.lifelines[0].typeLabel).toBeUndefined();
  });

  it('orders messages top to bottom by position and numbers them', () => {
    const view = buildSequenceDiagramView(repoWith({
      messages: [msg('late', 5, 'asynchCall', 'b', 'a', { name: 'second' }), msg('early', 2, 'asynchCall', 'a', 'b', { name: 'first' })],
    }), DIAGRAM);
    expect(view.messages.map(m => m.id)).toEqual(['early', 'late']);
    expect(view.messages.map(m => m.y)).toEqual([messageY(0), messageY(1)]);
    expect(view.messages.map(m => m.text)).toEqual(['1: first', '2: second']);
    expect(view.messages[0].points[0].x).toBeLessThan(view.messages[0].points[1].x);
    expect(view.messages[1].points[0].x).toBeGreaterThan(view.messages[1].points[1].x);
  });

  it('uses the notation of each message sort', () => {
    const view = buildSequenceDiagramView(repoWith({
      messages: [
        msg('sync', 1, 'synchCall', 'a', 'b', { signatureId: 'start()', arguments: 'fast' }),
        msg('rep', 2, 'reply', 'b', 'a'),
        msg('async', 3, 'asynchCall', 'a', 'b', { name: 'poke' }),
        msg('sig', 4, 'asynchSignal', 'a', 'c', { signatureId: 'Ignite' }),
        msg('mk', 5, 'createMessage', 'a', 'c'),
        msg('del', 6, 'deleteMessage', 'a', 'b'),
      ],
    }), DIAGRAM);
    const byId = Object.fromEntries(view.messages.map(m => [m.id, m]));
    expect(byId.sync).toMatchObject({ head: 'filled', dashed: false, text: '1: start(fast)' });
    expect(byId.rep).toMatchObject({ head: 'open', dashed: true, text: '2: Reply' });
    expect(byId.async).toMatchObject({ head: 'open', dashed: false });
    expect(byId.sig).toMatchObject({ head: 'open', dashed: false, text: '4: Ignite' });
    expect(byId.mk).toMatchObject({ head: 'open', dashed: true, text: '5: «create»' });
    expect(byId.del).toMatchObject({ head: 'filled', dashed: false, text: '6: «destroy»' });
    for (const m of view.messages) expect(m.text).not.toMatch(/\bsync\b|\bsig\b|\bmk\b|\bdel\b|\brep\b/);
  });

  it('a create message moves the target head down to it and a delete message ends the lifeline with a cross', () => {
    const view = buildSequenceDiagramView(repoWith({
      messages: [msg('first', 1, 'asynchCall', 'a', 'b'), msg('mk', 2, 'createMessage', 'a', 'c'), msg('del', 3, 'deleteMessage', 'a', 'c')],
    }), DIAGRAM);
    const created = view.lifelines[2];
    expect(created.createdAtY).toBe(messageY(1));
    expect(created.head.y).toBe(messageY(1) - HEAD_HEIGHT / 2);
    expect(created.destroyedAtY).toBe(messageY(2));
    expect(created.lineBottom).toBe(messageY(2));
    // The create arrow ends at the head box, not at the lifeline.
    const arrow = view.messages.find(m => m.id === 'mk')!;
    expect(arrow.points[1].x).toBe(created.head.x);
    expect(view.lifelines[0].createdAtY).toBeUndefined();
  });

  it('draws an execution bar from each synchronous call to its reply, nested calls offset to the right', () => {
    const view = buildSequenceDiagramView(repoWith({
      messages: [
        msg('c1', 1, 'synchCall', 'a', 'b'), msg('c2', 2, 'synchCall', 'c', 'b'),
        msg('r2', 3, 'reply', 'b', 'c'), msg('r1', 4, 'reply', 'b', 'a'),
        msg('open', 5, 'synchCall', 'a', 'c'),
      ],
    }), DIAGRAM);
    const bar = (id: string) => view.activations.find(a => a.callId === id)!;
    expect(bar('c1')).toMatchObject({ lifelineId: 'b', replyId: 'r1', depth: 0 });
    expect(bar('c1').bounds.y).toBe(messageY(0));
    expect(bar('c1').bounds.height).toBe(messageY(3) - messageY(0));
    expect(bar('c2')).toMatchObject({ lifelineId: 'b', replyId: 'r2', depth: 1 });
    expect(bar('c2').bounds.x).toBeGreaterThan(bar('c1').bounds.x);
    // A call with no reply gets a short bar.
    expect(bar('open').replyId).toBeUndefined();
    expect(bar('open').bounds.height).toBeGreaterThan(0);
    // The arrow into a busy lifeline stops at the bar edge, not at the dashed line.
    const incoming = view.messages.find(m => m.id === 'c2')!;
    const target = view.lifelines[1];
    expect(incoming.points[1].x).toBeGreaterThan(target.centerX - ACTIVATION_WIDTH);
  });

  it('draws a message to self as a loop on the right of its lifeline', () => {
    const view = buildSequenceDiagramView(repoWith({ messages: [msg('self', 1, 'asynchCall', 'b', 'b', { name: 'tick' })] }), DIAGRAM);
    const self = view.messages[0];
    expect(self.isSelf).toBe(true);
    expect(self.points).toHaveLength(4);
    expect(self.points[1].x).toBeGreaterThan(view.lifelines[1].centerX);
  });

  it('frames the messages of a combined fragment, splits operands and shows guards', () => {
    const view = buildSequenceDiagramView(repoWith({
      messages: [
        msg('m1', 1, 'asynchCall', 'a', 'b'), msg('m2', 2, 'asynchCall', 'b', 'a'),
        msg('m3', 3, 'asynchCall', 'a', 'b'), msg('m4', 4, 'asynchCall', 'a', 'c'),
      ],
      fragments: [
        { id: 'alt', operator: 'alt', operands: [{ guard: 'ok', messageIds: ['m1', 'm2'] }, { guard: 'else', messageIds: ['m3'] }], coveredLifelineIds: ['a', 'b'] },
        { id: 'inner', operator: 'opt', operands: [{ guard: 'x', messageIds: ['m1'] }], coveredLifelineIds: ['a', 'b'] },
      ],
    }), DIAGRAM);
    const alt = view.fragments.find(f => f.id === 'alt')!;
    expect(alt.operator).toBe('alt');
    expect(alt.bounds.y).toBeLessThan(messageY(0));
    expect(alt.bounds.y + alt.bounds.height).toBeGreaterThan(messageY(2));
    expect(alt.bounds.y + alt.bounds.height).toBeLessThan(messageY(3));
    expect(alt.bounds.x).toBeLessThan(view.lifelines[0].centerX);
    expect(alt.bounds.x + alt.bounds.width).toBeGreaterThan(view.lifelines[1].centerX);
    expect(alt.bounds.x + alt.bounds.width).toBeLessThan(view.lifelines[2].centerX);
    expect(alt.operands.map(o => o.guardLabel)).toEqual(['[ok]', '[else]']);
    // The dashed divider sits between the operands' messages.
    expect(alt.operands[1].top).toBeGreaterThan(messageY(1));
    expect(alt.operands[1].top).toBeLessThan(messageY(2));
    expect(alt.depth).toBe(0);
    expect(view.fragments.find(f => f.id === 'inner')!.depth).toBe(1);
    expect(view.messages.find(m => m.id === 'm1')!.fragmentIds.sort()).toEqual(['alt', 'inner']);
    expect(view.messages.find(m => m.id === 'm4')!.fragmentIds).toEqual([]);
  });

  it('still frames a fragment that holds no messages yet, below the last message', () => {
    const view = buildSequenceDiagramView(repoWith({
      messages: [msg('m1', 1, 'asynchCall', 'a', 'b')],
      fragments: [{ id: 'f', operator: 'opt', operands: [{ messageIds: [] }], coveredLifelineIds: ['a'] }],
    }), DIAGRAM);
    expect(view.fragments[0].bounds.y).toBeGreaterThan(messageY(0));
    expect(view.fragments[0].bounds.height).toBeGreaterThan(0);
  });

  it('maps a height to the nearest message slot and describes a message without ids', () => {
    expect(messageIndexForY(FIRST_MESSAGE_Y, 3)).toBe(0);
    expect(messageIndexForY(FIRST_MESSAGE_Y + MESSAGE_SPACING * 1.4, 3)).toBe(1);
    expect(messageIndexForY(10_000, 3)).toBe(2);
    expect(messageIndexForY(-50, 3)).toBe(0);
    expect(messageIndexForY(100, 0)).toBe(0);
    const repo = repoWith({ messages: [msg('call', 1, 'synchCall', 'a', 'b', { signatureId: 'start()' })] });
    expect(messageSentence(repo, 'int', 'call')).toBe('start (driver → car)');
    expect(messageSentence(repo, 'int', 'ghost')).toBe('Message');
  });

  it('grows the canvas with its content', () => {
    const small = buildSequenceDiagramView(repoWith(), DIAGRAM).canvasSize;
    const many = buildSequenceDiagramView(repoWith({
      lifelines: Array.from({ length: 8 }, (_, i) => ({ id: `l${i}`, name: `L${i}` })),
      messages: Array.from({ length: 20 }, (_, i) => msg(`m${i}`, i + 1, 'asynchCall', 'l0', 'l1')),
    }), DIAGRAM).canvasSize;
    expect(many.width).toBeGreaterThan(small.width);
    expect(many.height).toBeGreaterThan(small.height);
  });
});
