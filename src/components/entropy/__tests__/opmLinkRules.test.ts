import { describe, test, expect } from 'vitest';
import { validateOpmConnection } from '../OpmLinkRules';

describe('OpmLinkRules — ISO 19450 connection rules', () => {
  test('agent/instrument connect object → process only', () => {
    expect(validateOpmConnection('agent', 'object', 'process').allowed).toBe(true);
    expect(validateOpmConnection('instrument', 'object', 'process').allowed).toBe(true);
    expect(validateOpmConnection('agent', 'process', 'object').allowed).toBe(false);
    expect(validateOpmConnection('instrument', 'object', 'object').allowed).toBe(false);
  });

  test('consumption connects object/state → process', () => {
    expect(validateOpmConnection('consumption', 'object', 'process').allowed).toBe(true);
    expect(validateOpmConnection('consumption', 'state', 'process').allowed).toBe(true);
    expect(validateOpmConnection('consumption', 'process', 'object').allowed).toBe(false);
    expect(validateOpmConnection('consumption', 'object', 'state').allowed).toBe(false);
  });

  test('result connects process → object/state', () => {
    expect(validateOpmConnection('result', 'process', 'object').allowed).toBe(true);
    expect(validateOpmConnection('result', 'process', 'state').allowed).toBe(true);
    expect(validateOpmConnection('result', 'object', 'process').allowed).toBe(false);
  });

  test('effect connects process and object/state in either direction', () => {
    expect(validateOpmConnection('effect', 'process', 'object').allowed).toBe(true);
    expect(validateOpmConnection('effect', 'state', 'process').allowed).toBe(true);
    expect(validateOpmConnection('effect', 'object', 'object').allowed).toBe(false);
  });

  test('trigger/condition connect state (or object) → process', () => {
    expect(validateOpmConnection('trigger', 'state', 'process').allowed).toBe(true);
    expect(validateOpmConnection('condition', 'object', 'process').allowed).toBe(true);
    expect(validateOpmConnection('trigger', 'process', 'object').allowed).toBe(false);
  });

  test('structural links connect two objects', () => {
    expect(validateOpmConnection('aggregation', 'object', 'object').allowed).toBe(true);
    expect(validateOpmConnection('generalization', 'object', 'object').allowed).toBe(true);
    expect(validateOpmConnection('exhibition', 'object', 'object').allowed).toBe(true);
    expect(validateOpmConnection('aggregation', 'object', 'process').allowed).toBe(false);
  });

  test('satisfies/verifies connect requirement → object/process', () => {
    expect(validateOpmConnection('satisfies', 'requirement', 'object').allowed).toBe(true);
    expect(validateOpmConnection('verifies', 'requirement', 'process').allowed).toBe(true);
    expect(validateOpmConnection('satisfies', 'object', 'requirement').allowed).toBe(false);
  });

  test('rejected verdicts carry a human-readable reason', () => {
    const v = validateOpmConnection('agent', 'process', 'object');
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain('Agent');
  });
});
