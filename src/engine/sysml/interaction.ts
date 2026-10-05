import type {
  BlockDefinition, CombinedFragment, CombinedFragmentOperator, ConnectorUsage, InteractionDefinition, InteractionMessage,
  InteractionMessageSort, InteractionUse, Lifeline, SysmlRepository,
} from './model';
import { connectorEndAsPath } from './connectorEnds';
import { resolveSemanticEndpoint, type SemanticEndpointContext } from './semanticEndpointIndex';
import type { SysmlDiagnostic } from './validation';
import { effectiveSupertypeIds } from './services/supertypes';
import { resolvesAsPartitionOwner } from './activity';
import { isOccurrenceInContext, resolvePartLike } from './partOccurrences';

/**
 * SysML 1.6 Clause 12 (UML interactions), Cameo core set. Pure rules over the
 * nested content of an `InteractionDefinition`; no execution or simulation.
 *
 * Severity policy (same as activities): an `updateElement` is rejected on any
 * staged error, so a rule is an *error* only when the editor can prevent the
 * violation at the moment a message/fragment is added. Rules that are naturally
 * incomplete while a diagram is being drawn (a signal not chosen yet, an
 * unguarded operand) are warnings.
 */

const error = (code: string, elementId: string, propertyPath: string, message: string): SysmlDiagnostic =>
  ({ code, severity: 'error', elementId, propertyPath, message });
const warning = (code: string, elementId: string, propertyPath: string, message: string): SysmlDiagnostic =>
  ({ code, severity: 'warning', elementId, propertyPath, message });

export const MESSAGE_SORT_LABELS: Record<InteractionMessageSort, string> = {
  synchCall: 'Synchronous Call',
  asynchCall: 'Asynchronous Call',
  asynchSignal: 'Signal',
  reply: 'Reply',
  createMessage: 'Create',
  deleteMessage: 'Delete',
};
export const MESSAGE_SORTS = Object.keys(MESSAGE_SORT_LABELS) as InteractionMessageSort[];

export const FRAGMENT_OPERATOR_LABELS: Record<CombinedFragmentOperator, string> = {
  alt: 'alt', opt: 'opt', loop: 'loop', par: 'par', break: 'break', critical: 'critical', neg: 'neg', seq: 'seq', strict: 'strict',
};
export const FRAGMENT_OPERATORS = Object.keys(FRAGMENT_OPERATOR_LABELS) as CombinedFragmentOperator[];
/** Operators whose frame holds exactly one operand (UML 2.5 §17.6.3). */
export const SINGLE_OPERAND_OPERATORS: ReadonlySet<CombinedFragmentOperator> = new Set(['opt', 'loop', 'break', 'critical', 'neg']);

export const CALL_SORTS: ReadonlySet<InteractionMessageSort> = new Set(['synchCall', 'asynchCall']);

/**
 * Lost and found messages (UML §17.4): a lost message is sent and never received, a found message
 * arrives from an unknown sender. They use a sentinel instead of a lifeline id for the missing end.
 */
export const LOST_ENDPOINT = '@lost';
export const FOUND_ENDPOINT = '@found';
const LOST_FOUND_SORTS: ReadonlySet<InteractionMessageSort> = new Set(['asynchCall', 'asynchSignal']);

export function isLostFoundEndpoint(id: string): boolean {
  return id === LOST_ENDPOINT || id === FOUND_ENDPOINT;
}

/** lost / ound for a message with a sentinel end, otherwise undefined. */
export function lostFoundKind(message: Pick<InteractionMessage, 'sourceLifelineId' | 'targetLifelineId'>): 'lost' | 'found' | undefined {
  if (message.targetLifelineId === LOST_ENDPOINT) return 'lost';
  if (message.sourceLifelineId === FOUND_ENDPOINT) return 'found';
  return undefined;
}

/**
 * What is wrong with a message that has a sentinel end, or undefined when it is fine: only
 * asynchronous calls and signals may be lost or found, the other end must be a real lifeline of the
 * interaction, and a sentinel may not sit on the wrong end.
 */
export function lostFoundProblem(
  message: Pick<InteractionMessage, 'sort' | 'sourceLifelineId' | 'targetLifelineId'>,
  lifelineIds: ReadonlySet<string>,
): string | undefined {
  const sentinelEnds = [message.sourceLifelineId, message.targetLifelineId].filter(isLostFoundEndpoint);
  if (sentinelEnds.length === 0) return undefined;
  if (message.sourceLifelineId === LOST_ENDPOINT || message.targetLifelineId === FOUND_ENDPOINT || sentinelEnds.length > 1) {
    return 'A lost message ends at nothing and a found message starts from nothing; exactly one end is a lifeline.';
  }
  if (!LOST_FOUND_SORTS.has(message.sort)) return 'Only an asynchronous call or a signal can be lost or found.';
  const real = lostFoundKind(message) === 'lost' ? message.sourceLifelineId : message.targetLifelineId;
  if (!lifelineIds.has(real)) return 'A lost or found message must connect a lifeline of the same interaction.';
  return undefined;
}

/** Every nested id of an interaction (lifelines, messages, fragments, `ref` uses). */
export function interactionNestedIds(interaction: InteractionDefinition): string[] {
  return [
    ...(interaction.lifelines ?? []).map(lifeline => lifeline.id),
    ...(interaction.messages ?? []).map(message => message.id),
    ...(interaction.fragments ?? []).map(fragment => fragment.id),
    ...(interaction.uses ?? []).map(use => use.id),
    ...(interaction.stateInvariants ?? []).map(invariant => invariant.id),
    ...(interaction.constraints ?? []).map(constraint => constraint.id),
  ];
}

export function isInteractionDefinition(value: unknown): value is InteractionDefinition {
  return Boolean(value) && (value as { kind?: string }).kind === 'interaction';
}

export function listInteractions(repo: SysmlRepository): InteractionDefinition[] {
  return Object.values(repo.definitions).filter(isInteractionDefinition);
}

export type InteractionElementKind = 'lifeline' | 'message' | 'fragment' | 'use' | 'stateInvariant' | 'constraint';
export interface InteractionElementRef {
  interaction: InteractionDefinition;
  elementKind: InteractionElementKind;
  id: string;
  name: string;
}

/** Locates a nested interaction element anywhere in the repository. */
export function findInteractionElement(repo: SysmlRepository, id: string): InteractionElementRef | undefined {
  for (const interaction of listInteractions(repo)) {
    const inside = findInInteraction(interaction, id);
    if (inside) return inside;
  }
  return undefined;
}

export function findInInteraction(interaction: InteractionDefinition, id: string): InteractionElementRef | undefined {
  const lifeline = (interaction.lifelines ?? []).find(candidate => candidate.id === id);
  if (lifeline) return { interaction, elementKind: 'lifeline', id, name: lifeline.name?.trim() || 'Lifeline' };
  const message = (interaction.messages ?? []).find(candidate => candidate.id === id);
  if (message) return { interaction, elementKind: 'message', id, name: messageLabel(message) };
  const fragment = (interaction.fragments ?? []).find(candidate => candidate.id === id);
  if (fragment) return { interaction, elementKind: 'fragment', id, name: `Combined Fragment (${fragment.operator})` };
  const use = (interaction.uses ?? []).find(candidate => candidate.id === id);
  if (use) return { interaction, elementKind: 'use', id, name: 'Interaction Use' };
  const invariant = (interaction.stateInvariants ?? []).find(candidate => candidate.id === id);
  if (invariant) return { interaction, elementKind: 'stateInvariant', id, name: 'State Invariant' };
  const constraint = (interaction.constraints ?? []).find(candidate => candidate.id === id);
  if (constraint) return { interaction, elementKind: 'constraint', id, name: constraint.kind === 'duration' ? 'Duration Constraint' : 'Time Constraint' };
  return undefined;
}

/** Interactions the given one refers to through its `ref` frames. */
export function referencedInteractionIds(interaction: Pick<InteractionDefinition, 'uses'>): string[] {
  return [...new Set((interaction.uses ?? []).map(use => use.refersToId))];
}

/**
 * Whether adding a `ref` from `fromId` to `toId` would make interactions refer
 * to each other in a loop (including `fromId` referring to itself).
 */
export function wouldCreateUseCycle(repo: SysmlRepository, fromId: string, toId: string): boolean {
  const seen = new Set<string>();
  const stack = [toId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === fromId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const definition = repo.definitions[current];
    if (definition?.kind === 'interaction') stack.push(...referencedInteractionIds(definition));
  }
  return false;
}

/** The text of an operation signature before its parameter list. */
export function operationName(signature: string): string {
  return signature.split('(')[0].trim();
}

/** Display text of a message: its name, else the operation it calls. */
export function messageLabel(message: Pick<InteractionMessage, 'name' | 'sort' | 'signatureId'>): string {
  const name = message.name?.trim();
  if (name) return name;
  if (CALL_SORTS.has(message.sort) && message.signatureId) return operationName(message.signatureId);
  return MESSAGE_SORT_LABELS[message.sort] ?? 'Message';
}

/** Messages in diagram order (ascending `order`, ties keep array order). */
export function orderedMessages(interaction: Pick<InteractionDefinition, 'messages'>): InteractionMessage[] {
  return [...(interaction.messages ?? [])]
    .map((message, index) => ({ message, index }))
    .sort((a, b) => (a.message.order - b.message.order) || (a.index - b.index))
    .map(entry => entry.message);
}

export interface ReplyPairing {
  /** synchronous call id -> the reply answering it */
  replyOf: Map<string, string>;
  /** reply id -> the call it answers */
  callOf: Map<string, string>;
  /** replies that answer no earlier call between the same pair in reverse */
  orphanReplyIds: string[];
}

/**
 * Pairs each reply with the nearest earlier unanswered synchronous call between
 * the same two lifelines in the opposite direction (calls nest, so the most
 * recent open call is answered first).
 */
export function pairReplies(interaction: Pick<InteractionDefinition, 'messages'>): ReplyPairing {
  const replyOf = new Map<string, string>();
  const callOf = new Map<string, string>();
  const orphanReplyIds: string[] = [];
  const open: InteractionMessage[] = [];
  for (const message of orderedMessages(interaction)) {
    if (message.sort === 'synchCall') {
      open.push(message);
    } else if (message.sort === 'reply') {
      let found = -1;
      for (let index = open.length - 1; index >= 0; index -= 1) {
        if (open[index].sourceLifelineId === message.targetLifelineId && open[index].targetLifelineId === message.sourceLifelineId) { found = index; break; }
      }
      if (found < 0) orphanReplyIds.push(message.id);
      else {
        const [call] = open.splice(found, 1);
        replyOf.set(call.id, message.id);
        callOf.set(message.id, call.id);
      }
    }
  }
  return { replyOf, callOf, orphanReplyIds };
}

/** The Block a lifeline is typed by (the Block it represents, or the type of the part/reference it represents). */
export function lifelineBlock(repo: SysmlRepository, lifeline: Pick<Lifeline, 'representsId'>): BlockDefinition | undefined {
  const id = lifeline.representsId;
  if (!id) return undefined;
  const direct = repo.definitions[id];
  if (direct?.kind === 'block') return direct;
  const usage = resolvePartLike(repo, id);
  const typeId = usage?.kind === 'part'
    ? usage.typeId
    : Object.values(repo.definitions).flatMap(definition => definition.kind === 'block' ? definition.properties : [])
      .find(property => property.id === id && (property.kind === 'part' || property.kind === 'reference'))?.typeId;
  const typed = typeId ? repo.definitions[typeId] : undefined;
  return typed?.kind === 'block' ? typed : undefined;
}

/** Operation signatures of a Block, inherited ones included. */
export function blockOperations(repo: SysmlRepository, block: BlockDefinition): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const definition = repo.definitions[id];
    if (definition?.kind !== 'block') return;
    result.push(...(definition.operations ?? []));
    effectiveSupertypeIds(repo, id).forEach(visit);
  };
  visit(block.id);
  return [...new Set(result)];
}

/** Splits on commas that are not inside brackets, angle brackets or quotes. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let current = '';
  for (const char of text) {
    if (quote) {
      current += char;
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; current += char; continue; }
    if ('([{<'.includes(char)) depth += 1;
    if (')]}>'.includes(char)) depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += char;
  }
  parts.push(current);
  return parts.map(part => part.trim()).filter(part => part.length > 0);
}

/** Number of parameters in an operation signature such as `enable(on: Boolean, level: Integer)`. */
export function operationParameterCount(signature: string): number {
  const open = signature.indexOf('(');
  const close = signature.lastIndexOf(')');
  if (open < 0 || close < open) return 0;
  return splitTopLevel(signature.slice(open + 1, close)).length;
}

/** Number of values in a message's arguments text. */
export function argumentCount(args: string | undefined): number {
  return args ? splitTopLevel(args).length : 0;
}

/** Signal ids a Block receives (UML Receptions), inherited ones included. */
export function blockReceptions(repo: SysmlRepository, block: BlockDefinition): string[] {
  const result = new Set<string>();
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const definition = repo.definitions[id];
    if (definition?.kind !== 'block') return;
    (definition.receptions ?? []).forEach(signalId => result.add(signalId));
    effectiveSupertypeIds(repo, id).forEach(visit);
  };
  visit(block.id);
  return [...result];
}

/** Whether `signature` names one of the operations (exact text, or the same operation name). */
export function operationMatches(operations: readonly string[], signature: string): boolean {
  const wanted = operationName(signature);
  return operations.some(operation => operation === signature || operationName(operation) === wanted);
}

/** A lifeline may stand for a Block, a part of one, or an Actor (an external role in a use case scenario). */
export function lifelineTargetExists(repo: SysmlRepository, id: string): boolean {
  return resolvesAsPartitionOwner(repo, id) || Boolean(repo.actors?.[id]);
}

/** Whether the Actor, or an Actor it specializes, is associated with the Use Case. */
export function actorAssociatedWith(repo: SysmlRepository, actorId: string, useCaseId: string): boolean {
  const seen = new Set<string>();
  const queue = [actorId];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (seen.has(current)) continue;
    seen.add(current);
    const associated = Object.values(repo.relationships).some(relationship => relationship.kind === 'useCaseAssociation'
      && ((relationship.sourceId === current && relationship.targetId === useCaseId) || (relationship.targetId === current && relationship.sourceId === useCaseId)));
    if (associated) return true;
    queue.push(...(repo.actors?.[current]?.generalizationIds ?? []));
  }
  return false;
}

/** The Block that owns the interaction (its context), when it is Block-owned. */
export function interactionContextBlock(repo: SysmlRepository, interaction: Pick<InteractionDefinition, 'ownerId'>): BlockDefinition | undefined {
  const owner = interaction.ownerId ? repo.definitions[interaction.ownerId] : undefined;
  return owner?.kind === 'block' ? owner : undefined;
}

/**
 * Whether a lifeline's `representsId` belongs to the context Block: the Block
 * itself, or one of its part/reference properties (inherited ones and nested
 * property paths included, and the legacy part record that stands for one).
 */
export function isLifelineInContext(repo: SysmlRepository, context: BlockDefinition, representsId: string): boolean {
  if (representsId === context.id) return true;
  const usage = repo.usages?.[representsId];
  if (usage?.kind === 'part') {
    return usage.ownerId === context.id || isOccurrenceInContext(repo, context.id, usage.propertyId ?? usage.id);
  }
  return isOccurrenceInContext(repo, context.id, representsId);
}

/** Connectors of the context Block (own or inherited): the structure messages can travel over. */
export function contextConnectors(repo: SysmlRepository, context: BlockDefinition): ConnectorUsage[] {
  const owners = new Set<string>([context.id, ...effectiveSupertypeIds(repo, context.id)]);
  return Object.values(repo.connectors).filter(connector => owners.has(connector.ownerId));
}

/**
 * The property path from the context Block that a lifeline stands for: `[]`
 * for the Block itself, `[propertyId]` for a part or reference property (or
 * the legacy part record standing for one), the path itself for a nested part.
 */
function lifelineStructurePath(repo: SysmlRepository, context: BlockDefinition, representsId: string): string[] | undefined {
  if (representsId === context.id) return [];
  if (!isLifelineInContext(repo, context, representsId)) return undefined;
  if (representsId.includes('/')) return representsId.split('/');
  const usage = repo.usages?.[representsId];
  return [usage?.kind === 'part' ? (usage.propertyId ?? usage.id) : representsId];
}

/** A connector end belongs to a lifeline when it is that part, a port of it, or anything nested inside it. */
function endBelongsTo(endPath: readonly string[], lifelinePath: readonly string[]): boolean {
  if (lifelinePath.length === 0) return endPath.length === 0;
  return endPath.length >= lifelinePath.length && lifelinePath.every((segment, index) => endPath[index] === segment);
}

/**
 * The connectors that join the two lifelines, or `undefined` when that cannot be
 * judged (no context Block, or a lifeline that stands for nothing in it).
 */
export function connectorsBetweenLifelines(
  repo: SysmlRepository,
  interaction: InteractionDefinition,
  sourceLifelineId: string,
  targetLifelineId: string,
): ConnectorUsage[] | undefined {
  const context = interactionContextBlock(repo, interaction);
  if (!context) return undefined;
  const lifelines = interaction.lifelines ?? [];
  const sourceRepresents = lifelines.find(lifeline => lifeline.id === sourceLifelineId)?.representsId;
  const targetRepresents = lifelines.find(lifeline => lifeline.id === targetLifelineId)?.representsId;
  if (!sourceRepresents || !targetRepresents) return undefined;
  const a = lifelineStructurePath(repo, context, sourceRepresents);
  const b = lifelineStructurePath(repo, context, targetRepresents);
  if (!a || !b) return undefined;
  return contextConnectors(repo, context).filter(connector => {
    const source = connectorEndAsPath(repo, connector, 'source');
    const target = connectorEndAsPath(repo, connector, 'target');
    if (!source || !target) return false;
    return (endBelongsTo(source.path, a) && endBelongsTo(target.path, b))
      || (endBelongsTo(source.path, b) && endBelongsTo(target.path, a));
  });
}

export interface MessageCheck { code: string; message: string; }

/**
 * Legality of one message against the interaction it would join, used by both
 * the repository validation and the editor's command builders so the canvas
 * never offers a message the rules would reject. `existing` is the interaction
 * without the candidate; `candidate` carries its final `order`.
 */
export function checkInteractionMessage(
  repo: SysmlRepository,
  existing: InteractionDefinition,
  candidate: Pick<InteractionMessage, 'sort' | 'sourceLifelineId' | 'targetLifelineId' | 'order' | 'signatureId'> & { id?: string; connectorId?: string },
): MessageCheck | undefined {
  const lifelines = existing.lifelines ?? [];
  const source = lifelines.find(lifeline => lifeline.id === candidate.sourceLifelineId);
  const target = lifelines.find(lifeline => lifeline.id === candidate.targetLifelineId);
  const lostFound = lostFoundKind(candidate) !== undefined || isLostFoundEndpoint(candidate.sourceLifelineId) || isLostFoundEndpoint(candidate.targetLifelineId);
  if (lostFound) {
    const problem = lostFoundProblem(candidate, new Set(lifelines.map(lifeline => lifeline.id)));
    if (problem) return { code: 'LOST_FOUND_INVALID', message: problem };
  } else if (!source || !target) {
    return { code: 'MESSAGE_ENDPOINT_MISSING', message: 'A message must connect two lifelines of the same interaction.' };
  }
  if ((existing.messages ?? []).some(message => message.id !== candidate.id && message.order === candidate.order)) {
    return { code: 'DUPLICATE_MESSAGE_ORDER', message: 'Another message already has this position.' };
  }
  if (candidate.sort === 'reply') {
    const probe: InteractionDefinition = {
      ...existing,
      messages: [...(existing.messages ?? []).filter(message => message.id !== candidate.id), {
        id: candidate.id ?? '__candidate__', name: '', sort: 'reply', sourceLifelineId: candidate.sourceLifelineId,
        targetLifelineId: candidate.targetLifelineId, order: candidate.order,
      }],
    };
    if (pairReplies(probe).orphanReplyIds.includes(candidate.id ?? '__candidate__')) {
      return { code: 'REPLY_WITHOUT_CALL', message: 'A reply must answer an earlier synchronous call between the same two lifelines in the opposite direction.' };
    }
  }
  if (candidate.sort === 'asynchSignal' && candidate.signatureId && repo.definitions[candidate.signatureId]?.kind !== 'signal') {
    return { code: 'MISSING_MESSAGE_SIGNAL', message: 'A signal message must reference a Signal that exists.' };
  }
  if (CALL_SORTS.has(candidate.sort) && candidate.signatureId && target) {
    const block = lifelineBlock(repo, target);
    if (block && !operationMatches(blockOperations(repo, block), candidate.signatureId)) {
      return { code: 'UNKNOWN_MESSAGE_OPERATION', message: `${block.name} has no operation “${operationName(candidate.signatureId)}”.` };
    }
  }
  if (candidate.connectorId && source && target) {
    const problem = connectorProblem(repo, existing, candidate.connectorId, candidate.sourceLifelineId, candidate.targetLifelineId);
    if (problem) return problem;
  }
  const destroyed = destroyedAtOrder(existing, candidate.id);
  for (const lifeline of [source, target]) {
    if (!lifeline) continue;
    const at = destroyed.get(lifeline.id);
    if (at !== undefined && candidate.order > at) {
      return { code: 'MESSAGE_AFTER_DELETE', message: `${lifeline.name?.trim() || 'The lifeline'} has already been deleted; nothing may follow a delete message on it.` };
    }
  }
  return undefined;
}

/** Why `connectorId` cannot carry a message between these lifelines, if it cannot. */
function connectorProblem(
  repo: SysmlRepository,
  interaction: InteractionDefinition,
  connectorId: string,
  sourceLifelineId: string,
  targetLifelineId: string,
): MessageCheck | undefined {
  if (!repo.connectors[connectorId]) {
    return { code: 'MESSAGE_CONNECTOR_MISSING', message: 'The connector this message travels over does not exist.' };
  }
  const between = connectorsBetweenLifelines(repo, interaction, sourceLifelineId, targetLifelineId);
  // Not judgeable (no context Block, or a lifeline that is not one of its parts): accept it.
  if (between && !between.some(connector => connector.id === connectorId)) {
    return { code: 'MESSAGE_CONNECTOR_MISMATCH', message: 'That connector does not join the parts these lifelines represent.' };
  }
  return undefined;
}

/** lifeline id -> the order of the first delete message that destroys it. */
function destroyedAtOrder(interaction: Pick<InteractionDefinition, 'messages'>, ignoreId?: string): Map<string, number> {
  const destroyed = new Map<string, number>();
  for (const message of interaction.messages ?? []) {
    if (message.sort !== 'deleteMessage' || message.id === ignoreId) continue;
    const previous = destroyed.get(message.targetLifelineId);
    if (previous === undefined || message.order < previous) destroyed.set(message.targetLifelineId, message.order);
  }
  return destroyed;
}

export function validateInteraction(repo: SysmlRepository, interaction: InteractionDefinition, endpoints?: SemanticEndpointContext): SysmlDiagnostic[] {
  const diagnostics: SysmlDiagnostic[] = [];
  const name = interaction.name?.trim() || 'Interaction';
  const lifelines = interaction.lifelines ?? [];
  const messages = interaction.messages ?? [];
  const fragments = interaction.fragments ?? [];
  const lifelineById = new Map(lifelines.map(lifeline => [lifeline.id, lifeline]));
  const messageById = new Map(messages.map(message => [message.id, message]));

  const context = interactionContextBlock(repo, interaction);
  const contextHasConnectors = Boolean(context && contextConnectors(repo, context).length > 0);
  // An Interaction owned by a Use Case is that use case's scenario.
  const scenarioUseCaseId = interaction.ownerId && repo.useCases?.[interaction.ownerId] ? interaction.ownerId : undefined;
  const seenNames = new Set<string>();
  lifelines.forEach((lifeline, index) => {
    const label = lifeline.name?.trim();
    const actor = lifeline.representsId ? repo.actors?.[lifeline.representsId] : undefined;
    if (lifeline.representsId && !lifelineTargetExists(repo, lifeline.representsId)) {
      diagnostics.push(error('MISSING_LIFELINE_REPRESENTS', lifeline.id, `lifelines.${index}.representsId`, `Lifeline ${label || 'Lifeline'} in ${name} represents an element that does not exist (expected a Block, part or Actor)`));
    } else if (actor && scenarioUseCaseId && !actorAssociatedWith(repo, actor.id, scenarioUseCaseId)) {
      diagnostics.push(warning('SCENARIO_ACTOR_NOT_ASSOCIATED', lifeline.id, `lifelines.${index}.representsId`, `Actor ${actor.name} in ${name} is not associated with the use case this scenario belongs to`));
    } else if (context && lifeline.representsId && !actor && !isLifelineInContext(repo, context, lifeline.representsId)) {
      // Never an error: an Interaction owned by a Block describes that Block's
      // internal collaboration, but other Blocks may still take part.
      diagnostics.push(warning('LIFELINE_OUTSIDE_CONTEXT', lifeline.id, `lifelines.${index}.representsId`, `Lifeline ${label || 'Lifeline'} in ${name} is not the context Block ${context.name} or one of its parts`));
    }
    if (label) {
      if (seenNames.has(label)) diagnostics.push(warning('DUPLICATE_LIFELINE_NAME', lifeline.id, `lifelines.${index}.name`, `${name} has more than one lifeline named “${label}”`));
      seenNames.add(label);
    }
  });

  const orders = new Map<number, string>();
  const destroyed = destroyedAtOrder(interaction);
  const pairing = pairReplies(interaction);
  messages.forEach((message, index) => {
    const path = `messages.${index}`;
    const label = messageLabel(message);
    const source = lifelineById.get(message.sourceLifelineId);
    const target = lifelineById.get(message.targetLifelineId);
    if (isLostFoundEndpoint(message.sourceLifelineId) || isLostFoundEndpoint(message.targetLifelineId)) {
      const problem = lostFoundProblem(message, new Set(lifelineById.keys()));
      if (problem) diagnostics.push(error('LOST_FOUND_INVALID', message.id, path, `Message ${label} in ${name}: ${problem}`));
    } else if (!source || !target) {
      diagnostics.push(error('MESSAGE_ENDPOINT_MISSING', message.id, path, `Message ${label} in ${name} connects a lifeline that does not exist`));
    }
    if (!Number.isFinite(message.order)) {
      diagnostics.push(error('INVALID_MESSAGE_ORDER', message.id, `${path}.order`, `Message ${label} in ${name} has no valid position`));
    } else if (orders.has(message.order)) {
      diagnostics.push(error('DUPLICATE_MESSAGE_ORDER', message.id, `${path}.order`, `Messages ${messageLabel(messageById.get(orders.get(message.order)!) ?? message)} and ${label} in ${name} share the same position`));
    } else {
      orders.set(message.order, message.id);
    }
    if (message.sort === 'reply' && pairing.orphanReplyIds.includes(message.id)) {
      diagnostics.push(error('REPLY_WITHOUT_CALL', message.id, path, `Reply ${label} in ${name} answers no earlier synchronous call between the same two lifelines in the opposite direction`));
    }
    if (message.sort === 'asynchSignal') {
      if (!message.signatureId) {
        diagnostics.push(warning('SIGNAL_MESSAGE_WITHOUT_SIGNAL', message.id, `${path}.signatureId`, `Signal message ${label} in ${name} does not reference a Signal`));
      } else if (repo.definitions[message.signatureId]?.kind !== 'signal') {
        diagnostics.push(error('MISSING_MESSAGE_SIGNAL', message.id, `${path}.signatureId`, `Signal message ${label} in ${name} references a Signal that does not exist`));
      } else if (target) {
        // Only when the receiving Block declares receptions at all: a Block with
        // none has not said what it accepts, so old models stay quiet.
        const receiver = lifelineBlock(repo, target);
        const received = receiver ? blockReceptions(repo, receiver) : [];
        if (receiver && received.length > 0 && !received.includes(message.signatureId)) {
          diagnostics.push(warning('SIGNAL_NOT_RECEIVED', message.id, `${path}.signatureId`, `${receiver.name} does not receive the Signal sent by ${label} in ${name}`));
        }
      }
    }
    if (CALL_SORTS.has(message.sort) && message.signatureId && target) {
      const block = lifelineBlock(repo, target);
      if (block && !operationMatches(blockOperations(repo, block), message.signatureId)) {
        diagnostics.push(error('UNKNOWN_MESSAGE_OPERATION', message.id, `${path}.signatureId`, `Message ${label} in ${name} calls an operation that ${block.name} does not have. Rename the operation instead of removing it, or retarget this message first`));
      }
    }
    // Arguments are free text, so only the count is checked, and only when the
    // author wrote arguments at all (an empty field means "not specified yet").
    if (CALL_SORTS.has(message.sort) && message.signatureId && message.arguments?.trim()) {
      const expected = operationParameterCount(message.signatureId);
      const given = argumentCount(message.arguments);
      if (given !== expected) {
        diagnostics.push(warning('ARGUMENT_COUNT_MISMATCH', message.id, `${path}.arguments`, `Message ${label} in ${name} passes ${given} argument${given === 1 ? '' : 's'}, but ${operationName(message.signatureId)} takes ${expected}`));
      }
    }
    if (source && target) {
      if (message.connectorId) {
        const problem = connectorProblem(repo, interaction, message.connectorId, message.sourceLifelineId, message.targetLifelineId);
        if (problem) diagnostics.push(error(problem.code, message.id, `${path}.connectorId`, `Message ${label} in ${name}: ${problem.message}`));
      } else if (contextHasConnectors && source.id !== target.id) {
        // Only for a context that has wired its parts at all, and never an error:
        // a message between unwired parts is a modelling gap, not a contradiction.
        const between = connectorsBetweenLifelines(repo, interaction, source.id, target.id);
        if (between && between.length === 0) {
          diagnostics.push(warning('MESSAGE_WITHOUT_CONNECTOR', message.id, path, `Message ${label} in ${name} goes between parts that no connector joins`));
        }
      }
    }
    for (const lifelineId of new Set([message.sourceLifelineId, message.targetLifelineId])) {
      const at = destroyed.get(lifelineId);
      if (at !== undefined && message.order > at) {
        diagnostics.push(error('MESSAGE_AFTER_DELETE', message.id, path, `Message ${label} in ${name} follows a delete message on ${lifelineById.get(lifelineId)?.name?.trim() || 'a lifeline'}`));
      }
    }
  });

  fragments.forEach((fragment, index) => {
    const path = `fragments.${index}`;
    const covered = new Set(fragment.coveredLifelineIds ?? []);
    for (const lifelineId of covered) {
      if (!lifelineById.has(lifelineId)) {
        diagnostics.push(error('FRAGMENT_LIFELINE_MISSING', fragment.id, `${path}.coveredLifelineIds`, `A ${fragment.operator} fragment in ${name} covers a lifeline that does not exist`));
      }
    }
    const operands = fragment.operands ?? [];
    if (SINGLE_OPERAND_OPERATORS.has(fragment.operator) && operands.length > 1) {
      diagnostics.push(error('FRAGMENT_OPERAND_COUNT', fragment.id, `${path}.operands`, `A ${fragment.operator} fragment in ${name} has ${operands.length} operands; it may have only one`));
    }
    if (fragment.operator === 'alt' && operands.length === 1) {
      diagnostics.push(warning('ALT_NEEDS_OPERANDS', fragment.id, `${path}.operands`, `An alt fragment in ${name} needs at least two operands`));
    }
    const used = new Set<string>();
    operands.forEach((operand, operandIndex) => {
      if (fragment.operator === 'alt' && operands.length > 1 && operandIndex < operands.length - 1 && !operand.guard?.trim()) {
        diagnostics.push(warning('ALT_OPERAND_MISSING_GUARD', fragment.id, `${path}.operands.${operandIndex}.guard`, `Operand ${operandIndex + 1} of an alt fragment in ${name} has no guard`));
      }
      for (const messageId of operand.messageIds ?? []) {
        const message = messageById.get(messageId);
        if (!message) {
          diagnostics.push(error('FRAGMENT_MESSAGE_MISSING', fragment.id, `${path}.operands.${operandIndex}.messageIds`, `A ${fragment.operator} fragment in ${name} lists a message that does not exist`));
          continue;
        }
        if (used.has(messageId)) {
          diagnostics.push(error('MESSAGE_IN_MULTIPLE_OPERANDS', fragment.id, `${path}.operands.${operandIndex}.messageIds`, `Message ${messageLabel(message)} appears in more than one operand of the same ${fragment.operator} fragment in ${name}`));
        }
        used.add(messageId);
        const ends = [message.sourceLifelineId, message.targetLifelineId].filter(id => !isLostFoundEndpoint(id));
        if (ends.some(id => !covered.has(id))) {
          diagnostics.push(error('FRAGMENT_MESSAGE_NOT_COVERED', fragment.id, `${path}.operands.${operandIndex}.messageIds`, `Message ${messageLabel(message)} in a ${fragment.operator} fragment of ${name} touches a lifeline the fragment does not cover`));
        }
      }
    });
  });
  (interaction.uses ?? []).forEach((use, index) => {
    const path = `uses.${index}`;
    const target = repo.definitions[use.refersToId];
    if (target?.kind !== 'interaction') {
      diagnostics.push(error('USE_TARGET_MISSING', use.id, `${path}.refersToId`, `A ref frame in ${name} refers to an interaction that does not exist`));
    } else if (wouldCreateUseCycle(repo, interaction.id, use.refersToId)) {
      diagnostics.push(error('USE_CYCLE', use.id, `${path}.refersToId`, `${name} refers to ${target.name?.trim() || 'an interaction'}, which leads back to ${name}`));
    }
    for (const lifelineId of use.coveredLifelineIds ?? []) {
      if (!lifelineById.has(lifelineId)) {
        diagnostics.push(error('USE_LIFELINE_MISSING', use.id, `${path}.coveredLifelineIds`, `A ref frame in ${name} covers a lifeline that does not exist`));
      }
    }
    if (use.afterMessageId && !messageById.has(use.afterMessageId)) {
      diagnostics.push(error('USE_ANCHOR_MISSING', use.id, `${path}.afterMessageId`, `A ref frame in ${name} follows a message that does not exist`));
    }
    if ((use.coveredLifelineIds ?? []).length === 0) {
      diagnostics.push(warning('USE_WITHOUT_LIFELINES', use.id, `${path}.coveredLifelineIds`, `A ref frame in ${name} covers no lifeline`));
    }
  });
  (interaction.constraints ?? []).forEach((constraint, index) => {
    const path = `constraints.${index}`;
    const kindLabel = constraint.kind === 'duration' ? 'duration' : 'time';
    if (!messageById.has(constraint.fromMessageId)) {
      diagnostics.push(error('CONSTRAINT_ANCHOR_MISSING', constraint.id, `${path}.fromMessageId`, `A ${kindLabel} constraint in ${name} marks a message that does not exist`));
    }
    if (constraint.toMessageId && !messageById.has(constraint.toMessageId)) {
      diagnostics.push(error('CONSTRAINT_ANCHOR_MISSING', constraint.id, `${path}.toMessageId`, `A ${kindLabel} constraint in ${name} ends at a message that does not exist`));
    }
    if (constraint.kind === 'duration' && !constraint.toMessageId) {
      diagnostics.push(warning('DURATION_WITHOUT_END', constraint.id, `${path}.toMessageId`, `A duration constraint in ${name} has no end message`));
    }
    if (!constraint.expression?.trim()) {
      diagnostics.push(warning('CONSTRAINT_WITHOUT_EXPRESSION', constraint.id, `${path}.expression`, `A ${kindLabel} constraint in ${name} has no expression`));
    }
  });
  (interaction.stateInvariants ?? []).forEach((invariant, index) => {
    const path = `stateInvariants.${index}`;
    if (!lifelineById.has(invariant.lifelineId)) {
      diagnostics.push(error('STATE_INVARIANT_LIFELINE_MISSING', invariant.id, `${path}.lifelineId`, `A state invariant in ${name} is on a lifeline that does not exist`));
    }
    if (invariant.afterMessageId && !messageById.has(invariant.afterMessageId)) {
      diagnostics.push(error('STATE_INVARIANT_ANCHOR_MISSING', invariant.id, `${path}.afterMessageId`, `A state invariant in ${name} follows a message that does not exist`));
    }
    // The state machine editor is separate: a missing state is only a warning,
    // and only when the caller knows the states (an endpoint context was given).
    if (endpoints?.externalEndpoints && !resolveSemanticEndpoint(repo, invariant.stateId, endpoints)) {
      diagnostics.push(warning('STATE_INVARIANT_UNRESOLVED', invariant.id, `${path}.stateId`, `A state invariant in ${name} names a state that is not in the state machine`));
    }
  });
  return diagnostics;
}

export function validateInteractions(repo: SysmlRepository, endpoints?: SemanticEndpointContext): SysmlDiagnostic[] {
  return listInteractions(repo).flatMap(interaction => validateInteraction(repo, interaction, endpoints));
}

/** The repository with `next` swapped in, for validating a candidate before it is committed. */
export function withInteraction(repo: SysmlRepository, next: InteractionDefinition): SysmlRepository {
  return { ...repo, definitions: { ...repo.definitions, [next.id]: next } };
}

/** True when `candidateId` is `ancestorId` or inherits from it (directly or transitively). */
function blockIsOrInherits(repo: SysmlRepository, candidateId: string, ancestorId: string): boolean {
  const seen = new Set<string>();
  const visit = (id: string): boolean => {
    if (id === ancestorId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return effectiveSupertypeIds(repo, id).some(visit);
  };
  return visit(candidateId);
}

/**
 * How operation signatures renamed on a Block map to their new text. An
 * operation counts as renamed when the same position changed to text that is
 * neither an existing nor a removed operation of the Block; simultaneous
 * add + remove is paired in order only when the counts agree.
 */
export function renamedOperations(before: readonly string[], after: readonly string[]): Map<string, string> {
  const renames = new Map<string, string>();
  const removed = before.filter(signature => !after.includes(signature));
  const added = after.filter(signature => !before.includes(signature));
  if (removed.length === 0 || removed.length !== added.length) return renames;
  // A blank signature is never a rename: calls must not be rewritten to blank text (it would
  // silently detach them) nor from it. Emptying an operation that calls use is left to validation,
  // which refuses it. Limitation: a rename that passes through blank text starts again from the
  // last real signature, so an editor should drop blank lines (the Block inspector does).
  removed.forEach((signature, index) => {
    if (signature.trim() && added[index].trim()) renames.set(signature, added[index]);
  });
  return renames;
}

export interface InteractionMessageRewrite {
  interactionId: string;
  messages: InteractionMessage[];
}

/**
 * Messages that call an operation of `blockId` (or of a Block inheriting from
 * it) under its old text, rewritten to the new text. Used so renaming an
 * operation never leaves a call pointing at an operation that no longer exists.
 */
export function planOperationRenames(
  repo: SysmlRepository,
  blockId: string,
  before: readonly string[],
  after: readonly string[],
): InteractionMessageRewrite[] {
  const renames = renamedOperations(before, after);
  if (renames.size === 0) return [];
  const rewrites: InteractionMessageRewrite[] = [];
  for (const interaction of listInteractions(repo)) {
    let changed = false;
    const messages = (interaction.messages ?? []).map(message => {
      const next = message.signatureId ? renames.get(message.signatureId) : undefined;
      if (!next || !CALL_SORTS.has(message.sort)) return message;
      const target = (interaction.lifelines ?? []).find(lifeline => lifeline.id === message.targetLifelineId);
      const receiver = target ? lifelineBlock(repo, target) : undefined;
      if (!receiver || !blockIsOrInherits(repo, receiver.id, blockId)) return message;
      changed = true;
      return { ...message, signatureId: next };
    });
    if (changed) rewrites.push({ interactionId: interaction.id, messages });
  }
  return rewrites;
}

export interface InteractionReferenceEdit {
  interactionId: string;
  lifelines: Lifeline[];
  messages: InteractionMessage[];
  /** Present only when a `ref` frame was dropped. */
  uses?: InteractionUse[];
  /** Lifeline and message ids whose reference was cleared. */
  elementIds: string[];
}

/**
 * The edits that stop an interaction pointing at elements that are going away.
 * A lifeline whose `representsId` is gone survives untyped, and a signal
 * message whose Signal is gone survives unassigned (Cameo behaviour), instead
 * of leaving a dangling reference that the repository rules report as an error.
 * `gone` holds every id that disappears, including the part/reference property
 * ids of deleted Blocks. Interactions that are themselves going away are skipped.
 */
export function clearInteractionReferences(repo: SysmlRepository, gone: ReadonlySet<string>): InteractionReferenceEdit[] {
  const edits: InteractionReferenceEdit[] = [];
  for (const interaction of listInteractions(repo)) {
    if (gone.has(interaction.id)) continue;
    const elementIds: string[] = [];
    const lifelines = (interaction.lifelines ?? []).map(lifeline => {
      if (!lifeline.representsId || !gone.has(lifeline.representsId)) return lifeline;
      elementIds.push(lifeline.id);
      const { representsId: _removed, ...rest } = lifeline;
      return rest as Lifeline;
    });
    const messages = (interaction.messages ?? []).map(message => {
      let next = message;
      if (message.sort === 'asynchSignal' && message.signatureId && gone.has(message.signatureId)) {
        const { signatureId: _removed, ...rest } = next;
        next = rest as InteractionMessage;
      }
      if (message.connectorId && gone.has(message.connectorId)) {
        const { connectorId: _removed, ...rest } = next;
        next = rest as InteractionMessage;
      }
      if (next !== message) elementIds.push(message.id);
      return next;
    });
    // A `ref` frame to a deleted interaction has nothing left to refer to: it goes.
    const keptUses = (interaction.uses ?? []).filter(use => !gone.has(use.refersToId));
    const usesChanged = keptUses.length !== (interaction.uses ?? []).length;
    if (usesChanged) elementIds.push(...(interaction.uses ?? []).filter(use => gone.has(use.refersToId)).map(use => use.id));
    if (elementIds.length > 0) {
      edits.push({ interactionId: interaction.id, lifelines, messages, elementIds, ...(usesChanged ? { uses: keptUses } : {}) });
    }
  }
  return edits;
}

/** Ids of the lifelines and messages that reference something in `gone` (for deletion impact). */
export function interactionReferencesTo(repo: SysmlRepository, gone: ReadonlySet<string>): string[] {
  return clearInteractionReferences(repo, gone).flatMap(edit => edit.elementIds).sort();
}

/** Fragments of an interaction whose operands list `messageId`. */
export function fragmentsOfMessage(interaction: Pick<InteractionDefinition, 'fragments'>, messageId: string): CombinedFragment[] {
  return (interaction.fragments ?? []).filter(fragment => (fragment.operands ?? []).some(operand => (operand.messageIds ?? []).includes(messageId)));
}
