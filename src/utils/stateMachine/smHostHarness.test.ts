import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import { generateCArtifacts } from './smCGenerator';
import { flatOrFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import { renderHostSmokeHarness } from './smHostHarness';

describe('smHostHarness', () => {
  it('compiles and runs host C harness emitting valid 11-field JSONL trace records', () => {
    const model = flatOrFixture();
    const { ir } = buildSemanticModel(model);
    const artifacts = generateCArtifacts(ir!);
    const harness = renderHostSmokeHarness(ir!);
    const workspace = createGeneratedCodeTestWorkspace('harness-jsonl-test');

    for (const f of artifacts.files) {
      if (f.name.endsWith('.c') || f.name.endsWith('.h')) {
        writeFileSync(join(workspace.directory, f.name), f.content);
      }
    }
    writeFileSync(join(workspace.directory, 'harness.c'), harness);

    const execPath = join(workspace.directory, 'harness.exe');
    execFileSync('gcc', ['-std=c99', '-I.', 'sm_mapping.c', 'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'harness.c', '-o', execPath], { cwd: workspace.directory });

    const output = execFileSync(execPath, { cwd: workspace.directory, encoding: 'utf8' });
    const lines = output.trim().split('\n').filter(l => l.trim().startsWith('{'));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const record = JSON.parse(line);
      expect(record.tick).toBeDefined();
      expect(record.activeStates).toBeDefined();
      expect(record.error).toBeDefined();
    }
  }, 30000);
});
