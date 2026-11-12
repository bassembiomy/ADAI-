import { describe, expect, it } from 'vitest';
import { flatOrFixture } from './smFixtures';
import {
  createAppSimulationSession,
  postAppSimulationEvent,
  restorePersistedAppSimulationModel,
  stepAppSimulationSession,
} from './smAppAdapter';

const eventModel = () => {
  const model = flatOrFixture();
  const [a, b] = model.states;
  model.states = model.states.slice(0, 2).map((state, index) => ({ ...state, autostart: index === 0 }));
  model.transitions = [{
    id: 't_go', sourceId: a.id, targetId: b.id, condition: '', action: '', afterTicks: null,
    type: 'condition', hasControlPoint: false, order: 1, event: 'ev_go',
  }];
  model.events = [
    { id: 'ev_go', name: 'GO', scope: 'input' },
    { id: 'ev_loc', name: 'LOC', scope: 'local' },
  ];
  return { model, a, b };
};

describe('app adapter event posting', () => {
  it('posts an input event by name or id and fires the event transition on the next tick', () => {
    const { model, a, b } = eventModel();
    const session = createAppSimulationSession(model);
    expect(session.initialFrame.activeStateIds).toEqual([a.id]);

    expect(stepAppSimulationSession(session, 10).activeStateIds).toEqual([a.id]);
    postAppSimulationEvent(session, 'GO');
    expect(stepAppSimulationSession(session, 10).activeStateIds).toEqual([b.id]);
  });

  it('accepts the event id and rejects unknown and local events', () => {
    const { model } = eventModel();
    const session = createAppSimulationSession(model);
    expect(() => postAppSimulationEvent(session, 'ev_go')).not.toThrow();
    expect(() => postAppSimulationEvent(session, 'LOC')).toThrow(/not an input event/);
    expect(() => postAppSimulationEvent(session, 'NOPE')).toThrow(/not an input event/);
  });

  it('keeps events and executeAtInitialization through the persisted model round trip', () => {
    const { model } = eventModel();
    const restored = restorePersistedAppSimulationModel(JSON.parse(JSON.stringify({
      ...model, executeAtInitialization: false,
    })));
    expect(restored.events).toEqual(model.events);
    expect(restored.executeAtInitialization).toBe(false);
    expect(restorePersistedAppSimulationModel(JSON.parse(JSON.stringify(flatOrFixture()))).events).toBeUndefined();
  });
});
