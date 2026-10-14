// WP-15 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §7.3
import { describe, expect, it } from 'vitest';
import { evaluateSimExpression, isTruthy, parseSimExpression } from './simExpression';

const ev = (src: string, env: Record<string, number> = {}) => {
  const p = parseSimExpression(src);
  if (!p.ok) throw new Error(`parse failed: ${p.error} at ${p.at}`);
  return evaluateSimExpression(p.ast, env);
};
const err = (src: string) => {
  const p = parseSimExpression(src);
  if (p.ok) throw new Error(`expected a parse error for ${src}`);
  return p;
};

describe('parseSimExpression', () => {
  it('parses the user case x == 1 and lists its aliases', () => {
    const p = parseSimExpression('x == 1');
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.aliases).toEqual(['x']);
  });

  it('lists distinct aliases in first-appearance order', () => {
    const p = parseSimExpression('b > a && abs(a - c) <= 0.5 || b');
    expect(p.ok && p.aliases).toEqual(['b', 'a', 'c']);
  });

  it('accepts number formats', () => {
    expect(ev('12')).toBe(12);
    expect(ev('1.5')).toBe(1.5);
    expect(ev('.5')).toBe(0.5);
    expect(ev('1e-3')).toBe(0.001);
    expect(ev('2.5E+2')).toBe(250);
  });

  it('reports errors with a position', () => {
    expect(err('').at).toBe(0);
    expect(err('x ==').at).toBe(4);
    expect(err('x == 1 )').at).toBe(7);
    expect(err('(x == 1').error).toMatch(/\)/);
    expect(err('x # 1').at).toBe(2);
  });

  it('explains single = & |', () => {
    expect(err('x = 1').error).toMatch(/==/);
    expect(err('a & b').error).toMatch(/&&/);
    expect(err('a | b').error).toMatch(/\|\|/);
  });

  it('rejects unknown functions and wrong arity', () => {
    expect(err('sqrt(x)').error).toMatch(/sqrt/);
    expect(err('abs(x, y)').error).toMatch(/abs/);
    expect(err('min(x)').error).toMatch(/min/);
  });

  it('does not treat reserved words as aliases', () => {
    const p = parseSimExpression('true && x || false');
    expect(p.ok && p.aliases).toEqual(['x']);
    expect(err('abs > 1').error).toMatch(/abs/);
  });
});

describe('evaluateSimExpression', () => {
  it('evaluates comparisons and booleans as 1/0', () => {
    expect(ev('x == 1', { x: 1 })).toBe(1);
    expect(ev('x == 1', { x: 0 })).toBe(0);
    expect(ev('x != 1', { x: 0 })).toBe(1);
    expect(ev('true')).toBe(1);
    expect(ev('false')).toBe(0);
    expect(ev('!x', { x: 0 })).toBe(1);
    expect(ev('!x', { x: 3 })).toBe(0);
  });

  it('uses the documented precedence', () => {
    expect(ev('1 + 2 * 3')).toBe(7);
    expect(ev('(1 + 2) * 3')).toBe(9);
    expect(ev('1 - -2')).toBe(3);
    expect(ev('-2 * -3')).toBe(6);
    expect(ev('8 / 2 / 2')).toBe(2);
    expect(ev('10 - 4 - 3')).toBe(3);
    expect(ev('1 < 2 == 1')).toBe(1);
    expect(ev('0 || 1 && 0')).toBe(0);
    expect(ev('1 || 0 && 0')).toBe(1);
    expect(ev('!0 && 0')).toBe(0);
  });

  it('evaluates ranges, functions and mixed logic', () => {
    const band = 'dT >= 50 && dT <= 70';
    expect(ev(band, { dT: 50 })).toBe(1);
    expect(ev(band, { dT: 70.0001 })).toBe(0);
    expect(ev('abs(y - 5) <= 0.1', { y: 4.95 })).toBe(1);
    expect(ev('min(a, b, 3)', { a: 7, b: 4 })).toBe(3);
    expect(ev('max(a, b)', { a: -1, b: -4 })).toBe(-1);
    expect(ev('!(a > b) || c', { a: 2, b: 1, c: 0 })).toBe(0);
  });

  it('is exact for ==', () => {
    expect(ev('x == 0.3', { x: 0.1 + 0.2 })).toBe(0);
  });

  it('never turns a non-finite operand into a silent false', () => {
    for (const src of ['x > 1', 'x == x', '!x', 'x && 1', 'x || 1', '1 / y > 0']) {
      expect(Number.isNaN(ev(src, { x: Number.NaN, y: 0 }))).toBe(true);
    }
    expect(Number.isNaN(ev('x > 1', { x: Number.POSITIVE_INFINITY }))).toBe(true);
  });

  it('throws on an alias missing from the environment', () => {
    const p = parseSimExpression('x > 1');
    if (!p.ok) throw new Error('parse');
    expect(() => evaluateSimExpression(p.ast, {})).toThrow(/x/);
  });

  it('isTruthy is "not zero"', () => {
    expect(isTruthy(1)).toBe(true);
    expect(isTruthy(-0.5)).toBe(true);
    expect(isTruthy(0)).toBe(false);
  });
});
