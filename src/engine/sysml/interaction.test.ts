import { describe, expect, it } from 'vitest';
import {
  createEmptyRepository, type BlockDefinition, type InteractionDefinition, type InteractionMessage, type SysmlRepository,
} from './model';
import {
  blockOperations, checkInteractionMessage, findInteractionElement, interactionNestedIds, messageLabel, operationMatches, operationName,
  orderedMessages, pairReplies, renamedOperations, validateInteraction,
} from './interaction';
import { validateSysmlRepository } from './validation';
import { findUnresolvedEndpoints } from './interchangeReport';

const block = (id: string, extra: Partial<BlockDefinition> = {}): BlockDefinition => ({
  id, kind: 'block', name: id, namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false,
  properties: [], ports: [], operations: [], constraints: [], ...extra,
});

const msg = (id: string, order: number, sort: InteractionMessage['sort'], from: string, to: string, extra: Partial<InteractionMessage> = {}): InteractionMessage =>
  ({ id, name: id, sort, sourceLifelineId: from, targetLifelineId: to, order, ...extra });

function repoWith(interaction: Partial<InteractionDefinition>, setup?: (repo: SysmlRepository) => void): { repo: SysmlRepository; interaction: InteractionDefinition } {
  const repo = createEmptyRepository();
  repo.definitions.Vehicle = block('Vehicle', { operations: ['start()', 'stop(force: Boolean): Boolean'] });
  repo.definitions.Car = block('Car', { supertypeIds: ['Vehicle'], operations: ['honk()'] });
  repo.definitions.Driver = block('Driver');
  repo.definitions.Ignite = { id: 'Ignite', kind: 'signal', name: 'Ignite', namespace: [], ownerId: 'model' };
  const full: InteractionDefinition = {
    id: 'int', kind: 'interaction', name: 'Start', namespace: [], ownerId: 'model',
    lifelines: [{ id: 'a', name: 'driver', representsId: 'Driver' }, { id: 'b', name: 'car', representsId: 'Car' }, { id: 'c', name: 'plain' }],
    messages: [], fragments: [], ...interaction,
  };
  repo.definitions.int = full;
  setup?.(repo);
  return { repo, interaction: full };
}

const codes = (repo: SysmlRepository, interaction: InteractionDefinition, severity?: 'error' | 'warning') =>
  validateInteraction(repo, interaction).filter(d => !severity || d.severity === severity).map(d => d.code).sort();

describe('interaction helpers', () => {
  it('lists nested ids, finds nested elements and orders messages by position', () => {
    const { repo, interaction } = repoWith({
      messages: [msg('m2', 2, 'asynchCall', 'a', 'b'), msg('m1', 1, 'asynchCall', 'b', 'a')],
      fragments: [{ id: 'f', operator: 'opt', operands: [{ messageIds: ['m1'] }], coveredLifelineIds: ['a', 'b'] }],
    });
    expect(interactionNestedIds(interaction).sort()).toEqual(['a', 'b', 'c', 'f', 'm1', 'm2']);
    expect(findInteractionElement(repo, 'b')).toMatchObject({ elementKind: 'lifeline', name: 'car' });
    expect(findInteractionElement(repo, 'm1')).toMatchObject({ elementKind: 'message' });
    expect(findInteractionElement(repo, 'f')).toMatchObject({ elementKind: 'fragment' });
    expect(findInteractionElement(repo, 'nope')).toBeUndefined();
    expect(orderedMessages(interaction).map(m => m.id)).toEqual(['m1', 'm2']);
  });

  it('labels a message by name, operation or kind, never by id', () => {
    expect(messageLabel({ name: 'ignite', sort: 'asynchSignal' })).toBe('ignite');
    expect(messageLabel({ name: '', sort: 'synchCall', signatureId: 'stop(force: Boolean)' })).toBe('stop');
    expect(messageLabel({ name: '', sort: 'reply' })).toBe('Reply');
    expect(operationName(' start ( ) ')).toBe('start');
    expect(operationMatches(['start()'], 'start')).toBe(true);
    expect(operationMatches(['start()'], 'stop()')).toBe(false);
  });

  it('collects the operations of a Block including inherited ones', () => {
    const { repo } = repoWith({});
    expect(blockOperations(repo, repo.definitions.Car as BlockDefinition).sort()).toEqual(['honk()', 'start()', 'stop(force: Boolean): Boolean']);
  });
});

describe('interaction rules: messages', () => {
  it('requires both message ends to exist and positions to be unique', () => {
    const { repo, interaction } = repoWith({
      messages: [msg('m1', 1, 'asynchCall', 'a', 'ghost'), msg('m2', 2, 'asynchCall', 'a', 'b'), msg('m3', 2, 'asynchCall', 'b', 'a')],
    });
    const errors = codes(repo, interaction, 'error');
    expect(errors).toContain('MESSAGE_ENDPOINT_MISSING');
    expect(errors).toContain('DUPLICATE_MESSAGE_ORDER');
  });

  it('accepts a reply only after a synchronous call between the same pair in reverse', () => {
    const ok = repoWith({ messages: [msg('call', 1, 'synchCall', 'a', 'b'), msg('rep', 2, 'reply', 'b', 'a')] });
    expect(codes(ok.repo, ok.interaction)).toEqual([]);

    const orphan = repoWith({ messages: [msg('rep', 1, 'reply', 'b', 'a')] });
    expect(codes(orphan.repo, orphan.interaction, 'error')).toEqual(['REPLY_WITHOUT_CALL']);

    const wrongDirection = repoWith({ messages: [msg('call', 1, 'synchCall', 'a', 'b'), msg('rep', 2, 'reply', 'a', 'b')] });
    expect(codes(wrongDirection.repo, wrongDirection.interaction, 'error')).toEqual(['REPLY_WITHOUT_CALL']);

    const early = repoWith({ messages: [msg('rep', 1, 'reply', 'b', 'a'), msg('call', 2, 'synchCall', 'a', 'b')] });
    expect(codes(early.repo, early.interaction, 'error')).toEqual(['REPLY_WITHOUT_CALL']);

    const asyncCall = repoWith({ messages: [msg('call', 1, 'asynchCall', 'a', 'b'), msg('rep', 2, 'reply', 'b', 'a')] });
    expect(codes(asyncCall.repo, asyncCall.interaction, 'error')).toEqual(['REPLY_WITHOUT_CALL']);
  });

  it('pairs nested calls last-in-first-out and keeps the pairing', () => {
    const { interaction } = repoWith({
      messages: [
        msg('c1', 1, 'synchCall', 'a', 'b'), msg('c2', 2, 'synchCall', 'b', 'c'),
        msg('r2', 3, 'reply', 'c', 'b'), msg('r1', 4, 'reply', 'b', 'a'),
      ],
    });
    const pairing = pairReplies(interaction);
    expect(pairing.replyOf.get('c1')).toBe('r1');
    expect(pairing.replyOf.get('c2')).toBe('r2');
    expect(pairing.orphanReplyIds).toEqual([]);
  });

  it('a signal message must reference a Signal: none is a warning, a wrong id is an error', () => {
    const none = repoWith({ messages: [msg('s', 1, 'asynchSignal', 'a', 'b')] });
    expect(codes(none.repo, none.interaction, 'warning')).toEqual(['SIGNAL_MESSAGE_WITHOUT_SIGNAL']);
    expect(codes(none.repo, none.interaction, 'error')).toEqual([]);

    const ok = repoWith({ messages: [msg('s', 1, 'asynchSignal', 'a', 'b', { signatureId: 'Ignite' })] });
    expect(codes(ok.repo, ok.interaction)).toEqual([]);

    const notSignal = repoWith({ messages: [msg('s', 1, 'asynchSignal', 'a', 'b', { signatureId: 'Vehicle' })] });
    expect(codes(notSignal.repo, notSignal.interaction, 'error')).toEqual(['MISSING_MESSAGE_SIGNAL']);
    const missing = repoWith({ messages: [msg('s', 1, 'asynchSignal', 'a', 'b', { signatureId: 'ghost' })] });
    expect(codes(missing.repo, missing.interaction, 'error')).toEqual(['MISSING_MESSAGE_SIGNAL']);
  });

  it('a call must name an operation of the receiving lifeline Block, inherited ones included, when the lifeline is typed', () => {
    const inherited = repoWith({ messages: [msg('m', 1, 'asynchCall', 'a', 'b', { signatureId: 'start()' })] });
    expect(codes(inherited.repo, inherited.interaction)).toEqual([]);
    const own = repoWith({ messages: [msg('m', 1, 'asynchCall', 'a', 'b', { signatureId: 'honk' })] });
    expect(codes(own.repo, own.interaction)).toEqual([]);

    const unknown = repoWith({ messages: [msg('m', 1, 'synchCall', 'a', 'b', { signatureId: 'fly()' })] });
    expect(codes(unknown.repo, unknown.interaction, 'error')).toEqual(['UNKNOWN_MESSAGE_OPERATION']);

    // An untyped receiving lifeline cannot be checked.
    const untyped = repoWith({ messages: [msg('m', 1, 'synchCall', 'a', 'c', { signatureId: 'fly()' })] });
    expect(codes(untyped.repo, untyped.interaction)).toEqual([]);

    // A lifeline that represents a part is typed by the part's type.
    const viaPart = repoWith({
      lifelines: [{ id: 'a', name: 'driver' }, { id: 'p', name: 'engine', representsId: 'prop-engine' }],
      messages: [msg('m', 1, 'asynchCall', 'a', 'p', { signatureId: 'fly()' })],
    }, repo => {
      (repo.definitions.Driver as BlockDefinition).properties = [{ id: 'prop-engine', name: 'engine', kind: 'part', typeId: 'Car', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } }];
    });
    expect(codes(viaPart.repo, viaPart.interaction, 'error')).toEqual(['UNKNOWN_MESSAGE_OPERATION']);
  });

  it('nothing may follow a delete message on its lifeline', () => {
    const { repo, interaction } = repoWith({
      messages: [msg('d', 1, 'deleteMessage', 'a', 'b'), msg('after', 2, 'asynchCall', 'a', 'b'), msg('other', 3, 'asynchCall', 'a', 'c')],
    });
    const diagnostics = validateInteraction(repo, interaction).filter(d => d.code === 'MESSAGE_AFTER_DELETE');
    expect(diagnostics.map(d => d.elementId)).toEqual(['after']);
  });

  it('a lifeline must represent an existing Block or part', () => {
    const { repo, interaction } = repoWith({ lifelines: [{ id: 'a', name: 'x', representsId: 'ghost' }, { id: 'b', name: 'y', representsId: 'Signal-not-a-block' }] }, r => {
      r.definitions['Signal-not-a-block'] = { id: 'Signal-not-a-block', kind: 'signal', name: 'S', namespace: [], ownerId: 'model' };
    });
    expect(codes(repo, interaction, 'error')).toEqual(['MISSING_LIFELINE_REPRESENTS', 'MISSING_LIFELINE_REPRESENTS']);
    const dupes = repoWith({ lifelines: [{ id: 'a', name: 'same' }, { id: 'b', name: 'same' }] });
    expect(codes(dupes.repo, dupes.interaction, 'warning')).toEqual(['DUPLICATE_LIFELINE_NAME']);
  });

  it('checkInteractionMessage mirrors the repository rules for the editor', () => {
    const { repo, interaction } = repoWith({ messages: [msg('call', 1, 'synchCall', 'a', 'b')] });
    const base = { sort: 'reply' as const, sourceLifelineId: 'b', targetLifelineId: 'a', order: 2 };
    expect(checkInteractionMessage(repo, interaction, base)).toBeUndefined();
    expect(checkInteractionMessage(repo, interaction, { ...base, targetLifelineId: 'c' })?.code).toBe('REPLY_WITHOUT_CALL');
    expect(checkInteractionMessage(repo, interaction, { ...base, order: 1 })?.code).toBe('DUPLICATE_MESSAGE_ORDER');
    expect(checkInteractionMessage(repo, interaction, { ...base, targetLifelineId: 'ghost' })?.code).toBe('MESSAGE_ENDPOINT_MISSING');
    expect(checkInteractionMessage(repo, interaction, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b', order: 3, signatureId: 'fly' })?.code).toBe('UNKNOWN_MESSAGE_OPERATION');
  });
});

describe('interaction rules: combined fragments', () => {
  const messages = [msg('m1', 1, 'asynchCall', 'a', 'b'), msg('m2', 2, 'asynchCall', 'b', 'a'), msg('m3', 3, 'asynchCall', 'a', 'c')];

  it('operands only hold existing messages between covered lifelines', () => {
    const ok = repoWith({ messages, fragments: [{ id: 'f', operator: 'opt', operands: [{ guard: 'ready', messageIds: ['m1', 'm2'] }], coveredLifelineIds: ['a', 'b'] }] });
    expect(codes(ok.repo, ok.interaction)).toEqual([]);

    const uncovered = repoWith({ messages, fragments: [{ id: 'f', operator: 'opt', operands: [{ messageIds: ['m3'] }], coveredLifelineIds: ['a', 'b'] }] });
    expect(codes(uncovered.repo, uncovered.interaction, 'error')).toEqual(['FRAGMENT_MESSAGE_NOT_COVERED']);

    const ghostMessage = repoWith({ messages, fragments: [{ id: 'f', operator: 'opt', operands: [{ messageIds: ['ghost'] }], coveredLifelineIds: ['a'] }] });
    expect(codes(ghostMessage.repo, ghostMessage.interaction, 'error')).toEqual(['FRAGMENT_MESSAGE_MISSING']);

    const ghostLifeline = repoWith({ messages, fragments: [{ id: 'f', operator: 'opt', operands: [{ messageIds: [] }], coveredLifelineIds: ['ghost'] }] });
    expect(codes(ghostLifeline.repo, ghostLifeline.interaction, 'error')).toEqual(['FRAGMENT_LIFELINE_MISSING']);
  });

  it('a message is in at most one operand of the same fragment, but may be in nested fragments', () => {
    const twice = repoWith({ messages, fragments: [{ id: 'f', operator: 'alt', operands: [{ guard: 'x', messageIds: ['m1'] }, { guard: 'else', messageIds: ['m1'] }], coveredLifelineIds: ['a', 'b'] }] });
    expect(codes(twice.repo, twice.interaction, 'error')).toEqual(['MESSAGE_IN_MULTIPLE_OPERANDS']);

    const nested = repoWith({
      messages,
      fragments: [
        { id: 'outer', operator: 'loop', operands: [{ messageIds: ['m1', 'm2'] }], coveredLifelineIds: ['a', 'b'] },
        { id: 'inner', operator: 'opt', operands: [{ guard: 'g', messageIds: ['m1'] }], coveredLifelineIds: ['a', 'b'] },
      ],
    });
    expect(codes(nested.repo, nested.interaction)).toEqual([]);
  });

  it('operand counts: single-operand operators are errors with more, alt without a second operand or guard warns', () => {
    const many = repoWith({ messages, fragments: [{ id: 'f', operator: 'loop', operands: [{ messageIds: ['m1'] }, { messageIds: ['m2'] }], coveredLifelineIds: ['a', 'b'] }] });
    expect(codes(many.repo, many.interaction, 'error')).toEqual(['FRAGMENT_OPERAND_COUNT']);

    const lonelyAlt = repoWith({ messages, fragments: [{ id: 'f', operator: 'alt', operands: [{ messageIds: ['m1'] }], coveredLifelineIds: ['a', 'b'] }] });
    expect(codes(lonelyAlt.repo, lonelyAlt.interaction, 'warning')).toEqual(['ALT_NEEDS_OPERANDS']);

    const unguarded = repoWith({ messages, fragments: [{ id: 'f', operator: 'alt', operands: [{ messageIds: ['m1'] }, { guard: 'else', messageIds: ['m2'] }], coveredLifelineIds: ['a', 'b'] }] });
    expect(codes(unguarded.repo, unguarded.interaction, 'warning')).toEqual(['ALT_OPERAND_MISSING_GUARD']);
    expect(codes(unguarded.repo, unguarded.interaction, 'error')).toEqual([]);

    const par = repoWith({ messages, fragments: [{ id: 'f', operator: 'par', operands: [{ messageIds: ['m1'] }, { messageIds: ['m2'] }], coveredLifelineIds: ['a', 'b'] }] });
    expect(codes(par.repo, par.interaction)).toEqual([]);
  });
});

describe('interaction in the repository', () => {
  it('is validated with the repository, and its nested ids count towards global uniqueness', () => {
    const { repo } = repoWith({ messages: [msg('rep', 1, 'reply', 'b', 'a')] });
    expect(validateSysmlRepository(repo).diagnostics.map(d => d.code)).toContain('REPLY_WITHOUT_CALL');

    const clash = repoWith({ lifelines: [{ id: 'Vehicle', name: 'x' }] });
    expect(validateSysmlRepository(clash.repo).diagnostics.map(d => d.code)).toContain('DUPLICATE_ELEMENT_ID');
  });

  it('lets relationships end on lifelines and messages without being reported unresolved', () => {
    const { repo } = repoWith({ messages: [msg('m', 1, 'asynchCall', 'a', 'b')] });
    repo.relationships.alloc = { id: 'alloc', kind: 'allocation', sourceId: 'm', targetId: 'Car' };
    repo.relationships.trace = { id: 'trace', kind: 'dependency', sourceId: 'a', targetId: 'Car' };
    expect(findUnresolvedEndpoints(repo)).toEqual([]);
  });
});

describe('renamedOperations', () => {
  it('pairs a real rename', () => {
    expect([...renamedOperations(['start()'], ['go()'])]).toEqual([['start()', 'go()']]);
  });

  it('never treats a rename to or from blank text as a rename', () => {
    expect(renamedOperations(['start()'], ['']).size).toBe(0);
    expect(renamedOperations([''], ['g']).size).toBe(0);
    expect(renamedOperations(['start()'], ['  ']).size).toBe(0);
  });
});