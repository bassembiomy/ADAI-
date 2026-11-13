import { describe, expect, it } from 'vitest';
import type { ExternalFunctionDef, VariableDef } from '../../types/sm_types';
import {
  changeWordLength,
  codePrefixFileHints,
  codePrefixInputProblem,
  describeFixedPoint,
  externalFunctionCallSites,
  externalFunctionReservedNames,
  fractionLengthProblem,
  newExternalFunction,
  nextParamName,
  storedCodePrefix,
  textCallsFunction,
  validateExternalFunctionDraft,
  withVariableType,
} from './smChartSettingsEditing';

const variable = (patch: Partial<VariableDef> = {}): VariableDef => ({
  id: 'v1', name: 'level', type: 'int32', initialValue: '0', currentValue: 0, visibleInScope: true, ...patch,
});

describe('fixed-point variable editing', () => {
  it('gives a fixdt variable a default format and clears it again', () => {
    const fixed = withVariableType(variable(), 'fixdt');
    expect(fixed.type).toBe('fixdt');
    expect(fixed.fixedPoint).toEqual({ signed: true, wordLength: 16, fractionLength: 8 });
    const back = withVariableType(fixed, 'int32');
    expect(back.type).toBe('int32');
    expect('fixedPoint' in back).toBe(false);
  });

  it('keeps an existing format when fixdt is selected again', () => {
    const fixed = variable({ type: 'fixdt', fixedPoint: { signed: false, wordLength: 8, fractionLength: 3 } });
    expect(withVariableType(fixed, 'fixdt').fixedPoint).toEqual({ signed: false, wordLength: 8, fractionLength: 3 });
  });

  it('validates the fraction length against the word length', () => {
    expect(fractionLengthProblem('8', 16)).toBeNull();
    expect(fractionLengthProblem('16', 16)).toBeNull();
    expect(fractionLengthProblem('17', 16)).toMatch(/0 to 16/);
    expect(fractionLengthProblem('-1', 16)).toMatch(/0 to 16/);
    expect(fractionLengthProblem('1.5', 16)).toMatch(/integer/);
    expect(fractionLengthProblem('', 16)).toMatch(/integer/);
  });

  it('reduces a fraction length that no longer fits when the word shrinks', () => {
    const result = changeWordLength({ signed: true, wordLength: 32, fractionLength: 20 }, 16);
    expect(result.fractionClamped).toBe(true);
    expect(result.format).toEqual({ signed: true, wordLength: 16, fractionLength: 16 });
    expect(changeWordLength({ signed: true, wordLength: 16, fractionLength: 4 }, 32).fractionClamped).toBe(false);
  });

  it('describes range and step', () => {
    expect(describeFixedPoint({ signed: true, wordLength: 8, fractionLength: 4 })).toBe('fixdt(1, 8, 4): -8 to 7.9375, step 0.0625');
    expect(describeFixedPoint({ signed: false, wordLength: 8, fractionLength: 0 })).toBe('fixdt(0, 8, 0): 0 to 255, step 1');
  });
});

describe('code prefix editing', () => {
  it('accepts the empty text as the default and reports invalid prefixes', () => {
    expect(codePrefixInputProblem('')).toBeNull();
    expect(codePrefixInputProblem('PUMP')).toBeNull();
    expect(codePrefixInputProblem('pump')).toMatch(/must match/);
    expect(codePrefixInputProblem('MCAL')).toMatch(/reserved/);
  });

  it('stores nothing for the default prefix', () => {
    expect(storedCodePrefix('')).toBeUndefined();
    expect(storedCodePrefix('SM')).toBeUndefined();
    expect(storedCodePrefix('PUMP')).toBe('PUMP');
  });

  it('lists the file names the prefix produces', () => {
    expect(codePrefixFileHints('PUMP')).toEqual(['pump_core.c', 'pump_core.h']);
    expect(codePrefixFileHints(undefined)).toEqual(['sm_core.c', 'sm_core.h']);
  });
});

describe('external function editing', () => {
  const base: ExternalFunctionDef = {
    id: 'f1', name: 'scale', header: 'scale.h', returnType: 'int32', params: [{ name: 'x', type: 'int32' }], simulation: 'x * 2',
  };

  it('creates functions with unused names and a valid declaration', () => {
    const first = newExternalFunction([], 'a');
    expect(first.name).toBe('ext_fn_1');
    const second = newExternalFunction([first], 'b', new Set(['ext_fn_2']));
    expect(second.name).toBe('ext_fn_3');
    expect(validateExternalFunctionDraft([], first, new Set())).toEqual([]);
  });

  it('numbers new parameters', () => {
    expect(nextParamName({ ...base, params: [{ name: 'arg1', type: 'int32' }] })).toBe('arg2');
  });

  it('reports engine declaration problems for the draft only', () => {
    const reserved = externalFunctionReservedNames([variable({ name: 'level' })], [{ name: 'GO' }]);
    expect(validateExternalFunctionDraft([base], base, reserved)).toEqual([]);
    expect(validateExternalFunctionDraft([base], { ...base, name: '1bad' }, reserved).join(' ')).toMatch(/not a valid C identifier/);
    expect(validateExternalFunctionDraft([base], { ...base, name: 'sin' }, reserved).join(' ')).toMatch(/built-in/);
    expect(validateExternalFunctionDraft([base], { ...base, name: 'level' }, reserved).join(' ')).toMatch(/collides/);
    expect(validateExternalFunctionDraft([base], { ...base, header: '../x.h' }, reserved).join(' ')).toMatch(/header/);
    expect(validateExternalFunctionDraft([base], { ...base, simulation: 'y + 1' }, reserved).join(' ')).toMatch(/simulation expression/);
    expect(validateExternalFunctionDraft([base], { ...base, simulation: '' }, reserved).join(' ')).toMatch(/empty/);
    const other = { ...base, id: 'f2', name: 'other', header: 'other.h' };
    expect(validateExternalFunctionDraft([base, other], { ...other, name: 'scale' }, reserved).join(' ')).toMatch(/more than once/);
  });

  it('finds the calls in guards, actions and state text', () => {
    expect(textCallsFunction('y = scale(x) + 1;', 'scale')).toBe(true);
    expect(textCallsFunction('y = rescale(x);', 'scale')).toBe(false);
    expect(textCallsFunction('y = scale;', 'scale')).toBe(false);
    const sites = externalFunctionCallSites(
      'scale',
      [{ id: 's', name: 'Run', entry: 'y = scale(2);', during: '', exit: '', internalTransitions: '' }],
      [{ id: 't1', condition: 'scale(a) > 3', action: '' }, { id: 't2', condition: 'true', action: 'z = 1;' }],
    );
    expect(sites).toEqual(['state Run entry', 'transition 1 condition']);
  });
});
