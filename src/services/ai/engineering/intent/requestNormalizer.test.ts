import { describe, it, expect } from 'vitest';
import { RequestNormalizer } from './requestNormalizer';

describe('RequestNormalizer', () => {
  const normalizer = new RequestNormalizer();

  it('normalizes whitespace, punctuation, and casing deterministically', () => {
    const input = '   ADD    10,  and   20!   ';
    const result = normalizer.normalize(input);

    expect(result.originalText).toBe(input);
    expect(result.normalizedText).toBe('add 10 and 20');
    expect(result.tokens).toEqual(['add', '10', 'and', '20']);
  });

  it('corrects bounded typos in common operations and components', () => {
    // creat -> create, multiblying -> multiplying, cnstant -> constant, transfer functoin -> transfer function
    const input = 'creat a cnstant and multiblying it by 5, then show on a scop';
    const result = normalizer.normalize(input);

    expect(result.normalizedText).toBe('create a constant and multiplying it by 5, then show on a scope');
    expect(result.correctionsApplied).toContainEqual({
      original: 'creat',
      corrected: 'create',
      category: 'operation'
    });
    expect(result.correctionsApplied).toContainEqual({
      original: 'cnstant',
      corrected: 'constant',
      category: 'component'
    });
    expect(result.correctionsApplied).toContainEqual({
      original: 'multiblying',
      corrected: 'multiplying',
      category: 'operation'
    });
    expect(result.correctionsApplied).toContainEqual({
      original: 'scop',
      corrected: 'scope',
      category: 'observability'
    });
  });

  it('normalizes common number words to digits while preserving count context', () => {
    const input = 'add two numbers: five and ten';
    const result = normalizer.normalize(input);

    // Number words converted to digits: five -> 5, ten -> 10, two -> 2
    expect(result.normalizedText).toBe('add 2 numbers: 5 and 10');
  });

  it('normalizes unit spellings and abbreviations', () => {
    const input = 'set voltage to 24 volts and resistance to 100 ohms';
    const result = normalizer.normalize(input);

    expect(result.normalizedText).toBe('set voltage to 24 V and resistance to 100 ohm');
  });

  it('ensures normalization is strictly idempotent: normalize(normalize(x)) === normalize(x)', () => {
    const testCases = [
      'creat a cnstant and multiblying it',
      'Add 10 and 20',
      'Design a bldc motor with foc and hall sensor',
      'Transfer function 1 / (s + 1)',
      'show output on scope'
    ];

    for (const tc of testCases) {
      const firstPass = normalizer.normalize(tc);
      const secondPass = normalizer.normalize(firstPass.normalizedText);

      expect(secondPass.normalizedText).toBe(firstPass.normalizedText);
      expect(secondPass.tokens).toEqual(firstPass.tokens);
    }
  });

  it('keeps corrections strictly bounded to explicit dictionary; unknown words remain untouched', () => {
    const input = 'synthesize a supercalifragilistic tachyon flux loop';
    const result = normalizer.normalize(input);

    expect(result.normalizedText).toContain('supercalifragilistic');
    expect(result.normalizedText).toContain('tachyon');
    expect(result.normalizedText).toContain('flux');
    expect(result.correctionsApplied).toHaveLength(0);
  });
});
