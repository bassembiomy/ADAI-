/**
 * Sequence Diagram projection (SysML 1.6 Clause 12 / UML 2.5 §17).
 *
 * Pure: repository in, positioned notation out. The workspace component only
 * renders this and dispatches gateway commands. Everything is derived from the
 * Interaction, so there is nothing to place by hand:
 *
 *  - lifelines: a head box with a dashed line below it, left to right in
 *    lifeline order. A lifeline that a create message targets starts at that
 *    message; a delete message ends it with a cross.
 *  - messages: horizontal arrows, top to bottom in `order`.
 *      synchCall / deleteMessage: solid line, filled head
 *      asynchCall / asynchSignal:  solid line, open head
 *      reply / createMessage:      dashed line, open head
 *  - execution specifications: a bar on the target lifeline from each
 *    synchronous call to its reply (nested calls are offset to the right).
 *  - combined fragments: a labelled frame around the messages of its operands,
 *    operands separated by dashed lines with their `[guard]`.
 */
import type {
  CombinedFragmentOperator, InteractionDefinition, InteractionMessage, InteractionMessageSort, InteractionUse, StateInvariant, SysmlRepository,
} from '../../engine/sysml/model';
import { FOUND_ENDPOINT, LOST_ENDPOINT, lifelineBlock, lostFoundKind, messageLabel, orderedMessages, pairReplies } from '../../engine/sysml/interaction';
import { allocationNamesByElement } from '../../engine/sysml/allocation';
import { resolveSemanticEndpoint, type SemanticEndpointContext } from '../../engine/sysml/semanticEndpointIndex';
import { sysmlObjectLabel } from './sysmlDisplayLabel';

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }

export const MARGIN_X = 40;
export const LIFELINE_SPACING = 210;
export const HEAD_WIDTH = 140;
export const HEAD_HEIGHT = 48;
export const HEAD_Y = 24;
export const FIRST_MESSAGE_Y = HEAD_Y + HEAD_HEIGHT + 56;
export const MESSAGE_SPACING = 56;
export const ACTIVATION_WIDTH = 12;
export const ACTIVATION_OFFSET = 6;
export const SELF_LOOP_WIDTH = 38;
export const SELF_LOOP_HEIGHT = 22;
/** Height of a `ref` frame; it takes one message slot. */
export const USE_HEIGHT = 40;
/** Horizontal distance of the circle of a lost or found message from its lifeline. */
export const LOST_FOUND_REACH = 90;
/** Height of a state invariant box; it takes one message slot. */
export const INVARIANT_HEIGHT = 28;

export type SequenceHeadStyle = 'filled' | 'open';

export interface LifelineView {
  id: string;
  label: string;
  /** `: Type` line under the label, when the lifeline represents a typed part. */
  typeLabel?: string;
  representsLabel?: string;
  /** The lifeline stands for an Actor (drawn with an «actor» keyword instead of a type line). */
  isActor?: boolean;
  index: number;
  centerX: number;
  head: Rect;
  /** Where the dashed line starts (head bottom) and ends. */
  lineTop: number;
  lineBottom: number;
  /** Set when a delete message ends the lifeline: the cross is drawn here. */
  destroyedAtY?: number;
  /** Set when a create message brings the lifeline into existence. */
  createdAtY?: number;
  allocatedTo: string[];
}

export interface MessageView {
  id: string;
  sort: InteractionMessageSort;
  /** 1-based position. */
  position: number;
  /** `1: name(args)`. */
  text: string;
  sourceLifelineId: string;
  targetLifelineId: string;
  y: number;
  /** Polyline from the source to the arrowhead (four points for a self message). */
  points: Point[];
  dashed: boolean;
  head: SequenceHeadStyle;
  isSelf: boolean;
  labelAt: Point;
  /** Id of the fragment operand that encloses it, innermost first (for selection feedback). */
  fragmentIds: string[];
  /** Names of what the message is allocated to («allocate»). */
  allocatedTo: string[];
  /** A lost message ends, and a found message starts, at a filled circle instead of a lifeline. */
  lostFound?: 'lost' | 'found';
  /** Centre of that circle. */
  circleAt?: Point;
}

export interface ActivationView {
  /** The call message that opens the bar. */
  callId: string;
  replyId?: string;
  lifelineId: string;
  depth: number;
  bounds: Rect;
}

export interface FragmentOperandView {
  index: number;
  guardLabel: string;
  top: number;
  bottom: number;
}

export interface FragmentView {
  id: string;
  operator: CombinedFragmentOperator;
  bounds: Rect;
  depth: number;
  operands: FragmentOperandView[];
  messageIds: string[];
}

/** A `ref` frame (UML InteractionUse). */
export interface UseView {
  id: string;
  refersToId: string;
  refersToLabel: string;
  /** Text drawn in the frame: the referenced interaction, with its arguments. */
  text: string;
  coveredLifelineIds: string[];
  /** Centre of its vertical slot. */
  y: number;
  bounds: Rect;
}

/** A state invariant: a rounded box on a lifeline. */
export interface StateInvariantView {
  id: string;
  lifelineId: string;
  /** Name of the state, or Unknown state when the state machine no longer has it. */
  text: string;
  resolved: boolean;
  /** Centre of its vertical slot. */
  y: number;
  bounds: Rect;
}

/** A time or duration constraint: a bracket right of the lifelines with {expression}. */
export interface ConstraintView {
  id: string;
  kind: 'time' | 'duration';
  /** {expression}, or {…} while it is empty. */
  text: string;
  /** Bracket position: x of its vertical line, y of its first and last message. */
  x: number;
  yFrom: number;
  yTo: number;
}

export interface SequenceDiagramView {
  interactionId?: string;
  interactionLabel: string;
  lifelines: LifelineView[];
  messages: MessageView[];
  activations: ActivationView[];
  fragments: FragmentView[];
  uses: UseView[];
  stateInvariants: StateInvariantView[];
  constraints: ConstraintView[];
  canvasSize: { width: number; height: number };
}

/** The interaction a diagram documents: the diagram's context, falling back to its owner. */
export function interactionOfDiagram(repo: SysmlRepository, diagramId: string): InteractionDefinition | undefined {
  const diagram = repo.diagrams[diagramId];
  const id = diagram?.contextElementId ?? diagram?.ownerId;
  const definition = id ? repo.definitions[id] : undefined;
  return definition?.kind === 'interaction' ? definition : undefined;
}

export function messageY(index: number): number {
  return FIRST_MESSAGE_Y + index * MESSAGE_SPACING;
}

/**
 * 0-based index at which a new message dropped at `y` is inserted: the number of
 * messages that sit above it. Unlike `messageIndexForY` it follows the real
 * message positions, which move down around `ref` frames.
 */
export function insertionIndexForY(messages: ReadonlyArray<Pick<MessageView, 'y'>>, y: number): number {
  return messages.filter(message => message.y < y - MESSAGE_SPACING / 2).length;
}

/** Index of the message whose row is closest to `y` (drag to reorder); 0 when there are none. */
export function nearestMessageIndex(messages: ReadonlyArray<Pick<MessageView, 'y'>>, y: number): number {
  let best = 0;
  messages.forEach((message, index) => {
    if (Math.abs(message.y - y) < Math.abs(messages[best].y - y)) best = index;
  });
  return best;
}

/** 0-based message slot closest to a vertical position (drag to reorder). */
export function messageIndexForY(y: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round((y - FIRST_MESSAGE_Y) / MESSAGE_SPACING)));
}

const FILLED_HEADS: ReadonlySet<InteractionMessageSort> = new Set(['synchCall', 'deleteMessage']);
const DASHED: ReadonlySet<InteractionMessageSort> = new Set(['reply', 'createMessage']);

function messageText(repo: SysmlRepository, message: InteractionMessage): string {
  let label = messageLabel(message);
  if (message.sort === 'asynchSignal' && !message.name?.trim() && message.signatureId) {
    label = sysmlObjectLabel(repo.definitions[message.signatureId], 'Signal');
  }
  if (message.sort === 'createMessage' && !message.name?.trim()) label = '«create»';
  if (message.sort === 'deleteMessage' && !message.name?.trim()) label = '«destroy»';
  const args = message.arguments?.trim();
  if (args && (message.sort === 'synchCall' || message.sort === 'asynchCall' || message.sort === 'asynchSignal')) label = `${label}(${args})`;
  return label;
}

function representsLabelOf(repo: SysmlRepository, representsId: string): string | undefined {
  const actor = repo.actors?.[representsId];
  if (actor) return sysmlObjectLabel(actor, 'Actor');
  const block = repo.definitions[representsId];
  if (block) return sysmlObjectLabel(block, 'Block');
  const usage = repo.usages[representsId];
  if (usage) return sysmlObjectLabel(usage, 'Part');
  const property = Object.values(repo.definitions).flatMap(def => def.kind === 'block' ? def.properties : []).find(candidate => candidate.id === representsId);
  return property ? sysmlObjectLabel(property, 'Part') : undefined;
}

export interface SequenceViewOptions {
  /** Also draw an execution bar for each asynchronous call, until the receiver's next message. Off by default. */
  asyncExecutionBars?: boolean;
}

export function buildSequenceDiagramView(repo: SysmlRepository, diagramId: string, endpoints?: SemanticEndpointContext, options: SequenceViewOptions = {}): SequenceDiagramView {
  const interaction = interactionOfDiagram(repo, diagramId);
  if (!interaction) {
    return { interactionLabel: '', lifelines: [], messages: [], activations: [], fragments: [], uses: [], stateInvariants: [], constraints: [], canvasSize: { width: 800, height: 480 } };
  }
  const allocation = allocationNamesByElement(repo);
  const sequence = orderedMessages(interaction);
  // Vertical slots: messages in order, each followed by the `ref` frames anchored
  // after it (frames whose anchor is gone or absent sit before the first message).
  const messageIds = new Set(sequence.map(message => message.id));
  type Slot = { kind: 'message'; id: string } | { kind: 'use'; use: InteractionUse } | { kind: 'invariant'; invariant: StateInvariant };
  const extrasAfter = new Map<string | undefined, Slot[]>();
  const addExtra = (afterMessageId: string | undefined, slot: Slot) => {
    const key = afterMessageId && messageIds.has(afterMessageId) ? afterMessageId : undefined;
    extrasAfter.set(key, [...(extrasAfter.get(key) ?? []), slot]);
  };
  for (const use of interaction.uses ?? []) addExtra(use.afterMessageId, { kind: 'use', use });
  for (const invariant of interaction.stateInvariants ?? []) addExtra(invariant.afterMessageId, { kind: 'invariant', invariant });
  const slots: Slot[] = [...(extrasAfter.get(undefined) ?? [])];
  for (const message of sequence) {
    slots.push({ kind: 'message', id: message.id });
    slots.push(...(extrasAfter.get(message.id) ?? []));
  }
  const yOf = new Map<string, number>();
  const useSlotY = new Map<string, number>();
  const invariantSlotY = new Map<string, number>();
  slots.forEach((slot, index) => {
    if (slot.kind === 'message') yOf.set(slot.id, messageY(index));
    else if (slot.kind === 'use') useSlotY.set(slot.use.id, messageY(index));
    else invariantSlotY.set(slot.invariant.id, messageY(index));
  });
  const lastY = slots.length > 0 ? messageY(slots.length - 1) : FIRST_MESSAGE_Y;
  const pairing = pairReplies(interaction);

  // Lifelines
  const createdAt = new Map<string, number>();
  const destroyedAt = new Map<string, number>();
  for (const message of sequence) {
    const y = yOf.get(message.id)!;
    if (message.sort === 'createMessage' && !createdAt.has(message.targetLifelineId)) createdAt.set(message.targetLifelineId, y);
    if (message.sort === 'deleteMessage' && !destroyedAt.has(message.targetLifelineId)) destroyedAt.set(message.targetLifelineId, y);
  }
  const lifelines: LifelineView[] = (interaction.lifelines ?? []).map((lifeline, index) => {
    const centerX = MARGIN_X + HEAD_WIDTH / 2 + index * LIFELINE_SPACING;
    const created = createdAt.get(lifeline.id);
    const headY = created !== undefined ? created - HEAD_HEIGHT / 2 : HEAD_Y;
    const representsLabel = lifeline.representsId ? representsLabelOf(repo, lifeline.representsId) : undefined;
    const block = lifelineBlock(repo, lifeline);
    const name = lifeline.name?.trim();
    const label = name || representsLabel || 'Lifeline';
    const typeLabel = block && sysmlObjectLabel(block, 'Block') !== label ? sysmlObjectLabel(block, 'Block') : undefined;
    const destroyed = destroyedAt.get(lifeline.id);
    return {
      id: lifeline.id,
      label,
      ...(typeLabel ? { typeLabel } : {}),
      ...(representsLabel ? { representsLabel } : {}),
      ...(lifeline.representsId && repo.actors?.[lifeline.representsId] ? { isActor: true } : {}),
      index,
      centerX,
      head: { x: centerX - HEAD_WIDTH / 2, y: headY, width: HEAD_WIDTH, height: HEAD_HEIGHT },
      lineTop: headY + HEAD_HEIGHT,
      lineBottom: destroyed ?? lastY + 70,
      ...(destroyed !== undefined ? { destroyedAtY: destroyed } : {}),
      ...(created !== undefined ? { createdAtY: created } : {}),
      allocatedTo: allocation.get(lifeline.id)?.allocatedTo ?? [],
    };
  });
  const lifelineById = new Map(lifelines.map(lifeline => [lifeline.id, lifeline]));

  // Execution specifications: call -> reply on the target lifeline
  const activations: ActivationView[] = [];
  sequence.forEach((message, sequenceIndex) => {
    const asynchronous = Boolean(options.asyncExecutionBars) && message.sort === 'asynchCall';
    if (message.sort !== 'synchCall' && !asynchronous) return;
    const target = lifelineById.get(message.targetLifelineId);
    if (!target) return;
    const startY = yOf.get(message.id)!;
    const replyId = asynchronous ? undefined : pairing.replyOf.get(message.id);
    // An asynchronous call runs until the receiver sends something next.
    const nextFromReceiver = asynchronous
      ? sequence.slice(sequenceIndex + 1).find(later => later.sourceLifelineId === target.id)
      : undefined;
    const endY = replyId ? yOf.get(replyId)! : nextFromReceiver ? yOf.get(nextFromReceiver.id)! : startY + MESSAGE_SPACING * 0.6;
    const depth = activations.filter(bar => bar.lifelineId === target.id && bar.bounds.y <= startY && bar.bounds.y + bar.bounds.height >= startY).length;
    activations.push({
      callId: message.id,
      ...(replyId ? { replyId } : {}),
      lifelineId: target.id,
      depth,
      bounds: { x: target.centerX - ACTIVATION_WIDTH / 2 + depth * ACTIVATION_OFFSET, y: startY, width: ACTIVATION_WIDTH, height: Math.max(endY - startY, 12) },
    });
  });
  const rightEdge = (lifelineId: string, y: number): number => {
    const lifeline = lifelineById.get(lifelineId)!;
    const bars = activations.filter(bar => bar.lifelineId === lifelineId && bar.bounds.y <= y && bar.bounds.y + bar.bounds.height >= y);
    if (bars.length === 0) return lifeline.centerX;
    return Math.max(...bars.map(bar => bar.bounds.x + bar.bounds.width));
  };
  const leftEdge = (lifelineId: string, y: number): number => {
    const lifeline = lifelineById.get(lifelineId)!;
    const bars = activations.filter(bar => bar.lifelineId === lifelineId && bar.bounds.y <= y && bar.bounds.y + bar.bounds.height >= y);
    return bars.length === 0 ? lifeline.centerX : lifeline.centerX - ACTIVATION_WIDTH / 2;
  };

  // Messages
  const messages: MessageView[] = [];
  sequence.forEach((message, index) => {
    const source = lifelineById.get(message.sourceLifelineId);
    const target = lifelineById.get(message.targetLifelineId);
    const kind = lostFoundKind(message);
    const y = yOf.get(message.id)!;
    if (kind) {
      // The missing end is a circle LOST_FOUND_REACH away from the real lifeline, on the side with more room.
      const real = kind === 'lost' ? source : target;
      if (!real) return;
      const toRight = real.index < lifelines.length - 1 || real.index === 0;
      const circleX = toRight ? real.centerX + LOST_FOUND_REACH : real.centerX - LOST_FOUND_REACH;
      const edge = toRight ? rightEdge(real.id, y) : leftEdge(real.id, y);
      const text = `${index + 1}: ${messageText(repo, message)}`.replace(/: $/, '');
      const points = kind === 'lost' ? [{ x: edge, y }, { x: circleX, y }] : [{ x: circleX, y }, { x: edge, y }];
      messages.push({
        id: message.id, sort: message.sort, position: index + 1, text,
        sourceLifelineId: message.sourceLifelineId, targetLifelineId: message.targetLifelineId,
        y, points, dashed: false, head: 'open', isSelf: false,
        labelAt: { x: (edge + circleX) / 2, y: y - 6 },
        fragmentIds: [], allocatedTo: allocation.get(message.id)?.allocatedTo ?? [],
        lostFound: kind, circleAt: { x: circleX, y },
      });
      return;
    }
    if (!source || !target) return;
    const isSelf = source.id === target.id;
    const text = `${index + 1}: ${messageText(repo, message)}`.replace(/: $/, '');
    let points: Point[];
    let labelAt: Point;
    if (isSelf) {
      const x = rightEdge(source.id, y);
      points = [{ x, y }, { x: x + SELF_LOOP_WIDTH, y }, { x: x + SELF_LOOP_WIDTH, y: y + SELF_LOOP_HEIGHT }, { x, y: y + SELF_LOOP_HEIGHT }];
      labelAt = { x: x + 6, y: y - 6 };
    } else {
      const toRight = target.centerX > source.centerX;
      const startX = toRight ? rightEdge(source.id, y) : leftEdge(source.id, y);
      let endX: number;
      if (message.sort === 'createMessage') endX = toRight ? target.head.x : target.head.x + target.head.width;
      else endX = toRight ? leftEdge(target.id, y) : rightEdge(target.id, y);
      points = [{ x: startX, y }, { x: endX, y }];
      labelAt = { x: (startX + endX) / 2, y: y - 6 };
    }
    messages.push({
      id: message.id,
      sort: message.sort,
      position: index + 1,
      text,
      sourceLifelineId: source.id,
      targetLifelineId: target.id,
      y,
      points,
      dashed: DASHED.has(message.sort),
      head: FILLED_HEADS.has(message.sort) ? 'filled' : 'open',
      isSelf,
      labelAt,
      fragmentIds: [],
      allocatedTo: allocation.get(message.id)?.allocatedTo ?? [],
    });
  });

  // Combined fragments
  const messageViewById = new Map(messages.map(message => [message.id, message]));
  const fragmentMessageIds = (interaction.fragments ?? []).map(fragment =>
    new Set(fragment.operands.flatMap(operand => operand.messageIds).filter(id => messageViewById.has(id))));
  const fragments: FragmentView[] = (interaction.fragments ?? []).map((fragment, fragmentIndex) => {
    const own = fragmentMessageIds[fragmentIndex];
    // Depth: how many other fragments strictly contain every message of this one.
    const depth = (interaction.fragments ?? []).filter((other, otherIndex) => otherIndex !== fragmentIndex
      && own.size > 0 && [...own].every(id => fragmentMessageIds[otherIndex].has(id)) && fragmentMessageIds[otherIndex].size > own.size).length;
    const covered = fragment.coveredLifelineIds.map(id => lifelineById.get(id)).filter((lifeline): lifeline is LifelineView => Boolean(lifeline));
    const xs = covered.length > 0 ? covered.map(lifeline => lifeline.centerX) : lifelines.map(lifeline => lifeline.centerX);
    const left = (xs.length > 0 ? Math.min(...xs) : MARGIN_X + HEAD_WIDTH / 2) - 90 + depth * 12;
    const right = (xs.length > 0 ? Math.max(...xs) : MARGIN_X + HEAD_WIDTH / 2) + 90 - depth * 12;
    const rows = fragment.operands.map(operand => operand.messageIds.filter(id => messageViewById.has(id)).map(id => messageViewById.get(id)!.y));
    const allYs = rows.flat();
    const hasMessages = allYs.length > 0;
    const top = (hasMessages ? Math.min(...allYs) : lastY + 30) - 26 + depth * 6;
    const selfExtra = hasMessages && [...own].some(id => messageViewById.get(id)?.isSelf) ? SELF_LOOP_HEIGHT : 0;
    const bottom = (hasMessages ? Math.max(...allYs) + selfExtra : lastY + 30 + 24) + 26 - depth * 6;
    // Operand bands: split between the last message of one operand and the first of the next.
    const bands: FragmentOperandView[] = [];
    let cursor = top;
    fragment.operands.forEach((operand, index) => {
      const ys = rows[index];
      const nextYs = rows.slice(index + 1).find(candidate => candidate.length > 0);
      let bandBottom = bottom;
      if (index < fragment.operands.length - 1) {
        if (ys.length > 0 && nextYs) bandBottom = (Math.max(...ys) + Math.min(...nextYs)) / 2;
        else if (ys.length > 0) bandBottom = Math.max(...ys) + 26;
        else bandBottom = Math.min(bottom, cursor + 28);
      }
      bands.push({ index, guardLabel: operand.guard?.trim() ? `[${operand.guard.trim()}]` : '', top: cursor, bottom: Math.max(bandBottom, cursor + 20) });
      cursor = Math.max(bandBottom, cursor + 20);
    });
    return {
      id: fragment.id,
      operator: fragment.operator,
      bounds: { x: left, y: top, width: right - left, height: Math.max(bottom, cursor) - top },
      depth,
      operands: bands,
      messageIds: [...own],
    };
  });
  // `ref` frames: a labelled box over the lifelines it covers, in its own slot.
  const uses: UseView[] = (interaction.uses ?? []).map(use => {
    const covered = (use.coveredLifelineIds ?? []).map(id => lifelineById.get(id)).filter((lifeline): lifeline is LifelineView => Boolean(lifeline));
    const spanning = covered.length > 0 ? covered : lifelines;
    const xs = spanning.map(lifeline => lifeline.centerX);
    const slotY = useSlotY.get(use.id) ?? FIRST_MESSAGE_Y;
    const left = (xs.length > 0 ? Math.min(...xs) : MARGIN_X + HEAD_WIDTH / 2) - HEAD_WIDTH / 2 - 10;
    const right = (xs.length > 0 ? Math.max(...xs) : MARGIN_X + HEAD_WIDTH / 2) + HEAD_WIDTH / 2 + 10;
    const refersToLabel = sysmlObjectLabel(repo.definitions[use.refersToId], 'Interaction');
    const args = use.arguments?.trim();
    return {
      id: use.id,
      refersToId: use.refersToId,
      refersToLabel,
      text: args ? `${refersToLabel}(${args})` : refersToLabel,
      coveredLifelineIds: covered.map(lifeline => lifeline.id),
      y: slotY,
      bounds: { x: left, y: slotY - USE_HEIGHT / 2, width: right - left, height: USE_HEIGHT },
    };
  });

  // State invariants: a rounded box on the lifeline, in its own slot.
  const stateInvariants: StateInvariantView[] = (interaction.stateInvariants ?? []).flatMap(invariant => {
    const lifeline = lifelineById.get(invariant.lifelineId);
    if (!lifeline) return [];
    const state = resolveSemanticEndpoint(repo, invariant.stateId, endpoints ?? {});
    const slotY = invariantSlotY.get(invariant.id) ?? FIRST_MESSAGE_Y;
    const name = state?.name?.trim();
    const text = name || 'Unknown state';
    const width = Math.max(70, Math.min(180, text.length * 8 + 24));
    return [{
      id: invariant.id,
      lifelineId: lifeline.id,
      text,
      resolved: Boolean(name),
      y: slotY,
      bounds: { x: lifeline.centerX - width / 2, y: slotY - INVARIANT_HEIGHT / 2, width, height: INVARIANT_HEIGHT },
    }];
  });

  // Time and duration constraints: brackets beside the last lifeline, side by side when they overlap.
  const rightMost = lifelines.reduce((max, lifeline) => Math.max(max, lifeline.centerX + HEAD_WIDTH / 2), MARGIN_X);
  const laneEnds: number[] = [];
  const constraints: ConstraintView[] = [...(interaction.constraints ?? [])].flatMap(constraint => {
    const yFrom = yOf.get(constraint.fromMessageId);
    if (yFrom === undefined) return [];
    const yTo = constraint.toMessageId ? yOf.get(constraint.toMessageId) ?? yFrom : yFrom;
    return [{ constraint, top: Math.min(yFrom, yTo), bottom: Math.max(yFrom, yTo) }];
  }).sort((a, b) => a.top - b.top).map(({ constraint, top, bottom }) => {
    let lane = laneEnds.findIndex(end => end < top - 4);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(bottom); } else laneEnds[lane] = bottom;
    const expression = constraint.expression?.trim();
    return {
      id: constraint.id,
      kind: constraint.kind,
      text: expression ? `{${expression}}` : '{…}',
      x: rightMost + 36 + lane * 70,
      yFrom: top,
      yTo: bottom,
    };
  });

  // Innermost fragments are listed on each message so the canvas can highlight a frame's messages.
  fragments.forEach(fragment => {
    for (const id of fragment.messageIds) messageViewById.get(id)?.fragmentIds.push(fragment.id);
  });

  const maxX = Math.max(800, MARGIN_X * 2 + lifelines.length * LIFELINE_SPACING, ...fragments.map(fragment => fragment.bounds.x + fragment.bounds.width + 40), ...uses.map(use => use.bounds.x + use.bounds.width + 40), ...constraints.map(constraint => constraint.x + 120));
  const maxY = Math.max(480, lastY + 140, ...fragments.map(fragment => fragment.bounds.y + fragment.bounds.height + 40));
  return {
    interactionId: interaction.id,
    interactionLabel: sysmlObjectLabel(interaction, 'Interaction'),
    lifelines,
    messages,
    activations,
    fragments,
    uses,
    stateInvariants,
    constraints,
    canvasSize: { width: maxX, height: maxY },
  };
}

/** A message's endpoint names for sentences shown to the user (never ids). */
export function messageSentence(repo: SysmlRepository, interactionId: string, messageId: string): string {
  const interaction = repo.definitions[interactionId];
  if (interaction?.kind !== 'interaction') return 'Message';
  const message = interaction.messages.find(candidate => candidate.id === messageId);
  if (!message) return 'Message';
  const lifelineName = (id: string) => id === LOST_ENDPOINT ? 'lost' : id === FOUND_ENDPOINT ? 'found' : interaction.lifelines.find(candidate => candidate.id === id)?.name?.trim() || 'Lifeline';
  return `${messageLabel(message)} (${lifelineName(message.sourceLifelineId)} → ${lifelineName(message.targetLifelineId)})`;
}
