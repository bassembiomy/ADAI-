import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reviewedTwoStateFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import { createDefaultAdapters, runVerificationPipeline } from './smPipelineOrchestrator';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import type { StateMachineModelV5 } from './smModel';

/*
 * The generated tests must stay meaningful: when the generated production code deviates from the
 * model, the generated suite has to fail. Each case mutates one guard of the generated sm_core.c.
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

interface Mutation {
  file: string;
  apply: (source: string) => string;
}

const runWithMutation = async (label: string, mutate: Mutation | null) => {
  const built = buildSemanticModel(threeStateChain());
  expect(built.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const ir = built.ir!;
  const workspace = createGeneratedCodeTestWorkspace(label);
  for (const file of generateCArtifacts(ir, { includeVerificationPackage: true }).files) {
    const path = join(workspace.directory, file.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content);
  }
  // The pipeline regenerates the package, so mutate after generation and run the host gates directly.
  if (mutate) {
    const corePath = join(workspace.directory, 'production', mutate.file);
    const original = readFileSync(corePath, 'utf8');
    const mutated = mutate.apply(original);
    expect(mutated).not.toBe(original);
    writeFileSync(corePath, mutated);
  }
  const adapters = createDefaultAdapters();
  const compiled = await adapters.host.compile({ packageDirectory: workspace.directory, standard: ir.verification.cStandard });
  expect(compiled.status).toBe('PASS');
  return adapters.host.runTests({ packageDirectory: workspace.directory });
};

const failedTests = (runtime: { details: unknown }): string[] =>
  ((runtime.details as { failedTests?: string[] } | null)?.failedTests ?? []);

describe('generated tests detect defects in generated code', () => {
  it('passes on the unmodified generated code', async () => {
    const runtime = await runWithMutation('detect-baseline', null);
    expect(runtime.status).toBe('PASS');
  }, 300_000);

  it('fails when a guard is swapped to its negation', async () => {
    const runtime = await runWithMutation('detect-negated-guard', { file: 'sm_core.c', apply: (src) => src.replace('instance->data.y > 5', 'instance->data.y <= 5') });
    expect(runtime.status).toBe('FAIL');
    const failed = failedTests(runtime);
    expect(failed.some((id) => id.startsWith('SM-TC-TRANS-STATE_2-STATE_3-'))).toBe(true);
  }, 300_000);

  it('fails when an after() threshold is changed', async () => {
    const runtime = await runWithMutation('detect-after-threshold', { file: 'sm_core.c', apply: (src) => src.replace('>= 1500U', '>= 2500U') });
    expect(runtime.status).toBe('FAIL');
    expect(failedTests(runtime).some((id) => id.startsWith('SM-TC-TRANS-STATE_3-STATE_1-'))).toBe(true);
  }, 300_000);

  it('fails when the entry action of State_3 is dropped', async () => {
    const runtime = await runWithMutation('detect-entry-action', { file: 'sm_user_logic.c', apply: (src) => src.replace('instance->data.y = (int32_t)((instance->data.y + 1));', '(void)instance;') });
    expect(runtime.status).toBe('FAIL');
  }, 300_000);
});
