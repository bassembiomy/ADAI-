import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reviewedTwoStateFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import { buildSMTestManifest } from './smTestPlanBuilder';
import { createDefaultAdapters, runVerificationPipeline } from './smPipelineOrchestrator';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import { buildRandomChart } from './smRandomChartFixture';
import type { StateMachineModelV5 } from './smModel';
import type { SemanticModel } from './smSemanticModel';

/*
 * Generated unit tests take their expected results from the simulation (the oracle), so
 * every transition can be tested, including transitions triggered by local events and
 * transitions whose actions send() events:
 *  - a local-event-triggered transition is driven by queueing the local event through a
 *    test-only hook (ADIA_TESTING) or by the input that makes another transition send it;
 *  - the expected active configuration and variable values after the stimulus are those the
 *    simulation computes from the same forced configuration and stimulus, including the
 *    follow-up executions of sent events.
 * No TRUE/FALSE case is reported not-applicable because of events; the only remaining
 * not-applicable cases are logically impossible ones (e.g. the FALSE case of after(1)).
 * Generated suites pass on correct charts (random charts included) and fail when the
 * generated code is wrong.
 */

const eventChart = (): StateMachineModelV5 => {
  const m = reviewedTwoStateFixture();
  m.safetyMode = false;
  delete (m as { hilConfig?: unknown }).hilConfig;
  m.verification = { ...m.verification, invalidInputPolicies: {} };
  m.events = [
    { id: 'ev_go', name: 'GO', scope: 'input' },
    { id: 'ev_tickle', name: 'TICKLE', scope: 'input' },
    { id: 'ev_ping', name: 'PING', scope: 'local' },
  ];
  m.states[1].entry = 'y = 10;';
  m.states.push({ ...m.states[1], id: 'State_3', name: 'State_3', priority: 3, entry: 'y = y + 1;' });
  m.transitions[0] = { ...m.transitions[0], event: 'ev_go' };
  m.transitions.push(
    { ...m.transitions[0], id: 'trans_2_3', sourceId: 'State_2', targetId: 'State_3', condition: 'y > 5', event: 'ev_ping', order: 1 },
    { ...m.transitions[0], id: 'trans_2_1', sourceId: 'State_2', targetId: 'State_1', condition: '', event: 'ev_tickle', order: 2 },
    { ...m.transitions[0], id: 'trans_3_1', sourceId: 'State_3', targetId: 'State_1', condition: '', type: 'after', afterTicks: 3, event: null, action: 'send(PING);', order: 1 },
  );
  m.layers[0].stateIds.push('State_3');
  m.layers[0].transitionIds.push('trans_2_3', 'trans_2_1', 'trans_3_1');
  return m;
};

const build = (model: StateMachineModelV5): SemanticModel => {
  const built = buildSemanticModel(model);
  expect(built.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return built.ir!;
};

const runSuite = async (ir: SemanticModel, label: string, mutate?: (directory: string) => void) => {
  const workspace = createGeneratedCodeTestWorkspace(label);
  for (const file of generateCArtifacts(ir, { includeVerificationPackage: true }).files) {
    const path = join(workspace.directory, file.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content);
  }
  mutate?.(workspace.directory);
  const adapters = createDefaultAdapters();
  if (!mutate) {
    return runVerificationPipeline({ ir, outputDirectory: workspace.directory, adapters });
  }
  const compiled = await adapters.host.compile({ packageDirectory: workspace.directory, standard: ir.verification.cStandard });
  expect(compiled.status).toBe('PASS');
  const runtime = await adapters.host.runTests({ packageDirectory: workspace.directory, standard: ir.verification.cStandard });
  return { activities: { 'host-runtime': runtime } } as Awaited<ReturnType<typeof runVerificationPipeline>>;
};

describe('oracle-based generated tests', () => {
  it('cover local-event and send() transitions', () => {
    const manifest = buildSMTestManifest(build(eventChart()));
    for (const id of ['SM-TC-TRANS-STATE_2-STATE_3-TRUE', 'SM-TC-TRANS-STATE_2-STATE_3-FALSE', 'SM-TC-TRANS-STATE_3-STATE_1-TRUE']) {
      const testCase = manifest.cases.find((item) => item.id === id);
      expect(testCase, id).toBeDefined();
      expect(testCase!.applicability.status, id).toBe('applicable');
    }
    const eventReasons = manifest.cases
      .filter((item) => item.applicability.status === 'not-applicable')
      .map((item) => (item.applicability as { reason: string }).reason)
      .filter((reason) => /event|send/i.test(reason));
    expect(eventReasons).toEqual([]);
  });

  it('pass on the correct event chart', async () => {
    const bundle = await runSuite(build(eventChart()), 'oracle-events');
    expect(bundle.activities['host-runtime'].status).toBe('PASS');
    expect(bundle.activities['differential'].status).toBe('PASS');
  }, 300_000);

  it('fail when the generated code ignores send()', async () => {
    const bundle = await runSuite(build(eventChart()), 'oracle-events-mutant', (directory) => {
      const path = join(directory, 'production', 'sm_core.c');
      const source = readFileSync(path, 'utf8');
      // Disable the local-event queue: queued events are dropped instead of processed.
      const mutated = source.replace(/(SM_SendEvent|SM_Queue_Local_Event|SM_Enqueue\w*)\s*\(/g, '(void)sizeof(');
      writeFileSync(path, mutated === source ? source.replace(/local_queue_count\s*=\s*[^;]+;/, 'local_queue_count = 0U;') : mutated);
    });
    expect(bundle.activities['host-runtime'].status).toBe('FAIL');
  }, 300_000);

  it('pass on random charts with events, inner transitions and arithmetic', async () => {
    let checked = 0;
    for (let seed = 7000; checked < 6 && seed < 7100; seed += 1) {
      const model = buildRandomChart(seed, { innerTransitions: true, arithmetic: true, events: true } as never);
      const built = buildSemanticModel(model);
      if (!built.ir || built.diagnostics.some((d) => d.severity === 'error') || model.states.length > 40) continue;
      checked += 1;
      const bundle = await runSuite(built.ir, `oracle-random-${seed}`);
      expect(bundle.activities['host-runtime'].status, `seed ${seed}: ${JSON.stringify(bundle.activities['host-runtime'].details).slice(0, 400)}`).toBe('PASS');
    }
    expect(checked).toBe(6);
  }, 900_000);
});
