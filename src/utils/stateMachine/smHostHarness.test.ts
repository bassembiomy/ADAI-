import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import { compileAndRunCProgram } from './smCHarness';
import { generateCArtifacts } from './smCGenerator';
import { hybridXBridgesFixture } from './smFixtures';
import { renderHostSmokeHarness } from './smHostHarness';
import { buildSemanticModel } from './smSemanticBuilder';

describe('host smoke harness renderer', () => {
  it('renders a deterministic C smoke test harness that initializes, steps, writes outputs, and resets', () => {
    const built = buildSemanticModel(hybridXBridgesFixture());
    if (!built.ir) throw new Error('model build failed');

    const harnessSource = renderHostSmokeHarness(built.ir);

    expect(harnessSource).toContain('ADIA_Instance_t instance;');
    expect(harnessSource).toContain('(void)memset(&instance, 0xA5, sizeof(instance));');
    expect(harnessSource).toContain('if (SM_Init(&instance) != SM_ERR_NONE) return 10;');
    expect(harnessSource).toContain('if (SM_Validate_State_Consistency(&instance) != SM_ERR_NONE) return 11;');
    expect(harnessSource).toContain('if (SM_Step(&instance, SM_TICK_MS) != SM_ERR_NONE) return 12;');
    expect(harnessSource).toContain('if (SM_WriteOutputs(&instance) != SM_ERR_NONE) return 13;');
    expect(harnessSource).toContain('if (SM_Reset(&instance) != SM_ERR_NONE) return 14;');
    expect(harnessSource).toContain('if (SM_Validate_State_Consistency(&instance) != SM_ERR_NONE) return 15;');
  });

  it('compiles and executes cleanly in production and trace modes', () => {
    const built = buildSemanticModel(hybridXBridgesFixture());
    if (!built.ir) throw new Error('model build failed');

    const workspace = createGeneratedCodeTestWorkspace('host-harness-smoke');
    try {
      const generated = generateCArtifacts(built.ir, {
        includeTestShims: true,
        includeHostHarness: true,
      });

      const hostHarnessFile = generated.files.find((f) => f.name === 'sm_host_test.c');
      expect(hostHarnessFile).toBeDefined();

      for (const file of generated.files) {
        if (file.name.endsWith('.c') || file.name.endsWith('.h')) {
          writeFileSync(join(workspace.directory, file.name), file.content);
        }
      }

      const prodOutput = compileAndRunCProgram({
        directory: workspace.directory,
        harnessSource: hostHarnessFile!.content,
      });
      expect(prodOutput).toBe('');

      const traceOutput = compileAndRunCProgram({
        directory: workspace.directory,
        harnessSource: hostHarnessFile!.content,
        defines: ['SM_TRACE_ENABLED'],
      });
      expect(traceOutput).toBe('');
    } finally {
      workspace.cleanup();
    }
  }, 30000);
});
