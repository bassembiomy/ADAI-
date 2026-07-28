import { afterEach, describe, it, expect } from 'vitest';

/* gcc compile + execute cycles can exceed the default 5s test timeout on
 * Windows (AV scans of freshly linked executables); allow generous time. */
const BEHAVIOR_TIMEOUT = 60000;
import { generateMISRACCode, validateInitialValue } from './stateMachineCodeGenerator';
import { StateData, VariableDef, TransitionData, JunctionData, Layer } from '../types/sm_types';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { createGeneratedCodeTestWorkspace } from './generatedCodeTestWorkspace';
import { compileAndRunCProgram } from './stateMachine/smCHarness';

const generatedCodeWorkspaces: ReturnType<typeof createGeneratedCodeTestWorkspace>[] = [];

const generatedCodeTestDirectory = (label: string): string => {
  const workspace = createGeneratedCodeTestWorkspace(label);
  generatedCodeWorkspaces.push(workspace);
  return workspace.directory;
};

afterEach(() => {
  for (const workspace of generatedCodeWorkspaces.splice(0)) {
    workspace.cleanup();
  }
});

/* ------------------------------------------------------------------ */
/* Shared chart builders                                               */
/* ------------------------------------------------------------------ */

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

const AVR_GCC = path.join(__dirname, '../../avr-gcc/avr-gcc-15.2.0-x64-windows/bin/avr-gcc.exe');
const AVR_INC = path.join(__dirname, '../../avr-gcc/avr-gcc-15.2.0-x64-windows/avr/include');

const avrCompile = (dir: string) => {
  /* The bundled toolchain must be present — fail loudly instead of skipping */
  expect(fs.existsSync(AVR_GCC)).toBe(true);
  execSync(
    `"${AVR_GCC}" -Wall -Wextra -Werror -c sm_core.c sm_safety.c sm_user_logic.c -I. -I"${AVR_INC}" -D__AVR_ATmega2560__ -DF_CPU=16000000UL -D__AVR__`,
    { cwd: dir, stdio: 'pipe' }
  );
};

/* Compiles the generated C with the HOST gcc plus a behavioral harness and
 * runs it. Returns the harness stdout. Skips (warn) only when no host gcc
 * exists on the machine. */
const hostCompileAndRun = (dir: string, harnessC: string): string => {
  const output = compileAndRunCProgram({
    directory: dir,
    harnessSource: harnessC,
    allowMissingCompiler: true,
    executableName: 'harness',
  });
  if (output === null) {
    console.warn('host gcc not found, skipping behavioral test');
    return 'SKIPPED';
  }
  return output;
};

const HARNESS_PREAMBLE = `#include "sm_core.h"
#include <stdio.h>

void MCAL_ApplySafeOutputs(void) {}

static int failures = 0;
#define CHECK(cond, msg) do { \\
    if (!(cond)) { printf("FAIL: %s\\n", msg); failures++; } \\
    else { printf("ok: %s\\n", msg); } \\
} while (0)

int main(void) {
    ADIA_Instance_t inst;
`;

const HARNESS_EPILOGUE = `    if (failures > 0) { printf("RESULT: FAIL (%d)\\n", failures); } else { printf("RESULT: PASS\\n"); }
    return failures;
}
`;

/* ------------------------------------------------------------------ */
/* Unit-level tests for previously uncovered validation/features       */
/* ------------------------------------------------------------------ */

describe('Generator validation & trigger coverage', () => {
  const baseVars = [mkVar('v1', 'counter', 'uint16', '0'), mkVar('v2', 'flag', 'bool', 'false')];

  it('rejects C keyword, reserved and duplicate variable names', () => {
    const chart = {
      tickMs: 10,
      states: [mkState('s1', 'A', { autostart: true })],
      junctions: [],
      transitions: [],
      variables: [mkVar('v1', 'int', 'uint8', '0')],
      layers: [rootLayer(['s1'])],
      safetyMode: false
    };
    const r1 = generateMISRACCode(chart as any);
    expect(r1.errors.length).toBeGreaterThan(0);
    expect(r1.errors[0].message).toContain('reserved');

    const r2 = generateMISRACCode({ ...chart, variables: [mkVar('v1', 'state_timer', 'uint8', '0')] } as any);
    expect(r2.errors.length).toBeGreaterThan(0);

    const r3 = generateMISRACCode({ ...chart, variables: [mkVar('v1', 'dup', 'uint8', '0'), mkVar('v2', 'dup', 'uint8', '0')] } as any);
    expect(r3.errors.length).toBeGreaterThan(0);
    expect(r3.errors[0].message).toContain('Duplicate');

    const r4 = generateMISRACCode({ ...chart, variables: [mkVar('v1', 'not valid!', 'uint8', '0')] } as any);
    expect(r4.errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid initial values and accepts scientific float notation', () => {
    const chart = {
      tickMs: 10,
      states: [mkState('s1', 'A', { autostart: true })],
      junctions: [],
      transitions: [],
      variables: [mkVar('v1', 'x', 'float', '')],
      layers: [rootLayer(['s1'])],
      safetyMode: false
    };
    const r1 = generateMISRACCode(chart as any);
    expect(r1.errors.length).toBeGreaterThan(0);
    expect(r1.errors[0].message).toContain('Invalid initial value');

    const r2 = generateMISRACCode({ ...chart, variables: [mkVar('v1', 'x', 'uint8', 'abc')] } as any);
    expect(r2.errors.length).toBeGreaterThan(0);

    /* 1e3 must stay valid scientific notation, never mangled to 1.0fe3 */
    const r3 = generateMISRACCode({ ...chart, variables: [mkVar('v1', 'x', 'float', '1e3')] } as any);
    expect(r3.errors).toHaveLength(0);
    const coreC = r3.files.find(f => f.name === 'sm_core.c')?.content || '';
    expect(coreC).toContain('instance->data.x = (float)(1000.0f);');
    expect(coreC).not.toContain('1.0fe3');
  });

  it('validates variable initial values accurately using validateInitialValue', () => {
    expect(validateInitialValue({ type: 'uint8', initialValue: '255' })).toBe('255');
    expect(validateInitialValue({ type: 'uint8', initialValue: '-5' })).toBeNull();
    expect(validateInitialValue({ type: 'uint8', initialValue: 'abc' })).toBeNull();

    expect(validateInitialValue({ type: 'bool', initialValue: 'true' })).toBe('true');
    expect(validateInitialValue({ type: 'bool', initialValue: '1' })).toBe('true');
    expect(validateInitialValue({ type: 'bool', initialValue: 'false' })).toBe('false');
    expect(validateInitialValue({ type: 'bool', initialValue: '0' })).toBe('false');
    expect(validateInitialValue({ type: 'bool', initialValue: 'abc' })).toBeNull();

    expect(validateInitialValue({ type: 'float', initialValue: '3.14' })).toBe('3.14');
    expect(validateInitialValue({ type: 'float', initialValue: '1.5f' })).toBe('1.5f');
    expect(validateInitialValue({ type: 'float', initialValue: 'xyz' })).toBeNull();
  });

  it('emits and/or trigger combinations without invariant timer operands', () => {
    const states = [mkState('s1', 'A', { autostart: true }), mkState('s2', 'B')];
    const transitions = [
      mkTransition('t1', 's1', 's2', { type: 'and', condition: 'flag', afterTicks: 5, order: 1 }),
      mkTransition('t2', 's2', 's1', {
        type: 'or',
        condition: 'counter > 3',
        afterTicks: 5,
        order: 1,
      })
    ];
    const chart = {
      tickMs: 10, states, junctions: [], transitions,
      variables: baseVars,
      layers: [{ ...rootLayer(['s1', 's2']), transitionIds: ['t1', 't2'] }],
      safetyMode: false
    };
    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';

    /* and: condition && timer */
    expect(coreC).toContain('instance->data.flag');
    expect(coreC).toContain('instance->state_timers[SM_ST_S1_IDX] >= 50U');

    /* or without afterTicks: condition only, no "(timer >= 0U)" invariant */
    expect(coreC).toContain('(instance->data.counter > 3U)');
    expect(coreC).not.toContain('>= 0U)');
  });

  it('honors transition priority order (order field)', () => {
    const states = [mkState('s1', 'A', { autostart: true }), mkState('s2', 'B'), mkState('s3', 'C')];
    const transitions = [
      mkTransition('t_hi', 's1', 's3', { condition: 'true', order: 2 }),
      mkTransition('t_lo', 's1', 's2', { condition: 'flag', order: 1 })
    ];
    const chart = {
      tickMs: 10, states, junctions: [], transitions,
      variables: baseVars,
      layers: [{ ...rootLayer(['s1', 's2', 's3']), transitionIds: ['t_hi', 't_lo'] }],
      safetyMode: false
    };
    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';

    /* The order-1 transition (to B) must be emitted before the order-2 one (to C) */
    const posB = coreC.indexOf('(instance->active_states[0U] != SM_ST_S2)');
    const posC = coreC.indexOf('(instance->active_states[0U] != SM_ST_S3)');
    expect(posB).toBeGreaterThan(-1);
    expect(posC).toBeGreaterThan(-1);
    expect(posB).toBeLessThan(posC);
  });
});

/* ------------------------------------------------------------------ */
/* Compile gates: hierarchy, history and parallel charts via avr-gcc   */
/* ------------------------------------------------------------------ */

describe('avr-gcc compile gates for advanced charts', () => {
  const vars = [
    mkVar('v1', 'log', 'uint32', '0'),
    mkVar('v2', 't1', 'bool', 'false'),
    mkVar('v3', 't2', 'bool', 'false'),
    mkVar('v4', 't3', 'bool', 'false')
  ];

  const hierarchyChart = () => ({
    tickMs: 10,
    states: [
      mkState('p', 'P', { autostart: true, entry: 'log = log * 10 + 6;', exit: 'log = log * 10 + 2;' }),
      mkState('q', 'Q', { entry: 'log = log * 10 + 4;', exit: 'log = log * 10 + 5;' }),
      mkState('c', 'C', { autostart: true, exit: 'log = log * 10 + 1;' }),
      mkState('d', 'D', { entry: 'log = log * 10 + 7;' })
    ],
    junctions: [] as JunctionData[],
    transitions: [
      mkTransition('t_cq', 'c', 'q', { condition: 't1', action: 'log = log * 10 + 3;' }),
      mkTransition('t_qd', 'q', 'd', { condition: 't2' })
    ],
    variables: vars,
    layers: [
      rootLayer(['p', 'q']),
      { id: 'layerP', name: 'layerP', parentStateId: 'p', stateIds: ['c', 'd'], transitionIds: [], junctionIds: [] }
    ],
    safetyMode: false
  });

  it('compiles a nested-hierarchy chart with avr-gcc -Wall -Wextra -Werror', () => {
    const result = generateMISRACCode(hierarchyChart() as any);
    expect(result.errors).toHaveLength(0);
    const dir = generatedCodeTestDirectory('compile-hierarchy');
    writeFiles(dir, result.files);
    avrCompile(dir);
  });

  const historyChart = (histType: 'history' | 'deep-history') => ({
    tickMs: 10,
    states: [
      mkState('p', 'P', { autostart: true }),
      mkState('out', 'Out'),
      mkState('a', 'A', { autostart: true }),
      mkState('b', 'B'),
      mkState('x', 'X', { autostart: true }),
      mkState('y', 'Y')
    ],
    junctions: [
      { id: 'hj', x: 0, y: 0, name: 'H', color: 'gray', parentId: 'layerP', type: histType } as JunctionData
    ],
    transitions: [
      mkTransition('t_xy', 'x', 'y', { condition: 't1' }),
      mkTransition('t_yout', 'y', 'out', { condition: 't2' }),
      mkTransition('t_outp', 'out', 'p', { condition: 't3' })
    ],
    variables: vars,
    layers: [
      rootLayer(['p', 'out']),
      { id: 'layerP', name: 'layerP', parentStateId: 'p', stateIds: ['a', 'b'], transitionIds: [], junctionIds: ['hj'] },
      { id: 'layerA', name: 'layerA', parentStateId: 'a', stateIds: ['x', 'y'], transitionIds: [], junctionIds: [] }
    ],
    safetyMode: false
  });

  it('compiles shallow-history and deep-history charts with avr-gcc', () => {
    for (const histType of ['history', 'deep-history'] as const) {
      const result = generateMISRACCode(historyChart(histType) as any);
      expect(result.errors).toHaveLength(0);
      const dir = generatedCodeTestDirectory(`compile-${histType}`);
      writeFiles(dir, result.files);
      avrCompile(dir);
    }
  });

  it('compiles a parallel-region chart with avr-gcc', () => {
    const chart = {
      tickMs: 10,
      states: [
        mkState('a', 'ParA', { autostart: true, isParallel: true, regionId: 'R1', priority: 1, during: 'log = 1;' }),
        mkState('b', 'ParB', { autostart: true, isParallel: true, regionId: 'R2', priority: 2, during: 'log = 2;' })
      ],
      junctions: [],
      transitions: [],
      variables: vars,
      layers: [rootLayer(['a', 'b'])],
      safetyMode: false
    };
    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);
    const dir = generatedCodeTestDirectory('compile-parallel');
    writeFiles(dir, result.files);
    avrCompile(dir);
  });
});

/* ------------------------------------------------------------------ */
/* Behavioral tests: run generated C on the host and assert semantics  */
/* ------------------------------------------------------------------ */

describe('Generated code behaves like Stateflow/Embedded Coder output (host gcc execution)', () => {
  const vars = [
    mkVar('v1', 'log', 'uint32', '0'),
    mkVar('v2', 't1', 'bool', 'false'),
    mkVar('v3', 't2', 'bool', 'false'),
    mkVar('v4', 't3', 'bool', 'false')
  ];

  it('exit -> transition action -> entry ordering, flat chart', () => {
    const chart = {
      tickMs: 10,
      states: [
        mkState('a', 'A', { autostart: true, exit: 'log = log * 10 + 1;' }),
        mkState('b', 'B', { entry: 'log = log * 10 + 3;' })
      ],
      junctions: [],
      transitions: [mkTransition('t_ab', 'a', 'b', { condition: 't1', action: 'log = log * 10 + 2;' })],
      variables: vars,
      layers: [rootLayer(['a', 'b'])],
      safetyMode: false
    };
    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);
    const dir = generatedCodeTestDirectory('behavior-order');
    writeFiles(dir, result.files);

    const out = hostCompileAndRun(dir, HARNESS_PREAMBLE + `
    SM_Init(&inst);
    inst.data.log = 0U;
    inst.data.t1 = true;
    SM_Step(&inst, 10U);
    /* exit A (+1), action (+2), entry B (+3) => 123 */
    CHECK(inst.data.log == 123U, "exit-action-entry order");
    CHECK(inst.state_active[SM_ST_B_IDX] == true, "B active after transition");
    CHECK(inst.state_active[SM_ST_A_IDX] == false, "A inactive after transition");
` + HARNESS_EPILOGUE);
    if (out !== 'SKIPPED') expect(out).toContain('RESULT: PASS');
  }, BEHAVIOR_TIMEOUT);

  it('cross-hierarchy transition runs LCA exit/entry chain', () => {
    const chart = {
      tickMs: 10,
      states: [
        mkState('p', 'P', { autostart: true, entry: 'log = log * 10 + 6;', exit: 'log = log * 10 + 2;' }),
        mkState('q', 'Q', { entry: 'log = log * 10 + 4;', exit: 'log = log * 10 + 5;' }),
        mkState('c', 'C', { autostart: true, exit: 'log = log * 10 + 1;' }),
        mkState('d', 'D', { entry: 'log = log * 10 + 7;' })
      ],
      junctions: [],
      transitions: [
        mkTransition('t_cq', 'c', 'q', { condition: 't1', action: 'log = log * 10 + 3;' }),
        mkTransition('t_qd', 'q', 'd', { condition: 't2' })
      ],
      variables: vars,
      layers: [
        rootLayer(['p', 'q']),
        { id: 'layerP', name: 'layerP', parentStateId: 'p', stateIds: ['c', 'd'], transitionIds: [], junctionIds: [] }
      ],
      safetyMode: false
    };
    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);
    const dir = generatedCodeTestDirectory('behavior-hierarchy');
    writeFiles(dir, result.files);

    const out = hostCompileAndRun(dir, HARNESS_PREAMBLE + `
    SM_Init(&inst);
    /* After init: P and C active */
    CHECK(inst.state_active[SM_ST_P_IDX] == true, "P active after init");
    CHECK(inst.state_active[SM_ST_C_IDX] == true, "C active after init");

    inst.data.log = 0U;
    inst.data.t1 = true;
    SM_Step(&inst, 10U);
    /* C->Q: exit C (+1), exit P (+2), action (+3), enter Q (+4) => 1234 */
    CHECK(inst.data.log == 1234U, "C->Q exit chain order");
    CHECK(inst.state_active[SM_ST_Q_IDX] == true, "Q active");
    CHECK(inst.state_active[SM_ST_P_IDX] == false, "P exited");
    CHECK(inst.state_active[SM_ST_C_IDX] == false, "C exited");
    inst.data.t1 = false;

    inst.data.log = 0U;
    inst.data.t2 = true;
    SM_Step(&inst, 10U);
    /* Q->D: exit Q (+5), enter P shallow (+6), enter D (+7) => 567 */
    CHECK(inst.data.log == 567U, "Q->D entry chain order");
    CHECK(inst.state_active[SM_ST_P_IDX] == true, "P re-entered");
    CHECK(inst.state_active[SM_ST_D_IDX] == true, "D active");
` + HARNESS_EPILOGUE);
    if (out !== 'SKIPPED') expect(out).toContain('RESULT: PASS');
  }, BEHAVIOR_TIMEOUT);

  it('shallow history restores direct child only; deep history restores nested path', () => {
    const buildChart = (histType: 'history' | 'deep-history') => ({
      tickMs: 10,
      states: [
        mkState('p', 'P', { autostart: true }),
        mkState('out', 'Out'),
        mkState('a', 'A', { autostart: true }),
        mkState('b', 'B'),
        mkState('x', 'X', { autostart: true }),
        mkState('y', 'Y')
      ],
      junctions: [
        { id: 'hj', x: 0, y: 0, name: 'H', color: 'gray', parentId: 'layerP', type: histType } as JunctionData
      ],
      transitions: [
        mkTransition('t_xy', 'x', 'y', { condition: 't1' }),
        mkTransition('t_yout', 'y', 'out', { condition: 't2' }),
        mkTransition('t_outp', 'out', 'hj', { condition: 't3' })
      ],
      variables: vars,
      layers: [
        rootLayer(['p', 'out']),
        { id: 'layerP', name: 'layerP', parentStateId: 'p', stateIds: ['a', 'b'], transitionIds: [], junctionIds: ['hj'] },
        { id: 'layerA', name: 'layerA', parentStateId: 'a', stateIds: ['x', 'y'], transitionIds: [], junctionIds: [] }
      ],
      safetyMode: false
    });

    /* Shallow: re-entering P restores A, but A's child layer uses its DEFAULT (X) */
    {
      const result = generateMISRACCode(buildChart('history') as any);
      expect(result.errors).toHaveLength(0);
      const dir = generatedCodeTestDirectory('behavior-hist-shallow');
      writeFiles(dir, result.files);
      const out = hostCompileAndRun(dir, HARNESS_PREAMBLE + `
    SM_Init(&inst);
    inst.data.t1 = true;  SM_Step(&inst, 10U); inst.data.t1 = false;  /* X->Y */
    CHECK(inst.state_active[SM_ST_Y_IDX] == true, "Y active before exit");
    inst.data.t2 = true;  SM_Step(&inst, 10U); inst.data.t2 = false;  /* Y->Out */
    CHECK(inst.state_active[SM_ST_OUT_IDX] == true, "Out active");
    inst.data.t3 = true;  SM_Step(&inst, 10U); inst.data.t3 = false;  /* Out->P restores history */
    CHECK(inst.state_active[SM_ST_A_IDX] == true, "shallow: A restored");
    CHECK(inst.state_active[SM_ST_X_IDX] == true, "shallow: default X entered (not Y)");
    CHECK(inst.state_active[SM_ST_Y_IDX] == false, "shallow: Y not restored");
` + HARNESS_EPILOGUE);
      if (out !== 'SKIPPED') expect(out).toContain('RESULT: PASS');
    }

    /* Deep: re-entering P restores A AND the nested Y */
    {
      const result = generateMISRACCode(buildChart('deep-history') as any);
      expect(result.errors).toHaveLength(0);
      const dir = generatedCodeTestDirectory('behavior-hist-deep');
      writeFiles(dir, result.files);
      const out = hostCompileAndRun(dir, HARNESS_PREAMBLE + `
    SM_Init(&inst);
    inst.data.t1 = true;  SM_Step(&inst, 10U); inst.data.t1 = false;  /* X->Y */
    inst.data.t2 = true;  SM_Step(&inst, 10U); inst.data.t2 = false;  /* Y->Out */
    inst.data.t3 = true;  SM_Step(&inst, 10U); inst.data.t3 = false;  /* Out->P restores deep history */
    CHECK(inst.state_active[SM_ST_A_IDX] == true, "deep: A restored");
    CHECK(inst.state_active[SM_ST_Y_IDX] == true, "deep: nested Y restored");
    CHECK(inst.state_active[SM_ST_X_IDX] == false, "deep: default X not entered");
` + HARNESS_EPILOGUE);
      if (out !== 'SKIPPED') expect(out).toContain('RESULT: PASS');
    }
  }, BEHAVIOR_TIMEOUT);

  it('external self-transition exits/re-enters; internal runs action only', () => {
    const chart = {
      tickMs: 10,
      states: [
        mkState('s1', 'S1', {
          autostart: true,
          entry: 'log = log * 10 + 2;', exit: 'log = log * 10 + 1;'
        }),
        mkState('s2', 'S2', { entry: 'log = log * 10 + 3;' })
      ],
      junctions: [],
      transitions: [
        mkTransition('t_self_ext', 's1', 's1', { condition: 't1' }),
        mkTransition('t_go', 's1', 's2', { condition: 't2' }),
        mkTransition('t_self_int', 's2', 's2', { condition: 't3', isInternal: true, action: 'log = log * 10 + 5;' })
      ],
      variables: vars,
      layers: [rootLayer(['s1', 's2'])],
      safetyMode: false
    };
    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);
    const dir = generatedCodeTestDirectory('behavior-selftrans');
    writeFiles(dir, result.files);

    const out = hostCompileAndRun(dir, HARNESS_PREAMBLE + `
    SM_Init(&inst);
    inst.data.log = 0U;
    inst.data.t1 = true;
    SM_Step(&inst, 10U);
    inst.data.t1 = false;
    /* External self: exit S1 (+1), entry S1 (+2) => 12 */
    CHECK(inst.data.log == 12U, "external self-transition exits and re-enters");
    CHECK(inst.state_active[SM_ST_S1_IDX] == true, "S1 still active");

    inst.data.log = 0U;
    inst.data.t2 = true;
    SM_Step(&inst, 10U);
    inst.data.t2 = false;
    /* S1->S2: exit S1 (+1), entry S2 (+3) => 13 */
    CHECK(inst.data.log == 13U, "S1->S2 transition");
    CHECK(inst.state_active[SM_ST_S2_IDX] == true, "S2 active");

    inst.data.t3 = true;
    SM_Step(&inst, 10U);
    inst.data.t3 = false;
    /* Internal self: action only (+5) => 135 */
    CHECK(inst.data.log == 135U, "internal self-transition runs action without exit/entry");
    CHECK(inst.state_active[SM_ST_S2_IDX] == true, "S2 still active");
` + HARNESS_EPILOGUE);
    if (out !== 'SKIPPED') expect(out).toContain('RESULT: PASS');
  }, BEHAVIOR_TIMEOUT);

  it('after(N) temporal transition fires after exactly N ticks', () => {
    const chart = {
      tickMs: 10,
      states: [
        mkState('a', 'A', { autostart: true }),
        mkState('b', 'B')
      ],
      junctions: [],
      transitions: [mkTransition('t_ab', 'a', 'b', { type: 'after', afterTicks: 3 })],
      variables: vars,
      layers: [rootLayer(['a', 'b'])],
      safetyMode: false
    };
    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);
    const dir = generatedCodeTestDirectory('behavior-after');
    writeFiles(dir, result.files);

    const out = hostCompileAndRun(dir, HARNESS_PREAMBLE + `
    SM_Init(&inst);
    SM_Step(&inst, 10U);
    CHECK(inst.state_active[SM_ST_A_IDX] == true, "tick 1: still A");
    SM_Step(&inst, 10U);
    CHECK(inst.state_active[SM_ST_A_IDX] == true, "tick 2: still A");
    SM_Step(&inst, 10U);
    CHECK(inst.state_active[SM_ST_B_IDX] == true, "tick 3: transitioned to B");
` + HARNESS_EPILOGUE);
    if (out !== 'SKIPPED') expect(out).toContain('RESULT: PASS');
  }, BEHAVIOR_TIMEOUT);

  it('transition priority: lower order number wins at runtime', () => {
    const chart = {
      tickMs: 10,
      states: [
        mkState('a', 'A', { autostart: true }),
        mkState('b', 'B'),
        mkState('c', 'C')
      ],
      junctions: [],
      transitions: [
        mkTransition('t_hi', 'a', 'c', { condition: 'true', order: 2 }),
        mkTransition('t_lo', 'a', 'b', { condition: 'true', order: 1 })
      ],
      variables: vars,
      layers: [rootLayer(['a', 'b', 'c'])],
      safetyMode: false
    };
    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);
    const dir = generatedCodeTestDirectory('behavior-priority');
    writeFiles(dir, result.files);

    const out = hostCompileAndRun(dir, HARNESS_PREAMBLE + `
    SM_Init(&inst);
    SM_Step(&inst, 10U);
    CHECK(inst.state_active[SM_ST_B_IDX] == true, "order-1 transition to B wins");
    CHECK(inst.state_active[SM_ST_C_IDX] == false, "order-2 transition to C loses");
` + HARNESS_EPILOGUE);
    if (out !== 'SKIPPED') expect(out).toContain('RESULT: PASS');
  }, BEHAVIOR_TIMEOUT);

  it('safety error exits active states and enters the safe state', () => {
    const chart = {
      tickMs: 10,
      states: [
        mkState('run', 'Run', { autostart: true, exit: 'log = log * 10 + 1;' }),
        mkState('safe', 'Safe', { isSafeState: true, entry: 'log = log * 10 + 2;' })
      ],
      junctions: [],
      transitions: [],
      variables: vars,
      layers: [rootLayer(['run', 'safe'])],
      safetyMode: true,
      allowDeadlocks: true
    };
    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);
    const dir = generatedCodeTestDirectory('behavior-safety');
    writeFiles(dir, result.files);

    const out = hostCompileAndRun(dir, HARNESS_PREAMBLE + `
    SM_Init(&inst);
    inst.data.log = 0U;
    /* Inject a safety-class error, then step */
    inst.error_status = SM_ERR_SAFETY_VIOLATION;
    SM_Step(&inst, 10U);
    /* Run exit (+1), Safe entry (+2) => 12 */
    CHECK(inst.data.log == 12U, "exit actions run before safe-state entry");
    CHECK(inst.state_active[SM_ST_SAFE_IDX] == true, "safe state active");
    CHECK(inst.state_active[SM_ST_RUN_IDX] == false, "run state exited");
` + HARNESS_EPILOGUE);
    if (out !== 'SKIPPED') expect(out).toContain('RESULT: PASS');
  }, BEHAVIOR_TIMEOUT);

  it('parallel regions both activate and step independently', () => {
    const chart = {
      tickMs: 10,
      states: [
        mkState('a', 'ParA', { autostart: true, isParallel: true, regionId: 'R1', priority: 1, during: 'log = log + 1;' }),
        mkState('b', 'ParB', { autostart: true, isParallel: true, regionId: 'R2', priority: 2, during: 'log = log + 100;' })
      ],
      junctions: [],
      transitions: [],
      variables: vars,
      layers: [rootLayer(['a', 'b'])],
      safetyMode: false
    };
    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);
    const dir = generatedCodeTestDirectory('behavior-parallel');
    writeFiles(dir, result.files);

    const out = hostCompileAndRun(dir, HARNESS_PREAMBLE + `
    SM_Init(&inst);
    CHECK(inst.state_active[SM_ST_A_IDX] == true, "first AND child active");
    CHECK(inst.state_active[SM_ST_B_IDX] == true, "second AND child active");
    inst.data.log = 0U;
    SM_Step(&inst, 10U);
    CHECK(inst.data.log == 101U, "both parallel during actions ran");
` + HARNESS_EPILOGUE);
    if (out !== 'SKIPPED') expect(out).toContain('RESULT: PASS');
  }, BEHAVIOR_TIMEOUT);

  it('SM_Reset returns the machine to its default configuration', () => {
    const chart = {
      tickMs: 10,
      states: [
        mkState('a', 'A', { autostart: true }),
        mkState('b', 'B')
      ],
      junctions: [],
      transitions: [mkTransition('t_ab', 'a', 'b', { condition: 't1' })],
      variables: vars,
      layers: [rootLayer(['a', 'b'])],
      safetyMode: false
    };
    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);
    const dir = generatedCodeTestDirectory('behavior-reset');
    writeFiles(dir, result.files);

    const out = hostCompileAndRun(dir, HARNESS_PREAMBLE + `
    SM_Init(&inst);
    inst.data.t1 = true;
    SM_Step(&inst, 10U);
    inst.data.t1 = false;
    CHECK(inst.state_active[SM_ST_B_IDX] == true, "B active before reset");
    SM_Reset(&inst);
    CHECK(inst.state_active[SM_ST_A_IDX] == true, "A active after reset");
    CHECK(inst.state_active[SM_ST_B_IDX] == false, "B cleared after reset");
    CHECK(inst.state_timers[SM_ST_B_IDX] == 0U, "timers cleared after reset");
` + HARNESS_EPILOGUE);
    if (out !== 'SKIPPED') expect(out).toContain('RESULT: PASS');
  }, BEHAVIOR_TIMEOUT);

  it('hierarchical states with mixed OR and parallel AND layers behave correctly under simulation', () => {
    const states = [
      mkState('parent', 'Parent', { autostart: true }),
      mkState('target', 'Target'),
      mkState('ex_a', 'Ex_StateA', { parentId: 'parent', autostart: true, entry: 'log = log + 1U;', exit: 'log = log + 2U;' }),
      mkState('ex_b', 'Ex_StateB', { parentId: 'parent', entry: 'log = log + 4U;', exit: 'log = log + 8U;' }),
      mkState('par_c', 'Par_StateC', { parentId: 'parent', isParallel: true, regionId: 'R1', autostart: true, priority: 1, entry: 'log = log + 10U;', exit: 'log = log + 20U;', during: 'log = log + 100U;' }),
      mkState('par_d', 'Par_StateD', { parentId: 'parent', isParallel: true, regionId: 'R2', autostart: true, priority: 2, entry: 'log = log + 1000U;', exit: 'log = log + 2000U;', during: 'log = log + 10000U;' }),
      mkState('c_sub_1', 'C_Sub_1', { parentId: 'par_c', autostart: true, entry: 'log = log + 100000U;', exit: 'log = log + 200000U;' }),
      mkState('c_sub_2', 'C_Sub_2', { parentId: 'par_c', entry: 'log = log + 400000U;', exit: 'log = log + 800000U;' })
    ];

    const transitions = [
      mkTransition('t_exit', 'parent', 'target', { condition: 't_exit' }),
      mkTransition('t_ex', 'ex_a', 'ex_b', { condition: 't_ex' }),
      mkTransition('t_sub', 'c_sub_1', 'c_sub_2', { condition: 't_sub' })
    ];

    const varsList = [
      mkVar('v_log', 'log', 'uint32', '0'),
      mkVar('v_tex', 't_ex', 'bool', 'false'),
      mkVar('v_tsub', 't_sub', 'bool', 'false'),
      mkVar('v_texit', 't_exit', 'bool', 'false')
    ];

    const chart = {
      tickMs: 10,
      states,
      junctions: [],
      transitions,
      variables: varsList,
      layers: [
        { id: 'root', name: 'root', parentStateId: null, stateIds: ['parent', 'target'], transitionIds: ['t_exit'], junctionIds: [] },
        { id: 'layer_ex', name: 'Layer_Exclusive', parentStateId: 'parent', stateIds: ['ex_a', 'ex_b'], transitionIds: ['t_ex'], junctionIds: [] },
        { id: 'layer_par', name: 'Layer_Parallel', parentStateId: 'parent', stateIds: ['par_c', 'par_d'], transitionIds: [], junctionIds: [] },
        { id: 'layer_c_sub', name: 'Layer_C_Sub', parentStateId: 'par_c', stateIds: ['c_sub_1', 'c_sub_2'], transitionIds: ['t_sub'], junctionIds: [] }
      ],
      safetyMode: false
    };

    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);

    const dir = generatedCodeTestDirectory('behavior-mixed-layers');
    writeFiles(dir, result.files);

    const harness = HARNESS_PREAMBLE + `
    SM_Init(&inst);
    /* Verify dual/all starts in AND decomposition and exclusive start are entered */
    CHECK(inst.state_active[SM_ST_PARENT_IDX] == true, "Parent active");
    CHECK(inst.state_active[SM_ST_EX_A_IDX] == true, "Ex_StateA active");
    CHECK(inst.state_active[SM_ST_PAR_C_IDX] == true, "Par_StateC active");
    CHECK(inst.state_active[SM_ST_PAR_D_IDX] == true, "Par_StateD active");
    CHECK(inst.state_active[SM_ST_C_SUB_1_IDX] == true, "C_Sub_1 active");
    /* Log check: Ex_StateA entry (1) + Par_StateC entry (10) + Par_StateD entry (1000) + C_Sub_1 entry (100000) = 101011 */
    CHECK(inst.data.log == 101011U, "initial entry log matches");

    /* Step with no triggers: runs during actions of parallel states Par_StateC (100) and Par_StateD (10000) */
    inst.data.log = 0U;
    SM_Step(&inst, 10U);
    CHECK(inst.data.log == 10100U, "during actions executed");

    /* Trigger transition in exclusive layer: Ex_StateA -> Ex_StateB */
    inst.data.t_ex = true;
    inst.data.log = 0U;
    SM_Step(&inst, 10U);
    /* Ex_StateA exit (2) + Ex_StateB entry (4) + during actions (10100) = 10106 */
    CHECK(inst.data.log == 10106U, "transition in exclusive layer logs correctly");
    CHECK(inst.state_active[SM_ST_EX_A_IDX] == false, "Ex_StateA inactive");
    CHECK(inst.state_active[SM_ST_EX_B_IDX] == true, "Ex_StateB active");

    /* Trigger transition in nested exclusive layer inside Par_StateC: C_Sub_1 -> C_Sub_2 */
    inst.data.t_sub = true;
    inst.data.log = 0U;
    SM_Step(&inst, 10U);
    /* C_Sub_1 exit (200000) + C_Sub_2 entry (400000) + during actions (10100) = 610100 */
    CHECK(inst.data.log == 610100U, "nested exclusive transition logs correctly");
    CHECK(inst.state_active[SM_ST_C_SUB_1_IDX] == false, "C_Sub_1 inactive");
    CHECK(inst.state_active[SM_ST_C_SUB_2_IDX] == true, "C_Sub_2 active");

    /* Exit parent superstate: exits C_Sub_2 (800000) + Par_StateC (20) + Par_StateD (2000) + Ex_StateB (8) = 802028 */
    inst.data.t_exit = true;
    inst.data.log = 0U;
    SM_Step(&inst, 10U);
    CHECK(inst.data.log == 802028U, "superstate exit logs correctly");
    CHECK(inst.state_active[SM_ST_PARENT_IDX] == false, "Parent inactive");
    CHECK(inst.state_active[SM_ST_TARGET_IDX] == true, "Target active");
    ` + HARNESS_EPILOGUE;

    const out = hostCompileAndRun(dir, harness);
    if (out !== 'SKIPPED') {
      expect(out).toContain('RESULT: PASS');
    }
  }, BEHAVIOR_TIMEOUT);
});
