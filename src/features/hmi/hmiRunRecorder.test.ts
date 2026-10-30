import { describe, expect, it } from 'vitest';
import { createHmiRunRecorder } from './hmiRunRecorder';

const targets = { t1: 'heat', t2: 'idle' };
const tick = (time: number, values: Record<string, number | boolean>, activeStateIds: string[], firedTransitionIds: string[] = [], operatorInputIds: string[] = []) => ({ time, values, activeStateIds, firedTransitionIds, operatorInputIds });

describe('HMI run recorder', () => {
  it('records initial values and only real value changes with their cause', () => {
    const rec = createHmiRunRecorder({ transitionTargets: targets });
    rec.start(tick(0, { start: false, temp: 20, heater: false }, ['idle']));
    rec.record(tick(0.1, { start: true, temp: 20, heater: false }, ['idle'], [], ['start']));
    rec.record(tick(0.2, { start: true, temp: 20, heater: true }, ['heat'], ['t1']));
    rec.record(tick(0.3, { start: true, temp: 21.5, heater: true }, ['heat']));
    rec.record(tick(0.4, { start: true, temp: 21.5, heater: true }, ['heat']));
    const log = rec.snapshot();
    expect(log.initial).toEqual({ start: false, temp: 20, heater: false });
    expect(log.ticks).toBe(4);
    expect(log.startTime).toBe(0);
    expect(log.endTime).toBe(0.4);
    expect(log.changes).toEqual([
      { time: 0.1, variableId: 'start', from: false, to: true, activeStateIds: ['idle'], cause: { kind: 'operator' } },
      { time: 0.2, variableId: 'heater', from: false, to: true, activeStateIds: ['heat'], cause: { kind: 'transition', transitionIds: ['t1'] } },
      { time: 0.3, variableId: 'temp', from: 20, to: 21.5, activeStateIds: ['heat'], cause: { kind: 'state' } },
    ]);
    expect(log.transitions).toEqual([{ time: 0.2, transitionId: 't1' }]);
  });

  it('prefers operator over transition and lists every transition fired in the tick', () => {
    const rec = createHmiRunRecorder({ transitionTargets: targets });
    rec.start(tick(0, { a: 0, b: 0 }, ['idle']));
    rec.record(tick(1, { a: 1, b: 1 }, ['heat'], ['t1', 't9'], ['a']));
    const [a, b] = rec.snapshot().changes;
    expect(a.cause).toEqual({ kind: 'operator' });
    expect(b.cause).toEqual({ kind: 'transition', transitionIds: ['t1', 't9'] });
  });

  it('treats a variable that first appears as a change from undefined', () => {
    const rec = createHmiRunRecorder();
    rec.start(tick(0, {}, []));
    rec.record(tick(1, { late: 3 }, []));
    expect(rec.snapshot().changes).toEqual([expect.objectContaining({ variableId: 'late', from: undefined, to: 3 })]);
  });

  it('tracks state visits with the entering transition', () => {
    const rec = createHmiRunRecorder({ transitionTargets: targets });
    rec.start(tick(0, {}, ['idle', 'root']));
    rec.record(tick(1, {}, ['heat', 'root'], ['t1']));
    rec.record(tick(2, {}, ['idle', 'root'], ['t2']));
    rec.record(tick(3, {}, ['done', 'root'], ['tx']));
    expect(rec.snapshot().visits).toEqual([
      { stateId: 'idle', enter: 0, exit: 1, viaTransitionId: null },
      { stateId: 'root', enter: 0, exit: null, viaTransitionId: null },
      { stateId: 'heat', enter: 1, exit: 2, viaTransitionId: 't1' },
      { stateId: 'idle', enter: 2, exit: 3, viaTransitionId: 't2' },
      { stateId: 'done', enter: 3, exit: null, viaTransitionId: null },
    ]);
  });

  it('starts implicitly, resets, caps changes and returns independent snapshots', () => {
    const rec = createHmiRunRecorder({ maxChanges: 2 });
    rec.record(tick(5, { v: 0 }, ['s']));
    expect(rec.snapshot()).toEqual(expect.objectContaining({ startTime: 5, ticks: 0, initial: { v: 0 } }));
    for (let i = 1; i <= 4; i++) rec.record(tick(5 + i, { v: i }, ['s']));
    const log = rec.snapshot();
    expect(log.changes).toHaveLength(2);
    expect(log.truncated).toBe(true);
    expect(log.ticks).toBe(4);
    log.changes.length = 0;
    expect(rec.snapshot().changes).toHaveLength(2);
    rec.reset();
    expect(rec.snapshot()).toEqual(expect.objectContaining({ ticks: 0, changes: [], visits: [], transitions: [], truncated: false, initial: {} }));
  });
});
