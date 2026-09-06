import { execFileSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import type { SMCStandard } from './smModel';
import {
  renderCTestRuntimeFiles,
  type CTestRuntimeRenderOptions,
} from './smCTestRuntimeRenderer';

const isGccAvailable = (): boolean => {
  try {
    execFileSync('gcc', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};

describe('smCTestRuntimeRenderer', () => {
  const standards: readonly SMCStandard[] = ['c90', 'c99', 'c11'];

  for (const standard of standards) {
    describe(`Standard ${standard}`, () => {
      it(`renders all required support and MCAL stub files for ${standard}`, () => {
        const files = renderCTestRuntimeFiles({ standard });
        const fileNames = files.map((f) => f.name);

        expect(fileNames).toContain('tests/test_support.h');
        expect(fileNames).toContain('tests/test_support.c');
        expect(fileNames).toContain('tests/test_main.c');
        expect(fileNames).toContain('tests/mcal_test_stub.h');
        expect(fileNames).toContain('tests/mcal_test_stub.c');

        const supportHeader = files.find((f) => f.name === 'tests/test_support.h')!.content;
        const supportSource = files.find((f) => f.name === 'tests/test_support.c')!.content;
        const mcalHeader = files.find((f) => f.name === 'tests/mcal_test_stub.h')!.content;
        const mcalSource = files.find((f) => f.name === 'tests/mcal_test_stub.c')!.content;

        // Stable support contracts
        expect(supportHeader).toContain('ADIA_TestBegin');
        expect(supportHeader).toContain('ADIA_TestFail');
        expect(supportHeader).toContain('ADIA_AssertBool');
        expect(supportHeader).toContain('ADIA_AssertU32');
        expect(supportHeader).toContain('ADIA_AssertDouble');
        expect(supportHeader).toContain('ADIA_TestRun');

        // MCAL recorder contracts
        expect(mcalHeader).toContain('MCAL_TestReset');
        expect(mcalHeader).toContain('MCAL_TestCount');
        expect(mcalHeader).toContain('MCAL_TestCallAt');
        expect(mcalHeader).toContain('MCAL_TestCall');
        expect(mcalHeader).toContain('Wdg_Service');
        expect(mcalHeader).toContain('ADIA_Safe_Outputs_Hook');

        // Check that -Wvla will be enforced during compilation
        expect(supportSource).not.toMatch(/\b(int|char|float|double|uint32_t)\s+\w+\[[a-z_]\w*\];/);
        expect(mcalSource).not.toMatch(/\b(int|char|float|double|uint32_t)\s+\w+\[[a-z_]\w*\];/);

        // Standard-specific headers
        if (standard === 'c90') {
          expect(supportHeader).toContain('typedef unsigned char bool');
          expect(supportHeader).toContain('typedef unsigned long uint32_t');
        } else {
          expect(supportHeader).toContain('<stdbool.h>');
          expect(supportHeader).toContain('<stdint.h>');
        }
      });
    });
  }

  describe('strict C compilation and execution', () => {
    it.skipIf(!isGccAvailable())(
      'compiles test_support and mcal_test_stub with strict host flags under c90, c99, and c11',
      () => {
        for (const standard of standards) {
          const workspace = createGeneratedCodeTestWorkspace(`runtime-renderer-${standard}`);
          const files = renderCTestRuntimeFiles({ standard, maxCalls: 64 });

          for (const file of files) {
            const dest = join(workspace.directory, file.name.replace('tests/', ''));
            writeFileSync(dest, file.content);
          }

          // Write a sample test case demonstrating the API
          const testHarness = `
#include "test_support.h"
#include "mcal_test_stub.h"

static void sample_test_case(void) {
    MCAL_TestReset();
    ADIA_AssertBool(true, true, "true == true", __FILE__, __LINE__);
    ADIA_AssertU32(100, 100, "100 == 100", __FILE__, __LINE__);
    ADIA_AssertDouble(3.1415, 3.1416, 0.001, "approx pi", __FILE__, __LINE__);

    MCAL_SetChannelInputBool(1, true);
    Dio_WriteChannel(2, 1);
    Wdg_Service();
    ADIA_Safe_Outputs_Hook();

    ADIA_AssertU32(3, (uint32_t)MCAL_TestCount(), "3 calls recorded", __FILE__, __LINE__);
    {
        const MCAL_TestCall *first = MCAL_TestCallAt(0);
        ADIA_AssertBool(first != NULL, true, "first != NULL", __FILE__, __LINE__);
        if (first != NULL) {
            ADIA_AssertU32(2, first->channel, "channel == 2", __FILE__, __LINE__);
        }
    }
}

static const ADIA_TestCase s_cases[] = {
    { "SAMPLE-001", "Sample test case", sample_test_case }
};

int main(void) {
    return ADIA_TestRun(s_cases, sizeof(s_cases) / sizeof(s_cases[0]));
}
`;
          writeFileSync(join(workspace.directory, 'sample_test.c'), testHarness);

          const exeName = join(workspace.directory, `test_run_${standard}.exe`);
          const compileArgs = [
            `-std=${standard}`,
            '-Wall',
            '-Wextra',
            '-Werror',
            '-Wpedantic',
            '-Wconversion',
            '-Wsign-conversion',
            '-Wshadow',
            '-Wvla',
            '-I.',
            'test_support.c',
            'mcal_test_stub.c',
            'sample_test.c',
            '-o',
            exeName,
          ];

          execFileSync('gcc', compileArgs, { cwd: workspace.directory, stdio: 'pipe' });
          expect(existsSync(exeName)).toBe(true);

          const runOutput = execFileSync(exeName, [], { cwd: workspace.directory, stdio: 'pipe' });
          expect(runOutput.toString()).toContain('PASS');
        }
      },
      60_000,
    );
  });
});
