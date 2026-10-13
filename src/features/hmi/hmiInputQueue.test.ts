import { describe, expect, it } from 'vitest';
import { createHmiInputQueue, getPortableHmiInputQueueScript } from './hmiInputQueue';
import { flatOrFixture, nestedAndFixture, parallelHistoryFixture } from '../../utils/stateMachine/smFixtures';
import { createAppSimulationSession, runAppSimulationTick, setSessionVariableValue, stepAppSimulationSession } from '../../utils/stateMachine/smAppAdapter';

describe('HMI tick input queue', () => {
  it('portable report runs the same queue without module imports', () => {
    const queue = new Function(`${getPortableHmiInputQueueScript()}; return createHmiInputQueue();`)();
    queue.enqueue({ sourceId: 'p', variableId: 'go', value: true, mode: 'pulse' });
    expect(queue.drain()).toEqual({go: true});
    expect(queue.drain()).toEqual({go: false});
  });
  it('preserves a press and release between ticks for exactly one consumed tick', () => {
    const queue = createHmiInputQueue();
    queue.enqueue({ sourceId: 'button', variableId: 'go', value: true, mode: 'press' });
    queue.enqueue({ sourceId: 'button', variableId: 'go', value: false, mode: 'release' });
    expect(queue.drain()).toEqual({ go: true });
    expect(queue.drain()).toEqual({ go: false });
    expect(queue.drain()).toEqual({});
  });
  it('holds until release and ignores repeated keydown', () => {
    const queue = createHmiInputQueue();
    queue.enqueue({ sourceId: 'button', variableId: 'go', value: true, mode: 'press' });
    queue.enqueue({ sourceId: 'button', variableId: 'go', value: true, mode: 'press' });
    expect(queue.drain()).toEqual({ go: true });
    expect(queue.drain()).toEqual({});
    queue.enqueue({ sourceId: 'button', variableId: 'go', value: false, mode: 'release' });
    expect(queue.drain()).toEqual({ go: false });
  });
  it('preserves pulse ordering and deterministic latest set writes', () => {
    const queue = createHmiInputQueue();
    queue.enqueue({ sourceId: 'a', variableId: 'total', value: 1 });
    queue.enqueue({ sourceId: 'b', variableId: 'total', value: 2 });
    queue.enqueue({ sourceId: 'p', variableId: 'go', value: true, mode: 'pulse', releaseValue: false });
    expect(queue.drain()).toEqual({ total: 2, go: true });
    expect(queue.drain()).toEqual({ go: false });
  });
  it('reset discards queued presses, automatic releases and stale cleanup', () => {
    const queue = createHmiInputQueue();
    queue.enqueue({ sourceId: 'p', variableId: 'go', value: true, mode: 'pulse' });
    queue.clear();
    queue.enqueue({ sourceId: 'p', variableId: 'go', value: false, mode: 'release' });
    expect(queue.drain()).toEqual({});
  });
  it.each([flatOrFixture(), nestedAndFixture(), parallelHistoryFixture('parallel-order')])('matches direct input semantic traces in %s', async model => {
    const direct = createAppSimulationSession(model);
    const hmi = createAppSimulationSession(model);
    const queue = createHmiInputQueue();
    queue.enqueue({ sourceId: 'operator', variableId: 'go', value: true, mode: 'pulse' });
    for (const value of [true, false]) {
      setSessionVariableValue(direct, 'go', value);
      const expected = stepAppSimulationSession(direct, 10);
      const actual = await runAppSimulationTick(hmi, 10, {
        readInputs: async () => ({}), isCurrent: () => true,
        beforeStep: () => Object.entries(queue.drain()).forEach(([id, v]) => setSessionVariableValue(hmi, id, v)),
        applyFrame: () => {}, commitOutputs: async () => {},
      });
      expect(actual).toEqual(expected);
    }
  });
  it('does not consume staged input when an external read is cancelled', async () => {
    const session = createAppSimulationSession(flatOrFixture());
    const queue = createHmiInputQueue();
    queue.enqueue({ sourceId: 'operator', variableId: 'go', value: true });
    const frame = await runAppSimulationTick(session, 10, {
      readInputs: async () => ({}), isCurrent: () => false,
      beforeStep: () => queue.drain(), applyFrame: () => {}, commitOutputs: async () => {},
    });
    expect(frame).toBeNull();
    expect(queue.drain()).toEqual({ go: true });
    expect(session.runtime.data.go).toBe(false);
  });
});
