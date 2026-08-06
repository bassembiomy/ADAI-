import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import { createXBRuntime, stepXBState } from './xbInterpreter';
import { generateCArtifacts } from './smCGenerator';
import { hybridXBridgesFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import type { SemanticModel } from './smSemanticModel';

function createLMSModel(): SemanticModel {
  const model = hybridXBridgesFixture();
  const ordinaryState = model.states.find((s) => s.id === 'ordinary')!;
  const controllerState = model.states.find((s) => s.id === 'controller')!;
  ordinaryState.autostart = false;
  controllerState.autostart = true;
  controllerState.xBridgesModel = {
    schemaVersion: 1,
    nodes: [
      {
        id: 'lms1',
        type: 'LMS_ADAPTIVE_FILTER',
        parameters: {
          lr: 0.1,
          inputs: [
            { id: 'x', direction: 'input' },
            { id: 'd', direction: 'input' },
            { id: 'lr', direction: 'input' },
          ],
          outputs: [
            { id: 'y', direction: 'output' },
            { id: 'err', direction: 'output' },
            { id: 'w1', direction: 'output' },
            { id: 'w2', direction: 'output' },
          ],
        },
      },
    ],
    edges: [],
    mappings: [
      { smVarId: 'x_in', blockId: 'lms1', portId: 'x', direction: 'in' },
      { smVarId: 'd_in', blockId: 'lms1', portId: 'd', direction: 'in' },
      { smVarId: 'lr_in', blockId: 'lms1', portId: 'lr', direction: 'in' },
      { smVarId: 'w1_out', blockId: 'lms1', portId: 'w1', direction: 'out' },
    ],
    solver: { kind: 'euler', stepSeconds: 0.002 },
    policy: { memory: 'reset', numericFault: 'escalate' },
  };
  model.variables = [
    { id: 'x_in', name: 'x_in', type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'd_in', name: 'd_in', type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'lr_in', name: 'lr_in', type: 'float', initialValue: '0.1', currentValue: 0.1, visibleInScope: true },
    { id: 'w1_out', name: 'w1_out', type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true },
  ];

  const buildResult = buildSemanticModel(model);
  if (!buildResult.ir) {
    throw new Error(`Failed to build semantic model: ${JSON.stringify(buildResult.diagnostics)}`);
  }
  return buildResult.ir;
}

describe('LMS_ADAPTIVE_FILTER C Generator Conformance', () => {
  it('matches interpreter trace for LMS_ADAPTIVE_FILTER in compiled C', () => {
    const ir = createLMSModel();
    const xb = ir.states.controller.xBridges!;
    const runtime = createXBRuntime(xb);

    const inputs = [
      { x: 1.0, d: 2.0, lr: 0.1 },
      { x: 2.0, d: 3.0, lr: 0.1 },
      { x: 1.5, d: 2.5, lr: 0.1 },
    ];

    const interpreterTrace: number[] = [];
    for (const inp of inputs) {
      stepXBState(runtime, { x_in: inp.x, d_in: inp.d, lr_in: inp.lr });
      interpreterTrace.push(Number(runtime.signals['lms1:w1']?.[0] ?? 0));
    }

    const workspace = createGeneratedCodeTestWorkspace('xb-lms-c99');
    try {
      for (const file of generateCArtifacts(ir, { includeTestShims: true }).files) {
        writeFileSync(join(workspace.directory, file.name), file.content);
      }
      writeFileSync(join(workspace.directory, 'harness.c'), [
        '#include "sm_core.h"',
        '#include <stdio.h>',
        'int main(void) {',
        '    ADIA_Instance_t instance;',
        '    if (SM_Init(&instance) != SM_ERR_NONE) return 1;',
        '    for (unsigned tick = 0U; tick < 3U; ++tick) {',
        '        if (tick == 0U) { instance.data.x_in = 1.0f; instance.data.d_in = 2.0f; instance.data.lr_in = 0.1f; }',
        '        else if (tick == 1U) { instance.data.x_in = 2.0f; instance.data.d_in = 3.0f; instance.data.lr_in = 0.1f; }',
        '        else { instance.data.x_in = 1.5f; instance.data.d_in = 2.5f; instance.data.lr_in = 0.1f; }',
        '        if (SM_Step(&instance, SM_TICK_MS) != SM_ERR_NONE) return 2;',
        '        (void)printf("%.17g\\n", (double)instance.data.w1_out);',
        '    }',
        '    return 0;',
        '}',
      ].join('\n'));

      const executable = join(workspace.directory, 'xb_lms.exe');
      execFileSync('gcc', [
        '-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror', '-I.',
        'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'sm_xbridges.c',
        'mcal_dio_test_stubs.c', 'harness.c', '-lm', '-o', executable,
      ], { cwd: workspace.directory, stdio: 'pipe' });

      const cTrace = execFileSync(executable, [], { cwd: workspace.directory, encoding: 'utf8' })
        .trim().split('\n').filter(Boolean).map(Number);

      expect(cTrace.length).toBe(interpreterTrace.length);
      for (let i = 0; i < cTrace.length; i++) {
        expect(cTrace[i]).toBeCloseTo(interpreterTrace[i], 3);
      }
    } finally {
      workspace.cleanup();
    }
  }, 30000);
});
