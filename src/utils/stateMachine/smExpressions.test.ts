import { describe, expect, it } from 'vitest';
import {
  parseAction,
  parseActions,
  parseCondition,
  findInternalTransitionSyntaxErrors,
  parseInternalTransition,
} from './smExpressions';

describe('semantic expressions', () => {
  it('parses division without confusing it with transition action syntax', () => {
    expect(parseAction('ratio = total / count;')).toEqual({
      kind: 'assign',
      target: 'ratio',
      value: expect.objectContaining({
        kind: 'binary',
        operator: '/',
        left: expect.objectContaining({ kind: 'variable', name: 'total' }),
        right: expect.objectContaining({ kind: 'variable', name: 'count' }),
      }),
    });
  });

  it('preserves arithmetic, comparison, and logical precedence', () => {
    expect(parseCondition('total / count > 2 && enabled')).toMatchObject({
      kind: 'binary',
      operator: '&&',
      left: {
        kind: 'binary',
        operator: '>',
        left: { kind: 'binary', operator: '/' },
      },
      right: { kind: 'variable', name: 'enabled' },
    });
  });

  it('parses multiple typed assignments in source order', () => {
    expect(parseActions('ratio = total / count; enabled = ratio > 1;')).toEqual([
      expect.objectContaining({ kind: 'assign', target: 'ratio' }),
      expect.objectContaining({ kind: 'assign', target: 'enabled' }),
    ]);
  });

  it('rejects undeclared symbols before simulation or generation', () => {
    expect(() => parseCondition('missing > 0', new Set(['known']))).toThrow(
      /undeclared symbol 'missing'/,
    );
  });

  it('rejects an undeclared assignment target', () => {
    expect(() => parseAction('missing = known + 1;', new Set(['known']))).toThrow(
      /undeclared symbol 'missing'/,
    );
  });

  it('resolves symbol aliases to one canonical C identifier', () => {
    expect(parseCondition(
      'variable_id > 0',
      new Map([['variable_id', 'display_name']]),
    )).toMatchObject({
      kind: 'binary',
      left: {
        kind: 'variable',
        name: 'variable_id',
        cName: 'display_name',
      },
    });
  });

  it('separates internal-transition actions without splitting division', () => {
    const parsed = parseInternalTransition(
      '[total / count > 1] / ratio = total / count;',
    );

    expect(parsed.guard).toMatchObject({
      kind: 'binary',
      operator: '>',
      left: { kind: 'binary', operator: '/' },
    });
    expect(parsed.actions).toEqual([
      expect.objectContaining({
        kind: 'assign',
        target: 'ratio',
        value: expect.objectContaining({ kind: 'binary', operator: '/' }),
      }),
    ]);
  });

  it('rejects malformed temporal triggers instead of making them unconditional', () => {
    expect(() => parseInternalTransition('after(-1) / ratio = 1;')).toThrow(
      /invalid internal-transition trigger/,
    );
    expect(() => parseInternalTransition('after(foo) / ratio = 1;')).toThrow(
      /invalid internal-transition trigger/,
    );
  });

  it('preserves textual temporal conjunction versus disjunction', () => {
    expect(parseInternalTransition('after(2) && [enabled] / ratio = 1;'))
      .toMatchObject({ triggerMode: 'and', afterTicks: 2 });
    expect(parseInternalTransition('after(2) || [enabled] / ratio = 1;'))
      .toMatchObject({ triggerMode: 'or', afterTicks: 2 });
  });

  it('rejects mixed temporal conjunction and disjunction operators', () => {
    expect(() => parseInternalTransition(
      'after(2) && || [enabled] / ratio = 1;',
    )).toThrow(/invalid internal-transition trigger/);
  });

  it('requires exactly one connector between condition and temporal clauses', () => {
    expect(() => parseInternalTransition(
      'after(2) [enabled] / ratio = 1;',
    )).toThrow(/exactly one '&&' or '\|\|'/);
    expect(() => parseInternalTransition(
      'after(2) && && [enabled] / ratio = 1;',
    )).toThrow(/exactly one '&&' or '\|\|'/);
    expect(() => parseInternalTransition(
      '[enabled] || || after(2) / ratio = 1;',
    )).toThrow(/exactly one '&&' or '\|\|'/);
  });

  it('rejects a zero textual temporal threshold', () => {
    expect(() => parseInternalTransition(
      'after(0) / ratio = 1;',
    )).toThrow(/positive integer/);
  });
});

describe('internal-transition syntax check', () => {
  it('checks every non-empty line, not only the ones starting with a bracket', () => {
    expect(findInternalTransitionSyntaxErrors('[a > 1] / x = 1;\n\n  after(5) / y = 2;\n')).toEqual([]);
    const errors = findInternalTransitionSyntaxErrors('[a > 1] / x = 1;\nafter(5 / y = 2;\n/ x = = 1;\ngarbage text');
    expect(errors.map((e) => e.line)).toEqual(['after(5 / y = 2;', '/ x = = 1;', 'garbage text']);
  });
});
