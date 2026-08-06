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

function createKalmanTestModel(): SemanticModel {
  const model = hybridXBridgesFixture();
  const ordinaryState = model.states.find((s) => s.id === 'ordinary')!;
  const controllerState = model.states.find((s) => s.id === 'controller')!;
  ordinaryState.autostart = false;
  controllerState.autostart = true;
  controllerState.xBridgesModel = {
    schemaVersion: 1,
    nodes: [
      {
        id: 'kf1',
        type: 'KALMAN_FILTER',
        parameters: {
          A: [[1, 0.01], [0, 1]],
          B: [[0.00005], [0.01]],
          C: [[1, 0]],
          D: [[0]],
          Q: [[0.001, 0], [0, 0.001]],
          R: [[0.01]],
          P0: [[1, 0], [0, 1]],
          x0: [[0], [0]],
          inputs: [{ id: 'u', direction: 'input' }, { id: 'y_meas', direction: 'input' }],
          outputs: [
            { id: 'x_hat', direction: 'output' },
            { id: 'y_hat', direction: 'output' },
            { id: 'innovation', direction: 'output' },
            { id: 'K', direction: 'output' },
          ],
        },
      },
    ],
    edges: [],
    mappings: [
      { smVarId: 'u_in', blockId: 'kf1', portId: 'u', direction: 'in' },
      { smVarId: 'y_in', blockId: 'kf1', portId: 'y_meas', direction: 'in' },
      { smVarId: 'x_out', blockId: 'kf1', portId: 'x_hat', direction: 'out' },
    ],
    solver: { kind: 'euler', stepSeconds: 0.002 },
    policy: { memory: 'reset', numericFault: 'escalate' },
  };
  model.variables = [
    { id: 'u_in', name: 'u_in', type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'y_in', name: 'y_in', type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'x_out', name: 'x_out', type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true },
  ];

  const buildResult = buildSemanticModel(model);
  if (!buildResult.ir) {
    throw new Error(`Failed to build semantic model: ${JSON.stringify(buildResult.diagnostics)}`);
  }
  return buildResult.ir;
}

describe('KALMAN_FILTER C Generator Conformance', { timeout: 60_000 }, () => {
  it('matches interpreter trace for KALMAN_FILTER in compiled C', () => {
    const ir = createKalmanTestModel();
    const xb = ir.states.controller.xBridges!;
    const runtime = createXBRuntime(xb);

    const inputs = [
      { u: 1.0, y: 0.5 },
      { u: 0.5, y: 0.8 },
      { u: 0.0, y: 1.0 },
    ];

    const interpreterTrace: number[] = [];
    for (const inp of inputs) {
      stepXBState(runtime, { u_in: inp.u, y_in: inp.y });
      interpreterTrace.push(Number(runtime.signals['kf1:x_hat']?.[0] ?? runtime.variables['x_out'] ?? 0));
    }

    const workspace = createGeneratedCodeTestWorkspace('xb-kalman-c99');
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
        '        if (tick == 0U) { instance.data.u_in = 1.0f; instance.data.y_in = 0.5f; }',
        '        else if (tick == 1U) { instance.data.u_in = 0.5f; instance.data.y_in = 0.8f; }',
        '        else { instance.data.u_in = 0.0f; instance.data.y_in = 1.0f; }',
        '        if (SM_Step(&instance, SM_TICK_MS) != SM_ERR_NONE) return 2;',
        '        (void)printf("%.17g\\n", (double)instance.data.x_out);',
        '    }',
        '    return 0;',
        '}',
      ].join('\n'));

      const executable = join(workspace.directory, 'xb_kalman.exe');
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
  });

  it('matches interpreter trace for EXTENDED_KALMAN_FILTER in compiled C', () => {
    const model = hybridXBridgesFixture();
    const ordinaryState = model.states.find((s) => s.id === 'ordinary')!;
    const controllerState = model.states.find((s) => s.id === 'controller')!;
    ordinaryState.autostart = false;
    controllerState.autostart = true;
    controllerState.xBridgesModel = {
      schemaVersion: 1,
      nodes: [
        {
          id: 'ekf1',
          type: 'EXTENDED_KALMAN_FILTER',
          parameters: {
            f: ['x1 + 0.01 * x2 + 0.00005 * u1', 'x2 + 0.01 * u1'],
            h: ['x1'],
            Q: [[0.001, 0], [0, 0.001]],
            R: [[0.01]],
            P0: [[1, 0], [0, 1]],
            x0: [[0], [0]],
            inputs: [{ id: 'u', direction: 'input' }, { id: 'y_meas', direction: 'input' }],
            outputs: [
              { id: 'x_hat', direction: 'output' },
              { id: 'y_hat', direction: 'output' },
              { id: 'innovation', direction: 'output' },
              { id: 'K', direction: 'output' },
            ],
          },
        },
      ],
      edges: [],
      mappings: [
        { smVarId: 'u_in', blockId: 'ekf1', portId: 'u', direction: 'in' },
        { smVarId: 'y_in', blockId: 'ekf1', portId: 'y_meas', direction: 'in' },
        { smVarId: 'x_out', blockId: 'ekf1', portId: 'x_hat', direction: 'out' },
      ],
      solver: { kind: 'euler', stepSeconds: 0.002 },
      policy: { memory: 'reset', numericFault: 'escalate' },
    };
    model.variables = [
      { id: 'u_in', name: 'u_in', type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true },
      { id: 'y_in', name: 'y_in', type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true },
      { id: 'x_out', name: 'x_out', type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true },
    ];

    const buildResult = buildSemanticModel(model);
    expect(buildResult.ir).not.toBeNull();
    const ir = buildResult.ir!;

    const xb = ir.states.controller.xBridges!;
    const runtime = createXBRuntime(xb);

    const inputs = [
      { u: 1.0, y: 0.5 },
      { u: 0.5, y: 0.8 },
      { u: 0.0, y: 1.0 },
    ];

    const interpreterTrace: number[] = [];
    for (const inp of inputs) {
      stepXBState(runtime, { u_in: inp.u, y_in: inp.y });
      interpreterTrace.push(Number(runtime.signals['ekf1:x_hat']?.[0] ?? runtime.variables['x_out'] ?? 0));
    }

    const workspace = createGeneratedCodeTestWorkspace('xb-ekf-c99');
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
        '        if (tick == 0U) { instance.data.u_in = 1.0f; instance.data.y_in = 0.5f; }',
        '        else if (tick == 1U) { instance.data.u_in = 0.5f; instance.data.y_in = 0.8f; }',
        '        else { instance.data.u_in = 0.0f; instance.data.y_in = 1.0f; }',
        '        if (SM_Step(&instance, SM_TICK_MS) != SM_ERR_NONE) return 2;',
        '        (void)printf("%.17g\\n", (double)instance.data.x_out);',
        '    }',
        '    return 0;',
        '}',
      ].join('\n'));

      const executable = join(workspace.directory, 'xb_ekf.exe');
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
  });
});
