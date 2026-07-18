import { describe, it, expect } from 'vitest';

/* gcc compile + execute cycles can exceed the default 5s test timeout on
 * Windows (AV scans of freshly linked executables); allow generous time. */
const BEHAVIOR_TIMEOUT = 60000;
import { generateMISRACCode } from './stateMachineCodeGenerator';
import { StateData, VariableDef, TransitionData, JunctionData, Layer } from '../types/sm_types';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

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
  let gcc = 'gcc';
  try {
    execSync('gcc --version', { stdio: 'pipe' });
  } catch {
    console.warn('host gcc not found, skipping behavioral test');
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
    expect(coreC).toContain('instance->data.x = 1e3f;');
    expect(coreC).not.toContain('1.0fe3');
  });

  it('emits and/or trigger combinations without invariant timer operands', () => {
    const states = [mkState('s1', 'A', { autostart: true }), mkState('s2', 'B')];
    const transitions = [
      mkTransition('t1', 's1', 's2', { type: 'and', condition: 'flag', afterTicks: 5, order: 1 }),
      mkTransition('t2', 's2', 's1', { type: 'or', condition: 'counter > 3', order: 1 })
    ];
    const chart = {
      tickMs: 10, states, junctions: [], transitions,
      variables: baseVars, layers: [rootLayer(['s1', 's2'])], safetyMode: false
    };
    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';

    /* and: condition && timer */
    expect(coreC).toContain('((instance->data.flag)) && (instance->state_timers[0U] >= SM_TMR_TR_T1_MS)');
    /* or without afterTicks: condition only, no "(timer >= 0U)" invariant */
    expect(coreC).toContain('(instance->data.counter > 3U)');
    expect(coreC).not.toContain('>= 0U)');
  });

  it('honors transition priority order (order field)', () => {
    const states = [mkState('s1', 'A', { autostart: true }), mkState('s2', 'B'), mkState('s3', 'C')];
    const transitions = [
      mkTransition('t_hi', 's1', 's3', { condition: 'true', order: 2 }),
      mkTransition('t_lo', 's1', 's2', { condition: 'true', order: 1 })
    ];
    const chart = {
      tickMs: 10, states, junctions: [], transitions,
      variables: baseVars, layers: [rootLayer(['s1', 's2', 's3'])], safetyMode: false
    };
    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';

    /* The order-1 transition (to B) must be emitted before the order-2 one (to C) */
    const posB = coreC.indexOf('SM_Enter_State(instance, SM_ST_B, false);');
    const posC = coreC.indexOf('SM_Enter_State(instance, SM_ST_C, false);');
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
    const dir = path.join(__dirname, '../../scratch/test_compile_hierarchy');
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
      const dir = path.join(__dirname, `../../scratch/test_compile_${histType}`);
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
    const dir = path.join(__dirname, '../../scratch/test_compile_parallel');
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
    const dir = path.join(__dirname, '../../scratch/behavior_order');
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
    const dir = path.join(__dirname, '../../scratch/behavior_hierarchy');
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

    /* Shallow: re-entering P restores A, but A's child layer uses its DEFAULT (X) */
    {
      const result = generateMISRACCode(buildChart('history') as any);
      expect(result.errors).toHaveLength(0);
      const dir = path.join(__dirname, '../../scratch/behavior_hist_shallow');
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
      const dir = path.join(__dirname, '../../scratch/behavior_hist_deep');
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
    const dir = path.join(__dirname, '../../scratch/behavior_selftrans');
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
    const dir = path.join(__dirname, '../../scratch/behavior_after');
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
    const dir = path.join(__dirname, '../../scratch/behavior_priority');
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
      safetyMode: true
    };
    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);
    const dir = path.join(__dirname, '../../scratch/behavior_safety');
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
    const dir = path.join(__dirname, '../../scratch/behavior_parallel');
    writeFiles(dir, result.files);

    const out = hostCompileAndRun(dir, HARNESS_PREAMBLE + `
    SM_Init(&inst);
    CHECK(inst.state_active[SM_ST_PARA_IDX] == true, "region R1 state active");
    CHECK(inst.state_active[SM_ST_PARB_IDX] == true, "region R2 state active");
    CHECK(SM_GetActive(&inst, SM_GRP_R1) == SM_ST_PARA, "SM_GetActive returns R1 state");
    CHECK(SM_GetActive(&inst, SM_GRP_R2) == SM_ST_PARB, "SM_GetActive returns R2 state");
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
    const dir = path.join(__dirname, '../../scratch/behavior_reset');
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
});
