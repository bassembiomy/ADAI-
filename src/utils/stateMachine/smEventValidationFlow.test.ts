import { describe, expect, it } from 'vitest';
import { generateMISRACCode } from '../stateMachineCodeGenerator';
import { flatOrFixture } from './smFixtures';

/** The App's Validate / Generate C/H paths call generateMISRACCode: event diagnostics must surface with an elementId. */
describe('event diagnostics reach the generator error list', () => {
  const chartWith = (events: { id: string; name: string; scope: 'input' | 'local' }[], eventId: string | null) => {
    const model = flatOrFixture();
    return {
      ...model,
      events,
      transitions: model.transitions.map((t, i) => (i === 0 ? { ...t, event: eventId } : t)),
    };
  };

  it('reports an invalid event name against the event element', () => {
    const { errors } = generateMISRACCode(chartWith([{ id: 'e1', name: '1bad', scope: 'input' }], null));
    const hit = errors.find((e) => /valid C identifier/.test(e.message) && /Event/.test(e.message));
    expect(hit?.elementId).toBe('e1');
  });

  it('reports a transition that references an undeclared event against the transition', () => {
    const model = chartWith([], 'missing');
    const { errors } = generateMISRACCode(model);
    const hit = errors.find((e) => /event/i.test(e.message));
    expect(hit?.elementId).toBe(model.transitions[0].id);
  });
});
