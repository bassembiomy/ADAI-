import { describe, expect, it } from 'vitest';
import { flatOrFixture, type DifferentialFixture } from './smFixtures';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import { generateEmbeddedProject } from '../../engine/embedded/embeddedLayerGenerator';
import { defaultTargetPackFor } from '../../engine/targetPacks/defaultTargetPacks';
import type { StateMachineModelV5 } from './smModel';

/*
 * Chart initialization, as Stateflow's "Execute (enter) chart at initialization":
 *
 *   model.executeAtInitialization === true or undefined (ADIA's behaviour so far):
 *     SM_Init enters the default configuration and runs entry actions; the first SM_Step
 *     already evaluates transitions.
 *   model.executeAtInitialization === false (Stateflow's default):
 *     SM_Init initializes data and leaves no state active. The first SM_Step only enters
 *     the default configuration (entry actions run, after inputs have been read); it does
 *     not evaluate transitions or run during actions. From the second SM_Step on, the
 *     chart executes normally. State timers start at the first SM_Step.
 * The simulation and the generated C agree in both modes.
 */

const chart = (executeAtInitialization: boolean | undefined): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.states[0].entry = 'total = total + 1;';
  model.states[0].during = 'count = count + 10;';
  if (executeAtInitialization !== undefined) {
    (model as unknown as { executeAtInitialization: boolean }).executeAtInitialization = executeAtInitialization;
  }
  return model;
};

const run = (model: StateMachineModelV5) => {
  const fx: DifferentialFixture = {
    name: 'flat-priority',
    model,
    steps: [{ kind: 'step', inputs: { go: true } }, { kind: 'step' }, { kind: 'step' }],
  };
  const expected = runInterpreterTrace(fx);
  expect(compareSemanticTraces(expected, compileAndRunCTrace(fx))).toBeNull();
  return expected;
};

describe('chart initialization option', () => {
  it('enters at SM_Init by default (unchanged behaviour)', () => {
    const frames = run(chart(undefined));
    expect(frames[0].activeStateIds).toEqual(['a']);
    expect(frames[0].data.total).toBe(1);
    expect(frames[1].activeStateIds).toEqual(['b']);
  }, 120_000);

  it('enters on the first step and evaluates transitions from the second step when disabled', () => {
    const frames = run(chart(false));
    expect(frames[0].activeStateIds).toEqual([]);
    expect(frames[0].data.total).toBe(0);
    // first step: default entry only, guard `go` is true but not evaluated, no during action
    expect(frames[1].activeStateIds).toEqual(['a']);
    expect(frames[1].data.total).toBe(1);
    expect(frames[1].data.count).toBe(1);
    // second step: the transition fires
    expect(frames[2].activeStateIds).toEqual(['b']);
    for (const frame of frames) expect(frame.error).toBeNull();
  }, 120_000);

  it('accepts executeAtInitialization in validation and keeps it in the semantic model', () => {
    const built = buildSemanticModel(chart(false));
    expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect((built.ir as unknown as { executeAtInitialization: boolean }).executeAtInitialization).toBe(false);
    const core = generateCArtifacts(built.ir!).files.find((file) => file.name === 'sm_core.c')!.content;
    expect(core).toMatch(/SM_EXECUTE_AT_INIT|chart_entered|first_step/);
  });
});

describe('integration guide for the embedded engineer', () => {
  it('ships a Stateflow-to-ADIA integration guide with the embedded project', () => {
    const result = generateEmbeddedProject({
      enabled: true,
      target: 'STM32F4',
      targetSelection: { targetId: 'stm32f407vgt6', packVersion: '1.0.0', driverMode: 'vendor', boardRevision: 'A' },
      clockSpeed: 168,
      channels: [{ id: 'LED_0', name: 'led', peripheral: 'GPIO', pin: 'PD12', direction: 'Out', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' }],
      mappings: [{ id: 'map-led', adiaVarId: 'led', channelId: 'LED_0', direction: 'write', safeValue: false }],
      commPort: 'COM3',
      baudRate: 115200,
    }, defaultTargetPackFor('stm32f407vgt6')!);
    const guide = result.files.find((file) => /INTEGRATION\.md$/i.test(file.path));
    expect(guide, 'docs/INTEGRATION.md').toBeDefined();
    const text = guide!.content;
    for (const term of ['model_initialize', 'model_step', 'ADIA_Component_Init', 'ADIA_Component_OneStep', 'ADIA_Scheduler_Poll', 'SM_PostEvent', 'SM_TICK_MS', 'Execute (enter) chart at initialization', 'SM_ENTER_CRITICAL']) {
      expect(text, term).toContain(term);
    }
  });
});
