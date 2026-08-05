import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import { generateMISRACCode } from '../stateMachineCodeGenerator';
import { buildSemanticModel } from './smSemanticBuilder';
import { migrateStateMachineModel } from './smModelMigration';
import {
  flatOrFixture,
  historyFixture,
  hybridXBridgesFixture,
  interpreterFixture,
  nestedAndFixture,
  parallelHistoryFixture,
} from './smFixtures';
import type { SemanticModel } from './smSemanticModel';
import {
  generateCArtifacts,
  renderConfigHeader,
  renderCoreSource,
  renderSafetySource,
} from './smCGenerator';
import { renderCExpression, unwrapTopLevelCondition } from './smCExpressions';

const build = (model: ReturnType<typeof flatOrFixture>) => {
  const result = buildSemanticModel(model);
  expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  expect(result.ir).toBeDefined();
  return result.ir!;
};

const generatedFile = (
  ir: SemanticModel,
  name: string,
  options: Parameters<typeof generateCArtifacts>[1] = {},
): string => {
  const file = generateCArtifacts(ir, options).files.find((item) => item.name === name);
  expect(file, `expected generated file '${name}'`).toBeDefined();
  return file!.content;
};

const mappedOutputFixture = () => {
  const model = flatOrFixture();
  model.variables.push({
    id: 'output_enable',
    name: 'output_enable',
    type: 'bool',
    initialValue: 'false',
    currentValue: false,
    visibleInScope: true,
  });
  model.hilConfig = {
    enabled: true,
    target: 'Generic',
    clockSpeed: 1,
    commPort: '',
    baudRate: 115200,
    channels: [{
      id: 'motor', name: 'Motor', peripheral: 'GPIO', pin: '0',
      direction: 'Out', dataType: 'bool', rangeMin: 0, rangeMax: 1,
      scalingFactor: 1, unit: '',
    }],
    mappings: [{
      id: 'write_motor', adiaVarId: 'output_enable', channelId: 'motor',
      direction: 'write', safeValue: false,
    }],
  };
  return model;
};

const compileAndRun = (ir: SemanticModel, harness: string): string => {
  const workspace = createGeneratedCodeTestWorkspace('structured-behavior');
  try {
    for (const file of generateCArtifacts(ir).files) {
      if (file.name.endsWith('.c') || file.name.endsWith('.h')) {
        writeFileSync(join(workspace.directory, file.name), file.content);
      }
    }
    writeFileSync(join(workspace.directory, 'harness.c'), harness);
    const executable = join(workspace.directory, 'harness.exe');
    execFileSync(
      'gcc',
      [
        '-std=c99',
        '-pedantic-errors',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I.',
        'sm_core.c',
        'sm_safety.c',
        'sm_user_logic.c',
        'harness.c',
        '-o',
        executable,
      ],
      { cwd: workspace.directory, stdio: 'pipe' },
    );
    return execFileSync(executable, [], {
      cwd: workspace.directory,
      encoding: 'utf8',
    });
  } finally {
    workspace.cleanup();
  }
};

describe('typed C expression renderer', () => {
  it('renders typed AST nodes without rewriting identifier substrings', () => {
    expect(renderCExpression({
      kind: 'binary',
      operator: '+',
      left: { kind: 'variable', name: 'i', cName: 'i' },
      right: { kind: 'variable', name: 'limit', cName: 'limit' },
    })).toBe('(instance->data.i + instance->data.limit)');
  });
});

describe('structured C99 renderer', { timeout: 60_000 }, () => {
  it('never generates terminal-driven SM_Reset calls', () => {
    const core = renderCoreSource(build(parallelHistoryFixture('parallel-terminal')));
    expect(core).not.toMatch(/SM_Is_Terminal_State[\s\S]*SM_Reset/);
    expect(core).not.toContain('Terminal / End State: auto-reset');
  });

  it('emits layer constants from the semantic slot allocation', () => {
    const result = buildSemanticModel(nestedAndFixture());
    expect(result.ir).toBeDefined();
    const config = renderConfigHeader(result.ir!);
    expect(config).toContain('#define SM_LYR_ROOT_IDX 0U');
    expect(config).toContain(
      `#define SM_NUM_ACTIVE_SLOTS ${result.ir!.activeSlotCount}U`,
    );
  });

  it('renders consistency maps from the actual semantic hierarchy and slots', () => {
    const safety = renderSafetySource(build(nestedAndFixture()));

    expect(safety).toContain(
      'static const SM_Node_t SM_State_Parent_Map[SM_NUM_STATES + 1U]',
    );
    expect(safety).toContain(
      '[SM_ST_REGION_A_IDX] = SM_ST_PARALLEL',
    );
    expect(safety).toContain(
      '[SM_ST_REGION_B_IDX] = SM_ST_PARALLEL',
    );
    expect(safety).toContain(
      '[SM_ST_PARALLEL_IDX] = 0',
    );
    expect(safety).toContain(
      '[SM_ST_REGION_A_IDX] = -1',
    );
    expect(safety).toContain(
      'return SM_ERR_CONFIGURATION;',
    );
  });

  it('rejects missing active children in OR and AND containers', () => {
    const orIr = build(flatOrFixture());
    const orSlot = orIr.layers.root.activeSlot!;
    const orOutput = compileAndRun(
      orIr,
      `#include "sm_core.h"
#include "sm_safety.h"
#include <stdio.h>
int main(void) {
    ADIA_Instance_t inst;
    (void)SM_Init(&inst);
    inst.state_active[SM_ST_A_IDX] = false;
    inst.active_states[${orSlot}U] = SM_NODE_INVALID;
    printf("%u\\n", SM_Validate_State_Consistency(&inst) == SM_ERR_CONFIGURATION ? 1U : 0U);
    return 0;
}
`,
    );
    expect(orOutput.trim()).toBe('1');

    const andIr = build(nestedAndFixture());
    const andOutput = compileAndRun(
      andIr,
      `#include "sm_core.h"
#include "sm_safety.h"
#include <stdio.h>
int main(void) {
    ADIA_Instance_t inst;
    (void)SM_Init(&inst);
    inst.state_active[SM_ST_REGION_B_IDX] = false;
    printf("%u\\n", SM_Validate_State_Consistency(&inst) == SM_ERR_CONFIGURATION ? 1U : 0U);
    return 0;
}
`,
    );
    expect(andOutput.trim()).toBe('1');
  });

  it('keeps a leaf state with an empty child layer fault-free', () => {
    const model = flatOrFixture();
    model.layers.push({
      ...model.layers[0],
      id: 'empty_b_children',
      name: 'empty_b_children',
      parentStateId: 'b',
      stateIds: [],
      transitionIds: [],
      junctionIds: [],
      decomposition: 'OR',
    });
    const output = compileAndRun(
      build(model),
      `#include "sm_core.h"
#include <stdio.h>
int main(void) {
    ADIA_Instance_t instance;
    (void)SM_Init(&instance);
    instance.data.go = true;
    (void)SM_Step(&instance, SM_TICK_MS);
    instance.data.go = false;
    (void)SM_Step(&instance, SM_TICK_MS);
    printf("%u %u %u\\n",
        instance.state_active[SM_ST_B_IDX] ? 1U : 0U,
        SM_GetError(&instance) == SM_ERR_NONE ? 1U : 0U,
        instance.fault_latched ? 1U : 0U);
    return 0;
}
`,
    );

    expect(output.trim()).toBe('1 1 0');
  });

  it('rejects shallow and deep history outside the owning layer', () => {
    const ir = build(historyFixture('deep'));
    const historySlot = ir.layers.workspace_children.activeSlot!;
    const output = compileAndRun(
      ir,
      `#include "sm_core.h"
#include "sm_safety.h"
#include <stdio.h>
int main(void) {
    ADIA_Instance_t inst;
    unsigned shallow_invalid;
    unsigned deep_invalid;
    (void)SM_Init(&inst);
    inst.history_states[${historySlot}U] = SM_ST_OUTSIDE;
    shallow_invalid = SM_Validate_State_Consistency(&inst) == SM_ERR_CONFIGURATION ? 1U : 0U;
    (void)SM_Init(&inst);
    inst.deep_history[SM_LYR_WORKSPACE_CHILDREN_IDX][SM_ST_OUTSIDE_IDX] = true;
    deep_invalid = SM_Validate_State_Consistency(&inst) == SM_ERR_CONFIGURATION ? 1U : 0U;
    printf("%u %u\\n", shallow_invalid, deep_invalid);
    return 0;
}
`,
    );
    expect(output.trim()).toBe('1 1');
  });

  it('does not require post-generation brace or regex repair', () => {
    const source = readFileSync(
      'src/utils/stateMachine/smCGenerator.ts',
      'utf8',
    );
    expect(source).not.toContain('Syntactic Auto-Repair');
    // Bound the scan to a single local repair expression: the generator has
    // legitimate, unrelated `.replace()` calls earlier in the source file.
    expect(source).not.toMatch(/\.replace\([\s\S]{0,200}SM_Sync_IO/);
  });

  it('renders the embedded integration file set from immutable semantic IR', () => {
    const ir = build(flatOrFixture());
    const before = JSON.stringify(ir);
    const result = generateCArtifacts(ir);
    expect(result.errors).toEqual([]);
    expect(result.files.map((file) => file.name)).toEqual([
      'sm_config.h',
      'sm_core.h',
      'sm_core.c',
      'sm_safety.h',
      'sm_safety.c',
      'sm_user_logic.h',
      'sm_user_logic.c',
      'mcal_dio.h',
      'sm_testing_report.md',
      'static_metrics_report.md',
    ]);
    expect(JSON.stringify(ir)).toBe(before);
  });

  it('adds X-Bridges artifacts and static instance storage only when IR is owned', () => {
    const ordinary = build(flatOrFixture());
    expect(generateCArtifacts(ordinary).files.map((file) => file.name))
      .not.toContain('sm_xbridges.h');
    expect(renderConfigHeader(ordinary)).not.toContain('sm_xbridges.h');

    const hybrid = build(hybridXBridgesFixture());
    expect(generateCArtifacts(hybrid).files.map((file) => file.name)).toEqual([
      'sm_config.h',
      'sm_core.h',
      'sm_core.c',
      'sm_safety.h',
      'sm_safety.c',
      'sm_user_logic.h',
      'sm_user_logic.c',
      'mcal_dio.h',
      'sm_xbridges.h',
      'sm_xbridges.c',
      'sm_testing_report.md',
      'static_metrics_report.md',
    ]);
    expect(renderConfigHeader(hybrid)).toContain('#include "sm_xbridges.h"');
    expect(renderConfigHeader(hybrid)).toContain(
      'SM_XB_CONTROLLER_t xb_controller;',
    );

    const workspace = createGeneratedCodeTestWorkspace('structured-xbridges-c99');
    try {
      for (const file of generateCArtifacts(hybrid).files) {
        if (file.name.endsWith('.c') || file.name.endsWith('.h')) {
          writeFileSync(join(workspace.directory, file.name), file.content);
        }
      }
      execFileSync('gcc', [
        '-std=c99',
        '-pedantic-errors',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I.',
        '-c',
        'sm_core.c',
        'sm_safety.c',
        'sm_user_logic.c',
        'sm_xbridges.c',
      ], { cwd: workspace.directory, stdio: 'pipe' });
    } finally {
      workspace.cleanup();
    }
  });

  it('compiles generated artifacts as strict C99 without repair', () => {
    const workspace = createGeneratedCodeTestWorkspace('structured-c99');
    try {
      const result = generateCArtifacts(build(flatOrFixture()));
      for (const file of result.files) {
        if (file.name.endsWith('.c') || file.name.endsWith('.h')) {
          writeFileSync(join(workspace.directory, file.name), file.content);
        }
      }
      execFileSync(
        'gcc',
        [
          '-std=c99',
          '-pedantic-errors',
          '-Wall',
          '-Wextra',
          '-Werror',
          '-I.',
          '-c',
          'sm_core.c',
          'sm_safety.c',
          'sm_user_logic.c',
        ],
        { cwd: workspace.directory, stdio: 'pipe' },
      );
    } finally {
      workspace.cleanup();
    }
  });

  it('compiles a model with no data variables as strict C99', () => {
    const model = flatOrFixture();
    model.variables = [];
    model.states = model.states.map((state) => ({
      ...state,
      entry: '',
      during: '',
      exit: '',
    }));
    model.transitions = [];
    model.layers[0].transitionIds = [];

    const workspace = createGeneratedCodeTestWorkspace('structured-empty-data');
    try {
      const result = generateCArtifacts(build(model));
      for (const file of result.files) {
        if (file.name.endsWith('.c') || file.name.endsWith('.h')) {
          writeFileSync(join(workspace.directory, file.name), file.content);
        }
      }
      execFileSync(
        'gcc',
        [
          '-std=c99',
          '-pedantic-errors',
          '-Wall',
          '-Wextra',
          '-Werror',
          '-I.',
          '-c',
          'sm_core.c',
          'sm_safety.c',
          'sm_user_logic.c',
        ],
        { cwd: workspace.directory, stdio: 'pipe' },
      );
    } finally {
      workspace.cleanup();
    }
  });

  it('uses migration and semantic construction in the compatibility facade', () => {
    const chart = parallelHistoryFixture('parallel-terminal');
    const before = JSON.stringify(chart);
    const result = generateMISRACCode(chart);
    const core = result.files.find((file) => file.name === 'sm_core.c')?.content;
    expect(result.errors).toEqual([]);
    expect(core).toBeDefined();
    expect(core).not.toContain('Terminal / End State: auto-reset');
    expect(core).not.toMatch(/SM_Is_Terminal_State[\s\S]*SM_Reset/);
    expect(JSON.stringify(chart)).toBe(before);
  });

  it('rejects fractional tick periods instead of emitting invalid C tokens', () => {
    const chart = flatOrFixture();
    chart.tickMs = 0.5;

    const result = generateMISRACCode(chart);

    expect(result.files).toEqual([]);
    expect(result.errors).toContainEqual(expect.objectContaining({
      id: 'TICK_MS_UNSUPPORTED',
    }));
  });

  it('backtracks across default-junction branches before committing entry', () => {
    const model = flatOrFixture();
    model.states = model.states.map((state) => ({
      ...state,
      autostart: false,
      entry: '',
      during: '',
      exit: '',
    }));
    model.variables = [];
    model.junctions = [
      {
        id: 'default_junction',
        name: 'default_junction',
        x: 0,
        y: 0,
        color: '#000000',
        parentId: null,
        type: 'junction',
        autostart: true,
      },
      {
        id: 'dead_branch',
        name: 'dead_branch',
        x: 0,
        y: 0,
        color: '#000000',
        parentId: null,
        type: 'junction',
        autostart: false,
      },
    ];
    model.transitions = [
      {
        id: 'try_dead',
        sourceId: 'default_junction',
        targetId: 'dead_branch',
        condition: '',
        action: '',
        afterTicks: null,
        type: 'condition',
        hasControlPoint: false,
        order: 1,
      },
      {
        id: 'dead_guard',
        sourceId: 'dead_branch',
        targetId: 'a',
        condition: 'false',
        action: '',
        afterTicks: null,
        type: 'condition',
        hasControlPoint: false,
        order: 1,
      },
      {
        id: 'fallback',
        sourceId: 'default_junction',
        targetId: 'b',
        condition: '',
        action: '',
        afterTicks: null,
        type: 'condition',
        hasControlPoint: false,
        order: 2,
      },
    ];
    model.layers[0].junctionIds = ['default_junction', 'dead_branch'];
    model.layers[0].transitionIds = ['try_dead', 'dead_guard', 'fallback'];

    const output = compileAndRun(
      build(model),
      `#include "sm_core.h"
#include <stdio.h>
int main(void) {
    ADIA_Instance_t instance;
    (void)SM_Init(&instance);
    printf("%d %d\\n",
        instance.state_active[SM_ST_A_IDX],
        instance.state_active[SM_ST_B_IDX]);
    return 0;
}
`,
    );

    expect(output.trim()).toBe('0 1');
  });

  it('initializes storage directly without exiting an uninitialized chart', () => {
    const source = renderCoreSource(build(interpreterFixture('reset')));
    const init = source.slice(
      source.indexOf('SM_Error_t SM_Init'),
      source.indexOf('SM_Error_t SM_Reset'),
    );

    expect(init).not.toContain('return SM_Reset(instance);');
    expect(init).not.toContain('SM_Exit_Layer(instance');
    expect(init).not.toContain('trace_sink = instance->trace_sink');
    expect(init.indexOf('(void)memset(instance, 0, sizeof(*instance));')).toBeLessThan(
      init.indexOf('instance->data.'),
    );
    expect(init).toContain('instance->state_active[state_index] = false;');
  });

  it('matches LCA exit, transition-action, and entry ordering', () => {
    const output = compileAndRun(
      build(interpreterFixture('exit-action-entry')),
      `#include "sm_core.h"
#include <stdio.h>
int main(void) {
    ADIA_Instance_t instance;
    (void)SM_Init(&instance);
    instance.data.go = true;
    (void)SM_Step(&instance, 10U);
    printf("%d %.0f\\n", instance.state_active[SM_ST_B_IDX], instance.data.counter);
    return 0;
}
`,
    );
    expect(output.trim()).toBe('1 111');
  });

  it('initializes a non-zero caller-owned instance deterministically', () => {
    const output = compileAndRun(
      build(interpreterFixture('reset')),
      `#include "sm_core.h"
#include <stdio.h>
#include <string.h>
int main(void) {
    ADIA_Instance_t instance;
    (void)memset(&instance, 0xA5, sizeof(instance));
    printf("%d ", SM_Init(&instance));
    printf("%d %.0f\\n",
        instance.state_active[SM_ST_A_IDX],
        instance.data.counter);
    return 0;
}
`,
    );
    expect(output.trim()).toBe('0 1 0');
  });

  it('executes outer, during, inner, then children in interpreter order', () => {
    const output = compileAndRun(
      build(interpreterFixture('outer-during-inner')),
      `#include "sm_core.h"
#include <stdio.h>
int main(void) {
    ADIA_Instance_t instance;
    (void)SM_Init(&instance);
    instance.data.inner = true;
    (void)SM_Step(&instance, 10U);
    printf("%d %d %.0f\\n",
        instance.state_active[SM_ST_A_IDX],
        instance.state_active[SM_ST_A2_IDX],
        instance.data.counter);
    return 0;
}
`,
    );
    expect(output.trim()).toBe('1 1 11');
  });

  it('keeps a terminal AND child quiescent while its sibling executes', () => {
    const output = compileAndRun(
      build(parallelHistoryFixture('parallel-terminal')),
      `#include "sm_core.h"
#include <stdio.h>
int main(void) {
    ADIA_Instance_t instance;
    (void)SM_Init(&instance);
    (void)SM_Step(&instance, 10U);
    (void)SM_Step(&instance, 10U);
    printf("%d %d %.0f\\n",
        instance.state_active[SM_ST_TERMINAL_CHILD_IDX],
        instance.state_active[SM_ST_WORKER_IDX],
        instance.data.total);
    return 0;
}
`,
    );
    expect(output.trim()).toBe('1 1 2');
  });

  it('exits AND children in reverse priority before parent action and entry', () => {
    const model = parallelHistoryFixture('parallel-parent-exit');
    model.states.find((state) => state.id === 'R1')!.exit =
      'total = total * 10 + 1;';
    model.states.find((state) => state.id === 'R2')!.exit =
      'total = total * 10 + 2;';
    model.states.find((state) => state.id === 'R3')!.exit =
      'total = total * 10 + 3;';
    model.states.find((state) => state.id === 'PARENT')!.exit =
      'total = total * 10 + 4;';
    model.states.find((state) => state.id === 'OUTSIDE')!.entry =
      'total = total * 10 + 5;';
    const output = compileAndRun(
      build(model),
      `#include "sm_core.h"
#include <stdio.h>
int main(void) {
    ADIA_Instance_t instance;
    (void)SM_Init(&instance);
    instance.data.leave = true;
    (void)SM_Step(&instance, 10U);
    printf("%.0f\\n", instance.data.total);
    return 0;
}
`,
    );
    expect(output.trim()).toBe('32145');
  });

  it.each(['shallow', 'deep'] as const)(
    'restores explicit %s history like the interpreter',
    (kind) => {
      const output = compileAndRun(
        build(historyFixture(kind)),
        `#include "sm_core.h"
#include <stdio.h>
int main(void) {
    ADIA_Instance_t instance;
    (void)SM_Init(&instance);
    instance.data.select_a = true; (void)SM_Step(&instance, 10U); instance.data.select_a = false;
    instance.data.advance_nested = true; (void)SM_Step(&instance, 10U); instance.data.advance_nested = false;
    instance.data.advance_left = true; (void)SM_Step(&instance, 10U); instance.data.advance_left = false;
    instance.data.advance_right = true; (void)SM_Step(&instance, 10U); instance.data.advance_right = false;
    instance.data.leave = true; (void)SM_Step(&instance, 10U); instance.data.leave = false;
    instance.data.go = true; (void)SM_Step(&instance, 10U);
    printf("%d %d %d %d\\n",
        instance.state_active[SM_ST_PARENT_A_IDX],
        instance.state_active[SM_ST_NESTED_PREVIOUS_IDX],
        instance.state_active[SM_ST_PARALLEL_LEFT_PREVIOUS_IDX],
        instance.state_active[SM_ST_PARALLEL_RIGHT_PREVIOUS_IDX]);
    return 0;
}
`,
      );
      expect(output.trim()).toBe(
        kind === 'deep' ? '1 1 1 1' : '1 0 0 0',
      );
    },
  );

  it('fires a temporal transition at the exact normalized boundary', () => {
    const output = compileAndRun(
      build(parallelHistoryFixture('timing-boundary')),
      `#include "sm_core.h"
#include <stdio.h>
int main(void) {
    ADIA_Instance_t instance;
    (void)SM_Init(&instance);
    (void)SM_Step(&instance, 10U);
    printf("%d ", instance.state_active[SM_ST_TIMED_IDX]);
    (void)SM_Step(&instance, 10U);
    printf("%d ", instance.state_active[SM_ST_TIMED_IDX]);
    (void)SM_Step(&instance, 10U);
    printf("%d\\n", instance.state_active[SM_ST_DONE_IDX]);
    return 0;
}
`,
    );
    expect(output.trim()).toBe('1 1 1');
  });

  it('renders explicit mapped I/O conversions from typed expressions', () => {
    const model = flatOrFixture();
    model.hilConfig = {
      enabled: true,
      target: 'Generic',
      clockSpeed: 1,
      commPort: '',
      baudRate: 115200,
      channels: [{
        id: 'adc_0',
        name: 'ADC 0',
        peripheral: 'ADC',
        pin: '0',
        direction: 'In',
        dataType: 'double',
        rangeMin: 0,
        rangeMax: 100,
        scalingFactor: 1,
        unit: '',
      }, {
        id: 'gpio_0',
        name: 'GPIO 0',
        peripheral: 'GPIO',
        pin: '1',
        direction: 'Out',
        dataType: 'bool',
        rangeMin: 0,
        rangeMax: 1,
        scalingFactor: 1,
        unit: '',
      }],
      mappings: [{
        id: 'read_total',
        adiaVarId: 'total',
        channelId: 'adc_0',
        direction: 'read',
        conversionExpr: 'x * 2',
      }, {
        id: 'write_total',
        adiaVarId: 'total',
        channelId: 'gpio_0',
        direction: 'write',
        conversionExpr: 'x > 1',
      }],
    };
    const core = renderCoreSource(build(model));
    expect(core).toContain('MCAL_ReadChannelValue(MCAL_CH_ADC_0)');
    expect(core).toContain('* 2.0');
    expect(core).toContain('instance->data.total > 1');
    expect(core).toContain('MCAL_Dio_WriteChannel(MCAL_CH_GPIO_0');
    expect(core).not.toContain('instance->data.x');
  });

  it('maps only explicitly configured variables', () => {
    const model = mappedOutputFixture();
    model.variables.push({
      id: 'x', name: 'x', type: 'bool', initialValue: 'false',
      currentValue: false, visibleInScope: true,
    }, {
      id: 'y', name: 'y', type: 'bool', initialValue: 'false',
      currentValue: false, visibleInScope: true,
    });
    const core = generatedFile(build(model), 'sm_core.c');

    expect(core).not.toContain('instance->data.x = MCAL');
    expect(core).not.toContain('instance->data.y = MCAL');
    expect(core).toContain('MCAL_Dio_WriteChannel(MCAL_CH_MOTOR');
  });

  it('retains MCAL declarations in custom mode and emits separate test stubs', () => {
    const ir = build(mappedOutputFixture());
    const header = generatedFile(ir, 'mcal_dio.h');
    expect(header).toContain('bool MCAL_Dio_ReadChannel(uint32_t channel);');
    expect(header).toContain('void MCAL_Dio_WriteChannel(uint32_t channel, bool level);');
    expect(header).not.toMatch(/#ifndef MCAL_CUSTOM_DIO[\s\S]*bool MCAL_Dio_ReadChannel\(uint32_t channel\);/);

    const stubs = generatedFile(ir, 'mcal_dio_test_stubs.c', { includeTestShims: true });
    expect(stubs).toContain('bool MCAL_Dio_ReadChannel(uint32_t channel)');
    expect(stubs).toContain('void MCAL_Dio_WriteChannel(uint32_t channel, bool level)');
    expect(stubs).toContain('void MCAL_ApplySafeOutputs(void)');

    const workspace = createGeneratedCodeTestWorkspace('custom-mcal-contract');
    try {
      for (const file of generateCArtifacts(ir).files) {
        if (file.name.endsWith('.c') || file.name.endsWith('.h')) {
          writeFileSync(join(workspace.directory, file.name), file.content);
        }
      }
      expect(() => execFileSync('gcc', [
        '-std=c99', '-DMCAL_CUSTOM_DIO', '-pedantic-errors', '-Wall',
        '-Wextra', '-Werror', '-I.', '-c', 'sm_core.c', 'sm_safety.c',
        'sm_user_logic.c',
      ], { cwd: workspace.directory, stdio: 'pipe' })).not.toThrow();
    } finally {
      workspace.cleanup();
    }
  });

  it('restores output defaults and commits them during reset', () => {
    const output = compileAndRun(
      build(mappedOutputFixture()),
      `#include "sm_core.h"
#include <stdio.h>
static bool last_output_level = true;
bool MCAL_Dio_ReadChannel(uint32_t channel) { (void)channel; return false; }
void MCAL_Dio_WriteChannel(uint32_t channel, bool level) { (void)channel; last_output_level = level; }
void MCAL_ApplySafeOutputs(void) {}
void MCAL_Watchdog_Kick(void) {}
int main(void) {
    ADIA_Instance_t inst;
    (void)SM_Init(&inst);
    inst.data.output_enable = true;
    (void)SM_WriteOutputs(&inst);
    (void)SM_Reset(&inst);
    printf("%d %d\\n", inst.data.output_enable, last_output_level);
    return 0;
}
`,
    );
    expect(output.trim()).toBe('0 0');
  });

  it('returns to the autostart state and resets variables after SM_Reset', () => {
    const output = compileAndRun(
      build(flatOrFixture()),
      `#include "sm_core.h"\n#include <stdio.h>\nbool MCAL_Dio_ReadChannel(uint32_t channel) { (void)channel; return false; }\nvoid MCAL_Dio_WriteChannel(uint32_t channel, bool level) { (void)channel; (void)level; }\nvoid MCAL_ApplySafeOutputs(void) {}\nvoid MCAL_Watchdog_Kick(void) {}\nint main(void) {\n    ADIA_Instance_t inst;\n    (void)SM_Init(&inst);\n    inst.data.go = true;\n    (void)SM_Step(&inst, SM_TICK_MS);\n    printf("%d %d\\n", inst.data.go, SM_GetActive(&inst, 0U) == SM_ST_B);\n    (void)SM_Reset(&inst);\n    printf("%d %d\\n", inst.data.go, SM_GetActive(&inst, 0U) == SM_ST_A);\n    return 0;\n}\n`,
    );
    expect(output.trim().replace(/\r/g, '')).toBe('1 1\n0 1');
  });

  it('tolerates small jitter around SM_TICK_MS without a timing fault and advances state timers by SM_TICK_MS', () => {
    const ir = build(flatOrFixture());
    const code = generateCArtifacts(ir).files.find((file) => file.name === 'sm_core.c')!.content;
    expect(code).toContain('SM_TICK_MS > (UINT32_MAX - instance->state_timers[state_index])');
    expect(code).not.toContain('delta_ms > (UINT32_MAX - instance->state_timers[state_index])');

    const output = compileAndRun(
      ir,
      `#include "sm_core.h"\n#include <stdio.h>\nbool MCAL_Dio_ReadChannel(uint32_t channel) { (void)channel; return false; }\nvoid MCAL_Dio_WriteChannel(uint32_t channel, bool level) { (void)channel; (void)level; }\nvoid MCAL_ApplySafeOutputs(void) {}\nvoid MCAL_Watchdog_Kick(void) {}\nint main(void) {\n    ADIA_Instance_t inst;\n    (void)SM_Init(&inst);\n    (void)SM_Step(&inst, SM_TICK_MS + 1U);\n    printf("%u %d\\n", (unsigned)inst.state_timers[SM_ST_A_IDX], SM_GetError(&inst) == SM_ERR_NONE);\n    (void)SM_Step(&inst, SM_TICK_MS - 1U);\n    printf("%u %d\\n", (unsigned)inst.state_timers[SM_ST_A_IDX], SM_GetError(&inst) == SM_ERR_NONE);\n    (void)SM_Step(&inst, SM_TICK_MS + 55U);\n    printf("%d\\n", SM_GetError(&inst) == SM_ERR_TIMING);\n    return 0;\n}\n`,
    );
    expect(output.trim().replace(/\r/g, '')).toBe('10 1\n20 1\n1');
  });

  it('commits safe outputs immediately and latches a fault', () => {
    const model = mappedOutputFixture();
    model.safetyMode = true;
    model.states[0].isSafeState = true;
    const output = compileAndRun(
      build(model),
      `#include "sm_core.h"
#include <stdio.h>
static unsigned safe_outputs_applied = 0U;
bool MCAL_Dio_ReadChannel(uint32_t channel) { (void)channel; return false; }
void MCAL_Dio_WriteChannel(uint32_t channel, bool level) { (void)channel; (void)level; }
void MCAL_ApplySafeOutputs(void) { ++safe_outputs_applied; }
void MCAL_Watchdog_Kick(void) {}
int main(void) {
    ADIA_Instance_t inst;
    (void)SM_Init(&inst);
    inst.data.output_enable = true;
    inst.error_status = SM_ERR_SAFETY_VIOLATION;
    (void)SM_Step(&inst, SM_TICK_MS);
    printf("%u %d\\n", safe_outputs_applied, inst.fault_latched);
    return 0;
}
`,
    );
    expect(output.trim()).toBe('1 1');
  });

  it('does not kick the watchdog after a failed output commit', () => {
    const model = mappedOutputFixture();
    model.safetyMode = true;
    model.states[0].isSafeState = true;
    const output = compileAndRun(
      build(model),
      `#include "sm_core.h"
#include <stdio.h>
static unsigned safe_outputs_applied = 0U;
static unsigned watchdog_kicks = 0U;
bool MCAL_Dio_ReadChannel(uint32_t channel) { (void)channel; return false; }
void MCAL_Dio_WriteChannel(uint32_t channel, bool level) { (void)channel; (void)level; }
void MCAL_ApplySafeOutputs(void) { ++safe_outputs_applied; }
void MCAL_Watchdog_Kick(void) { ++watchdog_kicks; }
int main(void) {
    ADIA_Instance_t inst;
    (void)SM_Init(&inst);
    inst.error_status = SM_ERR_SAFETY_VIOLATION;
    (void)SM_WriteOutputs(&inst);
    printf("%u %u\\n", safe_outputs_applied, watchdog_kicks);
    return 0;
}
`,
    );
    expect(output.trim()).toBe('1 0');
  });

  it('calls MCAL safe-output handling for a safety fault without output mappings', () => {
    const model = flatOrFixture();
    model.safetyMode = true;
    model.states[0].isSafeState = true;
    const output = compileAndRun(
      build(model),
      `#include "sm_core.h"
#include <stdio.h>
static unsigned safe_outputs_applied = 0U;
void MCAL_ApplySafeOutputs(void) { ++safe_outputs_applied; }
int main(void) { ADIA_Instance_t inst; (void)SM_Init(&inst); inst.error_status = SM_ERR_SAFETY_VIOLATION; (void)SM_Step(&inst, SM_TICK_MS); printf("%u\\n", safe_outputs_applied); return 0; }
`,
    );
    expect(output.trim()).toBe('1');
  });

  it('emits typed non-DIO safe values without boolean coercion', () => {
    const model = flatOrFixture();
    model.hilConfig = {
      enabled: true, target: 'Generic', clockSpeed: 1, commPort: '', baudRate: 115200,
      channels: [{ id: 'pwm', name: 'PWM', peripheral: 'PWM', pin: '0', direction: 'Out', dataType: 'uint16_t', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' }],
      mappings: [{ id: 'pwm_write', adiaVarId: 'total', channelId: 'pwm', direction: 'write', safeValue: 128 }],
    };
    const safe = generatedFile(build(model), 'sm_safety.c');
    expect(safe).toContain('MCAL_WriteChannelValue(MCAL_CH_PWM, 128);');
    expect(safe).not.toContain('MCAL_Dio_WriteChannel(MCAL_CH_PWM');
  });

  it('rejects safe values incompatible with the mapped channel type', () => {
    const model = mappedOutputFixture();
    model.hilConfig!.mappings[0].safeValue = 2;
    const result = buildSemanticModel(model);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'IO_MAPPING_SAFE_VALUE_INVALID', severity: 'error',
    }));

    const numericModel = flatOrFixture();
    numericModel.hilConfig = {
      enabled: true, target: 'Generic', clockSpeed: 1, commPort: '', baudRate: 115200,
      channels: [{ id: 'pwm', name: 'PWM', peripheral: 'PWM', pin: '0', direction: 'Out', dataType: 'uint16_t', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' }],
      mappings: [{ id: 'pwm_write', adiaVarId: 'total', channelId: 'pwm', direction: 'write', safeValue: 1.5 }],
    };
    expect(buildSemanticModel(numericModel).diagnostics).toContainEqual(expect.objectContaining({
      code: 'IO_MAPPING_SAFE_VALUE_INVALID', severity: 'error',
    }));
  });

  it('restores history when transitioning through a shallow history junction', () => {
    const ir = build(historyFixture('shallow'));
    const output = compileAndRun(
      ir,
      `#include "sm_core.h"
#include <stdio.h>
int main(void) {
    ADIA_Instance_t inst;
    (void)SM_Init(&inst);
    /* Initial: workspace -> parent_b (autostart) */
    printf("%d ", inst.state_active[SM_ST_PARENT_B_IDX]);
    /* Move to parent_a via select_a transition */
    inst.data.select_a = true;
    (void)SM_Step(&inst, 10U);
    inst.data.select_a = false;
    printf("%d ", inst.state_active[SM_ST_PARENT_A_IDX]);
    /* Advance nested: nested_default -> nested_previous */
    inst.data.advance_nested = true;
    (void)SM_Step(&inst, 10U);
    inst.data.advance_nested = false;
    printf("%d ", inst.state_active[SM_ST_NESTED_PREVIOUS_IDX]);
    /* Leave workspace -> outside */
    inst.data.leave = true;
    (void)SM_Step(&inst, 10U);
    inst.data.leave = false;
    printf("%d ", inst.state_active[SM_ST_OUTSIDE_IDX]);
    /* Restore via shallow history -> should go back to parent_a (last active child of workspace_children) */
    inst.data.go = true;
    (void)SM_Step(&inst, 10U);
    inst.data.go = false;
    printf("%d\\n", inst.state_active[SM_ST_PARENT_A_IDX]);
    return 0;
}
`,
    );
    /* Sequence: parent_b active, parent_a active, nested_previous active, outside active, parent_a restored */
    expect(output.trim()).toBe('1 1 1 1 1');
  });

  it.each(['shallow', 'deep'] as const)(
    'restores %s history when reentering the containing state',
    (kind) => {
      const model = historyFixture(kind);
      model.transitions.find(
        (transition) => transition.id === 'restore_workspace',
      )!.targetId = 'workspace';
      const ir = build(model);
      const output = compileAndRun(
        ir,
        `#include "sm_core.h"
#include <stdio.h>
int main(void) {
    ADIA_Instance_t instance;
    (void)SM_Init(&instance);
    instance.data.select_a = true;
    (void)SM_Step(&instance, SM_TICK_MS);
    instance.data.select_a = false;
    instance.data.advance_nested = true;
    (void)SM_Step(&instance, SM_TICK_MS);
    instance.data.advance_nested = false;
    instance.data.leave = true;
    (void)SM_Step(&instance, SM_TICK_MS);
    instance.data.leave = false;
    instance.data.go = true;
    (void)SM_Step(&instance, SM_TICK_MS);
    printf("%u %u\\n",
        instance.state_active[SM_ST_PARENT_A_IDX] ? 1U : 0U,
        instance.state_active[SM_ST_NESTED_PREVIOUS_IDX] ? 1U : 0U);
    return 0;
}
`,
      );
      expect(output.trim()).toBe(
        kind === 'shallow' ? '1 0' : '1 1',
      );
    },
  );

  it('does not crash with SM_TRACE_ENABLED on a stack-allocated instance', () => {
    const ir = build(interpreterFixture('outer-during-inner'));
    const workspace = createGeneratedCodeTestWorkspace('trace-safety');
    try {
      for (const file of generateCArtifacts(ir).files) {
        if (file.name.endsWith('.c') || file.name.endsWith('.h')) {
          writeFileSync(join(workspace.directory, file.name), file.content);
        }
      }
      writeFileSync(
        join(workspace.directory, 'harness.c'),
        `#include "sm_core.h"
#include <stdio.h>
#include <string.h>

/* REQ-ENG-TRC-001 verification: post-init sink captures actions */
static int sink_called = 0;
static void test_sink(const SM_TraceEvent_t *event) {
    if (event != NULL && event->action != NULL) {
        sink_called = 1;
    }
}

int main(void) {
    ADIA_Instance_t inst;
    /* Fill entire instance with 0xA5 garbage */
    (void)memset(&inst, 0xA5, sizeof(inst));
    /* REQ-ENG-INIT-001: SM_Init must NOT read trace_sink before memset */
    (void)SM_Init(&inst);
    /* Verify no crash and no fault after init on garbage memory */
    printf("%d ", inst.error_status == SM_ERR_NONE ? 1 : 0);
    /* REQ-ENG-TRC-001: register sink AFTER SM_Init */
    SM_SetTraceSink(&inst, test_sink);
    /* Trigger a step to produce during-actions that reach the sink */
    (void)SM_Step(&inst, SM_TICK_MS);
    /* Verify the sink was called with at least one action */
    printf("%d\\n", sink_called);
    return 0;
}
`,
      );
      const executable = join(workspace.directory, 'harness.exe');
      execFileSync(
        'gcc',
        [
          '-std=c99',
          '-pedantic-errors',
          '-Wall',
          '-Wextra',
          '-Werror',
          '-DSM_TRACE_ENABLED',
          '-I.',
          'sm_core.c',
          'sm_safety.c',
          'sm_user_logic.c',
          'harness.c',
          '-o',
          executable,
        ],
        { cwd: workspace.directory, stdio: 'pipe' },
      );
      const result = execFileSync(executable, [], {
        cwd: workspace.directory,
        encoding: 'utf8',
      });
      /* "1 1" = no crash after init on garbage + sink received actions post-init */
      expect(result.trim()).toBe('1 1');
    } finally {
      workspace.cleanup();
    }
  });

  it('renders safe state traceability C comments before macros and declarations without comment injection', () => {
    const model = flatOrFixture();
    model.states[0].name = 'State A */ #include <bad.h>\nLine2';
    const built = build(model);
    const files = generateCArtifacts(built).files;

    const configHeader = files.find((f) => f.name === 'sm_config.h')!.content;
    const userHeader = files.find((f) => f.name === 'sm_user_logic.h')!.content;

    expect(configHeader).toContain('/* State: State A * / #include <bad.h> Line2 | Model ID: a | C enum: SM_ST_A */');
    expect(userHeader).toContain('/* State: State A * / #include <bad.h> Line2 | Model ID: a | C enum: SM_ST_A */');
    expect(configHeader).not.toContain('*/ #include');
  });

  describe('Strict Build Condition Unwrapping', () => {
    it('unwraps single top-level outer parentheses around simple equality', () => {
      expect(unwrapTopLevelCondition('(instance->data.x == 1)')).toBe('instance->data.x == 1');
      expect(unwrapTopLevelCondition('((instance->data.x == 1))')).toBe('instance->data.x == 1');
      expect(unwrapTopLevelCondition('(instance->data.x != 1)')).toBe('instance->data.x != 1');
      expect(unwrapTopLevelCondition('(instance->data.x >= 1)')).toBe('instance->data.x >= 1');
      expect(unwrapTopLevelCondition('(!instance->data.enabled)')).toBe('!instance->data.enabled');
    });

    it('preserves inner grouping in compound expressions', () => {
      expect(unwrapTopLevelCondition('(instance->data.x == 1) && (instance->data.y == 2)'))
        .toBe('(instance->data.x == 1) && (instance->data.y == 2)');
      expect(unwrapTopLevelCondition('(x == 1 || y == 2) && z != 0'))
        .toBe('(x == 1 || y == 2) && z != 0');
    });

    it('renders simple equality as "if (instance->data.x == 1)" without extra outer parentheses', () => {
      const model = flatOrFixture();
      if (!model.variables.some((v) => v.name === 'x')) {
        model.variables.push({ id: 'var_x', name: 'x', cName: 'x', type: 'uint8', currentValue: 0, initialValue: '0' });
      }
      model.transitions[0].condition = 'x == 1';
      const built = build(model);
      const coreSource = generatedFile(built, 'sm_core.c');

      expect(coreSource).toContain('if (instance->data.x == 1) {');
      expect(coreSource).not.toContain('if ((instance->data.x == 1)) {');
    });

    it('generates correct DELAY block initial condition (-1.0) for statemachine-xbridges-scalar-multisystem-test.json', () => {
      const rawJson = readFileSync('C:/Users/EL-Dawlia/Downloads/delay/statemachine-xbridges-scalar-multisystem-test.json', 'utf-8');
      const rawModel = JSON.parse(rawJson);
      const output = generateMISRACCode(rawModel);
      const coreSource = output.files.find((f) => f.name === 'sm_core.c')?.content ?? '';
      expect(coreSource).toContain('xb_state_initial_3_XB2_Delay_XB2_Delay_y_state_value = (double)(-1.0)');
      expect(coreSource).not.toContain('xb_state_initial_3_XB2_Delay_XB2_Delay_y_state_value = (double)(0.0)');
    });
  });
});
