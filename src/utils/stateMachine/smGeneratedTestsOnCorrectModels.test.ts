import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reviewedTwoStateFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import { createDefaultAdapters, runVerificationPipeline } from './smPipelineOrchestrator';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import type { StateMachineModelV5 } from './smModel';

/*
 * The generated unit tests check the generated code against the model. On a correct
 * model every generated test must pass: a failing generated test on a correct model is a
 * defect of the test generator, and it hides real defects.
 */

const threeStateChain = (): StateMachineModelV5 => {
  const m = reviewedTwoStateFixture();
  m.safetyMode = false;
  delete (m as { hilConfig?: unknown }).hilConfig;
  m.verification = { ...m.verification, invalidInputPolicies: {} };
  m.states.push({ ...m.states[1], id: 'State_3', name: 'State_3', priority: 3, entry: 'y = y + 1;' });
  m.transitions.push({ ...m.transitions[0], id: 'trans_2_3', sourceId: 'State_2', targetId: 'State_3', condition: 'y > 5' });
  m.transitions.push({ ...m.transitions[0], id: 'trans_3_1', sourceId: 'State_3', targetId: 'State_1', condition: '', type: 'after', afterTicks: 3 });
  m.layers[0].stateIds.push('State_3');
  m.layers[0].transitionIds.push('trans_2_3', 'trans_3_1');
  return m;
};

const nestedWithGuardAndAfter = (): StateMachineModelV5 => {
  const m = threeStateChain();
  m.states.push(
    { ...m.states[0], id: 'Inner_A', name: 'Inner_A', parentId: 'State_2', autostart: true, priority: 1, entry: '' },
    { ...m.states[0], id: 'Inner_B', name: 'Inner_B', parentId: 'State_2', autostart: false, priority: 2, entry: 'y = y + 2;' },
  );
  m.transitions.push(
    { ...m.transitions[0], id: 'inner_ab', sourceId: 'Inner_A', targetId: 'Inner_B', condition: 'x == false', type: 'and', afterTicks: 2 },
  );
  m.layers.push({ id: 'state_2_children', name: 'state_2_children', parentStateId: 'State_2', decomposition: 'OR', stateIds: ['Inner_A', 'Inner_B'], transitionIds: ['inner_ab'], junctionIds: [] } as never);
  return m;
};

const runGeneratedTests = async (model: StateMachineModelV5, label: string) => {
  const built = buildSemanticModel(model);
  expect(built.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const ir = built.ir!;
  const workspace = createGeneratedCodeTestWorkspace(label);
  for (const file of generateCArtifacts(ir, { includeVerificationPackage: true }).files) {
    const path = join(workspace.directory, file.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content);
  }
  return runVerificationPipeline({ ir, outputDirectory: workspace.directory, adapters: createDefaultAdapters() });
};

describe('generated tests pass on correct models', () => {
  for (const [label, make] of [['three-state-chain', threeStateChain], ['nested-guard-after', nestedWithGuardAndAfter]] as const) {
    it(label, async () => {
      const bundle = await runGeneratedTests(make(), `generated-tests-${label}`);
      const runtime = bundle.activities['host-runtime'];
      expect(runtime.details as { failedTests?: string[] } | null).not.toMatchObject({ failedTests: expect.arrayContaining([expect.any(String)]) });
      expect(runtime.status).toBe('PASS');
      expect(['PASS', 'NOT_RUN']).toContain(bundle.activities['sanitizers'].status);
      expect(bundle.activities['differential'].status).toBe('PASS');
    }, 300_000);
  }
});
