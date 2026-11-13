import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VariableDef } from '../../types/sm_types';
import { flatOrFixture, type DifferentialFixture, type DifferentialScenarioStep } from './smFixtures';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import type { StateMachineModelV5 } from './smModel';

/*
 * Fixed-point types, as Simulink/Stateflow fixdt with binary-point scaling.
 *
 * Declaration
 *   VariableDef.type = 'fixdt' and VariableDef.fixedPoint = { signed, wordLength, fractionLength }
 *   wordLength is 8, 16 or 32; 0 <= fractionLength <= wordLength (else SM_INVALID_FIXED_POINT).
 *   Real-world value = stored integer * 2^-fractionLength. Trace data reports the real-world value.
 *   Chart option model.fixedPointRounding: 'floor' (default, Simulink's default) or 'nearest'
 *   (round to nearest, ties toward +infinity, Simulink 'Nearest').
 *
 * Arithmetic
 *   An expression with fixed-point and integer operands only (integers have fraction length 0)
 *   is evaluated exactly on stored integers in a 64-bit intermediate that saturates:
 *     + and - align to the larger fraction length; * adds fraction lengths;
 *     / produces the larger of the two operand fraction lengths, rounded with the chart mode.
 *   Comparisons align fraction lengths and compare exactly.
 *   Any floating operand makes the expression floating (double), as before.
 * Assignment
 *   To a fixed-point variable: convert to its fraction length with the chart rounding mode, then
 *   saturate to its word length (overflowPolicy 'saturate', default) or raise ARITHMETIC
 *   ('error'). Literals and initial values convert the same way.
 *   To an integer variable from a fixed-point expression: round with the chart mode.
 * Generated C
 *   Fixed-point variables are stored as int8/16/32_t or uint8/16/32_t. Expressions with only
 *   fixed-point and integer operands generate no floating-point operations (no double/float),
 *   so the code runs on MCUs without an FPU.
 * The generated C and the simulation agree exactly.
 */

const fx = (name: string, signed: boolean, wordLength: 8 | 16 | 32, fractionLength: number, initialValue: string, overflowPolicy?: 'saturate' | 'error'): VariableDef => ({
  id: name, name, type: 'fixdt' as never, initialValue, currentValue: Number(initialValue), visibleInScope: true,
  fixedPoint: { signed, wordLength, fractionLength },
  ...(overflowPolicy ? { overflowPolicy } : {}),
} as VariableDef);
const iv = (name: string, type: 'int32' | 'double' | 'bool', initialValue: string): VariableDef => ({
  id: name, name, type, initialValue, currentValue: Number(initialValue), visibleInScope: true,
});

const chart = (variables: VariableDef[], during: string, options: { rounding?: 'floor' | 'nearest'; guard?: string } = {}): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.states = [
    { id: 'A', name: 'A', x: 0, y: 0, width: 100, height: 60, entry: '', during, exit: '', isActive: false, color: '#000000', parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: true },
    { id: 'B', name: 'B', x: 0, y: 0, width: 100, height: 60, entry: '', during: '', exit: '', isActive: false, color: '#000000', parentId: null, children: [], priority: 2, isParallel: false, regionId: null, autostart: false },
  ] as never;
  model.transitions = options.guard
    ? [{ id: 't_ab', sourceId: 'A', targetId: 'B', condition: options.guard, action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 1 }] as never
    : [];
  model.layers = [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['A', 'B'], transitionIds: options.guard ? ['t_ab'] : [], junctionIds: [] }] as never;
  model.variables = variables;
  if (options.rounding) (model as unknown as { fixedPointRounding: string }).fixedPointRounding = options.rounding;
  return model;
};

const run = (model: StateMachineModelV5, steps: DifferentialScenarioStep[] = [{ kind: 'step' }]) => {
  const fixture: DifferentialFixture = { name: 'flat-priority', model, steps };
  const expected = runInterpreterTrace(fixture);
  expect(compareSemanticTraces(expected, compileAndRunCTrace(fixture))).toBeNull();
  return expected;
};

describe('fixed-point arithmetic (simulation and generated C agree)', () => {
  it('stores binary-point values exactly and saturates on overflow', () => {
    const frames = run(chart([
      fx('q15', true, 16, 15, '0.5'),
      fx('sum', true, 16, 15, '0'),
      fx('u', false, 8, 4, '15.9375'),
      fx('neg', false, 8, 4, '3'),
    ], 'sum = q15 + q15; u = u + 1; neg = 0 - 1;'));
    expect(frames[0].data.q15).toBe(0.5);
    expect(frames[1].data.sum).toBe(32767 / 32768);
    expect(frames[1].data.u).toBe(15.9375);
    expect(frames[1].data.neg).toBe(0);
    expect(frames[1].error).toBeNull();
  }, 120_000);

  it('multiplies exactly and divides with Floor rounding (Simulink default)', () => {
    const frames = run(chart([
      fx('a', true, 16, 8, '1.5'),
      fx('b', true, 16, 8, '2.25'),
      fx('c', true, 32, 16, '0'),
      fx('d', true, 16, 8, '0'),
      fx('e', true, 16, 8, '0'),
      iv('n', 'int32', '3'),
      fx('f', true, 16, 8, '0'),
      iv('k', 'int32', '0'),
    ], 'c = a * b; d = a / b; e = (0 - a) / b; f = a * n; k = a * n;'));
    const data = frames[1].data;
    expect(data.c).toBe(3.375);
    expect(data.d).toBe(170 / 256);
    expect(data.e).toBe(-171 / 256);
    expect(data.f).toBe(4.5);
    expect(data.k).toBe(4);
  }, 120_000);

  it("rounds to nearest when the chart uses 'nearest'", () => {
    const frames = run(chart([
      fx('a', true, 16, 8, '1.5'),
      fx('b', true, 16, 8, '2.25'),
      fx('d', true, 16, 8, '0'),
      fx('e', true, 16, 8, '0'),
    ], 'd = a / b; e = (0 - a) / b;', { rounding: 'nearest' }));
    expect(frames[1].data.d).toBe(171 / 256);
    expect(frames[1].data.e).toBe(-171 / 256);
  }, 120_000);

  it('mixes with floating operands through double and converts back with the rounding mode', () => {
    const frames = run(chart([
      fx('a', true, 16, 8, '1.5'),
      iv('g', 'double', '0.1'),
      fx('h', true, 16, 8, '0'),
      iv('flag', 'bool', 'false'),
    ], 'h = a + g; flag = a > 1.4;', { guard: 'h >= 1.59' }), [{ kind: 'step' }, { kind: 'step' }]);
    expect(frames[1].data.h).toBe(409 / 256);
    expect(frames[1].data.flag).toBe(true);
    expect(frames[1].activeStateIds).toEqual(['A']);
    // fixed-point h compared with a floating literal: 1.59765625 >= 1.59
    expect(frames[2].activeStateIds).toEqual(['B']);
  }, 120_000);

  it("raises ARITHMETIC on overflow under policy 'error' and on division by zero", () => {
    const frames = run(chart([
      fx('s', true, 8, 4, '7', 'error'),
      fx('z', true, 8, 4, '0'),
      fx('r', true, 8, 4, '1'),
    ], 's = s + 1; r = s / z;'));
    expect(frames[1].data.s).toBe(7);
    expect(frames[1].data.r).toBe(1);
    expect(frames[1].error).toBe('ARITHMETIC: arithmetic error');
  }, 120_000);
});

const hasTool = (tool: string) => {
  try { execFileSync(tool, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
};

describe('fixed-point code generation', () => {
  const model = chart([
    fx('a', true, 16, 8, '1.5'),
    fx('b', true, 16, 8, '2.25'),
    fx('c', true, 32, 16, '0'),
    fx('u', false, 8, 4, '1'),
    iv('n', 'int32', '3'),
  ], 'c = a * b + n; a = a / b; u = u + a;', { guard: 'c > a * 2' });

  it('stores fixed-point variables as integers and uses no floating point for fixed/integer math', () => {
    const built = buildSemanticModel(model);
    expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    const files = generateCArtifacts(built.ir!).files;
    const config = files.find((file) => file.name === 'sm_config.h')!.content;
    expect(config).toMatch(/int16_t\s+a;/);
    expect(config).toMatch(/int32_t\s+c;/);
    expect(config).toMatch(/uint8_t\s+u;/);
    const logic = files.find((file) => file.name === 'sm_user_logic.c')!.content;
    const core = files.find((file) => file.name === 'sm_core.c')!.content;
    const body = (logic + core).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^#\s*include.*$/gm, '');
    expect(body).not.toMatch(/\b(double|float)\b/);
  });

  it.skipIf(!hasTool('avr-gcc'))('compiles for an ATmega328P without floating-point support code', () => {
    const files = generateCArtifacts(buildSemanticModel(model).ir!).files.filter((file) => /\.(c|h)$/.test(file.name) && !file.name.includes('/'));
    const dir = mkdtempSync(join(tmpdir(), 'adia-fix-avr-'));
    try {
      for (const file of files) writeFileSync(join(dir, file.name), file.content);
      writeFileSync(join(dir, 'main.c'), '#include "sm_core.h"\nstatic ADIA_Instance_t i;\nbool MCAL_Dio_ReadChannel(uint32_t c){(void)c;return false;}\nvoid MCAL_Dio_WriteChannel(uint32_t c,bool l){(void)c;(void)l;}\ndouble MCAL_ReadChannelValue(uint32_t c){(void)c;return 0.0;}\nvoid MCAL_WriteChannelValue(uint32_t c,double v){(void)c;(void)v;}\nvoid MCAL_ApplySafeOutputs(void){}\nvoid MCAL_Watchdog_Kick(void){}\nint main(void){(void)SM_Init(&i);for(;;){(void)SM_Step(&i,SM_TICK_MS);}}\n');
      const sources = files.filter((file) => file.name.endsWith('.c')).map((file) => file.name);
      execFileSync('avr-gcc', ['-std=c99', '-mmcu=atmega328p', '-Os', '-Wall', '-Wextra', '-Werror', '-pedantic', '-I.', ...sources, 'main.c', '-o', 'fw.elf'], { cwd: dir, stdio: 'pipe' });
      const symbols = execFileSync('avr-nm', ['fw.elf'], { cwd: dir, encoding: 'utf8' });
      // No soft-float arithmetic routines are linked for the fixed-point chart logic.
      expect(symbols).not.toMatch(/__(mulsf3|divsf3|addsf3|subsf3)\b/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it('rejects invalid fixed-point declarations', () => {
    const bad = chart([fx('w', true, 16, 8, '0'), { ...fx('x', true, 12 as never, 4, '0') }, { ...fx('y', true, 8, 9, '0') }], '');
    const codes = buildSemanticModel(bad).diagnostics.filter((item) => item.severity === 'error').map((item) => `${item.code}:${item.elementId}`);
    expect(codes).toContain('SM_INVALID_FIXED_POINT:x');
    expect(codes).toContain('SM_INVALID_FIXED_POINT:y');
    expect(codes.some((code) => code.endsWith(':w'))).toBe(false);
  });
});
