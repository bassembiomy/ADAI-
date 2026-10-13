import { describe, expect, it } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { DAEAssembler } from '../../engine/vlab/DAEAssembler';
import { VLabPhysicsEngine } from '../../engine/vlab/vlabPhysics';
import { numericParam } from '../../engine/vlab/vlabParams';
import type { VLabNode } from './VLabWorkspaceTypes';
import {
  LEGACY_PARAM_DROPS, LEGACY_PARAM_RENAMES, WP08_EXPOSED_PARAMS, canonicalizeLegacyParams, normalizeLegacyVLabGraph,
} from './vlabModelMigration';

const BLOCKS = VLAB_LIBRARY.flatMap(d => d.blocks);
const lib = (id: string) => BLOCKS.find(b => b.id === id)!;
const node = (type: string, params: Record<string, any>): VLabNode =>
  ({ id: 'n1', position: { x: 0, y: 0 }, data: { type, label: type, params, ports: lib(type).ports } }) as VLabNode;
const wrapped = (value: unknown, unit = 'u', label = 'legacy') => ({ value, unit, label });

describe('WP-08 migration: legacy parameter keys -> the one canonical library key', () => {
  it('every rename targets a library parameter and the legacy key is not a library parameter any more', () => {
    for (const [type, map] of Object.entries(LEGACY_PARAM_RENAMES)) {
      expect(lib(type), `${type} is a library block`).toBeDefined();
      for (const [legacy, canonical] of Object.entries(map)) {
        expect(lib(type).params[canonical], `${type}.${canonical} is canonical`).toBeDefined();
        expect(lib(type).params[legacy], `${type}.${legacy} must not stay a library parameter next to ${canonical}`).toBeUndefined();
      }
    }
    for (const [type, keys] of Object.entries(LEGACY_PARAM_DROPS)) for (const k of keys) {
      // dropped keys are gone from the library, except mag_controlled_mmf.MMF which is exposed again (listed in EXPOSED)
      if (!(WP08_EXPOSED_PARAMS[type] ?? []).includes(k)) expect(lib(type).params[k], `${type}.${k}`).toBeUndefined();
    }
    for (const [type, keys] of Object.entries(WP08_EXPOSED_PARAMS)) for (const k of keys) expect(lib(type).params[k], `${type}.${k}`).toBeDefined();
  });

  for (const [type, map] of Object.entries(LEGACY_PARAM_RENAMES)) {
    for (const [legacy, canonical] of Object.entries(map)) {
      it(`${type}: ${legacy} -> ${canonical} (0 and negatives survive, canonical wins when both are present)`, () => {
        const full = Object.fromEntries(Object.entries(lib(type).params).map(([k, s]) => [k, wrapped(s.value, s.unit, s.label)]));
        const { [canonical]: _drop, ...withoutCanonical } = full;
        for (const value of [0, -2.5, 0.125]) {
          const out = canonicalizeLegacyParams(type, { ...withoutCanonical, [legacy]: wrapped(value) });
          expect(out[canonical]?.value, `${legacy}=${value}`).toBe(value);
          expect(out[canonical]).toMatchObject({ unit: lib(type).params[canonical].unit, label: lib(type).params[canonical].label });
          expect(legacy in out).toBe(false);
          expect(canonicalizeLegacyParams(type, out)).toBe(out); // idempotent (same object, nothing left to change)
        }
        const input = { ...full, [legacy]: wrapped(123) };
        const both = canonicalizeLegacyParams(type, input);
        expect(both[canonical]).toEqual(full[canonical]); // canonical value is never overwritten
        expect(legacy in both).toBe(false);
        expect(input[legacy]).toEqual(wrapped(123)); // input not mutated
      });
    }
  }

  it('raw (non-wrapped) numbers move untouched', () => {
    expect(canonicalizeLegacyParams('resistor', { resistance: 0 })).toEqual({ R: 0 });
    expect(canonicalizeLegacyParams('torque_source', { torque: -3 })).toEqual({ T: -3 });
  });

  it('removed library parameters are dropped; newly exposed ones are backfilled with the library default', () => {
    const out = canonicalizeLegacyParams('busbar', { nodes: wrapped(4) });
    expect(out).toEqual({});
    const mag = canonicalizeLegacyParams('magnetron', { power_rating: wrapped(900), efficiency: wrapped(65), freq: wrapped(2.45) });
    expect('freq' in mag).toBe(false);
    expect(mag.v_nominal).toMatchObject({ value: 4000, unit: 'V' });
    const inertia = canonicalizeLegacyParams('inertia', { J: wrapped(0.5) });
    expect(inertia.B).toMatchObject({ value: 0.001, unit: 'N-m-s/rad' });
    const dz = canonicalizeLegacyParams('ps_dead_zone', { start: wrapped(0.25), end: wrapped(-0.75) });
    expect(dz).toMatchObject({ upper: { value: 0.25 }, lower: { value: -0.75 } });
    expect('start' in dz || 'end' in dz).toBe(false);
    // amp/freq never reached the equation (it ran on Vpk = 325, f = 50): they are dropped, not reinterpreted
    const s3 = canonicalizeLegacyParams('ps_sine_3phase', { amp: wrapped(1, 'pu'), freq: wrapped(60, 'Hz') });
    expect(s3).toMatchObject({ Vpk: { value: 325 }, f: { value: 50 } });
    expect('amp' in s3 || 'freq' in s3).toBe(false);
  });

  it('thermal_resistor: Rth is not a second resistance; it only fills R when R is absent', () => {
    expect(canonicalizeLegacyParams('thermal_resistor', { R: wrapped(10), Rth: wrapped(35) })).toEqual({ R: wrapped(10) });
    expect(canonicalizeLegacyParams('thermal_resistor', { Rth: wrapped(35) }).R.value).toBe(35);
  });

  it('ps_lpf: a legacy time constant T becomes the cutoff f_cut = 1 / (2 pi T)', () => {
    const out = canonicalizeLegacyParams('ps_lpf', { T: wrapped(0.1) });
    expect(out.f_cut.value).toBeCloseTo(1 / (2 * Math.PI * 0.1), 12);
    expect('T' in out).toBe(false);
    expect(canonicalizeLegacyParams('ps_lpf', { f_cut: wrapped(40), T: wrapped(0.1) }).f_cut.value).toBe(40);
  });

  it('conductive_heat: legacy k*A/L geometry becomes the conductance k in W/K', () => {
    const out = canonicalizeLegacyParams('conductive_heat', { k: wrapped(2), A: wrapped(0.5), L: wrapped(0.25) });
    expect(out.k.value).toBe(4);
    expect('A' in out || 'L' in out).toBe(false);
  });

  it('transformer: legacy N (v2 = N v1) becomes N12 = 1/N, and the simulated secondary voltage is identical (v2 = 10 v1)', () => {
    const out = canonicalizeLegacyParams('transformer', { N: wrapped(10) });
    expect(out.N12.value).toBeCloseTo(0.1, 12);
    expect('N' in out).toBe(false);
    expect(canonicalizeLegacyParams('transformer', { N: wrapped(0.5) }).N12.value).toBe(2);
    expect(canonicalizeLegacyParams('transformer', { N: wrapped(0) }).N12.value).toBe(0); // rejected later by the nonZero bound
    expect(canonicalizeLegacyParams('transformer', { N: wrapped(4), N12: wrapped(9) }).N12.value).toBe(9);
    expect(lib('transformer').params.N12.value).toBeCloseTo(0.1, 12); // default model behaves as the old N = 10
    // simulate the migrated model: 2 V on winding 1, 1 kOhm on winding 2 -> v2 = N_old * v1 = 20 V
    const mk = (id: string, type: string, params: Record<string, any>): any => ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } });
    const e = (a: string, ap: string, b: string, bp: string): any => ({ id: `${a}${ap}${b}${bp}`, source: a, sourceHandle: ap, target: b, targetHandle: bp });
    const { nodes } = normalizeLegacyVLabGraph([mk('t', 'transformer', { N: wrapped(10) }), mk('vs', 'dc_voltage', { V: 2, R_int: 0 }), mk('rl', 'resistor', { R: 1000 }), mk('g', 'ground', {})], []);
    const edges = [e('vs', 'p', 't', 'p1'), e('t', 'n1', 'g', 'a'), e('vs', 'n', 'g', 'a'), e('t', 'p2', 'rl', 'p'), e('rl', 'n', 'g', 'a'), e('t', 'n2', 'g', 'a')];
    const sys = new DAEAssembler().assemble(nodes as any, edges);
    const st = new VLabPhysicsEngine().simulateStep(nodes as any, edges, null, 0.01);
    const root = sys.components.find(c => c.blockId === 'rl')!.portNodeMap.get('p')!;
    const v2 = st.x[st.variableNames.findIndex((n: string) => n.startsWith(`Across_${root}_(`))];
    expect(v2).toBeCloseTo(20, 6);
  });

  it('end to end: a legacy-keyed model loads, validates and runs with the migrated value (never the default)', () => {
    const legacy = node('resistor', { resistance: wrapped(50, 'Ω') });
    const { nodes } = normalizeLegacyVLabGraph([legacy], []);
    expect(nodes[0].data.params).toEqual({ R: { value: 50, unit: 'Ω', label: 'Resistance' } });
    const comp = new DAEAssembler().assemble(nodes as any, []).components.find(c => c.blockId === 'n1')!;
    expect(numericParam(comp.params, 'R', 100)).toBe(50);
    expect(legacy.data.params).toEqual({ resistance: wrapped(50, 'Ω') }); // original untouched

    const torque = normalizeLegacyVLabGraph([node('torque_source', { torque: wrapped(0, 'N-m') })], []).nodes[0];
    expect(torque.data.params.T.value).toBe(0); // 0 N-m stays 0, it does not become the 5 N-m default
  });

  it('nodes without params and unknown block types are left alone', () => {
    const bare = { id: 'x', position: { x: 0, y: 0 }, data: { type: 'resistor' } } as VLabNode;
    expect(normalizeLegacyVLabGraph([bare], []).nodes[0]).toBe(bare);
    const unknown = node('resistor', {});
    (unknown.data as any).type = 'no_such_block';
    expect(normalizeLegacyVLabGraph([unknown], []).nodes[0]).toBe(unknown);
  });
});
