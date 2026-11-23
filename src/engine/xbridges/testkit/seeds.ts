/**
 * Seed selection for the random-graph suites (WP-22 nightly rotation).
 *
 * Default (XBV_SEED_BASE unset or empty): the fixed seeds the suite was written with, so push and PR runs are
 * unchanged. With XBV_SEED_BASE=<n> (a non-negative safe integer): the same number of seeds, n, n+1, ..., n+count-1.
 * The nightly workflow sets n from the run date, so every night covers a new window of graphs, and a failure is
 * reproduced locally with XBV_SEED_BASE=<n> (the failing seed is in the test title and the assertion message).
 */
export const SEED_BASE_ENV = 'XBV_SEED_BASE';

/** The inclusive integer range first..last as a seed list (the fixed default seeds of a suite). */
export function seedRange(first: number, last: number): number[] {
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last < first) {
    throw new Error(`seedRange: invalid range ${first}..${last}`);
  }
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/**
 * The seed list for a suite. `defaultSeeds` are the fixed seeds; the returned list has the same length. Invalid
 * XBV_SEED_BASE values throw instead of falling back, so a typo in the workflow cannot silently run the wrong seeds.
 */
export function seedsFromEnv(
  defaultSeeds: readonly number[],
  env: Record<string, string | undefined> = process.env,
): number[] {
  const raw = env[SEED_BASE_ENV];
  if (raw === undefined || raw.trim() === '') return [...defaultSeeds];
  const text = raw.trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(`${SEED_BASE_ENV} must be a non-negative integer, got '${raw}'`);
  }
  const base = Number(text);
  const last = base + defaultSeeds.length - 1;
  if (!Number.isSafeInteger(base) || !Number.isSafeInteger(last)) {
    throw new Error(`${SEED_BASE_ENV} ${text} is outside the safe integer range`);
  }
  return Array.from({ length: defaultSeeds.length }, (_, i) => base + i);
}
