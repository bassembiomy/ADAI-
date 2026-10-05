import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition, type ModelDiagramDefinition, type SysmlRepository } from '../engine/sysml/model';
import {
  buildCanonicalSysmlProjectPayload,
  computeImpactHash,
  createSysmlGatewayState,
  executeSysmlCommand,
  loadCanonicalSysmlProject,
  type SysmlCommandResult,
  type SysmlEditorCommand,
  type SysmlGatewayState,
} from './sysmlCommandGateway';
import { openExactDiagram } from './sysmlDiagramNavigation';
import { serializeRepository, loadRepository } from '../engine/sysml/persistence';
import { validateSysmlRepository } from '../engine/sysml/validation';
import { migrateV3ToV4 } from '../engine/sysml/persistence/migrateV3ToV4';
import { createDiagramDefinition, createInteraction } from '../features/modelExplorer/adapters/modelExplorerFactories';
import { createSysmlExplorerAdapter } from '../features/modelExplorer/adapters/sysmlExplorerAdapter';
import { createModelExplorerCommandBus } from '../features/modelExplorer/modelExplorerCommandBus';
import { allowedDiagramKinds } from '../features/modelExplorer/modelExplorerCapabilities';
import { buildSequenceDiagramView } from '../features/sysml/sequenceDiagramView';
import { buildCreateAllocationCommand } from './sysmlAllocationCommands';
import { orderedMessages } from '../engine/sysml/interaction';
import {
  buildAddFragmentCommand,
  buildAddFragmentOperandCommand,
  buildAddInteractionMessageCommand,
  buildAddLifelineCommand,
  buildMoveInteractionMessageCommand,
  buildMoveLifelineCommand,
  buildRemoveFragmentCommand,
  buildRemoveFragmentOperandCommand,
  buildRemoveInteractionMessageCommand,
  buildRemoveLifelineCommand,
  buildRenameInteractionElementCommand,
  buildSetFragmentOperatorCommand,
  buildSetLifelineRepresentsCommand,
  buildSetOperandGuardCommand,
  buildSetOperandMessagesCommand,
  buildUpdateInteractionMessageCommand,
  type InteractionCommandPlan,
} from './sysmlInteractionCommands';

const DIAGRAM = 'sd-diagram';
const INTERACTION = 'int1';

interface Ctx { state: SysmlGatewayState }

function run(ctx: Ctx, command: SysmlEditorCommand): SysmlCommandResult {
  const result = executeSysmlCommand(ctx.state, command);
  if (result.committed) ctx.state = { ...ctx.state, ...result } as SysmlGatewayState;
  return result;
}

function apply(ctx: Ctx, plan: InteractionCommandPlan): SysmlCommandResult {
  if (!plan.ok) throw new Error(`plan failed: ${plan.diagnostics.map(d => d.code).join(',')}`);
  const result = run(ctx, plan.command);
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(result.committed).toBe(true);
  return result;
}

const interaction = (ctx: Ctx): InteractionDefinition => ctx.state.repository.definitions[INTERACTION] as InteractionDefinition;
const refusal = (plan: InteractionCommandPlan) => (plan.ok ? 'ok' : plan.diagnostics[0].code);

function setup(extra?: (repo: SysmlRepository) => void): Ctx {
  const repo = createEmptyRepository();
  repo.definitions.Vehicle = { id: 'Vehicle', kind: 'block', name: 'Vehicle', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: ['start()', 'stop()'], constraints: [] };
  repo.definitions.Driver = { id: 'Driver', kind: 'block', name: 'Driver', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
  repo.definitions.Ignite = { id: 'Ignite', kind: 'signal', name: 'Ignite', namespace: [], ownerId: 'model' };
  extra?.(repo);
  const ctx: Ctx = { state: createSysmlGatewayState(repo) };
  expect(run(ctx, { type: 'createElement', element: createInteraction({ id: INTERACTION, name: 'Start', ownerId: 'model' }) }).committed).toBe(true);
  const diagram: ModelDiagramDefinition = createDiagramDefinition({ id: DIAGRAM, name: 'Start', ownerId: INTERACTION, diagramKind: 'sequence' });
  expect(run(ctx, { type: 'createDiagram', diagram }).committed).toBe(true);
  return ctx;
}

/** Lifelines a (Driver), b (Vehicle) and c (untyped). */
function withLifelines(ctx: Ctx) {
  apply(ctx, buildAddLifelineCommand(ctx.state.repository, { interactionId: INTERACTION, name: 'driver', representsId: 'Driver', id: 'a' }));
  apply(ctx, buildAddLifelineCommand(ctx.state.repository, { interactionId: INTERACTION, name: 'car', representsId: 'Vehicle', id: 'b' }));
  apply(ctx, buildAddLifelineCommand(ctx.state.repository, { interactionId: INTERACTION, name: 'log', id: 'c' }));
}

const addMessage = (ctx: Ctx, input: Omit<Parameters<typeof buildAddInteractionMessageCommand>[1], 'interactionId'>) =>
  apply(ctx, buildAddInteractionMessageCommand(ctx.state.repository, { interactionId: INTERACTION, ...input }));

const orderOf = (ctx: Ctx) => orderedMessages(interaction(ctx)).map(message => message.id);

describe('Interaction as a definition kind', () => {
  it('is created under the Model, a Package and a Block, and refused under a Requirement or an Interaction', () => {
    const ctx = setup(repo => {
      repo.packages.pkg = { id: 'pkg', kind: 'package', name: 'Pkg', namespace: [], ownerId: 'model' };
      repo.requirements.req = { id: 'req', kind: 'requirement', name: 'R', namespace: [], ownerId: 'model', requirementId: 'R1', text: 't', status: 'draft', version: '1' };
    });
    const bus = createModelExplorerCommandBus(createSysmlExplorerAdapter({ getState: () => ctx.state, executeCommand: command => run(ctx, command) }));
    for (const ownerId of ['model', 'pkg', 'Vehicle']) {
      const result = bus.dispatch({ type: 'createElement', ownerId, elementKind: 'Interaction', name: `From ${ownerId}` });
      expect(result.committed, `${ownerId}: ${JSON.stringify(result.diagnostics)}`).toBe(true);
    }
    const denied = bus.dispatch({ type: 'createElement', ownerId: 'req', elementKind: 'Interaction', name: 'Nope' });
    expect(denied.committed).toBe(false);
    expect(denied.diagnostics[0].code).toBe('ILLEGAL_OWNERSHIP');
    const nested = bus.dispatch({ type: 'createElement', ownerId: INTERACTION, elementKind: 'Interaction', name: 'Nope' });
    expect(nested.committed).toBe(false);
    const owned = Object.values(ctx.state.repository.definitions).filter(def => def.kind === 'interaction');
    expect(owned.map(def => def.ownerId).sort()).toEqual(['Vehicle', 'model', 'model', 'pkg']);
    // A Block-owned Interaction is qualified by its owner, like an Activity.
    expect(owned.find(def => def.ownerId === 'Vehicle')?.namespace).toEqual(['Vehicle']);
  });

  it('offers Interaction in the explorer capabilities of Model, Package and Block, and Sequence Diagram only on an Interaction', () => {
    const ctx = setup(repo => {
      repo.packages.pkg = { id: 'pkg', kind: 'package', name: 'Pkg', namespace: [], ownerId: 'model' };
    });
    const adapter = createSysmlExplorerAdapter({ getState: () => ctx.state, executeCommand: command => run(ctx, command) });
    for (const owner of ['model', 'pkg', 'Vehicle']) {
      expect(adapter.capabilities([owner]).some(cap => cap.id === 'create:Interaction' && cap.enabled), owner).toBe(true);
    }
    // A Package cannot own a sequence diagram directly; a Block can ask for one
    // (it creates the Interaction and the diagram together, see the next test).
    for (const owner of ['model', 'pkg']) {
      expect(adapter.capabilities([owner]).some(cap => cap.id === 'createDiagram:sequence'), owner).toBe(false);
    }
    expect(adapter.capabilities(['Vehicle']).some(cap => cap.id === 'createDiagram:sequence' && cap.enabled)).toBe(true);
    const onInteraction = adapter.capabilities([INTERACTION]);
    expect(onInteraction.filter(cap => cap.kind === 'createDiagram').map(cap => cap.elementKind)).toEqual(['sequence']);
    expect(onInteraction.find(cap => cap.id === 'createDiagram:sequence')?.label).toBe('Sequence Diagram');
    expect(allowedDiagramKinds({ id: 'x', name: 'x', metaclass: 'Interaction', namespace: [], ownerId: null })).toEqual(['sequence']);
    expect(allowedDiagramKinds({ id: 'x', name: 'x', metaclass: 'Package', namespace: [], ownerId: null })).not.toContain('sequence');
  });

  it('createDiagram requires an Interaction owner and names the diagram readably', () => {
    const ctx = setup(repo => {
      repo.packages.pkg = { id: 'pkg', kind: 'package', name: 'Pkg', namespace: [], ownerId: 'model' };
    });
    expect(createDiagramDefinition({ ownerId: INTERACTION, diagramKind: 'sequence' }).name).toBe('SequenceDiagram');
    for (const ownerId of ['model', 'pkg', 'Vehicle']) {
      const bad = executeSysmlCommand(ctx.state, { type: 'createDiagram', diagram: createDiagramDefinition({ ownerId, diagramKind: 'sequence' }) });
      expect(bad.committed, ownerId).toBe(false);
      expect(bad.diagnostics[0].code).toBe('INVALID_DIAGRAM_OWNER');
    }
    expect(ctx.state.repository.diagrams[DIAGRAM]).toMatchObject({ diagramKind: 'sequence', ownerId: INTERACTION, contextElementId: INTERACTION });
  });

  it('creating a Sequence Diagram on a Block makes an Interaction owned by it plus the diagram, in one step', () => {
    const ctx = setup(repo => {
      (repo.definitions.Vehicle as any).properties = [
        { id: 'drv', name: 'driver', kind: 'part', typeId: 'Driver', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
      ];
    });
    const before = Object.keys(ctx.state.repository.diagrams).length;
    const bus = createModelExplorerCommandBus(createSysmlExplorerAdapter({ getState: () => ctx.state, executeCommand: command => run(ctx, command) }));
    const result = bus.dispatch({ type: 'createDiagram', ownerId: 'Vehicle', diagramKind: 'sequence' });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    const created = Object.values(ctx.state.repository.diagrams).filter(diagram => diagram.diagramKind === 'sequence' && diagram.id !== DIAGRAM);
    expect(Object.keys(ctx.state.repository.diagrams).length).toBe(before + 1);
    expect(created).toHaveLength(1);
    const owner = ctx.state.repository.definitions[created[0].ownerId ?? ''] as InteractionDefinition;
    expect(owner).toMatchObject({ kind: 'interaction', ownerId: 'Vehicle' });
    expect(owner.lifelines.map(lifeline => lifeline.representsId)).toEqual(['drv']);
    // The new diagram is what the tree selects and opens.
    expect(result.selectedIds).toEqual([created[0].id]);
  });

  it('opening the diagram by id reports the sequence kind for the workspace to mount', () => {
    const ctx = setup();
    const nav = openExactDiagram({ activeDiagramId: 'x', diagramKind: 'bdd', returnStack: [] }, ctx.state.repository, DIAGRAM);
    expect(nav).toMatchObject({ activeDiagramId: DIAGRAM, diagramKind: 'sequence' });
  });

  it('shows every lifeline and message itself, so elements are not added one by one', () => {
    const ctx = setup();
    withLifelines(ctx);
    const refused = run(ctx, { type: 'addToDiagram', diagramId: DIAGRAM, elementIds: ['a'] });
    expect(refused.committed).toBe(false);
    expect(refused.diagnostics[0].code).toBe('INVALID_DIAGRAM_ELEMENT');
  });

  it('maps to the V4 Interaction metaclass', () => {
    const ctx = setup();
    withLifelines(ctx);
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b', id: 'm1' });
    const v4 = migrateV3ToV4(ctx.state.repository);
    expect(v4.elements[INTERACTION]).toMatchObject({ metaclass: 'Interaction', lifelineIds: ['a', 'b', 'c'], messageIds: ['m1'], fragmentIds: [] });
  });
});

describe('lifelines', () => {
  it('adds, renames, retargets and moves lifelines, each one command', () => {
    const ctx = setup();
    withLifelines(ctx);
    apply(ctx, buildRenameInteractionElementCommand(ctx.state.repository, { interactionId: INTERACTION, elementId: 'c', name: 'logger' }));
    apply(ctx, buildSetLifelineRepresentsCommand(ctx.state.repository, { interactionId: INTERACTION, lifelineId: 'c', representsId: 'Driver' }));
    expect(interaction(ctx).lifelines.find(l => l.id === 'c')).toMatchObject({ name: 'logger', representsId: 'Driver' });
    apply(ctx, buildSetLifelineRepresentsCommand(ctx.state.repository, { interactionId: INTERACTION, lifelineId: 'c' }));
    expect(interaction(ctx).lifelines.find(l => l.id === 'c')).not.toHaveProperty('representsId');

    apply(ctx, buildMoveLifelineCommand(ctx.state.repository, { interactionId: INTERACTION, lifelineId: 'c', direction: -1 }));
    expect(interaction(ctx).lifelines.map(l => l.id)).toEqual(['a', 'c', 'b']);
    expect(refusal(buildMoveLifelineCommand(ctx.state.repository, { interactionId: INTERACTION, lifelineId: 'a', direction: -1 }))).toBe('LIFELINE_AT_EDGE');
    expect(refusal(buildSetLifelineRepresentsCommand(ctx.state.repository, { interactionId: INTERACTION, lifelineId: 'a', representsId: 'ghost' }))).toBe('MISSING_LIFELINE_REPRESENTS');
    expect(refusal(buildAddLifelineCommand(ctx.state.repository, { interactionId: 'nope' }))).toBe('INTERACTION_NOT_FOUND');
  });

  it('names new lifelines uniquely and removing one takes its messages, replies and fragment ties with it', () => {
    const ctx = setup();
    apply(ctx, buildAddLifelineCommand(ctx.state.repository, { interactionId: INTERACTION }));
    apply(ctx, buildAddLifelineCommand(ctx.state.repository, { interactionId: INTERACTION }));
    expect(interaction(ctx).lifelines.map(l => l.name)).toEqual(['Lifeline', 'Lifeline2']);

    const fresh = setup();
    withLifelines(fresh);
    addMessage(fresh, { sort: 'synchCall', sourceLifelineId: 'a', targetLifelineId: 'b', id: 'call', withReply: true, replyId: 'rep' });
    addMessage(fresh, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'c', id: 'keep' });
    apply(fresh, buildAddFragmentCommand(fresh.state.repository, { interactionId: INTERACTION, operator: 'opt', messageIds: ['call', 'rep'], id: 'f' }));
    apply(fresh, buildRemoveLifelineCommand(fresh.state.repository, { interactionId: INTERACTION, lifelineId: 'b' }));
    expect(interaction(fresh).lifelines.map(l => l.id)).toEqual(['a', 'c']);
    expect(orderOf(fresh)).toEqual(['keep']);
    expect(interaction(fresh).messages[0].order).toBe(1);
    expect(interaction(fresh).fragments[0]).toMatchObject({ coveredLifelineIds: ['a'], operands: [{ messageIds: [] }] });
  });
});

describe('messages', () => {
  it('adds messages in order, inserts at a position and keeps positions 1..n', () => {
    const ctx = setup();
    withLifelines(ctx);
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b', id: 'm1', name: 'first' });
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'b', targetLifelineId: 'c', id: 'm3', name: 'third' });
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'c', id: 'm2', name: 'second', atIndex: 1 });
    expect(orderOf(ctx)).toEqual(['m1', 'm2', 'm3']);
    expect(orderedMessages(interaction(ctx)).map(m => m.order)).toEqual([1, 2, 3]);
  });

  it('adds a synchronous call with its reply as one command and one undo step', () => {
    const ctx = setup();
    withLifelines(ctx);
    const before = ctx.state.repository.revision;
    addMessage(ctx, { sort: 'synchCall', sourceLifelineId: 'a', targetLifelineId: 'b', id: 'call', signatureId: 'start()', withReply: true, replyId: 'rep' });
    expect(orderOf(ctx)).toEqual(['call', 'rep']);
    expect(interaction(ctx).messages.find(m => m.id === 'rep')).toMatchObject({ sort: 'reply', sourceLifelineId: 'b', targetLifelineId: 'a' });
    const undone = executeSysmlCommand(ctx.state, { type: 'undo' });
    expect((undone.repository.definitions[INTERACTION] as InteractionDefinition).messages).toEqual([]);
    expect(undone.repository.revision).toBeGreaterThanOrEqual(before);
  });

  it('refuses a reply with no call, an unknown signal and an unknown operation before reaching the gateway', () => {
    const ctx = setup();
    withLifelines(ctx);
    const repo = ctx.state.repository;
    expect(refusal(buildAddInteractionMessageCommand(repo, { interactionId: INTERACTION, sort: 'reply', sourceLifelineId: 'b', targetLifelineId: 'a' }))).toBe('REPLY_WITHOUT_CALL');
    expect(refusal(buildAddInteractionMessageCommand(repo, { interactionId: INTERACTION, sort: 'asynchSignal', sourceLifelineId: 'a', targetLifelineId: 'b', signatureId: 'ghost' }))).toBe('MISSING_MESSAGE_SIGNAL');
    expect(refusal(buildAddInteractionMessageCommand(repo, { interactionId: INTERACTION, sort: 'synchCall', sourceLifelineId: 'a', targetLifelineId: 'b', signatureId: 'fly()' }))).toBe('UNKNOWN_MESSAGE_OPERATION');
    expect(refusal(buildAddInteractionMessageCommand(repo, { interactionId: INTERACTION, sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'ghost' }))).toBe('MESSAGE_ENDPOINT_MISSING');
    expect(refusal(buildAddInteractionMessageCommand(repo, { interactionId: INTERACTION, sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'c', signatureId: 'anything()' }))).toBe('ok');
  });

  it('nothing can follow a delete message on its lifeline, but a message before it is fine', () => {
    const ctx = setup();
    withLifelines(ctx);
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b', id: 'm1' });
    addMessage(ctx, { sort: 'deleteMessage', sourceLifelineId: 'a', targetLifelineId: 'b', id: 'del' });
    expect(refusal(buildAddInteractionMessageCommand(ctx.state.repository, { interactionId: INTERACTION, sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b' }))).toBe('MESSAGE_AFTER_DELETE');
    expect(refusal(buildAddInteractionMessageCommand(ctx.state.repository, { interactionId: INTERACTION, sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'c' }))).toBe('ok');
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'b', targetLifelineId: 'a', atIndex: 1, id: 'before' });
    expect(orderOf(ctx)).toEqual(['m1', 'before', 'del']);
  });

  it('updates name, kind, operation, signal and arguments, with the same checks', () => {
    const ctx = setup();
    withLifelines(ctx);
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b', id: 'm1' });
    apply(ctx, buildUpdateInteractionMessageCommand(ctx.state.repository, { interactionId: INTERACTION, messageId: 'm1', signatureId: 'stop()', arguments: ' now ', name: 'halt' }));
    expect(interaction(ctx).messages[0]).toMatchObject({ signatureId: 'stop()', arguments: 'now', name: 'halt' });
    expect(refusal(buildUpdateInteractionMessageCommand(ctx.state.repository, { interactionId: INTERACTION, messageId: 'm1', signatureId: 'fly()' }))).toBe('UNKNOWN_MESSAGE_OPERATION');
    expect(refusal(buildUpdateInteractionMessageCommand(ctx.state.repository, { interactionId: INTERACTION, messageId: 'm1', sort: 'reply' }))).toBe('REPLY_WITHOUT_CALL');
    apply(ctx, buildUpdateInteractionMessageCommand(ctx.state.repository, { interactionId: INTERACTION, messageId: 'm1', sort: 'asynchSignal', signatureId: 'Ignite', arguments: null }));
    expect(interaction(ctx).messages[0]).toMatchObject({ sort: 'asynchSignal', signatureId: 'Ignite' });
    expect(interaction(ctx).messages[0]).not.toHaveProperty('arguments');
    apply(ctx, buildUpdateInteractionMessageCommand(ctx.state.repository, { interactionId: INTERACTION, messageId: 'm1', signatureId: null }));
    expect(interaction(ctx).messages[0]).not.toHaveProperty('signatureId');
  });

  it('reorders by dragging: the order changes and stays contiguous, and a reply cannot jump above its call', () => {
    const ctx = setup();
    withLifelines(ctx);
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b', id: 'm1' });
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'c', id: 'm2' });
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'b', targetLifelineId: 'c', id: 'm3' });
    apply(ctx, buildMoveInteractionMessageCommand(ctx.state.repository, { interactionId: INTERACTION, messageId: 'm3', toIndex: 0 }));
    expect(orderOf(ctx)).toEqual(['m3', 'm1', 'm2']);
    expect(orderedMessages(interaction(ctx)).map(m => m.order)).toEqual([1, 2, 3]);
    expect(refusal(buildMoveInteractionMessageCommand(ctx.state.repository, { interactionId: INTERACTION, messageId: 'm3', toIndex: 0 }))).toBe('MESSAGE_NOT_MOVED');
    expect(refusal(buildMoveInteractionMessageCommand(ctx.state.repository, { interactionId: INTERACTION, messageId: 'ghost', toIndex: 0 }))).toBe('MESSAGE_NOT_FOUND');

    addMessage(ctx, { sort: 'synchCall', sourceLifelineId: 'a', targetLifelineId: 'b', id: 'call', withReply: true, replyId: 'rep' });
    expect(refusal(buildMoveInteractionMessageCommand(ctx.state.repository, { interactionId: INTERACTION, messageId: 'rep', toIndex: 0 }))).toBe('REPLY_WITHOUT_CALL');
    // Undo restores the previous order in one step.
    const undone = executeSysmlCommand(ctx.state, { type: 'undo' });
    expect(orderedMessages(undone.repository.definitions[INTERACTION] as InteractionDefinition).map(m => m.id)).toEqual(['m3', 'm1', 'm2']);
  });

  it('removing a call removes its reply, renumbers, and drops the ids from fragments', () => {
    const ctx = setup();
    withLifelines(ctx);
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'c', id: 'm0' });
    addMessage(ctx, { sort: 'synchCall', sourceLifelineId: 'a', targetLifelineId: 'b', id: 'call', withReply: true, replyId: 'rep' });
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'c', id: 'm9' });
    apply(ctx, buildAddFragmentCommand(ctx.state.repository, { interactionId: INTERACTION, operator: 'opt', messageIds: ['call', 'rep'], id: 'f' }));
    apply(ctx, buildRemoveInteractionMessageCommand(ctx.state.repository, { interactionId: INTERACTION, messageId: 'call' }));
    expect(orderOf(ctx)).toEqual(['m0', 'm9']);
    expect(orderedMessages(interaction(ctx)).map(m => m.order)).toEqual([1, 2]);
    expect(interaction(ctx).fragments[0].operands[0].messageIds).toEqual([]);
    expect(refusal(buildRemoveInteractionMessageCommand(ctx.state.repository, { interactionId: INTERACTION, messageId: 'call' }))).toBe('MESSAGE_NOT_FOUND');
  });

  it('refuses to delete a message that is the end of a relationship', () => {
    const ctx = setup();
    withLifelines(ctx);
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b', id: 'm1' });
    expect(run(ctx, buildCreateAllocationCommand(ctx.state.repository, 'm1', 'Vehicle')).committed).toBe(true);
    expect(refusal(buildRemoveInteractionMessageCommand(ctx.state.repository, { interactionId: INTERACTION, messageId: 'm1' }))).toBe('INTERACTION_ELEMENT_HAS_RELATIONSHIPS');
    expect(refusal(buildRemoveLifelineCommand(ctx.state.repository, { interactionId: INTERACTION, lifelineId: 'a' }))).toBe('INTERACTION_ELEMENT_HAS_RELATIONSHIPS');
  });
});

describe('combined fragments', () => {
  function drawn(): Ctx {
    const ctx = setup();
    withLifelines(ctx);
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b', id: 'm1' });
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'b', targetLifelineId: 'a', id: 'm2' });
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'c', id: 'm3' });
    return ctx;
  }

  it('encloses messages, derives the covered lifelines and gives alt an else operand', () => {
    const ctx = drawn();
    apply(ctx, buildAddFragmentCommand(ctx.state.repository, { interactionId: INTERACTION, operator: 'alt', messageIds: ['m1', 'm2'], guard: 'ok', id: 'f' }));
    expect(interaction(ctx).fragments[0]).toEqual({
      id: 'f', operator: 'alt',
      operands: [{ guard: 'ok', messageIds: ['m1', 'm2'] }, { guard: 'else', messageIds: [] }],
      coveredLifelineIds: ['a', 'b'],
    });
    expect(refusal(buildAddFragmentCommand(ctx.state.repository, { interactionId: INTERACTION, operator: 'opt', messageIds: [] }))).toBe('FRAGMENT_NEEDS_MESSAGES');
  });

  it('edits the operator, operands, guards and messages of a fragment', () => {
    const ctx = drawn();
    apply(ctx, buildAddFragmentCommand(ctx.state.repository, { interactionId: INTERACTION, operator: 'par', messageIds: ['m1'], id: 'f' }));
    apply(ctx, buildAddFragmentOperandCommand(ctx.state.repository, { interactionId: INTERACTION, fragmentId: 'f', messageIds: ['m3'], guard: 'branch' }));
    expect(interaction(ctx).fragments[0].operands).toEqual([{ messageIds: ['m1'] }, { guard: 'branch', messageIds: ['m3'] }]);
    expect(interaction(ctx).fragments[0].coveredLifelineIds.sort()).toEqual(['a', 'b', 'c']);

    apply(ctx, buildSetOperandGuardCommand(ctx.state.repository, { interactionId: INTERACTION, fragmentId: 'f', operandIndex: 0, guard: ' first ' }));
    apply(ctx, buildSetOperandGuardCommand(ctx.state.repository, { interactionId: INTERACTION, fragmentId: 'f', operandIndex: 1, guard: '' }));
    expect(interaction(ctx).fragments[0].operands).toEqual([{ guard: 'first', messageIds: ['m1'] }, { messageIds: ['m3'] }]);

    // Moving a message into another operand removes it from the first.
    apply(ctx, buildSetOperandMessagesCommand(ctx.state.repository, { interactionId: INTERACTION, fragmentId: 'f', operandIndex: 1, messageIds: ['m3', 'm1'] }));
    expect(interaction(ctx).fragments[0].operands.map(o => o.messageIds)).toEqual([[], ['m3', 'm1']]);

    apply(ctx, buildSetFragmentOperatorCommand(ctx.state.repository, { interactionId: INTERACTION, fragmentId: 'f', operator: 'seq' }));
    expect(interaction(ctx).fragments[0].operator).toBe('seq');
    apply(ctx, buildRemoveFragmentOperandCommand(ctx.state.repository, { interactionId: INTERACTION, fragmentId: 'f', operandIndex: 0 }));
    expect(refusal(buildRemoveFragmentOperandCommand(ctx.state.repository, { interactionId: INTERACTION, fragmentId: 'f', operandIndex: 0 }))).toBe('LAST_OPERAND');
    apply(ctx, buildRemoveFragmentCommand(ctx.state.repository, { interactionId: INTERACTION, fragmentId: 'f' }));
    expect(interaction(ctx).fragments).toEqual([]);
  });

  it('refuses a second operand on a single-operand operator', () => {
    const ctx = drawn();
    apply(ctx, buildAddFragmentCommand(ctx.state.repository, { interactionId: INTERACTION, operator: 'loop', messageIds: ['m1'], id: 'f' }));
    expect(refusal(buildAddFragmentOperandCommand(ctx.state.repository, { interactionId: INTERACTION, fragmentId: 'f' }))).toBe('FRAGMENT_OPERAND_COUNT');
    expect(refusal(buildSetFragmentOperatorCommand(ctx.state.repository, { interactionId: INTERACTION, fragmentId: 'ghost', operator: 'opt' }))).toBe('FRAGMENT_NOT_FOUND');
  });
});

describe('deletion and persistence', () => {
  it('deleting the Interaction removes its diagram and the relationships on its lifelines and messages', () => {
    const ctx = setup();
    withLifelines(ctx);
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b', id: 'm1' });
    expect(run(ctx, buildCreateAllocationCommand(ctx.state.repository, 'm1', 'Vehicle')).committed).toBe(true);
    expect(Object.values(ctx.state.repository.relationships).filter(rel => rel.kind === 'allocation')).toHaveLength(1);
    const first = executeSysmlCommand(ctx.state, { type: 'deleteElements', elementIds: [INTERACTION] });
    expect(first.committed).toBe(false);
    expect(first.impact?.deletedElementIds).toEqual(expect.arrayContaining([INTERACTION, DIAGRAM]));
    expect(first.impact?.removedRelationshipIds).toHaveLength(1);
    const done = executeSysmlCommand(ctx.state, { type: 'deleteElements', elementIds: [INTERACTION], confirmedImpactHash: computeImpactHash(first.impact!) });
    expect(done.committed).toBe(true);
    expect(done.repository.definitions[INTERACTION]).toBeUndefined();
    expect(done.repository.diagrams[DIAGRAM]).toBeUndefined();
    expect(Object.keys(done.repository.relationships)).toEqual([]);
  });

  it('deleting a Block takes the Interactions it owns, and their diagrams, with it', () => {
    const ctx = setup();
    const owned = createInteraction({ id: 'owned', name: 'Owned', ownerId: 'Vehicle' });
    owned.namespace = ['Vehicle'];
    expect(run(ctx, { type: 'createElement', element: owned }).committed).toBe(true);
    expect(run(ctx, { type: 'createDiagram', diagram: createDiagramDefinition({ id: 'owned-sd', ownerId: 'owned', diagramKind: 'sequence' }) }).committed).toBe(true);
    const first = executeSysmlCommand(ctx.state, { type: 'deleteElements', elementIds: ['Vehicle'] });
    expect(first.impact?.deletedElementIds).toEqual(expect.arrayContaining(['Vehicle', 'owned']));
    const done = executeSysmlCommand(ctx.state, { type: 'deleteElements', elementIds: ['Vehicle'], confirmedImpactHash: computeImpactHash(first.impact!) });
    expect(done.committed, JSON.stringify(done.diagnostics)).toBe(true);
    expect(done.repository.definitions.owned).toBeUndefined();
    expect(done.repository.diagrams['owned-sd']).toBeUndefined();
  });

  it('survives serializeRepository -> loadRepository and the project payload round trip', () => {
    const ctx = setup();
    withLifelines(ctx);
    addMessage(ctx, { sort: 'synchCall', sourceLifelineId: 'a', targetLifelineId: 'b', id: 'call', signatureId: 'start()', arguments: 'fast', withReply: true, replyId: 'rep' });
    addMessage(ctx, { sort: 'asynchSignal', sourceLifelineId: 'a', targetLifelineId: 'c', id: 'sig', signatureId: 'Ignite' });
    addMessage(ctx, { sort: 'createMessage', sourceLifelineId: 'a', targetLifelineId: 'c', id: 'mk' });
    apply(ctx, buildAddFragmentCommand(ctx.state.repository, { interactionId: INTERACTION, operator: 'alt', messageIds: ['call', 'rep'], guard: 'ok', id: 'f' }));
    expect(run(ctx, buildCreateAllocationCommand(ctx.state.repository, 'call', 'Vehicle')).committed).toBe(true);

    const expected = interaction(ctx);
    const reloaded = loadRepository(serializeRepository(ctx.state.repository));
    expect(reloaded.repository.definitions[INTERACTION]).toEqual(expected);
    expect(validateSysmlRepository(reloaded.repository).diagnostics.filter(d => d.severity === 'error')).toEqual([]);

    const payload = buildCanonicalSysmlProjectPayload(ctx.state, { version: '1', projectName: 'p' });
    const loaded = loadCanonicalSysmlProject(JSON.parse(JSON.stringify(payload)));
    expect(loaded.valid).toBe(true);
    expect(loaded.repository.definitions[INTERACTION]).toEqual(expected);
    expect(loaded.repository.diagrams[DIAGRAM].diagramKind).toBe('sequence');
    expect(buildSequenceDiagramView(loaded.repository, DIAGRAM)).toEqual(buildSequenceDiagramView(ctx.state.repository, DIAGRAM));
    // The allocation to a nested message was not quarantined by the load.
    expect(Object.values(loaded.repository.relationships).filter(rel => rel.kind === 'allocation')).toHaveLength(1);
  });

  it('every builder is one undo step', () => {
    const ctx = setup();
    withLifelines(ctx);
    const snapshot = JSON.stringify(interaction(ctx));
    addMessage(ctx, { sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b', id: 'm1' });
    const undone = executeSysmlCommand(ctx.state, { type: 'undo' });
    expect(JSON.stringify(undone.repository.definitions[INTERACTION])).toBe(snapshot);
  });
});
