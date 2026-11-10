/**
 * WP-01 — catalogue closure: palettes, factories, code-generation registry, help and port well-formedness agree.
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md (sections 1 F6/F7, 2 V1, 4.1 U1).
 *
 * Gaps that exist today are pinned, never skipped: each is a ratchet list in tests/fixtures/xbridges/known-gaps.json
 * keyed by its ledger finding. The actual list must equal the pinned one, so a new gap cannot appear unnoticed and a
 * fixed gap must be removed from the list (the closing condition of the finding is an empty list).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY, XBRIDGES_CATEGORIES } from '../BlockDefinitions';
import { XBRIDGES_CATEGORIES as HELP_CATEGORIES } from '../../../utils/xbridges/XbridgesLibrary';
import { XB_CAPABILITIES } from '../../../utils/stateMachine/xbCapabilities';
import { getBlockHelpReferences } from '../../../help/blockReference';

const TYPES = Object.keys(BLOCK_LIBRARY).sort();
const make = (type: string) => BLOCK_LIBRARY[type]('catalog', {});
const paletteTypes = (categories: unknown): string[] =>
  [...new Set((categories as { blocks?: { type: string }[] }[]).flatMap((c) => (c.blocks ?? []).map((b) => b.type)))].sort();
const CANVAS = paletteTypes(XBRIDGES_CATEGORIES);
const HELP = paletteTypes(HELP_CATEGORIES);

/** The declared port signal types (src/engine/xbridges/types.ts, XSignalType). */
const DECLARED_SIGNAL_TYPES = new Set([
  'continuous', 'discrete', 'logical', 'vector', 'matrix', 'bit_array', 'power', 'measurement', 'transform', 'auto',
]);

const gaps = JSON.parse(readFileSync(join(__dirname, '../../../../tests/fixtures/xbridges/known-gaps.json'), 'utf8')) as Record<string, string[]>;

describe('palettes and factories', () => {
  it('every canvas palette entry has a factory', () => {
    expect(CANVAS.filter((t) => typeof BLOCK_LIBRARY[t] !== 'function')).toEqual([]);
  });

  it('every help/AI palette entry has a factory', () => {
    expect(HELP.filter((t) => typeof BLOCK_LIBRARY[t] !== 'function')).toEqual([]);
  });

  it('XBV-007: types on only one of the two palettes are exactly the pinned lists', () => {
    expect(CANVAS.filter((t) => !HELP.includes(t))).toEqual(gaps['XBV-007 types only on the canvas palette']);
    expect(HELP.filter((t) => !CANVAS.includes(t))).toEqual(gaps['XBV-007 types only on the help palette']);
  });

  it('every factory builds a block whose type is its library key', () => {
    expect(TYPES.filter((t) => make(t).type !== t)).toEqual([]);
  });

  it('every library block has a help reference', () => {
    const help = new Set(getBlockHelpReferences().filter((r) => r.source === 'X-Bridges').map((r) => r.typeId));
    expect(TYPES.filter((t) => !help.has(t))).toEqual([]);
  });
});

describe('code-generation registry closure (XBV-006)', () => {
  it('XBV-006: capability entries without a factory are exactly the pinned list', () => {
    expect(Object.keys(XB_CAPABILITIES).filter((t) => typeof BLOCK_LIBRARY[t] !== 'function').sort())
      .toEqual(gaps['XBV-006 capability entries without a factory']);
  });

  it('XBV-006: factories without their own XB_CAPABILITIES entry are exactly the pinned list', () => {
    expect(TYPES.filter((t) => !Object.prototype.hasOwnProperty.call(XB_CAPABILITIES, t)))
      .toEqual(gaps['XBV-006 factories without a capability entry']);
  });

  it('every capability that is not codegen-capable states a reason', () => {
    const missing = Object.entries(XB_CAPABILITIES).filter(([, c]) => !c.codegen && !(c.reason ?? '').trim()).map(([t]) => t);
    expect(missing).toEqual([]);
  });
});

describe('port well-formedness (U1)', () => {
  it.each(TYPES)('%s: ports have id, name, the right direction, and unique ids per direction', (type) => {
    const b = make(type);
    for (const [list, direction] of [[b.inputs, 'input'], [b.outputs, 'output']] as const) {
      for (const p of list) {
        expect(p.id, `${type} port id`).toMatch(/\S/);
        expect(p.name, `${type}.${p.id} name`).toMatch(/\S/);
        expect(p.direction, `${type}.${p.id} direction`).toBe(direction);
      }
      expect(new Set(list.map((p) => p.id)).size, `${type} duplicate ${direction} ids`).toBe(list.length);
    }
  });
});

describe('ratchets (tests/fixtures/xbridges/known-gaps.json)', () => {
  it('XBV-012: blocks without equation text are exactly the pinned list', () => {
    expect(TYPES.filter((t) => !make(t).equation)).toEqual(gaps['XBV-012 blocks without equation text']);
  });

  it('XBV-013: blocks with a port without a unit are exactly the pinned list', () => {
    const actual = TYPES.filter((t) => { const b = make(t); return [...b.inputs, ...b.outputs].some((p) => !p.unit); });
    expect(actual).toEqual(gaps['XBV-013 blocks with a port without a unit']);
  });

  it('XBV-014: blocks with a port type outside XSignalType are exactly the pinned list', () => {
    const actual = TYPES.filter((t) => { const b = make(t); return [...b.inputs, ...b.outputs].some((p) => !DECLARED_SIGNAL_TYPES.has(p.type)); });
    expect(actual).toEqual(gaps['XBV-014 blocks with a port type outside XSignalType']);
  });
});
