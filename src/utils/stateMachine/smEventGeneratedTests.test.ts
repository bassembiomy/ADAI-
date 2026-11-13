import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reviewedTwoStateFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import { buildSMTestManifest } from './smTestPlanBuilder';
import { createDefaultAdapters, runVerificationPipeline } from './smPipelineOrchestrator';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import type { StateMachineModelV5 } from './smModel';

/*
 * Generated verification tests for event-triggered transitions: the TRUE case posts the
 * transition's input event before the step, the FALSE case does not post it. A transition
 * triggered by a local event is driven through the ADIA_TESTING hook that queues it, and one whose
 * step sends a local event is tested with the follow-up executions the simulation (the oracle)
 * computes, so both are applicable (see smOracleGeneratedTests.test.ts). On a correct model every
 * generated test passes.
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

describe('generated tests for event-triggered transitions', () => {
  const manifest = () => {
    const built = buildSemanticModel(eventChart());
    expect(built.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    return { ir: built.ir!, manifest: buildSMTestManifest(built.ir!) };
  };
  const find = (id: string) => manifest().manifest.cases.find((testCase) => testCase.id === id)!;

  it('posts the input event in the TRUE case and not in the FALSE case', () => {
    const whenTrue = find('SM-TC-TRANS-STATE_1-STATE_2-TRUE');
    expect(whenTrue.applicability.status).toBe('applicable');
    expect(whenTrue.operations).toContainEqual({ kind: 'post-event', eventId: 'ev_go' });
    const whenFalse = find('SM-TC-TRANS-STATE_1-STATE_2-FALSE');
    expect(whenFalse.applicability.status).toBe('applicable');
    expect(whenFalse.operations.some((operation) => operation.kind === 'post-event')).toBe(false);
  });

  it('tests local-event and send-driven transitions', () => {
    const local = find('SM-TC-TRANS-STATE_2-STATE_3-TRUE');
    expect(local.applicability.status).toBe('applicable');
    expect(local.operations).toContainEqual({ kind: 'queue-local-event', eventId: 'ev_ping' });
    expect(find('SM-TC-TRANS-STATE_2-STATE_3-FALSE').applicability.status).toBe('applicable');
    expect(find('SM-TC-TRANS-STATE_3-STATE_1-TRUE').applicability.status).toBe('applicable');
  });

  it('every generated test passes on the correct model', async () => {
    const { ir } = manifest();
    const workspace = createGeneratedCodeTestWorkspace('generated-tests-events');
    for (const file of generateCArtifacts(ir, { includeVerificationPackage: true }).files) {
      const path = join(workspace.directory, file.name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, file.content);
    }
    const bundle = await runVerificationPipeline({ ir, outputDirectory: workspace.directory, adapters: createDefaultAdapters() });
    expect(bundle.activities['host-runtime'].status).toBe('PASS');
    expect(bundle.activities['differential'].status).toBe('PASS');
  }, 300_000);
});
