import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VariableDef, VariableType } from '../../types/sm_types';
import { flatOrFixture, type DifferentialFixture, type DifferentialScenarioStep } from './smFixtures';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import type { StateMachineModelV5 } from './smModel';

/*
 * Action-language arithmetic is typed, as in C and Stateflow, and the generated C must
 * produce exactly what the simulation produces:
 *
 *  - An expression whose operands are all integers is evaluated in a 64-bit signed
 *    intermediate; `/` truncates toward zero and `%` follows C. Intermediates never
 *    wrap (no undefined behaviour in C).
 *  - Any floating operand makes the expression floating (double intermediate).
 *  - On assignment the value is converted to the target type. Out-of-range integers
 *    saturate (overflowPolicy 'saturate', the default) or raise an arithmetic error
 *    (overflowPolicy 'error'). float/single saturate to ±FLT_MAX.
 *  - abs() keeps the fraction for floating arguments; sqrt/sin/cos/exp are double.
 *  - Arithmetic errors (division or remainder by zero, overflow under policy 'error',
 *    a non-finite floating result) skip that one assignment (the variable keeps its old
 *    value), latch the error 'ARITHMETIC', let the rest of the tick finish, and enter the
 *    fault configuration at the end of the tick, in the simulation and in C alike.
 */

const v = (name: string, type: VariableType, initialValue: string, overflowPolicy?: 'saturate' | 'error'): VariableDef => ({
  id: name, name, type, initialValue, currentValue: Number(initialValue), visibleInScope: true,
  ...(overflowPolicy ? { overflowPolicy } : {}),
});

const chart = (variables: VariableDef[], during: string, entry = ''): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.states = [{
    id: 'A', name: 'A', x: 0, y: 0, width: 100, height: 60, entry, during, exit: '',
    isActive: false, color: '#000000', parentId: null, children: [], priority: 1,
    isParallel: false, regionId: null, autostart: true,
  }] as never;
  model.transitions = [];
  model.layers = [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['A'], transitionIds: [], junctionIds: [] }] as never;
  model.variables = variables;
  return model;
};

const run = (model: StateMachineModelV5, steps: DifferentialScenarioStep[]) => {
  const fx: DifferentialFixture = { name: 'flat-priority', model, steps };
  const expected = runInterpreterTrace(fx);
  const actual = compileAndRunCTrace(fx);
  expect(compareSemanticTraces(expected, actual)).toBeNull();
  return expected;
};

const ARITH = 'ARITHMETIC: arithmetic error';

describe('typed arithmetic (simulation and generated C agree)', () => {
  it('saturates on assignment, truncates integer division, keeps 64-bit intermediates exact', () => {
    const frames = run(chart([
      v('i32', 'int32', '2147483647'),
      v('u8', 'uint8', '0'),
      v('a', 'int32', '7'),
      v('b', 'int32', '2'),
      v('r', 'int32', '0'),
      v('q', 'int32', '0'),
      v('m', 'int32', '0'),
      v('big', 'int32', '100000'),
      v('p', 'int32', '0'),
      v('x', 'double', '-3.7'),
      v('y', 'double', '0'),
      v('k', 'int32', '-5'),
      v('ak', 'int32', '0'),
      v('f', 'float', '3e38'),
      v('s16', 'int16', '-32768'),
    ], [
      'i32 = i32 + 1;',
      'u8 = u8 - 1;',
      'r = (a / b) * b;',
      'q = (0 - a) / b;',
      'm = (0 - a) % b;',
      'p = (big * big) / big;',
      'y = abs(x);',
      'ak = abs(k);',
      'f = f * 10;',
      's16 = s16 - 1;',
    ].join(' ')), [{ kind: 'step' }]);
    const d = frames[1].data;
    expect(frames[1].error).toBeNull();
    expect(d.i32).toBe(2147483647);
    expect(d.u8).toBe(0);
    expect(d.r).toBe(6);
    expect(d.q).toBe(-3);
    expect(d.m).toBe(-1);
    expect(d.p).toBe(100000);
    expect(d.y).toBeCloseTo(3.7, 12);
    expect(d.ak).toBe(5);
    expect(d.f).toBeCloseTo(3.4028234663852886e38, -30);
    expect(d.s16).toBe(-32768);
  }, 120_000);

  it('integer division by zero keeps the old value, finishes the tick, then faults', () => {
    const frames = run(chart([
      v('a', 'int32', '7'),
      v('z', 'int32', '0'),
      v('r', 'int32', '5'),
      v('after', 'int32', '0'),
    ], 'r = a / z; after = after + 1;'), [{ kind: 'step' }, { kind: 'step' }]);
    expect(frames[1].data.r).toBe(5);
    expect(frames[1].data.after).toBe(1);
    expect(frames[1].error).toBe(ARITH);
    expect(frames[1].activeStateIds).toEqual([]);
    expect(frames[2].data.after).toBe(1);
    expect(frames[2].error).toBe(ARITH);
  }, 120_000);

  it('remainder by zero and floating division by zero are arithmetic errors', () => {
    const rem = run(chart([v('a', 'int32', '7'), v('z', 'int32', '0'), v('r', 'int32', '5')], 'r = a % z;'), [{ kind: 'step' }]);
    expect(rem[1].data.r).toBe(5);
    expect(rem[1].error).toBe(ARITH);
    const flt = run(chart([v('one', 'double', '1'), v('zd', 'double', '0'), v('d', 'double', '2')], 'd = one / zd;'), [{ kind: 'step' }]);
    expect(flt[1].data.d).toBe(2);
    expect(flt[1].error).toBe(ARITH);
  }, 120_000);

  it('a non-finite floating result (sqrt of a negative) is an arithmetic error', () => {
    const frames = run(chart([v('n', 'double', '-1'), v('w', 'double', '9')], 'w = sqrt(n);'), [{ kind: 'step' }]);
    expect(frames[1].data.w).toBe(9);
    expect(frames[1].error).toBe(ARITH);
  }, 120_000);

  it("overflow under policy 'error' is an arithmetic error and keeps the old value", () => {
    const frames = run(chart([v('e8', 'int8', '100', 'error')], 'e8 = e8 + 100;'), [{ kind: 'step' }]);
    expect(frames[1].data.e8).toBe(100);
    expect(frames[1].error).toBe(ARITH);
  }, 120_000);

  it('an arithmetic error in an entry action at initialization is reported by init', () => {
    const frames = run(chart([v('a', 'int32', '1'), v('z', 'int32', '0'), v('r', 'int32', '3')], '', 'r = a / z;'), [{ kind: 'step' }]);
    expect(frames[0].data.r).toBe(3);
    expect(frames[0].error).toBe(ARITH);
  }, 120_000);
});

const hostGcc = (() => {
  try { execFileSync('gcc', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
})();

describe('math functions in actions and guards build under strict flags', () => {
  for (const cStandard of ['c99', 'c90'] as const) {
    it.skipIf(!hostGcc)(`compiles with -std=${cStandard} -Wall -Wextra -Werror -pedantic`, () => {
      const model = chart([
        v('x', 'double', '0.5'), v('y', 'double', '0'), v('fz', 'float', '1'), v('k', 'int32', '-2'), v('g', 'bool', 'false'),
      ], 'y = sin(x) + cos(x) + exp(x) + sqrt(x) + abs(x); fz = abs(fz) + 1; k = abs(k);', 'y = abs(y);');
      model.states[0].exit = 'x = sqrt(abs(x));';
      model.states.push({ ...model.states[0], id: 'B', name: 'B', autostart: false, priority: 2, entry: '', during: '', exit: '' });
      model.layers[0].stateIds.push('B');
      model.layers[0].transitionIds.push('t_ab');
      model.transitions = [{
        id: 't_ab', sourceId: 'A', targetId: 'B', condition: 'sqrt(x) > 2 || abs(k) > 3', action: 'y = exp(x);',
        afterTicks: null, type: 'condition', hasControlPoint: false, order: 1,
      }] as never;
      model.verification = { ...model.verification, cStandard };
      const built = buildSemanticModel(model);
      expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
      const dir = mkdtempSync(join(tmpdir(), 'adia-math-'));
      try {
        const files = generateCArtifacts(built.ir!).files.filter((file) => /\.(c|h)$/.test(file.name) && !file.name.includes('/'));
        for (const file of files) writeFileSync(join(dir, file.name), file.content);
        const sources = files.filter((file) => file.name.endsWith('.c')).map((file) => file.name);
        if (!sources.includes('mcal_test_stub.c') && !files.some((file) => file.name === 'mcal_dio_stub.c')) {
          writeFileSync(join(dir, 'mcal_stub_for_test.c'), '#include "mcal_dio.h"\nbool MCAL_Dio_ReadChannel(uint32_t c){(void)c;return false;}\nvoid MCAL_Dio_WriteChannel(uint32_t c,bool l){(void)c;(void)l;}\ndouble MCAL_ReadChannelValue(uint32_t c){(void)c;return 0.0;}\nvoid MCAL_WriteChannelValue(uint32_t c,double v){(void)c;(void)v;}\nvoid MCAL_ApplySafeOutputs(void){}\nvoid MCAL_Watchdog_Kick(void){}\n');
          sources.push('mcal_stub_for_test.c');
        }
        writeFileSync(join(dir, 'main_for_test.c'), '#include "sm_core.h"\nint main(void){ADIA_Instance_t i; (void)SM_Init(&i); (void)SM_Step(&i, SM_TICK_MS); return (int)SM_GetError(&i);}\n');
        sources.push('main_for_test.c');
        execFileSync('gcc', [`-std=${cStandard}`, '-Wall', '-Wextra', '-Werror', '-pedantic', '-I.', ...sources, '-o', join(dir, 'm'), '-lm'], { cwd: dir, stdio: 'pipe' });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }, 120_000);
  }
});
