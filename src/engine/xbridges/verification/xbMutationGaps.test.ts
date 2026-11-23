/**
 * Tests that close gaps found by the WP-22 mutation run (docs/xbridges-verification/mutation-report.md).
 * Mutant 16: the chatter limit must fire on exactly the (MAX + 1)-th consecutive crossing at the same time (Simulink's
 * "Number of consecutive zero crossings" limit: the error is raised when the count exceeds the limit).
 */
import { describe, expect, it } from 'vitest';
import { ConsecutiveCrossings, MAX_CONSECUTIVE_ZERO_CROSSINGS } from '../zeroCrossingGuard';

describe('chatter limit boundary (mutant 16)', () => {
  it(`${MAX_CONSECUTIVE_ZERO_CROSSINGS} crossings at the same time are allowed; the next one exceeds the limit`, () => {
    const c = new ConsecutiveCrossings();
    for (let i = 1; i <= MAX_CONSECUTIVE_ZERO_CROSSINGS; i++) expect(c.note(1.5, 1e-12), `crossing ${i}`).toBe(false);
    expect(c.note(1.5, 1e-12)).toBe(true);
  });
  it('a crossing outside the window restarts the count', () => {
    const c = new ConsecutiveCrossings();
    for (let i = 1; i <= MAX_CONSECUTIVE_ZERO_CROSSINGS; i++) c.note(1.5, 1e-12);
    expect(c.note(2.5, 1e-12)).toBe(false);
    for (let i = 2; i <= MAX_CONSECUTIVE_ZERO_CROSSINGS; i++) expect(c.note(2.5, 1e-12)).toBe(false);
    expect(c.note(2.5, 1e-12)).toBe(true);
  });
  it('the window scales with |t| (128 eps |t|) and with the location tolerance (10 tol)', () => {
    const c = new ConsecutiveCrossings();
    c.note(1e6, 1e-12);
    // 128 eps 1e6 = 2.8e-8: a crossing 1e-8 later is in the same window, 1e-7 later is not
    c.note(1e6 + 1e-8, 1e-12);
    for (let i = 3; i <= MAX_CONSECUTIVE_ZERO_CROSSINGS; i++) c.note(1e6 + 1e-8, 1e-12);
    expect(c.note(1e6 + 1e-8, 1e-12)).toBe(true);
    const d = new ConsecutiveCrossings();
    d.note(1, 1e-6);
    expect(d.note(1 + 5e-6, 1e-6)).toBe(false); // within 10 tol = 1e-5: count 2
    expect(d.note(1 + 5e-5, 1e-6)).toBe(false); // outside: count restarts at 1
  });
});
