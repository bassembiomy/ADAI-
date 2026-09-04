import { describe, it, expect } from 'vitest';
import { compileExecutableOpm } from '../pipeline';
import {
  makeApplianceFixture,
  twoInitialStates,
  noInitialState,
  crossOwnerTransition,
  equalPriorityWrites,
  unreachableState,
} from '../fixtures';

describe('OPM semantic validator', () => {
  it.each([
    ['two initial states', twoInitialStates(), 'OPM_STATE_MULTIPLE_INITIAL'],
    ['no initial state', noInitialState(), 'OPM_STATE_INITIAL_REQUIRED'],
    ['cross-owner transition', crossOwnerTransition(), 'OPM_TRANSITION_OWNER_MISMATCH'],
    ['equal-priority write conflict', equalPriorityWrites(), 'OPM_WRITE_CONFLICT'],
    ['unreachable target', unreachableState(), 'OPM_STATE_UNREACHABLE'],
  ])('blocks %s', (_name, fixture, code) => {
    const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
    expect(result.model).toBeUndefined();
    expect(result.diagnostics.map(d => d.code)).toContain(code);
  });

  it('allows a valid appliance model with no blocking errors', () => {
    const fixture = makeApplianceFixture();
    const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
    expect(result.model).toBeDefined();
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });
});

