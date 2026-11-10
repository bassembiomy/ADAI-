/**
 * WP-03 — universal corner-case battery (plan section 4.1), run on every block of BLOCK_LIBRARY.
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md.
 *
 * Part A covers U1, U2, U3, U4, U5, U7 (engine and factory level), U9, U10, U11 and U14. U6 (shapes), U8 (enums), U12 (reset), U13 (long runs),
 * U15 (dynamic ports) and U16 (names) follow in WP-03b.
 *
 * Every case computes, for all blocks, the list of blocks that break the rule. The list must equal the one pinned in
 * tests/fixtures/xbridges/universal-gaps.json under the case's finding id: a new failure fails the test, and a fixed
 * block must be removed from the list (the finding closes when its list is empty). Pinned entries are triaged: each
 * is a product defect, never a test artefact.
 *
 * Print the actual lists (for triage, never to update the fixture blindly):
 *   XBV_PRINT=<file> npx vitest run src/engine/xbridges/verification/xbUniversal.test.ts
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import type { XBlock } from '../types';
import { buildModel, mulberry32, runModel } from '../testkit';
import { parameterKind } from '../parameterSchema';
import { evaluateParameter } from '../parameterEvaluation';

const TYPES = Object.keys(BLOCK_LIBRARY).sort();
const make = (type: string, params: Record<string, unknown> = {}): XBlock => BLOCK_LIBRARY[type]('u', params);

const PINNED = JSON.parse(readFileSync(join(__dirname, '../../../../tests/fixtures/xbridges/universal-gaps.json'), 'utf8')) as Record<string, string[]>;

const pin = (key: string, actual: string[]) => {
  const sorted = [...new Set(actual)].sort();
  if (process.env.XBV_PRINT) appendFileSync(process.env.XBV_PRINT, `${JSON.stringify({ [key]: sorted })}\n`);
  expect(PINNED[key], `missing pinned list '${key}'`).toBeDefined();
  expect(sorted).toEqual(PINNED[key]);
};

/** All numbers inside a value (scalars, arrays, matrices, buses); booleans count as 0/1. */
const numbersIn = (v: unknown, out: number[] = []): number[] => {
  if (typeof v === 'number') out.push(v);
  else if (typeof v === 'boolean') out.push(v ? 1 : 0);
  else if (Array.isArray(v)) v.forEach((x) => numbersIn(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => numbersIn(x, out));
  return out;
};

/** Deep equality that treats NaN as equal to NaN and ignores functions. */
const sameValue = (a: unknown, b: unknown): boolean => {
  if (typeof a === 'function' && typeof b === 'function') return true;
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)) || a === b;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).filter((k) => typeof (a as any)[k] !== 'function').sort();
    const kb = Object.keys(b).filter((k) => typeof (b as any)[k] !== 'function').sort();
    return sameValue(ka, kb) && ka.every((k) => sameValue((a as any)[k], (b as any)[k]));
  }
  return a === b;
};

/** structuredClone that tolerates functions (they are dropped, like a worker snapshot would). */
const snapshot = <T>(v: T): T => {
  try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v ?? null)) as T; }
};

interface Exec { threw: string | null; outputs: unknown[]; nextState: unknown; error?: string; diagnostic?: string }
const exec = (b: XBlock, inputs: unknown[], state: unknown, t: number): Exec => {
  try {
    const r = b.execute(inputs as never, b.params, state, t);
    return { threw: null, outputs: r?.outputs ?? [], nextState: r?.nextState === undefined ? state : r.nextState, error: r?.error, diagnostic: r?.diagnostic?.code };
  } catch (e) {
    return { threw: String((e as Error)?.message ?? e), outputs: [], nextState: state };
  }
};

/** Runs n steps of execute with inputs u(k) per port, threading the state like the engine's discrete path. */
const trajectory = (b: XBlock, n: number, u: (k: number, port: number) => unknown, dt = 0.01, onStep?: (k: number, s: unknown) => unknown) => {
  let state = b.state;
  const outs: unknown[] = [];
  for (let k = 0; k < n; k++) {
    if (onStep) state = onStep(k, state);
    const r = exec(b, b.inputs.map((_, i) => u(k, i)), state, k * dt);
    if (r.threw) return { threw: r.threw, outs };
    outs.push(r.outputs);
    state = r.nextState;
  }
  return { threw: null as string | null, outs };
};

const FINITE_SPECIALS = [0, -0, 1, -1, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, 1e-300, -1e-300, 1e300, -1e300];
const NON_FINITE = [NaN, Infinity, -Infinity];
/** A ragged nested array is not included: no model can produce one (the parameter parser rejects it). */
const WRONG_KINDS: unknown[] = [true, 'abc', null, undefined, {}, []];
/** Above this magnitude IEEE overflow (Inf - Inf, 0 * Inf) legitimately produces NaN; only the no-throw rule applies. */
const OVERFLOW_RANGE = 1e150;
/** Typed diagnostics with which a block reports a numeric condition itself (types.ts XBlock execute result). */
const BLOCK_NUMERIC_DIAGNOSTICS = new Set(['MATH_DOMAIN_ERROR', 'DIVIDE_BY_ZERO', 'LOGIC_NAN_INPUT', 'NON_FINITE_INPUT']);

/** Runs fn with Math.random replaced by a fixed-seed generator, so randomness cannot masquerade as another defect. */
const seeded = <T>(fn: () => T, seed = 12345): T => {
  const rng = mulberry32(seed);
  const spy = vi.spyOn(Math, 'random').mockImplementation(rng);
  try { return fn(); } finally { spy.mockRestore(); }
};

describe('WP-03 universal battery, part A', () => {
  it('U1: default construction and one execute with unit inputs never throw', () => {
    pin('XBV-U1 throws on default construction or execute', TYPES.filter((t) => {
      try { const b = make(t); return exec(b, b.inputs.map(() => 1), b.state, 0).threw !== null; } catch { return true; }
    }));
  });

  it('U2: a block alone (inputs unconnected) runs 0.2 s of rk4, the canvas default (at least two hits of a 0.1 s sample time) without an exception, an undefined output, or a NaN it does not report', () => {
    pin('XBV-U2 fails alone with unconnected inputs', TYPES.filter((type) => {
      const b = make(type);
      const probes = b.outputs.map((p) => `u.${p.id}`);
      try {
        const r = runModel(buildModel({ blocks: [{ id: 'u', type }], wires: [] }), { solver: 'rk4', dt: 0.001, stopTime: 0.2, probes });
        // A fault or configuration error the block reports itself is a diagnosed stop (Simulink also refuses an
        // unconfigured block). An exception raised inside execute is not.
        const raised = r.diagnostics.some((d) => d.code === 'EXECUTION_EXCEPTION'
          || (d.code === 'BLOCK_RUNTIME_FAULT' && !d.message.includes('reported a runtime fault')));
        if (raised) return true;
        // "Reported" means the block itself flagged the condition: an error, or a typed numeric diagnostic.
        // Connectivity warnings (every lone block has them) and the engine's generic NaN check do not count.
        const reported = r.diagnostics.some((d) => (d.blockIds ?? []).includes('u')
          && (d.severity === 'error' || BLOCK_NUMERIC_DIAGNOSTICS.has(d.code)));
        return probes.some((p) => r.signals[p].some((v) => v === undefined || (!reported && numbersIn(v).some(Number.isNaN))));
      } catch { return true; }
    }));
  }, 120_000);

  it('U3: finite edge inputs never throw, and give no NaN the block does not report (|u| <= 1e150)', () => {
    pin('XBV-U3 throws or silent NaN on finite edge inputs', TYPES.filter((type) => FINITE_SPECIALS.some((v) => {
      const b = make(type);
      const r = exec(b, b.inputs.map(() => v), b.state, 0);
      if (r.threw !== null) return true;
      if (Math.abs(v) > OVERFLOW_RANGE) return false;
      return !r.error && !r.diagnostic && numbersIn(r.outputs).some(Number.isNaN);
    })));
  });

  it('U4: NaN and infinite inputs never throw', () => {
    pin('XBV-U4 throws on NaN or infinite inputs', TYPES.filter((type) => NON_FINITE.some((v) => {
      const b = make(type);
      return exec(b, b.inputs.map(() => v), b.state, 0).threw !== null;
    })));
  });

  it('U5: a wrong value kind on an input never throws (an error result is fine)', () => {
    pin('XBV-U5 throws on a wrong value kind', TYPES.filter((type) => {
      const b = make(type);
      return b.inputs.some((_, port) => WRONG_KINDS.some((w) => {
        const fresh = make(type);
        return exec(fresh, fresh.inputs.map((__, i) => (i === port ? w : 1)), fresh.state, 0).threw !== null;
      }));
    }));
  });

  it('U7: a numeric parameter set to 0 is kept, or rejected with a parameter error — never silently replaced', () => {
    const offenders: string[] = [];
    for (const type of TYPES) {
      const defaults = make(type).params ?? {};
      for (const [param, value] of Object.entries(defaults)) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) continue;
        try {
          const model = buildModel({ blocks: [{ id: 'u', type, params: { [param]: 0 } }], wires: [] });
          const engine = new XbridgesEngine(model);
          engine.compile(0);
          engine.applyParameterUpdates('u', { [param]: 0 });
          const rejected = engine.diagnostics.some((d) => d.severity === 'error' && d.code.startsWith('PARAMETER_') && (d.blockIds ?? []).includes('u'));
          const kept = engine.getBlock('u')?.params?.[param];
          if (!rejected && !(typeof kept === 'number' && kept === 0)) offenders.push(`${type}.${param}`);
        } catch {
          offenders.push(`${type}.${param}`);
        }
      }
    }
    pin('XBV-U7 zero parameter silently replaced', offenders);
  });

  it('U7: the factory keeps a numeric parameter set to 0 unless its schema rejects 0 (the canvas rebuilds blocks through the factory on Play)', () => {
    const offenders: string[] = [];
    for (const type of TYPES) {
      for (const [param, value] of Object.entries(make(type).params ?? {})) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) continue;
        const kind = parameterKind(type, param);
        if (kind && !evaluateParameter(0, kind).ok) continue;
        let kept: unknown;
        try { kept = make(type, { [param]: 0 }).params?.[param]; } catch { kept = 'threw'; }
        if (!(typeof kept === 'number' && kept === 0)) offenders.push(`${type}.${param}`);
      }
    }
    pin('XBV-U7f factory replaces a zero parameter', offenders);
  });

  it('U9: two fresh instances with the same inputs give identical outputs for 50 steps', () => {
    pin('XBV-U9 non-deterministic', TYPES.filter((type) => {
      const u = (k: number, i: number) => Math.sin(0.3 * k + i);
      const a = trajectory(make(type), 50, u);
      const b = trajectory(make(type), 50, u);
      return a.threw === null && b.threw === null && !sameValue(a.outs, b.outs);
    }));
  });

  it('U10: execute does not mutate its inputs, parameters or the incoming state', () => {
    pin('XBV-U10 execute mutates inputs, params or state', TYPES.filter((type) => {
      const b = make(type);
      let state = b.state;
      for (let k = 0; k < 5; k++) {
        const inputs = b.inputs.map((_, i) => Math.cos(k + i));
        const before = { inputs: snapshot(inputs), params: snapshot(b.params), state: snapshot(state) };
        const r = exec(b, inputs, state, k * 0.01);
        if (r.threw) return false;
        if (!sameValue(inputs, before.inputs) || !sameValue(b.params, before.params) || !sameValue(state, before.state)) return true;
        state = r.nextState;
      }
      return false;
    }));
  });

  it('U11: replacing the state by its clone mid-run (worker snapshot, save/reopen) does not change the trajectory', () => {
    pin('XBV-U11 state does not survive a clone', TYPES.filter((type) => {
      const u = (k: number, i: number) => 0.5 + 0.1 * k - i;
      const plain = seeded(() => trajectory(make(type), 20, u));
      const cloned = seeded(() => trajectory(make(type), 20, u, 0.01, (k, s) => (k === 10 ? JSON.parse(JSON.stringify(s ?? null)) ?? s : s)));
      return plain.threw === null && cloned.threw === null && !sameValue(plain.outs, cloned.outs);
    }));
  });

  it('U14: a block the engine treats as non-direct-feedthrough has outputs independent of its current input', () => {
    const nonFeedthrough = TYPES.filter((t) => { const b = make(t); return b.inputs.length > 0 && !(b.directFeedthrough ?? !b.isStateful); });
    pin('XBV-U14 declared non-feedthrough but output depends on the current input', nonFeedthrough.filter((type) => {
      const b = make(type);
      const s = snapshot(b.state);
      const r1 = seeded(() => exec(make(type), b.inputs.map(() => 1), snapshot(s), 0));
      const r2 = seeded(() => exec(make(type), b.inputs.map(() => 7), snapshot(s), 0));
      return r1.threw === null && r2.threw === null && !sameValue(r1.outputs, r2.outputs);
    }));
  });
});

describe('pinned single defects found by the battery', () => {
  // Oracle (closed form, plan 3.1): the space-vector sector of an angle is floor(mod(theta, 2*pi) / (pi/3)) + 1, in 1..6.
  const sectorOf = (theta: number) => Math.floor((((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 3)) + 1;
  it.fails('XBV-025: SECTOR_SELECTOR gives the sector of any angle, including large negative ones', () => {
    for (const theta of [-10, -7]) {
      const b = make('SECTOR_SELECTOR');
      expect(exec(b, [theta], b.state, 0).outputs[0], `theta ${theta}`).toBe(sectorOf(theta));
    }
  });
  it('SECTOR_SELECTOR matches the closed form on (-2*pi, 4*pi) (it is wrong only below -2*pi, XBV-025)', () => {
    for (let theta = -2 * Math.PI + 0.05; theta < 4 * Math.PI; theta += 0.1) {
      const b = make('SECTOR_SELECTOR');
      expect(exec(b, [theta], b.state, 0).outputs[0], `theta ${theta}`).toBe(sectorOf(theta));
    }
  });
});
