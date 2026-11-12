import type { EventDef, TransitionData } from '../../types/sm_types';
import { SM_MAX_INPUT_EVENTS } from './smSemanticModel';

/**
 * Pure helpers behind the Events editor and the transition Event selector.
 * Names follow the engine validator (SM_INVALID_EVENT_NAME / SM_DUPLICATE_EVENT).
 */

const C_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_EVENT_NAMES: readonly string[] = ['NONE', 'QUEUE_LEN'];

export type EventScope = EventDef['scope'];

/** Next unused default name: EVENT_1, EVENT_2, ... */
export const nextEventName = (events: readonly EventDef[]): string => {
  const used = new Set(events.map((event) => event.name));
  let index = 1;
  while (used.has(`EVENT_${index}`)) index += 1;
  return `EVENT_${index}`;
};

/** Returns the validation message for a proposed event name, or null when it is acceptable. */
export const validateEventName = (
  name: string,
  events: readonly EventDef[],
  selfId?: string,
): string | null => {
  if (!C_IDENTIFIER.test(name)) {
    return `Event name '${name}' is not a valid C identifier.`;
  }
  if (RESERVED_EVENT_NAMES.includes(name)) {
    return `Event name '${name}' is reserved by the generated SM_EVENT_* constants.`;
  }
  if (events.some((event) => event.name === name && event.id !== selfId)) {
    return `Event name '${name}' is already declared.`;
  }
  return null;
};

export const countInputEvents = (events: readonly EventDef[]): number =>
  events.filter((event) => event.scope === 'input').length;

/** True when one more input event (or a scope change to input) stays within the engine limit. */
export const canAddInputEvent = (events: readonly EventDef[]): boolean =>
  countInputEvents(events) < SM_MAX_INPUT_EVENTS;

export type EventEditResult =
  | { ok: true; events: EventDef[] }
  | { ok: false; error: string };

export const addEvent = (
  events: readonly EventDef[],
  id: string,
  scope: EventScope = 'input',
): EventEditResult => {
  if (scope === 'input' && !canAddInputEvent(events)) {
    return { ok: false, error: `At most ${SM_MAX_INPUT_EVENTS} input events are supported.` };
  }
  return { ok: true, events: [...events, { id, name: nextEventName(events), scope }] };
};

export const renameEvent = (
  events: readonly EventDef[],
  id: string,
  name: string,
): EventEditResult => {
  const error = validateEventName(name, events, id);
  if (error !== null) return { ok: false, error };
  return { ok: true, events: events.map((event) => (event.id === id ? { ...event, name } : event)) };
};

export const setEventScope = (
  events: readonly EventDef[],
  id: string,
  scope: EventScope,
): EventEditResult => {
  const current = events.find((event) => event.id === id);
  if (current === undefined) return { ok: false, error: 'Unknown event.' };
  if (current.scope !== scope && scope === 'input' && !canAddInputEvent(events)) {
    return { ok: false, error: `At most ${SM_MAX_INPUT_EVENTS} input events are supported.` };
  }
  return { ok: true, events: events.map((event) => (event.id === id ? { ...event, scope } : event)) };
};

export interface EventDeletion {
  events: EventDef[];
  transitions: TransitionData[];
  /** Ids of the transitions whose trigger was cleared because it referenced the deleted event. */
  clearedTransitionIds: string[];
}

/** Removes an event and clears `event` on every transition that referenced it. */
export const deleteEvent = (
  events: readonly EventDef[],
  transitions: readonly TransitionData[],
  id: string,
): EventDeletion => {
  const clearedTransitionIds: string[] = [];
  const nextTransitions = transitions.map((transition) => {
    if (transition.event !== id) return transition;
    clearedTransitionIds.push(transition.id);
    return { ...transition, event: null };
  });
  return {
    events: events.filter((event) => event.id !== id),
    transitions: clearedTransitionIds.length > 0 ? nextTransitions : [...transitions],
    clearedTransitionIds,
  };
};
