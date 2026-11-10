/**
 * WP-01 / gate V1 — contract snapshot of every X-Bridges block.
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md (section 2, V1).
 *
 * The contract of a block is what a model, the properties panel, the code generator and the state-machine mappings
 * rely on: ports (id, name, direction, order, type, unit, dimensions, position, data type, frame, sample rate, initial
 * value), parameter names with their default values, the initial state (shape and value), and the execution flags. Any change to it must be
 * deliberate: it shows up as a diff of tests/fixtures/xbridges/contracts.json and is reviewed like code.
 *
 * Regenerate after a reviewed, intended change only:
 *   npx vitest run src/engine/xbridges/verification/xbContract.test.ts -u
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import type { XPort } from '../types';

/** FNV-1a 32-bit, hex: a short stable fingerprint for long default values (lookup tables, maps). */
const fnv1a = (text: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

/** JSON text of a value with functions dropped and object keys sorted, so the fingerprint does not depend on key order. */
const stableJson = (value: unknown): string => JSON.stringify(value, (_k, v) => {
  if (typeof v === 'function') return undefined;
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]));
  }
  return v;
}) ?? 'undefined';

const kindOf = (v: unknown): string => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

const defaultOf = (v: unknown): unknown => {
  const text = stableJson(v);
  return text.length <= 160 ? { kind: kindOf(v), value: JSON.parse(text === 'undefined' ? 'null' : text) }
    : { kind: kindOf(v), length: text.length, fnv1a: fnv1a(text) };
};

const portOf = (p: XPort) => ({
  id: p.id,
  name: p.name,
  direction: p.direction,
  type: p.type,
  unit: p.unit ?? null,
  dimensions: p.dimensions ?? null,
  position: p.position ?? null,
  dataType: p.dataType ?? null,
  frame: p.frame ?? null,
  sampleRate: p.sampleRate ?? null,
  initialValue: defaultOf(p.value),
});

const stateShapeOf = (state: unknown): unknown => {
  if (state === undefined || state === null) return null;
  if (Array.isArray(state)) return { kind: 'array', length: state.length };
  if (typeof state === 'object') return { kind: 'object', keys: Object.keys(state as object).sort() };
  return { kind: typeof state };
};

export const contractOf = (type: string, id = 'contract') => {
  const b = BLOCK_LIBRARY[type](id, {});
  return {
    type: b.type,
    inputs: b.inputs.map(portOf),
    outputs: b.outputs.map(portOf),
    parameters: Object.fromEntries(Object.keys(b.params ?? {}).sort().map((k) => [k, defaultOf(b.params[k])])),
    state: stateShapeOf(b.state),
    initialState: defaultOf(b.state),
    flags: {
      isStateful: Boolean(b.isStateful),
      directFeedthrough: b.directFeedthrough ?? null,
      allowDynamicInputs: Boolean(b.allowDynamicInputs),
      allowDynamicOutputs: Boolean(b.allowDynamicOutputs),
      evaluateDerivatives: Boolean(b.evaluateDerivatives),
      updateDiscrete: Boolean(b.updateDiscrete),
      discreteStateKeys: b.discreteStateKeys ?? null,
      zeroCrossing: Boolean(b.ZeroCrossingFn),
    },
  };
};

const TYPES = Object.keys(BLOCK_LIBRARY).sort();

describe('V1 contract snapshot', () => {
  it('default construction is deterministic and independent of the block id', () => {
    for (const type of TYPES) expect(contractOf(type, 'blockA'), type).toEqual(contractOf(type, 'other_block_2'));
  });

  it('every library block matches tests/fixtures/xbridges/contracts.json', async () => {
    const all = Object.fromEntries(TYPES.map((t) => [t, contractOf(t)]));
    await expect(`${JSON.stringify(all, null, 1)}\n`).toMatchFileSnapshot('../../../../tests/fixtures/xbridges/contracts.json');
  });
});
