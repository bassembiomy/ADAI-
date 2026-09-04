import { describe, it, expect } from 'vitest';
import { compileExecutableOpm } from '../pipeline';
import {
  makeConformanceExerciseFixture,
  makeConformanceContentionFixture,
  makeReversedConformanceExerciseFixture,
  buildExerciseScenario,
  buildContentionScenario,
  buildReversedScenario,
} from '../fixtures';
import { runTypescriptScenario, compareOpmSnapshots } from '../conformanceHarness';
import { compileAndRunOpmCScenario } from '../cHostHarness';
import type { OpmConformanceScenario } from '../conformanceTypes';

const REPO_ROOT = process.cwd();

function compileFixture(fixture: ReturnType<typeof makeConformanceExerciseFixture>, label: string) {
  const comp = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
  expect(comp.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(comp.model, `${label}: model must compile`).toBeDefined();
  return comp.model!;
}

describe('OPM differential parity: TypeScript vs compiled C', () => {
  it('exercise model (110 steps: cyclic, events, timeout, delayed, reset, queue, overflow, I/O)', () => {
    const model = compileFixture(makeConformanceExerciseFixture(), 'exercise');
    const scenario: OpmConformanceScenario = {
      name: 'exercise',
      model,
      steps: buildExerciseScenario(model),
    };
    expect(scenario.steps.length).toBeGreaterThanOrEqual(100);

    const expected = runTypescriptScenario(scenario);
    const actual = compileAndRunOpmCScenario(model, scenario, { repoRoot: REPO_ROOT });
    expect(actual.snapshots).toHaveLength(expected.snapshots.length);
    expect(compareOpmSnapshots(expected.snapshots, actual.snapshots, model)).toEqual([]);
  }, 180000);

  it('contention model (write conflict, transition conflict, priority wins, reset)', () => {
    const model = compileFixture(makeConformanceContentionFixture(), 'contention');
    const scenario: OpmConformanceScenario = {
      name: 'contention',
      model,
      steps: buildContentionScenario(model),
    };

    const expected = runTypescriptScenario(scenario);
    const actual = compileAndRunOpmCScenario(model, scenario, { repoRoot: REPO_ROOT });
    expect(compareOpmSnapshots(expected.snapshots, actual.snapshots, model)).toEqual([]);
  }, 180000);

  it('reversed model order produces the identical model and matching snapshots', () => {
    const forward = compileFixture(makeConformanceExerciseFixture(), 'forward');
    const reversed = compileFixture(makeReversedConformanceExerciseFixture(), 'reversed');
    expect(reversed.fingerprint).toBe(forward.fingerprint);

    const scenario: OpmConformanceScenario = {
      name: 'reversed',
      model: reversed,
      steps: buildReversedScenario(reversed),
    };
    const expected = runTypescriptScenario(scenario);
    const actual = compileAndRunOpmCScenario(reversed, scenario, { repoRoot: REPO_ROOT });
    expect(compareOpmSnapshots(expected.snapshots, actual.snapshots, reversed)).toEqual([]);
  }, 180000);
});
