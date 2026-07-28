import { afterEach, describe, it, expect } from 'vitest';
import { generateMISRACCode } from './stateMachineCodeGenerator';
import { createGeneratedCodeTestWorkspace } from './generatedCodeTestWorkspace';
import { StateData, VariableDef, TransitionData, JunctionData, Layer } from '../types/sm_types';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const mkVar = (id: string, name: string, type: VariableDef['type'], initialValue: string): VariableDef =>
  ({ id, name, type, initialValue, currentValue: 0, visibleInScope: true });

const mkState = (id: string, name: string, over: Partial<StateData> = {}): StateData => ({
  id, name, x: 0, y: 0, width: 100, height: 100,
  entry: '', during: '', exit: '',
  isActive: false, color: 'blue', parentId: 'root', children: [],
  priority: 1, isParallel: false, regionId: 'MAIN', autostart: false,
  ...over
});

const mkTransition = (id: string, sourceId: string, targetId: string, over: Partial<TransitionData> = {}): TransitionData => ({
  id, sourceId, targetId, condition: '', action: '', afterTicks: null,
  type: 'condition', hasControlPoint: false, order: 1, ...over
});

const rootLayer = (stateIds: string[], junctionIds: string[] = []): Layer =>
  ({ id: 'root', name: 'root', parentStateId: null, stateIds, transitionIds: [], junctionIds });

const writeFiles = (dir: string, files: { name: string; content: string }[]) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  files.forEach(f => {
    if (f.name.endsWith('.c') || f.name.endsWith('.h')) {
      fs.writeFileSync(path.join(dir, f.name), f.content);
    }
  });
};

const hostCompileAndRun = (dir: string, harnessC: string): string => {
  let gcc = 'gcc';
  try {
    execSync('gcc --version', { stdio: 'pipe' });
  } catch {
    return 'SKIPPED';
  }
  fs.writeFileSync(path.join(dir, 'harness.c'), harnessC);
  const exe = path.join(dir, process.platform === 'win32' ? 'harness.exe' : 'harness');
  execSync(
    `${gcc} -std=c99 -Wall -Wextra -Werror -I. sm_core.c sm_safety.c sm_user_logic.c harness.c -o "${exe}"`,
    { cwd: dir, stdio: 'pipe' }
  );
  return execSync(`"${exe}"`, { cwd: dir, stdio: 'pipe' }).toString();
};

const HARNESS_PREAMBLE = `#include "sm_core.h"
#include <stdio.h>

static int failures = 0;
#define CHECK(cond, msg) do { \
    if (!(cond)) { printf("FAIL: %s\\n", msg); failures++; } \
    else { printf("ok: %s\\n", msg); } \
} while (0)

int main(void) {
    ADIA_Instance_t inst;
`;

const HARNESS_EPILOGUE = `    if (failures > 0) { printf("RESULT: FAIL (%d)\\n", failures); } else { printf("RESULT: PASS\\n"); }
    return failures;
}
`;

describe('Golden-file & behavior trace regression tests', () => {
  let generatedCodeWorkspace: ReturnType<typeof createGeneratedCodeTestWorkspace> | undefined;

  const generatedCodeTestDirectory = (label: string): string => {
    generatedCodeWorkspace = createGeneratedCodeTestWorkspace(label);
    return generatedCodeWorkspace.directory;
  };

  afterEach(() => {
    generatedCodeWorkspace?.cleanup();
    generatedCodeWorkspace = undefined;
  });

  const vars = [
    mkVar('v1', 'log', 'uint32', '0'),
    mkVar('v2', 't1', 'bool', 'false'),
    mkVar('v3', 't2', 'bool', 'false')
  ];

  const regressionChart = {
    tickMs: 10,
    states: [
      mkState('s1', 'A', { autostart: true, entry: 'log = 100;', during: 'log = log + 1;', exit: 'log = log + 5;' }),
      mkState('s2', 'B', { entry: 'log = 200;', during: 'log = log + 2;' })
    ],
    junctions: [] as JunctionData[],
    transitions: [
      mkTransition('t1', 's1', 's2', { type: 'after', afterTicks: 2 })
    ],
    variables: vars,
    layers: [rootLayer(['s1', 's2'])],
    safetyMode: false
  };

  it('should match golden templates (snapshot comparison)', () => {
    const result = generateMISRACCode(regressionChart as any);
    expect(result.errors).toHaveLength(0);

    // Assert file output structures match saved golden snapshots
    const filesSnapshot = result.files.map(f => ({
      name: f.name,
      content: f.content
        .replace(/\/\* Model: ADIA State Machine \| .*? \*\//g, '/* Model: ADIA State Machine | STATIC_TIMESTAMP */')
        .replace(/\*\*Timestamp:\*\* .*?\n/g, '**Timestamp:** STATIC_TIMESTAMP\n')
    }));

    expect(filesSnapshot).toMatchSnapshot();
  });

  it('should verify trace harness runtime behavior via host compiler execution', () => {
    const result = generateMISRACCode(regressionChart as any);
    expect(result.errors).toHaveLength(0);

    const dir = generatedCodeTestDirectory('regression-trace');
    writeFiles(dir, result.files);

    const out = hostCompileAndRun(dir, HARNESS_PREAMBLE + `
    /* Initialize trace harness */
    SM_Init(&inst);
    /* Initial state A entered: log entry action runs and sets it to 100 */
    CHECK(inst.state_active[SM_ST_S1_IDX] == true, "init: A active");
    CHECK(inst.data.log == 100U, "init: A entry action set log to 100");

    /* Tick 1 (10ms): A still active. Timer increments, transitions are evaluated.
     * Timer is 10 ms (1 tick) which is < 20 ms (2 ticks), so t1 does not fire.
     * Since no transition fires, during action of A runs (log + 1) => 101 */
    SM_Step(&inst, 10U);
    CHECK(inst.state_active[SM_ST_S1_IDX] == true, "tick 1: A still active");
    CHECK(inst.data.log == 101U, "tick 1: A during action updated log to 101");

    /* Tick 2 (10ms): A evaluates transitions. Timer increments to 20 ms (2 ticks).
     * Since timer >= 2 ticks, after(2) fires!
     * Exit A (log + 5) => 106
     * Enter B (log = 200) => 200
     * No during actions of either state run in the same step. */
    SM_Step(&inst, 10U);
    CHECK(inst.state_active[SM_ST_S2_IDX] == true, "tick 2: B active");
    CHECK(inst.data.log == 200U, "tick 2: B entry action runs and sets log to 200");

    /* Tick 3 (10ms): B active. No transitions out of B.
     * During action of B runs (log + 2) => 202 */
    SM_Step(&inst, 10U);
    CHECK(inst.state_active[SM_ST_S2_IDX] == true, "tick 3: B still active");
    CHECK(inst.data.log == 202U, "tick 3: B during action updated log to 202");
` + HARNESS_EPILOGUE);

    if (out !== 'SKIPPED') {
      expect(out).toContain('RESULT: PASS');
    }
  }, 60000);
});
