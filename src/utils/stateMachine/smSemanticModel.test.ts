import { describe, expect, it } from 'vitest';
import {
  toSysmlTransitionRelationship,
  fromSysmlTransitionRelationship,
  type SemanticTransition,
} from './smSemanticModel';

describe('smSemanticModel: Transition to SysML Relationship Conversion', () => {
  it('converts a SemanticTransition to a SysML Transition relationship', () => {
    const transition: SemanticTransition = {
      id: 'trans-1',
      guardSource: '[x > 10]',
      actionSource: 'y = 1;',
      sourceStateId: 'state-idle',
      destinationStateId: 'state-running',
      kind: 'outer',
      transitionKind: 'external',
      lcaStateId: null,
      priority: 1,
      triggerMode: 'condition',
      afterTicks: null,
      temporalThresholdMs: null,
      sourceKind: 'state',
      destinationKind: 'state',
      guard: {} as any,
      actions: [],
      exitStateIds: [],
      entryStateIds: [],
      routes: [],
    };

    const rel = toSysmlTransitionRelationship(transition, 'sm-block');

    expect(rel.id).toBe('trans-1');
    expect(rel.metaclass).toBe('Transition');
    expect(rel.ownerId).toBe('sm-block');
    expect(rel.sourceId).toBe('state-idle');
    expect(rel.targetId).toBe('state-running');
    expect(rel.customProperties?.guard).toBe('[x > 10]');
    expect(rel.customProperties?.action).toBe('y = 1;');
    expect(rel.customProperties?.priority).toBe(1);
  });

  it('converts a SysML Transition relationship back to a partial SemanticTransition', () => {
    const rel = {
      id: 'trans-2',
      name: '[temp >= 100]',
      sourceId: 'state-standby',
      targetId: 'state-alarm',
      customProperties: {
        guard: '[temp >= 100]',
        action: 'soundAlarm();',
        transitionKind: 'external',
        triggerMode: 'condition',
        priority: 2,
      },
    };

    const partial = fromSysmlTransitionRelationship(rel);

    expect(partial.id).toBe('trans-2');
    expect(partial.sourceStateId).toBe('state-standby');
    expect(partial.destinationStateId).toBe('state-alarm');
    expect(partial.guardSource).toBe('[temp >= 100]');
    expect(partial.actionSource).toBe('soundAlarm();');
    expect(partial.priority).toBe(2);
  });
});
