import { describe, expect, it } from 'vitest';
import type { EventDef, TransitionData } from '../../types/sm_types';
import {
  addEvent,
  deleteEvent,
  nextEventName,
  renameEvent,
  setEventScope,
  validateEventName,
} from './smEventEditing';

const ev = (id: string, name: string, scope: EventDef['scope'] = 'input'): EventDef => ({ id, name, scope });
const tr = (id: string, event?: string | null): TransitionData => ({
  id, sourceId: 'a', targetId: 'b', condition: 'true', action: '', afterTicks: null,
  type: 'condition', hasControlPoint: false, order: 1, event,
});

describe('event editing helpers', () => {
  it('proposes the first unused EVENT_n name', () => {
    expect(nextEventName([])).toBe('EVENT_1');
    expect(nextEventName([ev('1', 'EVENT_1'), ev('2', 'EVENT_3')])).toBe('EVENT_2');
  });

  it('validates C identifiers, reserved names and duplicates', () => {
    const events = [ev('1', 'GO'), ev('2', 'STOP')];
    expect(validateEventName('RUN', events)).toBeNull();
    expect(validateEventName('GO', events, '1')).toBeNull();
    expect(validateEventName('1BAD', events)).toMatch(/C identifier/);
    expect(validateEventName('has space', events)).toMatch(/C identifier/);
    expect(validateEventName('GO', events, '2')).toMatch(/already declared/);
    expect(validateEventName('NONE', events)).toMatch(/reserved/);
  });

  it('adds input events with unique default names and enforces the input limit', () => {
    const first = addEvent([], 'id1');
    expect(first.ok && first.events).toEqual([ev('id1', 'EVENT_1')]);
    const full = Array.from({ length: 32 }, (_, i) => ev(`e${i}`, `E${i}`));
    expect(addEvent(full, 'x').ok).toBe(false);
    expect(addEvent(full, 'x', 'local').ok).toBe(true);
  });

  it('renames only when valid and reports the error otherwise', () => {
    const events = [ev('1', 'GO'), ev('2', 'STOP')];
    const ok = renameEvent(events, '1', 'RUN');
    expect(ok.ok && ok.events.map((e) => e.name)).toEqual(['RUN', 'STOP']);
    const dup = renameEvent(events, '1', 'STOP');
    expect(dup.ok).toBe(false);
    expect(renameEvent(events, '1', '9x').ok).toBe(false);
  });

  it('changes scope and refuses a scope change past the input limit', () => {
    const events = [ev('1', 'GO')];
    const local = setEventScope(events, '1', 'local');
    expect(local.ok && local.events[0].scope).toBe('local');
    const full = [...Array.from({ length: 32 }, (_, i) => ev(`e${i}`, `E${i}`)), ev('l', 'L', 'local')];
    expect(setEventScope(full, 'l', 'input').ok).toBe(false);
    expect(setEventScope(events, 'missing', 'input').ok).toBe(false);
  });

  it('clears the event on transitions that referenced a deleted event', () => {
    const events = [ev('1', 'GO'), ev('2', 'STOP')];
    const transitions = [tr('t1', '1'), tr('t2', '2'), tr('t3', null), tr('t4')];
    const result = deleteEvent(events, transitions, '1');
    expect(result.events.map((e) => e.id)).toEqual(['2']);
    expect(result.clearedTransitionIds).toEqual(['t1']);
    expect(result.transitions.find((t) => t.id === 't1')?.event).toBeNull();
    expect(result.transitions.find((t) => t.id === 't2')?.event).toBe('2');
    expect(deleteEvent(events, transitions, '2').clearedTransitionIds).toEqual(['t2']);
  });
});
