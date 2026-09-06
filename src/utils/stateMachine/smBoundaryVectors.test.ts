import { describe, expect, it } from 'vitest';
import {
  invalidIndexValues,
  mcdcVectors,
  relationalBoundaryValues,
  timingBoundaryValues,
} from './smBoundaryVectors';

describe('smBoundaryVectors', () => {
  describe('timingBoundaryValues', () => {
    it('generates five canonical boundary values for tick 500 and tolerance 50', () => {
      expect(timingBoundaryValues(500, 50)).toEqual([
        { deltaMs: 449, accepted: false },
        { deltaMs: 450, accepted: true },
        { deltaMs: 500, accepted: true },
        { deltaMs: 550, accepted: true },
        { deltaMs: 551, accepted: false },
      ]);
    });

    it('handles zero tolerance strictly', () => {
      expect(timingBoundaryValues(100, 0)).toEqual([
        { deltaMs: 99, accepted: false },
        { deltaMs: 100, accepted: true },
        { deltaMs: 101, accepted: false },
      ]);
    });

    it('handles unsigned-zero lower bound when tick equals tolerance', () => {
      // 10ms tick, 10ms tolerance: lower bound is 0ms (accepted).
      // Delta below 0 cannot be negative in unsigned ms; deltaMs: 0 is accepted.
      const vectors = timingBoundaryValues(10, 10);
      expect(vectors.some((v) => v.deltaMs === 0 && v.accepted === true)).toBe(true);
      expect(vectors.every((v) => v.deltaMs >= 0)).toBe(true);
      expect(vectors).toEqual([
        { deltaMs: 0, accepted: true },
        { deltaMs: 10, accepted: true },
        { deltaMs: 20, accepted: true },
        { deltaMs: 21, accepted: false },
      ]);
    });
  });

  describe('relationalBoundaryValues', () => {
    it('generates below, at, and above values for integer < operator', () => {
      const result = relationalBoundaryValues('<', 10, 'int');
      expect(result).toEqual([
        { value: 9, outcome: true, role: 'below' },
        { value: 10, outcome: false, role: 'boundary' },
        { value: 11, outcome: false, role: 'above' },
      ]);
    });

    it('generates below, at, and above values for integer <= operator', () => {
      const result = relationalBoundaryValues('<=', 10, 'int');
      expect(result).toEqual([
        { value: 9, outcome: true, role: 'below' },
        { value: 10, outcome: true, role: 'boundary' },
        { value: 11, outcome: false, role: 'above' },
      ]);
    });

    it('generates below, at, and above values for integer > operator', () => {
      const result = relationalBoundaryValues('>', 10, 'int');
      expect(result).toEqual([
        { value: 9, outcome: false, role: 'below' },
        { value: 10, outcome: false, role: 'boundary' },
        { value: 11, outcome: true, role: 'above' },
      ]);
    });

    it('generates below, at, and above values for integer >= operator', () => {
      const result = relationalBoundaryValues('>=', 10, 'int');
      expect(result).toEqual([
        { value: 9, outcome: false, role: 'below' },
        { value: 10, outcome: true, role: 'boundary' },
        { value: 11, outcome: true, role: 'above' },
      ]);
    });

    it('generates equality values for integer == operator', () => {
      const result = relationalBoundaryValues('==', 10, 'int');
      expect(result).toEqual([
        { value: 9, outcome: false, role: 'below' },
        { value: 10, outcome: true, role: 'boundary' },
        { value: 11, outcome: false, role: 'above' },
      ]);
    });

    it('generates inequality values for integer != operator', () => {
      const result = relationalBoundaryValues('!=', 10, 'int');
      expect(result).toEqual([
        { value: 9, outcome: true, role: 'below' },
        { value: 10, outcome: false, role: 'boundary' },
        { value: 11, outcome: true, role: 'above' },
      ]);
    });

    it('generates float boundaries with eps precision', () => {
      const result = relationalBoundaryValues('<', 2.5, 'float');
      expect(result.length).toBe(3);
      expect(result[0].role).toBe('below');
      expect(result[0].outcome).toBe(true);
      expect(result[1].role).toBe('boundary');
      expect(result[1].outcome).toBe(false);
      expect(result[2].role).toBe('above');
      expect(result[2].outcome).toBe(false);
    });
  });

  describe('invalidIndexValues', () => {
    it('produces boundary and out-of-range indices for array length N', () => {
      const indices = invalidIndexValues(5);
      expect(indices).toEqual([-1, 5, 6, 0xffff, 0xffffffff]);
    });

    it('handles zero valid count', () => {
      const indices = invalidIndexValues(0);
      expect(indices).toEqual([-1, 0, 1, 0xffff, 0xffffffff]);
    });
  });

  describe('mcdcVectors', () => {
    it('synthesizes independent condition pairs for conjunction (a && b)', () => {
      const pairs = mcdcVectors('a && b', ['a', 'b']);
      expect(pairs).toHaveLength(2);

      // Pair for condition 'a'
      const pairA = pairs.find((p) => p.condition === 'a');
      expect(pairA).toBeDefined();
      expect(pairA!.trueVector.assignments).toEqual({ a: true, b: true });
      expect(pairA!.trueVector.decisionOutcome).toBe(true);
      expect(pairA!.falseVector.assignments).toEqual({ a: false, b: true });
      expect(pairA!.falseVector.decisionOutcome).toBe(false);

      // Pair for condition 'b'
      const pairB = pairs.find((p) => p.condition === 'b');
      expect(pairB).toBeDefined();
      expect(pairB!.trueVector.assignments).toEqual({ a: true, b: true });
      expect(pairB!.trueVector.decisionOutcome).toBe(true);
      expect(pairB!.falseVector.assignments).toEqual({ a: true, b: false });
      expect(pairB!.falseVector.decisionOutcome).toBe(false);
    });

    it('synthesizes independent condition pairs for disjunction (a || b)', () => {
      const pairs = mcdcVectors('a || b', ['a', 'b']);
      expect(pairs).toHaveLength(2);

      const pairA = pairs.find((p) => p.condition === 'a');
      expect(pairA).toBeDefined();
      expect(pairA!.trueVector.decisionOutcome).toBe(true);
      expect(pairA!.falseVector.decisionOutcome).toBe(false);

      const pairB = pairs.find((p) => p.condition === 'b');
      expect(pairB).toBeDefined();
      expect(pairB!.trueVector.decisionOutcome).toBe(true);
      expect(pairB!.falseVector.decisionOutcome).toBe(false);
    });

    it('throws SM_MCDC_VECTOR_UNRESOLVED when obligations cannot be synthesized instead of fabricating coverage', () => {
      // Contradictory or unresolvable expression e.g. coupled identical conditions
      expect(() => mcdcVectors('a && !a', ['a'])).toThrow('SM_MCDC_VECTOR_UNRESOLVED');
    });
  });
});
