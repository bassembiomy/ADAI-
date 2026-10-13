import type {
  CombinedFragment, CombinedFragmentOperator, InteractionDefinition, InteractionMessage, InteractionMessageSort, InteractionUse, Lifeline, StateInvariant, InteractionConstraint,
  SysmlRepository,
} from '../engine/sysml/model';
import {
  MESSAGE_SORTS, CALL_SORTS, FRAGMENT_OPERATORS, actorAssociatedWith, blockOperations, blockReceptions, checkInteractionMessage,
  connectorsBetweenLifelines, findInInteraction, interactionContextBlock, isLostFoundEndpoint, interactionNestedIds, lifelineBlock, lifelineTargetExists,
  operationName, orderedMessages, pairReplies, validateInteraction, withInteraction, wouldCreateUseCycle,
} from '../engine/sysml/interaction';
import { connectorEndAsPath, resolveConnectorEnd } from '../engine/sysml/connectorEnds';
import { effectiveSupertypeIds } from '../engine/sysml/services/supertypes';
import { sysmlObjectLabel } from '../features/sysml/sysmlDisplayLabel';
import { createDiagramDefinition, createInteraction, createSignal, generateUniqueName } from '../features/modelExplorer/adapters/modelExplorerFactories';
import type { SysmlEditorCommand, SysmlMutationCommand } from './sysmlCommandGateway';
import { freshId, uniqueName } from './sysmlActivityCommands';

/**
 * Pure command builders for interaction content. Every builder returns ONE
 * gateway command (a plain `updateElement` carrying the next arrays), so each
 * user action is one undo step. The pure rules run first: a builder never
 * returns a command that would add an error the interaction did not already have.
 *
 * Message positions (`order`) are always written as the contiguous run 1..n in
 * diagram order, so inserting, moving and removing never leave a gap or a tie.
 */

export interface InteractionPlanDiagnostic { code: string; message: string }
export type InteractionCommandPlan =
  | { ok: true; command: SysmlEditorCommand; createdIds: string[] }
  | { ok: false; diagnostics: InteractionPlanDiagnostic[] };

const fail = (code: string, message: string): InteractionCommandPlan => ({ ok: false, diagnostics: [{ code, message }] });

function interactionOf(repo: SysmlRepository, interactionId: string): InteractionDefinition | undefined {
  const definition = repo.definitions[interactionId];
  return definition?.kind === 'interaction' ? definition : undefined;
}

/** Errors the candidate has that the current interaction does not (so legacy faults never block unrelated edits). */
function introducedErrors(repo: SysmlRepository, current: InteractionDefinition, next: InteractionDefinition): InteractionPlanDiagnostic[] {
  const key = (d: { code: string; elementId?: string }) => `${d.code}|${d.elementId ?? ''}`;
  const before = new Set(validateInteraction(repo, current).filter(d => d.severity === 'error').map(key));
  return validateInteraction(withInteraction(repo, next), next)
    .filter(d => d.severity === 'error' && !before.has(key(d)))
    .map(d => ({ code: d.code, message: d.message }));
}

type InteractionPatch = Partial<Pick<InteractionDefinition, 'lifelines' | 'messages' | 'fragments' | 'uses' | 'stateInvariants' | 'constraints' | 'name'>>;

/**
 * `ref` frames after some messages are removed: a frame anchored to a removed
 * message moves up to the closest earlier message that stays (or to the top).
 * `sequence` is the message order before the removal.
 */
function reanchorUses<T extends { afterMessageId?: string }>(
  uses: readonly T[] | undefined,
  sequence: readonly InteractionMessage[],
  removedIds: ReadonlySet<string>,
): T[] | undefined {
  if (!uses) return undefined;
  return uses.map(use => {
    if (!use.afterMessageId || !removedIds.has(use.afterMessageId)) return use;
    let index = sequence.findIndex(message => message.id === use.afterMessageId) - 1;
    while (index >= 0 && removedIds.has(sequence[index].id)) index -= 1;
    const { afterMessageId: _old, ...rest } = use;
    return (index >= 0 ? { ...rest, afterMessageId: sequence[index].id } : rest) as T;
  });
}

/** Time and duration constraints that mark a removed message go with it. */
function dropConstraints(
  constraints: readonly InteractionConstraint[] | undefined,
  removedIds: ReadonlySet<string>,
): InteractionConstraint[] | undefined {
  if (!constraints) return undefined;
  return constraints.filter(constraint => !removedIds.has(constraint.fromMessageId) && !(constraint.toMessageId && removedIds.has(constraint.toMessageId)));
}

function commit(
  repo: SysmlRepository,
  current: InteractionDefinition,
  patch: InteractionPatch,
  createdIds: string[],
): InteractionCommandPlan {
  const next: InteractionDefinition = { ...current, ...patch };
  const errors = introducedErrors(repo, current, next);
  if (errors.length > 0) return { ok: false, diagnostics: errors };
  const update: SysmlMutationCommand = { type: 'updateElement', elementId: current.id, patch: patch as Record<string, unknown> };
  return { ok: true, command: update, createdIds };
}

/** Relationships (e.g. «allocate») that end on any of `ids`; removing the nested element would orphan them. */
function relationshipsTouching(repo: SysmlRepository, ids: ReadonlySet<string>): string[] {
  return Object.values(repo.relationships)
    .filter(relationship => ids.has(relationship.sourceId) || ids.has(relationship.targetId))
    .map(relationship => relationship.id);
}

const blockedByRelationships = (what: string): InteractionCommandPlan =>
  fail('INTERACTION_ELEMENT_HAS_RELATIONSHIPS', `${what} is the end of a relationship (for example «allocate»). Delete that relationship first.`);

/** Writes `order` as 1..n following the given sequence. */
function renumber(sequence: readonly InteractionMessage[]): InteractionMessage[] {
  return sequence.map((message, index) => ({ ...message, order: index + 1 }));
}

/** Messages as stored, keeping array order but with the contiguous `order` of `sequence`. */
function withOrders(stored: readonly InteractionMessage[], sequence: readonly InteractionMessage[]): InteractionMessage[] {
  const orderOf = new Map(sequence.map((message, index) => [message.id, index + 1] as const));
  return stored.map(message => ({ ...message, order: orderOf.get(message.id) ?? message.order }));
}

function nameOfLifeline(interaction: InteractionDefinition, lifelineId: string): string {
  return interaction.lifelines.find(lifeline => lifeline.id === lifelineId)?.name?.trim() || 'Lifeline';
}

// ---------------------------------------------------------------------------
// Lifelines
// ---------------------------------------------------------------------------

export type LifelineCandidateGroup = 'actor' | 'context' | 'contextPart' | 'block' | 'otherPart' | 'otherActor';
export interface LifelineCandidate { id: string; label: string; group: LifelineCandidateGroup }

/** In picker order. */
export const LIFELINE_CANDIDATE_GROUP_LABELS: Record<LifelineCandidateGroup, string> = {
  actor: 'Actors of this use case',
  context: 'This Block',
  contextPart: 'Parts of this Block',
  block: 'Other Blocks',
  otherPart: 'Parts of other Blocks',
  otherActor: 'Actors',
};

/** Part/reference properties a Block declares or inherits. */
function structuralProperties(repo: SysmlRepository, blockId: string): Array<{ id: string; name: string; typeId: string }> {
  const result: Array<{ id: string; name: string; typeId: string }> = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const definition = repo.definitions[id];
    if (definition?.kind !== 'block') return;
    for (const property of definition.properties) {
      if (property.kind === 'part' || property.kind === 'reference') result.push(property);
    }
    effectiveSupertypeIds(repo, id).forEach(visit);
  };
  visit(blockId);
  return result;
}

/**
 * What a lifeline of this interaction can represent, best choices first: for a
 * Block-owned interaction the owning Block and its parts (typed, as `part : Type`),
 * then every other Block and its parts. Mirrors the validation rule, so the
 * picker never leads with a choice the rule would warn about.
 */
export function listLifelineCandidates(repo: SysmlRepository, interactionId: string): LifelineCandidate[] {
  const interaction = interactionOf(repo, interactionId);
  const context = interaction ? interactionContextBlock(repo, interaction) : undefined;
  const blockLabel = (id: string) => sysmlObjectLabel(repo.definitions[id], 'Block');
  const candidates: LifelineCandidate[] = [];
  const used = new Set<string>();
  const add = (candidate: LifelineCandidate) => { if (!used.has(candidate.id)) { used.add(candidate.id); candidates.push(candidate); } };
  const actors = Object.values(repo.actors ?? {}).sort((a, b) => sysmlObjectLabel(a, 'Actor').localeCompare(sysmlObjectLabel(b, 'Actor')));
  // A use case scenario leads with the actors that take part in that use case.
  const scenarioUseCaseId = interaction?.ownerId && repo.useCases?.[interaction.ownerId] ? interaction.ownerId : undefined;
  if (scenarioUseCaseId) {
    for (const actor of actors) {
      if (actorAssociatedWith(repo, actor.id, scenarioUseCaseId)) add({ id: actor.id, label: sysmlObjectLabel(actor, 'Actor'), group: 'actor' });
    }
  }
  if (context) {
    add({ id: context.id, label: blockLabel(context.id), group: 'context' });
    for (const property of structuralProperties(repo, context.id)) {
      const type = repo.definitions[property.typeId];
      add({ id: property.id, label: `${sysmlObjectLabel(property, 'Part')}${type ? ` : ${blockLabel(type.id)}` : ''}`, group: 'contextPart' });
    }
  }
  const blocks = Object.values(repo.definitions).filter(definition => definition.kind === 'block')
    .sort((a, b) => blockLabel(a.id).localeCompare(blockLabel(b.id)));
  for (const block of blocks) add({ id: block.id, label: blockLabel(block.id), group: 'block' });
  for (const block of blocks) {
    if (block.kind !== 'block') continue;
    for (const property of block.properties) {
      if (property.kind !== 'part' && property.kind !== 'reference') continue;
      add({ id: property.id, label: `${blockLabel(block.id)}.${sysmlObjectLabel(property, 'Part')}`, group: 'otherPart' });
    }
  }
  for (const actor of actors) add({ id: actor.id, label: sysmlObjectLabel(actor, 'Actor'), group: 'otherActor' });
  return candidates;
}

/**
 * "New Sequence Diagram" on a Block (or on selected parts of it in an IBD): one
 * batch that creates an Interaction owned by the Block with one lifeline per
 * part, and a Sequence Diagram owned by that Interaction. A single undo step.
 * With no parts, the Block itself becomes the one lifeline so the diagram is not empty.
 */
export function buildCreateInteractionFromContextCommand(
  repo: SysmlRepository,
  input: { blockId: string; partIds?: string[]; name?: string; interactionId?: string; diagramId?: string },
): InteractionCommandPlan {
  const block = repo.definitions[input.blockId];
  if (block?.kind !== 'block') return fail('CONTEXT_NOT_A_BLOCK', 'A sequence diagram is created from a Block.');
  const available = structuralProperties(repo, block.id);
  const chosen = input.partIds ?? available.map(property => property.id);
  const unknown = chosen.filter(id => !available.some(property => property.id === id));
  if (unknown.length > 0) return fail('PART_NOT_IN_CONTEXT', 'Only parts of the chosen Block can become lifelines.');

  const existingInteractions = Object.values(repo.definitions).filter(definition => definition.kind === 'interaction').map(definition => definition.name);
  const interaction = createInteraction({
    id: freshId(repo, 'int', input.interactionId),
    name: input.name?.trim() || undefined,
    ownerId: block.id,
    existingNames: existingInteractions,
  });
  const usedIds = new Set<string>([interaction.id]);
  const lifelineId = (index: number) => {
    let candidate = `${interaction.id}-ll${index + 1}`;
    while (usedIds.has(candidate) || repo.definitions[candidate]) candidate += '_';
    usedIds.add(candidate);
    return candidate;
  };
  interaction.lifelines = chosen.length > 0
    ? chosen.map((propertyId, index) => ({ id: lifelineId(index), name: '', representsId: propertyId }))
    : [{ id: lifelineId(0), name: '', representsId: block.id }];

  const diagram = createDiagramDefinition({
    id: freshId(repo, 'diag', input.diagramId),
    ownerId: interaction.id,
    diagramKind: 'sequence',
    existingNames: Object.values(repo.diagrams).map(candidate => candidate.name),
    contextElementId: interaction.id,
  });
  return {
    ok: true,
    command: { type: 'batch', commands: [{ type: 'createElement', element: interaction }, { type: 'createDiagram', diagram }] },
    createdIds: [interaction.id, diagram.id],
  };
}

export function buildAddLifelineCommand(
  repo: SysmlRepository,
  input: { interactionId: string; name?: string; representsId?: string; id?: string },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  if (!interaction) return fail('INTERACTION_NOT_FOUND', 'The interaction does not exist.');
  if (input.representsId && !lifelineTargetExists(repo, input.representsId)) {
    return fail('MISSING_LIFELINE_REPRESENTS', 'A lifeline can represent a Block, one of its parts, or an Actor.');
  }
  const lifelines = interaction.lifelines ?? [];
  const lifeline: Lifeline = {
    id: freshId(repo, 'll', input.id),
    name: input.name?.trim() ?? (input.representsId ? '' : uniqueName('Lifeline', lifelines.map(candidate => candidate.name))),
    ...(input.representsId ? { representsId: input.representsId } : {}),
  };
  return commit(repo, interaction, { lifelines: [...lifelines, lifeline] }, [lifeline.id]);
}

/** Removes a lifeline together with every message that starts or ends on it. */
export function buildRemoveLifelineCommand(
  repo: SysmlRepository,
  input: { interactionId: string; lifelineId: string },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const lifeline = interaction?.lifelines.find(candidate => candidate.id === input.lifelineId);
  if (!interaction || !lifeline) return fail('LIFELINE_NOT_FOUND', 'The lifeline does not exist.');
  const doomed = interaction.messages.filter(message => message.sourceLifelineId === lifeline.id || message.targetLifelineId === lifeline.id);
  const doomedIds = new Set(doomed.map(message => message.id));
  if (relationshipsTouching(repo, new Set([lifeline.id, ...doomedIds])).length > 0) return blockedByRelationships(lifeline.name?.trim() || 'The lifeline');
  const kept = orderedMessages(interaction).filter(message => !doomedIds.has(message.id));
  // A `ref` frame loses this lifeline; one that covered only this lifeline goes away.
  const uses = interaction.uses === undefined
    ? undefined
    : reanchorUses(interaction.uses, orderedMessages(interaction), doomedIds)!
      .map(use => ({ ...use, coveredLifelineIds: use.coveredLifelineIds.filter(id => id !== lifeline.id) }))
      .filter(use => use.coveredLifelineIds.length > 0 || !interaction.uses!.find(original => original.id === use.id)!.coveredLifelineIds.includes(lifeline.id));
  const constraints = dropConstraints(interaction.constraints, doomedIds);
  const invariants = interaction.stateInvariants === undefined
    ? undefined
    : reanchorUses(interaction.stateInvariants.filter(invariant => invariant.lifelineId !== lifeline.id), orderedMessages(interaction), doomedIds)!;
  return commit(repo, interaction, {
    lifelines: interaction.lifelines.filter(candidate => candidate.id !== lifeline.id),
    messages: withOrders(interaction.messages.filter(message => !doomedIds.has(message.id)), kept),
    fragments: (interaction.fragments ?? []).map(fragment => ({
      ...fragment,
      coveredLifelineIds: fragment.coveredLifelineIds.filter(id => id !== lifeline.id),
      operands: fragment.operands.map(operand => ({ ...operand, messageIds: operand.messageIds.filter(id => !doomedIds.has(id)) })),
    })),
    ...(uses ? { uses } : {}),
    ...(invariants ? { stateInvariants: invariants } : {}),
    ...(constraints ? { constraints } : {}),
  }, []);
}

export function buildSetLifelineRepresentsCommand(
  repo: SysmlRepository,
  input: { interactionId: string; lifelineId: string; representsId?: string },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  if (!interaction || !interaction.lifelines.some(lifeline => lifeline.id === input.lifelineId)) return fail('LIFELINE_NOT_FOUND', 'The lifeline does not exist.');
  if (input.representsId && !lifelineTargetExists(repo, input.representsId)) {
    return fail('MISSING_LIFELINE_REPRESENTS', 'A lifeline can represent a Block, one of its parts, or an Actor.');
  }
  return commit(repo, interaction, {
    lifelines: interaction.lifelines.map(lifeline => {
      if (lifeline.id !== input.lifelineId) return lifeline;
      const { representsId: _previous, ...rest } = lifeline;
      return input.representsId ? { ...rest, representsId: input.representsId } : rest;
    }),
  }, []);
}

/** Moves a lifeline one column left (-1) or right (+1). */
export function buildMoveLifelineCommand(
  repo: SysmlRepository,
  input: { interactionId: string; lifelineId: string; direction: -1 | 1 },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const index = interaction?.lifelines.findIndex(lifeline => lifeline.id === input.lifelineId) ?? -1;
  if (!interaction || index < 0) return fail('LIFELINE_NOT_FOUND', 'The lifeline does not exist.');
  const target = index + input.direction;
  if (target < 0 || target >= interaction.lifelines.length) return fail('LIFELINE_AT_EDGE', 'The lifeline is already at the edge.');
  const lifelines = [...interaction.lifelines];
  [lifelines[index], lifelines[target]] = [lifelines[target], lifelines[index]];
  return commit(repo, interaction, { lifelines }, []);
}

/** Renames the interaction itself, a lifeline or a message (one command). */
export function buildRenameInteractionElementCommand(
  repo: SysmlRepository,
  input: { interactionId: string; elementId: string; name: string },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  if (!interaction) return fail('INTERACTION_NOT_FOUND', 'The interaction does not exist.');
  const name = input.name.trim();
  if (input.elementId === interaction.id) return commit(repo, interaction, { name }, []);
  const found = findInInteraction(interaction, input.elementId);
  if (!found || found.elementKind === 'fragment') return fail('ELEMENT_NOT_FOUND', 'That element cannot be renamed.');
  if (found.elementKind === 'lifeline') {
    return commit(repo, interaction, { lifelines: interaction.lifelines.map(lifeline => lifeline.id === input.elementId ? { ...lifeline, name } : lifeline) }, []);
  }
  return commit(repo, interaction, { messages: interaction.messages.map(message => message.id === input.elementId ? { ...message, name } : message) }, []);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface AddInteractionMessageInput {
  interactionId: string;
  sort: InteractionMessageSort;
  sourceLifelineId: string;
  targetLifelineId: string;
  name?: string;
  /** Signal definition id (signal messages) or operation text (calls). */
  signatureId?: string;
  arguments?: string;
  /** 0-based position among the messages; default: at the end. */
  atIndex?: number;
  id?: string;
  /** The IBD connector the message travels over (the reply of a synchronous call uses the same one). */
  connectorId?: string;
  /** synchCall only: also add the reply directly after the call. */
  withReply?: boolean;
  /** Test seam. */
  replyId?: string;
}

export function buildAddInteractionMessageCommand(repo: SysmlRepository, input: AddInteractionMessageInput): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  if (!interaction) return fail('INTERACTION_NOT_FOUND', 'The interaction does not exist.');
  if (!MESSAGE_SORTS.includes(input.sort)) return fail('INVALID_MESSAGE_SORT', 'That kind of message is not supported.');
  const sequence = orderedMessages(interaction);
  const index = Math.min(Math.max(input.atIndex ?? sequence.length, 0), sequence.length);
  const message: InteractionMessage = {
    id: freshId(repo, 'msg', input.id),
    name: input.name?.trim() ?? '',
    sort: input.sort,
    sourceLifelineId: input.sourceLifelineId,
    targetLifelineId: input.targetLifelineId,
    order: index + 1,
    ...(input.signatureId ? { signatureId: input.signatureId } : {}),
    ...(input.arguments?.trim() ? { arguments: input.arguments.trim() } : {}),
    ...(input.connectorId ? { connectorId: input.connectorId } : {}),
  };
  const created = [message];
  if (input.withReply && input.sort === 'synchCall') {
    created.push({
      id: freshId(repo, 'msg', input.replyId, [message.id]),
      name: '',
      sort: 'reply',
      sourceLifelineId: input.targetLifelineId,
      targetLifelineId: input.sourceLifelineId,
      order: index + 2,
      ...(input.connectorId ? { connectorId: input.connectorId } : {}),
    });
  }
  const nextSequence = renumber([...sequence.slice(0, index), ...created, ...sequence.slice(index)]);
  const finalOf = (id: string) => nextSequence.find(candidate => candidate.id === id)!;
  const others = nextSequence.filter(candidate => !created.some(c => c.id === candidate.id));
  for (const candidate of created) {
    const verdict = checkInteractionMessage(
      repo,
      { ...interaction, messages: [...others, ...created.filter(c => c.id !== candidate.id).map(c => finalOf(c.id))] },
      { ...finalOf(candidate.id) },
    );
    if (verdict) return fail(verdict.code, verdict.message);
  }
  const stored = interaction.messages ?? [];
  return commit(repo, interaction, {
    messages: [...withOrders(stored, nextSequence), ...created.map(c => finalOf(c.id))],
  }, created.map(c => c.id));
}

export interface UpdateInteractionMessageInput {
  interactionId: string;
  messageId: string;
  name?: string;
  sort?: InteractionMessageSort;
  /** `null` clears. */
  signatureId?: string | null;
  arguments?: string | null;
  /** `null` clears. */
  connectorId?: string | null;
}

/** A connector a message between two lifelines may travel over, labelled by the parts it joins. */
export interface MessageConnectorOption { id: string; label: string }

function connectorEndLabel(repo: SysmlRepository, connector: import('../engine/sysml/model').ConnectorUsage, side: 'source' | 'target'): string {
  const end = connectorEndAsPath(repo, connector, side);
  if (!end) return '?';
  const resolved = resolveConnectorEnd(repo, connector.ownerId, end, side, connector.id).resolved;
  const part = resolved?.part ? sysmlObjectLabel(resolved.part, 'Part') : sysmlObjectLabel(repo.definitions[connector.ownerId], 'Block');
  return resolved?.port ? `${part}.${sysmlObjectLabel(resolved.port, 'Port')}` : part;
}

/**
 * The connectors that join the parts two lifelines stand for; empty when none
 * does or when that cannot be judged. This is what the message inspector
 * offers, so it can only pick a connector the rule accepts.
 */
export function listMessageConnectors(
  repo: SysmlRepository,
  interactionId: string,
  sourceLifelineId: string,
  targetLifelineId: string,
): MessageConnectorOption[] {
  const interaction = interactionOf(repo, interactionId);
  if (!interaction) return [];
  return (connectorsBetweenLifelines(repo, interaction, sourceLifelineId, targetLifelineId) ?? []).map(connector => ({
    id: connector.id,
    label: `${connectorEndLabel(repo, connector, 'source')} — ${connectorEndLabel(repo, connector, 'target')}`,
  }));
}

export interface SignalCandidate { id: string; label: string; /** The receiving Block declares a reception for it. */ received: boolean }

/**
 * The Signals a signal message to this lifeline can carry: the ones the
 * receiving Block (and its supertypes) accept first, then every other Signal.
 */
export function listSignalCandidates(repo: SysmlRepository, interactionId: string, targetLifelineId: string): SignalCandidate[] {
  const interaction = interactionOf(repo, interactionId);
  const target = interaction?.lifelines.find(lifeline => lifeline.id === targetLifelineId);
  const receiver = target ? lifelineBlock(repo, target) : undefined;
  const received = new Set(receiver ? blockReceptions(repo, receiver) : []);
  return Object.values(repo.definitions)
    .filter(definition => definition.kind === 'signal')
    .map(definition => ({ id: definition.id, label: sysmlObjectLabel(definition, 'Signal'), received: received.has(definition.id) }))
    .sort((a, b) => Number(b.received) - Number(a.received) || a.label.localeCompare(b.label));
}

/** The Package that should own a new Signal made from this interaction: its nearest Package ancestor. */
function owningPackageId(repo: SysmlRepository, interaction: InteractionDefinition): string {
  const seen = new Set<string>();
  let id: string | undefined = interaction.ownerId;
  while (id && !seen.has(id)) {
    if (repo.packages[id]) return id;
    seen.add(id);
    id = repo.definitions[id]?.ownerId;
  }
  return 'model';
}

function messageWith(interaction: InteractionDefinition, messageId: string, patch: Partial<InteractionMessage>): InteractionMessage[] {
  return interaction.messages.map(message => message.id === messageId ? { ...message, ...patch } : message);
}

/**
 * "New operation" on a call message: adds an operation to the receiving Block
 * and points the message at it, as one undo step. The operation gets a unique
 * placeholder name the user renames on the Block (renaming rewrites the call).
 */
export function buildCreateOperationForMessageCommand(
  repo: SysmlRepository,
  input: { interactionId: string; messageId: string; name?: string },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const message = interaction?.messages.find(candidate => candidate.id === input.messageId);
  if (!interaction || !message) return fail('MESSAGE_NOT_FOUND', 'The message does not exist.');
  if (!CALL_SORTS.has(message.sort)) return fail('MESSAGE_NOT_A_CALL', 'Only a call message invokes an operation.');
  const target = interaction.lifelines.find(lifeline => lifeline.id === message.targetLifelineId);
  const receiver = target ? lifelineBlock(repo, target) : undefined;
  if (!receiver) return fail('NO_RECEIVING_BLOCK', 'The receiving lifeline must represent a Block before it can get an operation.');
  const taken = blockOperations(repo, receiver).map(operationName);
  const signature = `${input.name?.trim() || generateUniqueName('operation', taken)}()`;
  return {
    ok: true,
    command: {
      type: 'batch',
      commands: [
        { type: 'updateElement', elementId: receiver.id, patch: { operations: [...(receiver.operations ?? []), signature] } },
        { type: 'updateElement', elementId: interaction.id, patch: { messages: messageWith(interaction, message.id, { signatureId: signature }) } },
      ],
    },
    createdIds: [signature],
  };
}

/**
 * "New signal" on a signal message: creates the Signal next to the interaction,
 * points the message at it and, when the receiving Block already lists the
 * Signals it receives, adds the new one to that list. One undo step.
 */
export function buildCreateSignalForMessageCommand(
  repo: SysmlRepository,
  input: { interactionId: string; messageId: string; name?: string; signalId?: string },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const message = interaction?.messages.find(candidate => candidate.id === input.messageId);
  if (!interaction || !message) return fail('MESSAGE_NOT_FOUND', 'The message does not exist.');
  if (message.sort !== 'asynchSignal') return fail('MESSAGE_NOT_A_SIGNAL', 'Only a signal message carries a Signal.');
  const signal = createSignal({
    id: freshId(repo, 'sig', input.signalId),
    name: input.name?.trim() || undefined,
    ownerId: owningPackageId(repo, interaction),
    existingNames: Object.values(repo.definitions).filter(definition => definition.kind === 'signal').map(definition => definition.name),
  });
  const target = interaction.lifelines.find(lifeline => lifeline.id === message.targetLifelineId);
  const receiver = target ? lifelineBlock(repo, target) : undefined;
  const commands: SysmlMutationCommand[] = [
    { type: 'createElement', element: signal },
    { type: 'updateElement', elementId: interaction.id, patch: { messages: messageWith(interaction, message.id, { signatureId: signal.id }) } },
  ];
  if (receiver && blockReceptions(repo, receiver).length > 0) {
    commands.push({ type: 'updateElement', elementId: receiver.id, patch: { receptions: [...(receiver.receptions ?? []), signal.id] } });
  }
  return { ok: true, command: { type: 'batch', commands }, createdIds: [signal.id] };
}

export function buildUpdateInteractionMessageCommand(repo: SysmlRepository, input: UpdateInteractionMessageInput): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const message = interaction?.messages.find(candidate => candidate.id === input.messageId);
  if (!interaction || !message) return fail('MESSAGE_NOT_FOUND', 'The message does not exist.');
  const next: InteractionMessage = { ...message };
  if (input.name !== undefined) next.name = input.name.trim();
  if (input.sort !== undefined) {
    if (!MESSAGE_SORTS.includes(input.sort)) return fail('INVALID_MESSAGE_SORT', 'That kind of message is not supported.');
    next.sort = input.sort;
  }
  if (input.signatureId !== undefined) { if (input.signatureId) next.signatureId = input.signatureId; else delete next.signatureId; }
  if (input.arguments !== undefined) { if (input.arguments?.trim()) next.arguments = input.arguments.trim(); else delete next.arguments; }
  if (input.connectorId !== undefined) { if (input.connectorId) next.connectorId = input.connectorId; else delete next.connectorId; }
  const verdict = checkInteractionMessage(
    repo,
    { ...interaction, messages: interaction.messages.filter(candidate => candidate.id !== message.id) },
    next,
  );
  if (verdict) return fail(verdict.code, verdict.message);
  return commit(repo, interaction, { messages: interaction.messages.map(candidate => candidate.id === message.id ? next : candidate) }, []);
}

/**
 * Removes a message. A synchronous call takes the reply that answers it with
 * it (a reply with no call is invalid), and the ids leave every fragment operand.
 */
export function buildRemoveInteractionMessageCommand(
  repo: SysmlRepository,
  input: { interactionId: string; messageId: string },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const message = interaction?.messages.find(candidate => candidate.id === input.messageId);
  if (!interaction || !message) return fail('MESSAGE_NOT_FOUND', 'The message does not exist.');
  const doomed = new Set([message.id]);
  if (message.sort === 'synchCall') {
    const reply = pairReplies(interaction).replyOf.get(message.id);
    if (reply) doomed.add(reply);
  }
  if (relationshipsTouching(repo, doomed).length > 0) return blockedByRelationships(message.name?.trim() || 'The message');
  const kept = orderedMessages(interaction).filter(candidate => !doomed.has(candidate.id));
  const uses = reanchorUses(interaction.uses, orderedMessages(interaction), doomed);
  const invariants = reanchorUses(interaction.stateInvariants, orderedMessages(interaction), doomed);
  const constraints = dropConstraints(interaction.constraints, doomed);
  return commit(repo, interaction, {
    messages: withOrders(interaction.messages.filter(candidate => !doomed.has(candidate.id)), kept),
    fragments: (interaction.fragments ?? []).map(fragment => ({
      ...fragment,
      operands: fragment.operands.map(operand => ({ ...operand, messageIds: operand.messageIds.filter(id => !doomed.has(id)) })),
    })),
    ...(uses ? { uses } : {}),
    ...(invariants ? { stateInvariants: invariants } : {}),
    ...(constraints ? { constraints } : {}),
  }, []);
}

/** Moves a message to a 0-based position among the messages (drag to reorder). */
export function buildMoveInteractionMessageCommand(
  repo: SysmlRepository,
  input: { interactionId: string; messageId: string; toIndex: number },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const sequence = interaction ? orderedMessages(interaction) : [];
  const from = sequence.findIndex(candidate => candidate.id === input.messageId);
  if (!interaction || from < 0) return fail('MESSAGE_NOT_FOUND', 'The message does not exist.');
  const to = Math.min(Math.max(input.toIndex, 0), sequence.length - 1);
  if (to === from) return fail('MESSAGE_NOT_MOVED', 'The message is already at that position.');
  const reordered = [...sequence];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  return commit(repo, interaction, { messages: withOrders(interaction.messages, reordered) }, []);
}

// ---------------------------------------------------------------------------
// Interaction uses (`ref` frames)
// ---------------------------------------------------------------------------

/** Interactions a `ref` frame in `interactionId` may refer to: every other interaction that would not refer back. */
export function listReferableInteractions(repo: SysmlRepository, interactionId: string): Array<{ id: string; label: string }> {
  return Object.values(repo.definitions)
    .filter(definition => definition.kind === 'interaction' && definition.id !== interactionId && !wouldCreateUseCycle(repo, interactionId, definition.id))
    .map(definition => ({ id: definition.id, label: sysmlObjectLabel(definition, 'Interaction') }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function checkUseTarget(repo: SysmlRepository, interaction: InteractionDefinition, refersToId: string): InteractionCommandPlan | undefined {
  if (interactionOf(repo, refersToId) === undefined) return fail('USE_TARGET_MISSING', 'A ref frame must refer to an interaction that exists.');
  if (wouldCreateUseCycle(repo, interaction.id, refersToId)) {
    return fail('USE_CYCLE', 'That would make the interactions refer to each other in a loop.');
  }
  return undefined;
}

export function buildAddInteractionUseCommand(
  repo: SysmlRepository,
  input: {
    interactionId: string; refersToId: string; coveredLifelineIds?: string[]; afterMessageId?: string | null;
    arguments?: string; id?: string;
  },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  if (!interaction) return fail('INTERACTION_NOT_FOUND', 'The interaction does not exist.');
  const refused = checkUseTarget(repo, interaction, input.refersToId);
  if (refused) return refused;
  const covered = input.coveredLifelineIds ?? interaction.lifelines.map(lifeline => lifeline.id);
  if (covered.some(id => !interaction.lifelines.some(lifeline => lifeline.id === id))) {
    return fail('USE_LIFELINE_MISSING', 'A ref frame can only cover lifelines of this interaction.');
  }
  const sequence = orderedMessages(interaction);
  // Default: after the last message, so a new frame is appended to the scenario.
  const afterMessageId = input.afterMessageId === undefined ? sequence[sequence.length - 1]?.id : input.afterMessageId ?? undefined;
  if (afterMessageId && !sequence.some(message => message.id === afterMessageId)) {
    return fail('USE_ANCHOR_MISSING', 'A ref frame can only follow a message of this interaction.');
  }
  const use: InteractionUse = {
    id: freshId(repo, 'use', input.id),
    refersToId: input.refersToId,
    coveredLifelineIds: covered,
    ...(afterMessageId ? { afterMessageId } : {}),
    ...(input.arguments?.trim() ? { arguments: input.arguments.trim() } : {}),
  };
  return commit(repo, interaction, { uses: [...(interaction.uses ?? []), use] }, [use.id]);
}

export function buildUpdateInteractionUseCommand(
  repo: SysmlRepository,
  input: {
    interactionId: string; useId: string; refersToId?: string; coveredLifelineIds?: string[];
    /** `null` clears (the frame moves to the top). */
    afterMessageId?: string | null;
    /** `null` clears. */
    arguments?: string | null;
  },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const use = interaction?.uses?.find(candidate => candidate.id === input.useId);
  if (!interaction || !use) return fail('USE_NOT_FOUND', 'The ref frame does not exist.');
  const next: InteractionUse = { ...use };
  if (input.refersToId !== undefined) {
    const refused = checkUseTarget(repo, interaction, input.refersToId);
    if (refused) return refused;
    next.refersToId = input.refersToId;
  }
  if (input.coveredLifelineIds !== undefined) {
    if (input.coveredLifelineIds.some(id => !interaction.lifelines.some(lifeline => lifeline.id === id))) {
      return fail('USE_LIFELINE_MISSING', 'A ref frame can only cover lifelines of this interaction.');
    }
    next.coveredLifelineIds = input.coveredLifelineIds;
  }
  if (input.afterMessageId !== undefined) {
    if (input.afterMessageId && !interaction.messages.some(message => message.id === input.afterMessageId)) {
      return fail('USE_ANCHOR_MISSING', 'A ref frame can only follow a message of this interaction.');
    }
    if (input.afterMessageId) next.afterMessageId = input.afterMessageId; else delete next.afterMessageId;
  }
  if (input.arguments !== undefined) { if (input.arguments?.trim()) next.arguments = input.arguments.trim(); else delete next.arguments; }
  return commit(repo, interaction, { uses: interaction.uses!.map(candidate => candidate.id === use.id ? next : candidate) }, []);
}

export function buildRemoveInteractionUseCommand(
  repo: SysmlRepository,
  input: { interactionId: string; useId: string },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  if (!interaction || !interaction.uses?.some(use => use.id === input.useId)) return fail('USE_NOT_FOUND', 'The ref frame does not exist.');
  if (relationshipsTouching(repo, new Set([input.useId])).length > 0) return blockedByRelationships('The ref frame');
  return commit(repo, interaction, { uses: interaction.uses.filter(use => use.id !== input.useId) }, []);
}

// ---------------------------------------------------------------------------
// State invariants
// ---------------------------------------------------------------------------

export function buildAddStateInvariantCommand(
  repo: SysmlRepository,
  input: { interactionId: string; lifelineId: string; stateId: string; afterMessageId?: string | null; id?: string },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  if (!interaction) return fail('INTERACTION_NOT_FOUND', 'The interaction does not exist.');
  if (!interaction.lifelines.some(lifeline => lifeline.id === input.lifelineId)) {
    return fail('STATE_INVARIANT_LIFELINE_MISSING', 'A state invariant sits on a lifeline of this interaction.');
  }
  if (!input.stateId.trim()) return fail('STATE_INVARIANT_STATE_MISSING', 'Choose the state the lifeline is in.');
  const sequence = orderedMessages(interaction);
  const afterMessageId = input.afterMessageId === undefined ? sequence[sequence.length - 1]?.id : input.afterMessageId ?? undefined;
  if (afterMessageId && !sequence.some(message => message.id === afterMessageId)) {
    return fail('STATE_INVARIANT_ANCHOR_MISSING', 'A state invariant can only follow a message of this interaction.');
  }
  const invariant: StateInvariant = {
    id: freshId(repo, 'inv', input.id),
    lifelineId: input.lifelineId,
    stateId: input.stateId,
    ...(afterMessageId ? { afterMessageId } : {}),
  };
  return commit(repo, interaction, { stateInvariants: [...(interaction.stateInvariants ?? []), invariant] }, [invariant.id]);
}

export function buildUpdateStateInvariantCommand(
  repo: SysmlRepository,
  input: { interactionId: string; invariantId: string; lifelineId?: string; stateId?: string; afterMessageId?: string | null },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const invariant = interaction?.stateInvariants?.find(candidate => candidate.id === input.invariantId);
  if (!interaction || !invariant) return fail('STATE_INVARIANT_NOT_FOUND', 'The state invariant does not exist.');
  const next: StateInvariant = { ...invariant };
  if (input.lifelineId !== undefined) {
    if (!interaction.lifelines.some(lifeline => lifeline.id === input.lifelineId)) return fail('STATE_INVARIANT_LIFELINE_MISSING', 'A state invariant sits on a lifeline of this interaction.');
    next.lifelineId = input.lifelineId;
  }
  if (input.stateId !== undefined) {
    if (!input.stateId.trim()) return fail('STATE_INVARIANT_STATE_MISSING', 'Choose the state the lifeline is in.');
    next.stateId = input.stateId;
  }
  if (input.afterMessageId !== undefined) {
    if (input.afterMessageId && !interaction.messages.some(message => message.id === input.afterMessageId)) {
      return fail('STATE_INVARIANT_ANCHOR_MISSING', 'A state invariant can only follow a message of this interaction.');
    }
    if (input.afterMessageId) next.afterMessageId = input.afterMessageId; else delete next.afterMessageId;
  }
  return commit(repo, interaction, { stateInvariants: interaction.stateInvariants!.map(candidate => candidate.id === invariant.id ? next : candidate) }, []);
}

export function buildRemoveStateInvariantCommand(
  repo: SysmlRepository,
  input: { interactionId: string; invariantId: string },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  if (!interaction || !interaction.stateInvariants?.some(invariant => invariant.id === input.invariantId)) return fail('STATE_INVARIANT_NOT_FOUND', 'The state invariant does not exist.');
  if (relationshipsTouching(repo, new Set([input.invariantId])).length > 0) return blockedByRelationships('The state invariant');
  return commit(repo, interaction, { stateInvariants: interaction.stateInvariants.filter(invariant => invariant.id !== input.invariantId) }, []);
}

// ---------------------------------------------------------------------------
// Time and duration constraints
// ---------------------------------------------------------------------------

export function buildAddInteractionConstraintCommand(
  repo: SysmlRepository,
  input: { interactionId: string; kind: 'time' | 'duration'; fromMessageId: string; toMessageId?: string; expression?: string; id?: string },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  if (!interaction) return fail('INTERACTION_NOT_FOUND', 'The interaction does not exist.');
  const sequence = orderedMessages(interaction);
  const has = (id: string) => sequence.some(message => message.id === id);
  if (!has(input.fromMessageId)) return fail('CONSTRAINT_ANCHOR_MISSING', 'A constraint can only mark a message of this interaction.');
  if (input.kind === 'duration') {
    if (!input.toMessageId || !has(input.toMessageId)) return fail('CONSTRAINT_ANCHOR_MISSING', 'A duration constraint needs a start and an end message of this interaction.');
    if (input.toMessageId === input.fromMessageId) return fail('DURATION_SAME_MESSAGE', 'A duration spans two different messages.');
  } else if (input.toMessageId) {
    return fail('TIME_CONSTRAINT_HAS_END', 'A time constraint marks one message.');
  }
  // The span always runs from the earlier message to the later one.
  const [from, to] = input.kind === 'duration' && sequence.findIndex(message => message.id === input.toMessageId) < sequence.findIndex(message => message.id === input.fromMessageId)
    ? [input.toMessageId!, input.fromMessageId] : [input.fromMessageId, input.toMessageId];
  const constraint: InteractionConstraint = {
    id: freshId(repo, 'con', input.id),
    kind: input.kind,
    fromMessageId: from,
    ...(to ? { toMessageId: to } : {}),
    expression: (input.expression ?? '').trim(),
  };
  return commit(repo, interaction, { constraints: [...(interaction.constraints ?? []), constraint] }, [constraint.id]);
}

export function buildUpdateInteractionConstraintCommand(
  repo: SysmlRepository,
  input: { interactionId: string; constraintId: string; expression: string },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const constraint = interaction?.constraints?.find(candidate => candidate.id === input.constraintId);
  if (!interaction || !constraint) return fail('CONSTRAINT_NOT_FOUND', 'The constraint does not exist.');
  return commit(repo, interaction, {
    constraints: interaction.constraints!.map(candidate => candidate.id === constraint.id ? { ...candidate, expression: input.expression.trim() } : candidate),
  }, []);
}

export function buildRemoveInteractionConstraintCommand(
  repo: SysmlRepository,
  input: { interactionId: string; constraintId: string },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  if (!interaction || !interaction.constraints?.some(constraint => constraint.id === input.constraintId)) return fail('CONSTRAINT_NOT_FOUND', 'The constraint does not exist.');
  if (relationshipsTouching(repo, new Set([input.constraintId])).length > 0) return blockedByRelationships('The constraint');
  return commit(repo, interaction, { constraints: interaction.constraints.filter(constraint => constraint.id !== input.constraintId) }, []);
}

// ---------------------------------------------------------------------------
// Combined fragments
// ---------------------------------------------------------------------------

function coverageOf(interaction: InteractionDefinition, messageIds: readonly string[]): string[] {
  const covered = new Set<string>();
  for (const id of messageIds) {
    const message = interaction.messages.find(candidate => candidate.id === id);
    if (message) {
      for (const end of [message.sourceLifelineId, message.targetLifelineId]) if (!isLostFoundEndpoint(end)) covered.add(end);
    }
  }
  return [...covered];
}

export function buildAddFragmentCommand(
  repo: SysmlRepository,
  input: { interactionId: string; operator: CombinedFragmentOperator; messageIds: string[]; guard?: string; id?: string },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  if (!interaction) return fail('INTERACTION_NOT_FOUND', 'The interaction does not exist.');
  if (!FRAGMENT_OPERATORS.includes(input.operator)) return fail('INVALID_FRAGMENT_OPERATOR', 'That fragment operator is not supported.');
  if (input.messageIds.length === 0) return fail('FRAGMENT_NEEDS_MESSAGES', 'Select at least one message to enclose in the fragment.');
  const guard = input.guard?.trim();
  const operands = [{ ...(guard ? { guard } : {}), messageIds: [...input.messageIds] }];
  if (input.operator === 'alt') operands.push({ guard: 'else', messageIds: [] });
  const fragment: CombinedFragment = {
    id: freshId(repo, 'frag', input.id),
    operator: input.operator,
    operands,
    coveredLifelineIds: coverageOf(interaction, input.messageIds),
  };
  return commit(repo, interaction, { fragments: [...(interaction.fragments ?? []), fragment] }, [fragment.id]);
}

function fragmentOf(interaction: InteractionDefinition, fragmentId: string): CombinedFragment | undefined {
  return (interaction.fragments ?? []).find(candidate => candidate.id === fragmentId);
}

function replaceFragment(interaction: InteractionDefinition, next: CombinedFragment): CombinedFragment[] {
  return (interaction.fragments ?? []).map(fragment => fragment.id === next.id ? next : fragment);
}

export function buildSetFragmentOperatorCommand(
  repo: SysmlRepository,
  input: { interactionId: string; fragmentId: string; operator: CombinedFragmentOperator },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const fragment = interaction ? fragmentOf(interaction, input.fragmentId) : undefined;
  if (!interaction || !fragment) return fail('FRAGMENT_NOT_FOUND', 'The combined fragment does not exist.');
  if (!FRAGMENT_OPERATORS.includes(input.operator)) return fail('INVALID_FRAGMENT_OPERATOR', 'That fragment operator is not supported.');
  return commit(repo, interaction, { fragments: replaceFragment(interaction, { ...fragment, operator: input.operator }) }, []);
}

/** Adds an operand (optionally taking `messageIds` out of the fragment's other operands). */
export function buildAddFragmentOperandCommand(
  repo: SysmlRepository,
  input: { interactionId: string; fragmentId: string; guard?: string; messageIds?: string[] },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const fragment = interaction ? fragmentOf(interaction, input.fragmentId) : undefined;
  if (!interaction || !fragment) return fail('FRAGMENT_NOT_FOUND', 'The combined fragment does not exist.');
  const moved = new Set(input.messageIds ?? []);
  const guard = input.guard?.trim();
  return commit(repo, interaction, {
    fragments: replaceFragment(interaction, {
      ...fragment,
      operands: [
        ...fragment.operands.map(operand => ({ ...operand, messageIds: operand.messageIds.filter(id => !moved.has(id)) })),
        { ...(guard ? { guard } : {}), messageIds: [...moved] },
      ],
      coveredLifelineIds: [...new Set([...fragment.coveredLifelineIds, ...coverageOf(interaction, [...moved])])],
    }),
  }, []);
}

export function buildSetOperandGuardCommand(
  repo: SysmlRepository,
  input: { interactionId: string; fragmentId: string; operandIndex: number; guard: string },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const fragment = interaction ? fragmentOf(interaction, input.fragmentId) : undefined;
  if (!interaction || !fragment) return fail('FRAGMENT_NOT_FOUND', 'The combined fragment does not exist.');
  if (!fragment.operands[input.operandIndex]) return fail('OPERAND_NOT_FOUND', 'The operand does not exist.');
  const guard = input.guard.trim();
  return commit(repo, interaction, {
    fragments: replaceFragment(interaction, {
      ...fragment,
      operands: fragment.operands.map((operand, index) => {
        if (index !== input.operandIndex) return operand;
        const { guard: _previous, ...rest } = operand;
        return guard ? { ...rest, guard } : rest;
      }),
    }),
  }, []);
}

/** Replaces an operand's messages; they leave the fragment's other operands and their lifelines become covered. */
export function buildSetOperandMessagesCommand(
  repo: SysmlRepository,
  input: { interactionId: string; fragmentId: string; operandIndex: number; messageIds: string[] },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const fragment = interaction ? fragmentOf(interaction, input.fragmentId) : undefined;
  if (!interaction || !fragment) return fail('FRAGMENT_NOT_FOUND', 'The combined fragment does not exist.');
  if (!fragment.operands[input.operandIndex]) return fail('OPERAND_NOT_FOUND', 'The operand does not exist.');
  const taken = new Set(input.messageIds);
  return commit(repo, interaction, {
    fragments: replaceFragment(interaction, {
      ...fragment,
      operands: fragment.operands.map((operand, index) => index === input.operandIndex
        ? { ...operand, messageIds: [...input.messageIds] }
        : { ...operand, messageIds: operand.messageIds.filter(id => !taken.has(id)) }),
      coveredLifelineIds: [...new Set([...fragment.coveredLifelineIds, ...coverageOf(interaction, input.messageIds)])],
    }),
  }, []);
}

export function buildRemoveFragmentOperandCommand(
  repo: SysmlRepository,
  input: { interactionId: string; fragmentId: string; operandIndex: number },
): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const fragment = interaction ? fragmentOf(interaction, input.fragmentId) : undefined;
  if (!interaction || !fragment) return fail('FRAGMENT_NOT_FOUND', 'The combined fragment does not exist.');
  if (!fragment.operands[input.operandIndex]) return fail('OPERAND_NOT_FOUND', 'The operand does not exist.');
  if (fragment.operands.length === 1) return fail('LAST_OPERAND', 'A fragment needs at least one operand; delete the fragment instead.');
  return commit(repo, interaction, {
    fragments: replaceFragment(interaction, { ...fragment, operands: fragment.operands.filter((_operand, index) => index !== input.operandIndex) }),
  }, []);
}

export function buildRemoveFragmentCommand(repo: SysmlRepository, input: { interactionId: string; fragmentId: string }): InteractionCommandPlan {
  const interaction = interactionOf(repo, input.interactionId);
  const fragment = interaction ? fragmentOf(interaction, input.fragmentId) : undefined;
  if (!interaction || !fragment) return fail('FRAGMENT_NOT_FOUND', 'The combined fragment does not exist.');
  if (relationshipsTouching(repo, new Set([fragment.id])).length > 0) return blockedByRelationships('The fragment');
  return commit(repo, interaction, { fragments: (interaction.fragments ?? []).filter(candidate => candidate.id !== fragment.id) }, []);
}

/** Lifeline name for messages shown to the user (never an id). */
export function interactionLifelineName(repo: SysmlRepository, interactionId: string, lifelineId: string): string {
  const interaction = interactionOf(repo, interactionId);
  return interaction ? nameOfLifeline(interaction, lifelineId) : 'Lifeline';
}

/** All ids that live inside an interaction (for callers that must not reuse them). */
export function interactionIds(repo: SysmlRepository, interactionId: string): string[] {
  const interaction = interactionOf(repo, interactionId);
  return interaction ? interactionNestedIds(interaction) : [];
}
