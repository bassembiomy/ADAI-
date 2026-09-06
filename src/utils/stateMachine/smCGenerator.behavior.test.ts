import { execFileSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import { reviewedTwoStateFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';

const isGccAvailable = (): boolean => {
  try {
    execFileSync('gcc', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};

describe('smCGenerator behavior and safety contracts', () => {
  const buildReviewed = () => {
    const fixture = reviewedTwoStateFixture();
    const built = buildSemanticModel(fixture);
    if (!built.ir) throw new Error('Failed to build semantic model');
    return built.ir;
  };

  it('declares and compiles test-only corruption hooks only when ADIA_TESTING is defined', () => {
    const ir = buildReviewed();
    const artifacts = generateCArtifacts(ir, { includeTestShims: true });

    const coreHeader = artifacts.files.find((f) => f.name === 'sm_core.h')!.content;
    const coreSource = artifacts.files.find((f) => f.name === 'sm_core.c')!.content;

    expect(coreHeader).toContain('#ifdef ADIA_TESTING');
    expect(coreHeader).toContain('SM_Test_SetActiveState');
    expect(coreHeader).toContain('SM_Test_SetStateActive');
    expect(coreHeader).toContain('SM_Test_SetStateTimer');

    expect(coreSource).toContain('#ifdef ADIA_TESTING');
    expect(coreSource).toContain('SM_Test_SetActiveState');
  });

  it('defines SM_TICK_MIN_MS, SM_TICK_MAX_MS, and SM_TICK_TOLERANCE_MS in sm_config.h', () => {
    const ir = buildReviewed();
    const artifacts = generateCArtifacts(ir);
    const configHeader = artifacts.files.find((f) => f.name === 'sm_config.h')!.content;

    expect(configHeader).toContain('#define SM_TICK_MS 500U');
    expect(configHeader).toContain('#define SM_TICK_TOLERANCE_MS 50U');
    expect(configHeader).toContain('#define SM_TICK_MIN_MS 450U');
    expect(configHeader).toContain('#define SM_TICK_MAX_MS 550U');
  });

  it.skipIf(!isGccAvailable())(
    'compiles and validates runtime contracts: null checks, timing rejection, saturation, and fault latching',
    () => {
      const ir = buildReviewed();
      const artifacts = generateCArtifacts(ir, { includeTestShims: true });
      const workspace = createGeneratedCodeTestWorkspace('behavior-runtime-tests');

      for (const file of artifacts.files) {
        if (file.name.endsWith('.c') || file.name.endsWith('.h')) {
          writeFileSync(join(workspace.directory, file.name), file.content);
        }
      }

      const harness = `
#include <assert.h>
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include "sm_core.h"
#include "sm_config.h"
#include "sm_safety.h"

int main(void) {
    ADIA_Instance_t inst;

    /* 1. Null pointer safety */
    assert(SM_Init(NULL) == SM_ERR_NULL_INSTANCE);
    assert(SM_Step(NULL, 500) == SM_ERR_NULL_INSTANCE);
    assert(SM_Reset(NULL) == SM_ERR_NULL_INSTANCE);
    assert(SM_ReadInputs(NULL) == SM_ERR_NULL_INSTANCE);
    assert(SM_WriteOutputs(NULL) == SM_ERR_NULL_INSTANCE);

    /* 2. Proper initialization */
    assert(SM_Init(&inst) == SM_ERR_NONE);
    assert(SM_GetError(&inst) == SM_ERR_NONE);
    assert(!inst.fault_latched);

    /* 3. Valid timing accepted */
    assert(SM_Step(&inst, 500) == SM_ERR_NONE);
    assert(SM_Step(&inst, 450) == SM_ERR_NONE);
    assert(SM_Step(&inst, 550) == SM_ERR_NONE);

    /* 4. Invalid timing rejected */
    assert(SM_Reset(&inst) == SM_ERR_NONE);
    assert(SM_Step(&inst, 449) == SM_ERR_TIMING);
    assert(inst.fault_latched == true);

    /* Latched execution blocks subsequent steps */
    assert(SM_Step(&inst, 500) == SM_ERR_TIMING);

    /* Reset recovers from fault */
    assert(SM_Reset(&inst) == SM_ERR_NONE);
    assert(inst.fault_latched == false);
    assert(SM_GetError(&inst) == SM_ERR_NONE);

    assert(SM_Step(&inst, 551) == SM_ERR_TIMING);
    assert(inst.fault_latched == true);

    /* 5. Saturation */
    assert(SM_Reset(&inst) == SM_ERR_NONE);
    assert(SM_Test_SetStateTimer(&inst, SM_ST_STATE_1, 0xFFFFFFFFU - 100U) == SM_ERR_NONE);
    assert(SM_Step(&inst, 500) == SM_ERR_NONE);
    /* Timer should have saturated at UINT32_MAX */
    assert(inst.state_timers[SM_ST_STATE_1_IDX] == 0xFFFFFFFFU);

    /* 6. Test setter argument validation */
    assert(SM_Test_SetActiveState(NULL, 0, SM_ST_STATE_1) == SM_ERR_NULL_INSTANCE);
    assert(SM_Test_SetActiveState(&inst, 999, SM_ST_STATE_1) == SM_ERR_INVALID_ARGUMENT);
    assert(SM_Test_SetStateActive(&inst, 999, true) == SM_ERR_INVALID_ARGUMENT);

    printf("BEHAVIOR_CONTRACTS_PASS\\n");
    return 0;
}
`;
      writeFileSync(join(workspace.directory, 'harness.c'), harness);

      const exeName = join(workspace.directory, 'behavior_test.exe');
      const cFiles = artifacts.files
        .filter((f) => f.name.endsWith('.c') && !f.name.includes('report') && !f.name.includes('host_test'))
        .map((f) => f.name);

      const compileArgs = [
        '-std=c99',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-DADIA_TESTING',
        '-I.',
        ...cFiles,
        'harness.c',
        '-o',
        exeName,
      ];

      execFileSync('gcc', compileArgs, { cwd: workspace.directory, stdio: 'pipe' });
      expect(existsSync(exeName)).toBe(true);

      const output = execFileSync(exeName, [], { cwd: workspace.directory, stdio: 'pipe' });
      expect(output.toString()).toContain('BEHAVIOR_CONTRACTS_PASS');
    },
    60_000,
  );
});
