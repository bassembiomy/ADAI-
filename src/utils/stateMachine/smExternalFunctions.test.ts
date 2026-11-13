import { describe, expect, it } from 'vitest';
import { flatOrFixture, type DifferentialFixture, type DifferentialScenarioStep } from './smFixtures';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import type { StateMachineModelV5 } from './smModel';

/*
 * Calls to hand-written C functions from actions and guards (Stateflow custom code).
 *
 * Declaration on the chart: model.externalFunctions = [{
 *   id, name, header,              // C identifier; header file name like "motor_api.h"
 *   returnType, params: [{ name, type }],   // types are chart variable types (incl. bool)
 *   simulation                     // action-language expression over the params, used by
 * }]                               // the simulation in place of the C code
 * Calls look like ordinary function calls: `speed = ramp(speed, target);`, `[is_safe(level)]`.
 * Arguments are converted to the parameter types and the result to returnType with the usual
 * conversion rules (saturation, rounding mode).
 *
 * Generated C: `#include "<header>"` in the files that call it, direct calls with explicit
 * casts. The integrator provides the implementation; it must match the simulation expression
 * for the simulation to be a faithful model.
 * Validation: SM_UNKNOWN_FUNCTION (call to an undeclared name), SM_FUNCTION_ARITY (wrong number
 * of arguments), SM_INVALID_FUNCTION (bad name, clash with built-ins sin/cos/exp/sqrt/abs/send,
 * duplicate, header not a plain relative *.h name, invalid simulation expression).
 * Differential fixtures may carry extra C sources (DifferentialFixture.extraSources) that the
 * C harness compiles with the generated code.
 */

const chart = (): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.variables = [
    { id: 'speed', name: 'speed', type: 'int32', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'target', name: 'target', type: 'int32', initialValue: '50', currentValue: 50, visibleInScope: true },
    { id: 'level', name: 'level', type: 'double', initialValue: '0.25', currentValue: 0.25, visibleInScope: true },
  ];
  (model as unknown as { externalFunctions: unknown[] }).externalFunctions = [
    { id: 'f_ramp', name: 'ramp', header: 'motor_api.h', returnType: 'int32', params: [{ name: 'now', type: 'int32' }, { name: 'goal', type: 'int32' }], simulation: 'now + (goal - now) / 4' },
    { id: 'f_safe', name: 'is_safe', header: 'motor_api.h', returnType: 'bool', params: [{ name: 'x', type: 'double' }], simulation: 'x < 0.5' },
  ];
  model.states = [
    { id: 'run', name: 'Run', x: 0, y: 0, width: 100, height: 60, entry: '', during: 'speed = ramp(speed, target); level = level + 0.1;', exit: '', isActive: false, color: '#000', parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: true },
    { id: 'stop', name: 'Stop', x: 0, y: 0, width: 100, height: 60, entry: 'speed = 0;', during: '', exit: '', isActive: false, color: '#000', parentId: null, children: [], priority: 2, isParallel: false, regionId: null, autostart: false },
  ] as never;
  model.transitions = [{ id: 't_stop', sourceId: 'run', targetId: 'stop', condition: '!is_safe(level)', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 1 }] as never;
  model.layers = [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['run', 'stop'], transitionIds: ['t_stop'], junctionIds: [] }] as never;
  return model;
};

const HEADER = '#ifndef MOTOR_API_H\n#define MOTOR_API_H\n#include <stdbool.h>\n#include <stdint.h>\nint32_t ramp(int32_t now, int32_t goal);\nbool is_safe(double x);\n#endif\n';
const IMPLEMENTATION = '#include "motor_api.h"\nint32_t ramp(int32_t now, int32_t goal) { return now + (goal - now) / 4; }\nbool is_safe(double x) { return x < 0.5; }\n';

describe('external C functions', () => {
  it('are called by the generated C and modelled by their simulation expression', () => {
    const steps: DifferentialScenarioStep[] = Array.from({ length: 5 }, () => ({ kind: 'step' as const }));
    const fixture = {
      name: 'flat-priority',
      model: chart(),
      steps,
      extraSources: [{ name: 'motor_api.h', content: HEADER }, { name: 'motor_api.c', content: IMPLEMENTATION }],
    } as unknown as DifferentialFixture;
    const expected = runInterpreterTrace(fixture);
    expect(compareSemanticTraces(expected, compileAndRunCTrace(fixture))).toBeNull();
    // speed: 0 -> 12 -> 21 -> 28 -> (level 0.55 not safe) stop: 0
    expect(expected.slice(1, 4).map((frame) => frame.data.speed)).toEqual([12, 21, 28]);
    expect(expected[4].activeStateIds).toEqual(['stop']);
    expect(expected[4].data.speed).toBe(0);
  }, 120_000);

  it('include the declared header and call the function directly', () => {
    const files = generateCArtifacts(buildSemanticModel(chart()).ir!).files;
    const logic = files.find((file) => file.name === 'sm_user_logic.c')!.content;
    const core = files.find((file) => file.name === 'sm_core.c')!.content;
    expect(logic).toMatch(/#include "motor_api\.h"/);
    expect(logic).toMatch(/\bramp\s*\(/);
    expect(core).toMatch(/#include "motor_api\.h"/);
    expect(core).toMatch(/\bis_safe\s*\(/);
  });

  it('are validated', () => {
    const codes = (mutate: (model: StateMachineModelV5) => void) => {
      const model = chart();
      mutate(model);
      return buildSemanticModel(model).diagnostics.filter((item) => item.severity === 'error').map((item) => item.code);
    };
    const functions = (model: StateMachineModelV5) => (model as unknown as { externalFunctions: Array<Record<string, unknown>> }).externalFunctions;
    expect(codes(() => undefined)).toEqual([]);
    expect(codes((model) => { model.states[0].during = 'speed = unknown_fn(speed);'; })).toContain('SM_UNKNOWN_FUNCTION');
    expect(codes((model) => { model.states[0].during = 'speed = ramp(speed);'; })).toContain('SM_FUNCTION_ARITY');
    expect(codes((model) => { functions(model)[0].name = 'abs'; })).toContain('SM_INVALID_FUNCTION');
    expect(codes((model) => { functions(model)[0].header = '../secret.h'; })).toContain('SM_INVALID_FUNCTION');
    expect(codes((model) => { functions(model)[1].name = 'ramp'; })).toContain('SM_INVALID_FUNCTION');
    expect(codes((model) => { functions(model)[0].simulation = 'now +'; })).toContain('SM_INVALID_FUNCTION');
  });
});
