import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import { generateMISRACCode } from '../stateMachineCodeGenerator';
import { buildSemanticModel } from './smSemanticBuilder';
import {
  flatOrFixture,
  historyFixture,
  interpreterFixture,
  nestedAndFixture,
  parallelHistoryFixture,
} from './smFixtures';
import type { SemanticModel } from './smSemanticModel';
import {
  generateCArtifacts,
  renderConfigHeader,
  renderCoreSource,
} from './smCGenerator';
import { renderCExpression } from './smCExpressions';

const build = (model: ReturnType<typeof flatOrFixture>) => {
  const result = buildSemanticModel(model);
  expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  expect(result.ir).toBeDefined();
  return result.ir!;
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

describe('structured C99 renderer', () => {
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

  it('does not require post-generation brace or regex repair', () => {
    const source = readFileSync(
      'src/utils/stateMachine/smCGenerator.ts',
      'utf8',
    );
    expect(source).not.toContain('Syntactic Auto-Repair');
    expect(source).not.toMatch(/\.replace\([\s\S]*SM_Sync_IO/);
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
    ]);
    expect(JSON.stringify(ir)).toBe(before);
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
    expect(core).toContain('MCAL_Dio_ReadChannel(MCAL_CH_ADC_0)');
    expect(core).toContain('* 2.0');
    expect(core).toContain('instance->data.total > 1');
    expect(core).toContain('MCAL_Dio_WriteChannel(MCAL_CH_GPIO_0');
    expect(core).not.toContain('instance->data.x');
  });
});
