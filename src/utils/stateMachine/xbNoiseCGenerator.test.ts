import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import { createXBRuntime, stepXBState } from './xbInterpreter';
import { generateCArtifacts } from './smCGenerator';
import type {
  XBSemanticOperation,
  XBSemanticSignal,
} from './xbSemanticModel';

const scalar = { kind: 'scalar' } as const;
const float32 = { kind: 'float32' } as const;

import { hybridXBridgesFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';

const createNoiseOperation = (id: string, type: 'WHITE_NOISE' | 'BAND_LIMITED_NOISE', seed: number, mean: number, variance: number, fc = 1): XBSemanticOperation => {
  return {
    id,
    type,
    inputSignalIds: [],
    outputSignalIds: [`${id}:y`],
    parameters: { seed, mean, variance, ...(type === 'BAND_LIMITED_NOISE' ? { fc } : {}) },
    directFeedthrough: false,
    stateful: true,
    conversion: null,
    numericFault: { fallback: 'previous-value', errorSignalId: null },
    state: {
      outputPhase: 'read-before-update',
      updatePhase: 'after-direct-feedthrough',
      slots: [
        { id: `${id}:rng_state$state`, role: 'rng_state', signalId: null, numericType: { kind: 'float64' }, shape: scalar, initialValues: [seed] },
        { id: `${id}:spare_normal$state`, role: 'spare_normal', signalId: null, numericType: float32, shape: scalar, initialValues: [0] },
        { id: `${id}:has_spare_normal$state`, role: 'has_spare_normal', signalId: null, numericType: float32, shape: scalar, initialValues: [false] },
        ...(type === 'BAND_LIMITED_NOISE' ? [{ id: `${id}:filter_state$state`, role: 'filter_state', signalId: null, numericType: float32, shape: scalar, initialValues: [mean] }] : []),
      ],
    },
    schedule: { periodSubsteps: 1, offsetSubsteps: 0, initialCounter: 0, counterIncrement: 1, hold: 'none' },
  };
};

const createNoiseTestModel = (type: 'WHITE_NOISE' | 'BAND_LIMITED_NOISE') => {
  const model = hybridXBridgesFixture();
  const ordinaryState = model.states.find((s) => s.id === 'ordinary')!;
  const controllerState = model.states.find((s) => s.id === 'controller')!;
  ordinaryState.autostart = false;
  controllerState.autostart = true;
  controllerState.xBridgesModel = {
    schemaVersion: 1,
    nodes: [
      {
        id: 'n',
        type,
        parameters: {
          seed: 1234,
          mean: 0,
          variance: 1,
          ...(type === 'BAND_LIMITED_NOISE' ? { fc: 1 } : {}),
          inputs: [],
          outputs: [{ id: 'y', direction: 'output' }],
        },
      },
    ],
    edges: [],
    mappings: [
      { smVarId: 'out', blockId: 'n', portId: 'y', direction: 'out' },
    ],
    solver: { kind: 'euler', stepSeconds: 0.002 },
    policy: { memory: 'reset', numericFault: 'escalate' },
  };
  model.variables = [
    { id: 'out', name: 'out', type: 'double', initialValue: '0', currentValue: 0, visibleInScope: true },
  ];
  const buildResult = buildSemanticModel(model);
  if (!buildResult.ir) {
    throw new Error(`Build failed: ${JSON.stringify(buildResult.diagnostics)}`);
  }
  return buildResult.ir;
};

describe('X-Bridges C99 noise generation', { timeout: 60_000 }, () => {
  it.each(['WHITE_NOISE', 'BAND_LIMITED_NOISE'] as const)('matches interpreter trace for %s', (type) => {
    const ir = createNoiseTestModel(type);
    const xb = ir.states.controller.xBridges!;
    const runtime = createXBRuntime(xb);
    
    const expected: number[] = [];
    for (let i = 0; i < 50; i++) {
      const data: Record<string, number | boolean> = {};
      stepXBState(runtime, data);
      expected.push(Number(runtime.signals['n:y']![0]));
    }

    const workspace = createGeneratedCodeTestWorkspace(`xb-noise-${type}-c99`);
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
        '    for (unsigned tick = 0U; tick < 50U; ++tick) {',
        '        if (SM_Step(&instance, SM_TICK_MS) != SM_ERR_NONE) return 2;',
        '        (void)printf("%.17g\\n", instance.data.out);',
        '    }',
        '    return 0;',
        '}',
      ].join('\n'));
      const executable = join(workspace.directory, `xb_noise.exe`);
      execFileSync('gcc', [
        '-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror', '-I.',
        'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'sm_xbridges.c',
        'mcal_dio_test_stubs.c', 'harness.c', '-lm', '-o', executable,
      ], { cwd: workspace.directory, stdio: 'pipe' });
      const actual = execFileSync(executable, [], {
        cwd: workspace.directory,
        encoding: 'utf8',
      }).trim().split(/\r?\n/).map(Number);

      expect(actual).toHaveLength(expected.length);
      actual.forEach((value, index) => {
        expect(value).toBeCloseTo(expected[index], 5); // Float32 precision is ~7 decimal digits
      });
    } finally {
      workspace.cleanup();
    }
  });
});
