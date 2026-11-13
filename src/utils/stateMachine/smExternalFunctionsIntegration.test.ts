import { describe, expect, it } from 'vitest';
import { flatOrFixture, type DifferentialFixture, type DifferentialScenarioStep } from './smFixtures';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import { applyCodePrefixToSource } from './smCodePrefix';
import type { StateMachineModelV5 } from './smModel';

/*
 * External C functions: argument conversion, code prefix and include handling
 * (the contract itself is in smExternalFunctions.test.ts).
 */

const chart = (): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.variables = [
    { id: 'speed', name: 'speed', type: 'int32', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'target', name: 'target', type: 'int32', initialValue: '50', currentValue: 50, visibleInScope: true },
    { id: 'level', name: 'level', type: 'double', initialValue: '12.75', currentValue: 12.75, visibleInScope: true },
    { id: 'flag', name: 'flag', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true },
    { id: 'small', name: 'small', type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true },
  ];
  (model as unknown as { externalFunctions: unknown[] }).externalFunctions = [
    { id: 'f1', name: 'sm_clip8', header: 'sm_clip_api.h', returnType: 'int32', params: [{ name: 'v', type: 'int8' }], simulation: 'v' },
    { id: 'f2', name: 'sm_not', header: 'sm_clip_api.h', returnType: 'bool', params: [{ name: 'b', type: 'bool' }], simulation: '!b' },
    { id: 'f3', name: 'sm_half', header: 'sm_clip_api.h', returnType: 'float', params: [{ name: 'x', type: 'float' }], simulation: 'x / 2' },
  ];
  model.states = [
    {
      id: 'run', name: 'Run', x: 0, y: 0, width: 100, height: 60, entry: '',
      during: 'speed = sm_clip8(target * 5); flag = sm_not(speed - 127); small = sm_half(level * 1.0e39);',
      exit: '', isActive: false, color: '#000', parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: true,
    },
  ] as never;
  model.transitions = [] as never;
  model.layers = [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['run'], transitionIds: [], junctionIds: [] }] as never;
  return model;
};

const HEADER = '#ifndef SM_CLIP_API_H\n#define SM_CLIP_API_H\n#include <stdbool.h>\n#include <stdint.h>\nint32_t sm_clip8(int8_t v);\nbool sm_not(bool b);\nfloat sm_half(float x);\n#endif\n';
const IMPLEMENTATION = '#include "sm_clip_api.h"\nint32_t sm_clip8(int8_t v) { return (int32_t)v; }\nbool sm_not(bool b) { return !b; }\nfloat sm_half(float x) { return x / 2.0F; }\n';

describe('external C functions: conversions, prefix and includes', () => {
  const steps: DifferentialScenarioStep[] = Array.from({ length: 3 }, () => ({ kind: 'step' as const }));

  it('convert arguments with saturation (int8, bool, float) like the generated C', () => {
    const fixture: DifferentialFixture = {
      name: 'flat-priority',
      model: chart(),
      steps,
      extraSources: [{ name: 'sm_clip_api.h', content: HEADER }, { name: 'sm_clip_api.c', content: IMPLEMENTATION }],
    };
    const expected = runInterpreterTrace(fixture);
    expect(compareSemanticTraces(expected, compileAndRunCTrace(fixture))).toBeNull();
    // 250 saturates to 127 as int8; sm_not(127 - 127 = 0) is true; the float argument saturates at FLT_MAX.
    expect(expected[1].data.speed).toBe(127);
    expect(expected[1].data.flag).toBe(true);
    expect(expected[1].data.small).toBeCloseTo(3.4028234663852886e38 / 2, -30);
  }, 120_000);

  it('are not renamed by the code prefix pass, headers included', () => {
    const model = chart();
    model.codePrefix = 'PUMP';
    const ir = buildSemanticModel(model).ir!;
    const files = generateCArtifacts(ir).files;
    const names = files.map((file) => file.name);
    expect(names).toContain('pump_core.c');
    const core = files.find((file) => file.name === 'pump_user_logic.c')!.content;
    expect(core).toMatch(/#include "sm_clip_api\.h"/);
    expect(core).toMatch(/\bsm_clip8\s*\(/);
    expect(core).not.toMatch(/pump_clip|PUMP_clip|pump_not/);
    for (const file of files.filter((item) => item.name.endsWith('.c') || item.name.endsWith('.h'))) {
      expect(file.content).not.toMatch(/pump_clip_api|pump_half|pump_not/);
    }
    // The pass itself, without the generator.
    const source = '#include "sm_clip_api.h"\n#include "sm_core.h"\nint x = sm_clip8(SM_MAX);\n';
    expect(applyCodePrefixToSource(source, 'PUMP', { names: new Set(['sm_clip8']), headers: new Set(['sm_clip_api.h']) }))
      .toBe('#include "sm_clip_api.h"\n#include "pump_core.h"\nint x = sm_clip8(PUMP_MAX);\n');
    expect(applyCodePrefixToSource(source, 'PUMP'))
      .toBe('#include "pump_clip_api.h"\n#include "pump_core.h"\nint x = pump_clip8(PUMP_MAX);\n');
  });

  it('compile and agree with the simulation under a code prefix', () => {
    const model = chart();
    model.codePrefix = 'PUMP';
    const fixture: DifferentialFixture = {
      name: 'flat-priority',
      model,
      steps,
      extraSources: [{ name: 'sm_clip_api.h', content: HEADER }, { name: 'sm_clip_api.c', content: IMPLEMENTATION }],
    };
    expect(compareSemanticTraces(runInterpreterTrace(fixture), compileAndRunCTrace(fixture))).toBeNull();
  }, 120_000);

  it('include each header once and only in the files that call', () => {
    const files = generateCArtifacts(buildSemanticModel(chart()).ir!).files;
    const includes = (name: string): string[] =>
      (files.find((file) => file.name === name)!.content.match(/#include "sm_clip_api\.h"/g) ?? []);
    expect(includes('sm_user_logic.c')).toHaveLength(1);
    expect(includes('sm_core.c')).toHaveLength(0);
    expect(includes('sm_safety.c')).toHaveLength(0);
  });

  it('keep charts without external functions free of the helpers', () => {
    const model = chart();
    delete (model as { externalFunctions?: unknown }).externalFunctions;
    model.states[0].during = 'speed = target;';
    const files = generateCArtifacts(buildSemanticModel(model).ir!).files;
    expect(files.map((file) => file.content).join('\n')).not.toMatch(/SM_Arg|sm_clip/);
  });

  it('reject a simulation expression that reads a chart variable', () => {
    const model = chart();
    (model as unknown as { externalFunctions: Array<{ simulation: string }> }).externalFunctions[0].simulation = 'v + target';
    const codes = buildSemanticModel(model).diagnostics.filter((item) => item.severity === 'error').map((item) => item.code);
    expect(codes).toContain('SM_INVALID_FUNCTION');
  });
});
