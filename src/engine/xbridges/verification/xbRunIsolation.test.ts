/**
 * WP-21 batch R acceptance (controller), XBV-188: a block keeps no state between runs. Simulink: every run starts from the
 * block's initial conditions; nothing carries over from an earlier simulation. For every BLOCK_LIBRARY type, a fresh
 * instance driven by its port default inputs for 8 evaluations gives the same outputs and states as a second fresh
 * instance created after the first one ran (Math.random replaced by the same seeded sequence for both runs).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';

const lcg = () => { let s = 12345; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; };
const clone = (v: unknown) => { try { return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x))); } catch { return '<unserialisable>'; } };

const run = (type: string) => {
  vi.spyOn(Math, 'random').mockImplementation(lcg());
  const trace: unknown[] = [];
  try {
    const b = BLOCK_LIBRARY[type](`iso_${type}`, {});
    const ins = (b.inputs ?? []).map((p: { value?: unknown }) => p.value);
    let state = b.state;
    for (let k = 0; k < 8; k++) {
      const r = b.execute(ins as never, b.params, state, k * 0.01) as { outputs?: unknown; newState?: unknown } | undefined;
      if (r && r.newState !== undefined) state = r.newState;
      trace.push(clone({ out: r?.outputs, state }));
    }
  } catch (err) {
    trace.push(`threw: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    vi.restoreAllMocks();
  }
  return trace;
};

describe('XBV-188: no block keeps state from an earlier run', () => {
  afterEach(() => vi.restoreAllMocks());
  const types = Object.keys(BLOCK_LIBRARY).filter((t) => typeof BLOCK_LIBRARY[t] === 'function').sort();
  it('every type: a second fresh run equals the first', () => {
    const differ: string[] = [];
    for (const t of types) {
      const a = run(t);
      const b = run(t);
      if (JSON.stringify(a) !== JSON.stringify(b)) differ.push(t);
    }
    expect(differ).toEqual([]);
  }, 120_000);
});

// XBV-188 root cause (WP-21 batch R): the twin grid mode is module-level run state. A lidar hit or pose outside the 6 m house
// latches the 12 m MATLAB map for the rest of the run; a new run (engine compile) must start from the house map again.
import { getTwinGridCoords } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { buildModel } from '../testkit';
describe('XBV-188: the twin grid mode does not carry over to the next run', () => {
  it('a point outside the house latches the 12 m map in one run; after compiling a new run (1, 1) maps to the 6 m house cell again', () => {
    expect(getTwinGridCoords(1, 1).col).toBe(Math.floor(((1 + 3) / 6) * 30)); // house: col 20
    getTwinGridCoords(5, 5); // outside the house: latches the MATLAB map
    expect(getTwinGridCoords(1, 1).col).toBe(Math.floor(((1 + 6) / 12) * 30)); // MATLAB map: col 17
    new XbridgesEngine(buildModel({ blocks: [{ id: 'c', type: 'Constant' }], wires: [] })).compile(0);
    expect(getTwinGridCoords(1, 1).col).toBe(20);
  });
});
