import { describe, expect, it } from 'vitest';
import { STATE_MACHINE_RUNTIME_BUNDLE } from '../../generated/stateMachineRuntimeBundle';
import {
  historyFixture,
  parallelHistoryFixture,
} from './smFixtures';
import {
  createRuntime,
  initializeRuntime,
  resetRuntime,
  stepRuntime,
  type SemanticRuntime,
} from './smInterpreter';
import type { StateMachineModelV4 } from './smModel';
import { buildSemanticModel } from './smSemanticBuilder';
import type { SemanticBuildResult } from './smSemanticModel';
import type { SemanticTraceFrame } from './smTrace';

interface ScenarioOperation {
  inputs?: Readonly<Record<string, number | boolean>>;
  elapsedMs?: number;
  reset?: boolean;
}

interface StandaloneRuntimeApi {
  buildSemanticModel(model: StateMachineModelV4): SemanticBuildResult;
  createRuntime(ir: NonNullable<SemanticBuildResult['ir']>): SemanticRuntime;
  initializeRuntime(runtime: SemanticRuntime): SemanticTraceFrame;
  applyInputs(
    runtime: SemanticRuntime,
    inputs: Readonly<Record<string, number | boolean>>,
  ): void;
  stepRuntime(
    runtime: SemanticRuntime,
    elapsedMs: number,
  ): SemanticTraceFrame;
  resetRuntime(runtime: SemanticRuntime): SemanticTraceFrame;
}

const runModuleScenario = (
  model: StateMachineModelV4,
  operations: readonly ScenarioOperation[],
): SemanticTraceFrame[] => {
  const built = buildSemanticModel(model);
  expect(built.diagnostics).toEqual([]);
  if (!built.ir) throw new Error('module scenario did not build');
  const runtime = createRuntime(built.ir);
  const frames = [initializeRuntime(runtime)];
  for (const operation of operations) {
    Object.assign(runtime.data, operation.inputs);
    frames.push(
      operation.reset
        ? resetRuntime(runtime)
        : stepRuntime(runtime, operation.elapsedMs ?? model.tickMs),
    );
  }
  return frames;
};

const loadStandaloneRuntime = (): StandaloneRuntimeApi => {
  const evaluateBundle = new Function(
    `${STATE_MACHINE_RUNTIME_BUNDLE}
return ADIAStateMachineRuntime;`,
  );
  return evaluateBundle() as StandaloneRuntimeApi;
};

const runStandaloneScenario = (
  model: StateMachineModelV4,
  operations: readonly ScenarioOperation[],
): SemanticTraceFrame[] => {
  const standalone = loadStandaloneRuntime();
  const built = standalone.buildSemanticModel(model);
  expect(built.diagnostics).toEqual([]);
  if (!built.ir) throw new Error('standalone scenario did not build');
  const runtime = standalone.createRuntime(built.ir);
  const frames = [standalone.initializeRuntime(runtime)];
  for (const operation of operations) {
    standalone.applyInputs(runtime, operation.inputs ?? {});
    frames.push(
      operation.reset
        ? standalone.resetRuntime(runtime)
        : standalone.stepRuntime(
          runtime,
          operation.elapsedMs ?? model.tickMs,
        ),
    );
  }
  return frames;
};

describe('standalone state-machine runtime parity', () => {
  it('matches nested AND and deep-history execution frame by frame', () => {
    const model = historyFixture('deep');
    const operations: ScenarioOperation[] = [
      { inputs: { select_a: true } },
      { inputs: { select_a: false, advance_nested: true } },
      { inputs: { advance_nested: false, advance_left: true } },
      { inputs: { advance_left: false, advance_right: true } },
      { inputs: { advance_right: false, leave: true } },
      { inputs: { leave: false, go: true } },
      { inputs: { go: false }, reset: true },
    ];

    expect(runStandaloneScenario(model, operations)).toEqual(
      runModuleScenario(model, operations),
    );
  });

  it('keeps a terminal AND child quiescent while its sibling continues', () => {
    const model = parallelHistoryFixture('parallel-terminal');
    const operations: ScenarioOperation[] = [
      { elapsedMs: 10 },
      { elapsedMs: 10 },
      { elapsedMs: 10 },
    ];

    expect(runStandaloneScenario(model, operations)).toEqual(
      runModuleScenario(model, operations),
    );
  });

  it('matches timing thresholds at exact tick boundaries', () => {
    const model = parallelHistoryFixture('timing-boundary');
    const operations: ScenarioOperation[] = [
      { elapsedMs: 10 },
      { elapsedMs: 10 },
      { elapsedMs: 10 },
    ];

    expect(runStandaloneScenario(model, operations)).toEqual(
      runModuleScenario(model, operations),
    );
  });
});
