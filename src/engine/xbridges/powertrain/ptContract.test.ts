// WP-06 acceptance tests (Powertrain plan §3, §4 G1/G2): the contract every powertrain block must satisfy.
// The per-block expected data (ports, units, equations) lives in each block-group test; this file checks
// that the registry, factories, palettes, help and symbols stay consistent for every spec.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCK_LIBRARY, XBRIDGES_CATEGORIES as CANVAS_CATEGORIES } from '../BlockDefinitions';
import { XBRIDGES_CATEGORIES as HELP_CATEGORIES } from '../../../utils/xbridges/XbridgesLibrary';
import { getBlockHelpReferences } from '../../../help/blockReference';
import { POWERTRAIN_SPECS, POWERTRAIN_FACTORIES, POWERTRAIN_CATEGORIES, getPowertrainSpec } from './index';
import { PT_SYMBOL_IDS, PT_CATEGORY_ORDER } from './ptSpec';
import { rpm2radps, radps2rpm, smoothSign, powerFlowEfficiency, validateParams } from './ptMath';
import type { PtBlockSpec, PtPortSpec } from './ptSpec';

const portIds = (ports: PtPortSpec[]) => [...ports].sort((a, b) => a.simulinkIndex - b.simulinkIndex).map(p => p.id);

describe('ptMath', () => {
  it('converts rpm and rad/s exactly', () => {
    expect(rpm2radps(60)).toBeCloseTo(2 * Math.PI, 14);
    expect(radps2rpm(2 * Math.PI)).toBeCloseTo(60, 12);
    expect(rpm2radps(-3000)).toBeCloseTo(-100 * Math.PI, 11);
  });

  it('smoothSign is odd, bounded, 0 at 0 and ±1 well outside its width', () => {
    expect(smoothSign(0, 0.1)).toBe(0);
    expect(smoothSign(5, 0.1)).toBeCloseTo(1, 12);
    expect(smoothSign(-5, 0.1)).toBeCloseTo(-1, 12);
    expect(smoothSign(0.03, 0.1)).toBeCloseTo(-smoothSign(-0.03, 0.1), 15);
    expect(Math.abs(smoothSign(0.03, 0.1))).toBeLessThan(1);
  });

  it('powerFlowEfficiency applies eta when power flows forward and 1/eta when it flows back', () => {
    // Output torque of an ideal-ratio stage with efficiency eta: forward Tout = eta*Tin*N, reverse Tout = Tin*N/eta.
    expect(powerFlowEfficiency(100, 10, 0.9)).toBeCloseTo(0.9, 15);
    expect(powerFlowEfficiency(-100, 10, 0.9)).toBeCloseTo(1 / 0.9, 15);
    expect(powerFlowEfficiency(100, -10, 0.9)).toBeCloseTo(1 / 0.9, 15);
    expect(powerFlowEfficiency(0, 0, 0.9)).toBe(1);
  });

  it('validateParams reports bounds and accepts zero and negatives where allowed', () => {
    const spec = [
      { name: 'm', label: 'Mass', unit: 'kg', default: 1200, min: 0, minExclusive: true, kind: 'scalar' },
      { name: 'theta', label: 'Grade', unit: 'deg', default: 0, min: -90, max: 90, kind: 'scalar' },
    ] as any;
    expect(validateParams(spec, { m: 1200, theta: 0 })).toBeNull();
    expect(validateParams(spec, { m: 1200, theta: -10 })).toBeNull();
    expect(validateParams(spec, { m: 0, theta: 0 })).toMatch(/m/);
    expect(validateParams(spec, { m: 1200, theta: 95 })).toMatch(/theta/);
    expect(validateParams(spec, { m: NaN, theta: 0 })).toMatch(/m/);
  });
});

describe('powertrain registry contract (every spec)', () => {
  it('registry shape: unique PT_ types, factories registered in BLOCK_LIBRARY', () => {
    const types = POWERTRAIN_SPECS.map(s => s.type);
    expect(new Set(types).size).toBe(types.length);
    for (const s of POWERTRAIN_SPECS) {
      expect(s.type).toMatch(/^PT_[A-Z0-9_]+$/);
      expect(POWERTRAIN_FACTORIES[s.type], s.type).toBeTypeOf('function');
      expect(BLOCK_LIBRARY[s.type], s.type).toBe(POWERTRAIN_FACTORIES[s.type]);
      expect(getPowertrainSpec(s.type)).toBe(s);
    }
    for (const t of Object.keys(POWERTRAIN_FACTORIES)) expect(types, t).toContain(t);
  });

  it('G1: default ports equal the spec (ids, order by simulinkIndex, direction, unit on every port)', () => {
    for (const s of POWERTRAIN_SPECS) {
      const b = POWERTRAIN_FACTORIES[s.type]('probe', {});
      expect(b.inputs.map(p => p.id), `${s.type} inputs`).toEqual(portIds(s.inputs));
      expect(b.outputs.map(p => p.id), `${s.type} outputs`).toEqual(portIds(s.outputs));
      for (const p of [...b.inputs, ...b.outputs]) {
        expect(p.unit, `${s.type}.${p.id} unit`).toBeTruthy();
        const sp = [...s.inputs, ...s.outputs].find(x => x.id === p.id)!;
        expect(p.unit, `${s.type}.${p.id}`).toBe(sp.unit);
        expect(p.name, `${s.type}.${p.id}`).toBe(sp.name);
        expect(p.direction).toBe(sp.direction);
      }
    }
  });

  it('G1: every variant builds exactly its spec ports', () => {
    for (const s of POWERTRAIN_SPECS.filter(x => x.variants)) {
      for (const [value, ports] of Object.entries(s.variants!.ports)) {
        const b = POWERTRAIN_FACTORIES[s.type]('probe', { [s.variants!.param]: value });
        expect(b.inputs.map(p => p.id), `${s.type} ${value} inputs`).toEqual(portIds(ports.inputs));
        expect(b.outputs.map(p => p.id), `${s.type} ${value} outputs`).toEqual(portIds(ports.outputs));
      }
    }
  });

  it('G2: factory params carry every spec parameter with its default, defaults inside bounds', () => {
    for (const s of POWERTRAIN_SPECS) {
      const b = POWERTRAIN_FACTORIES[s.type]('probe', {});
      for (const p of s.params) {
        expect(b.params, `${s.type}.${p.name}`).toHaveProperty(p.name);
        expect(b.params[p.name], `${s.type}.${p.name}`).toEqual(p.default);
        expect(p.unit, `${s.type}.${p.name} unit`).toBeTypeOf('string');
      }
      expect(validateParams(s.params, b.params), s.type).toBeNull();
    }
  });

  it('documents equations, references, states and a known symbol for every block', () => {
    for (const s of POWERTRAIN_SPECS) {
      expect(s.equations.length, s.type).toBeGreaterThan(0);
      expect(s.references.length, s.type).toBeGreaterThan(0);
      if (s.source === 'user-spec') {
        // user-specified engine calibration blocks (no Simulink counterpart): must cite the spec section
        expect(s.specRef, s.type).toMatch(/^docs\/powertrain\/engine-calibration-spec\.md#/);
        expect(s.category, s.type).toMatch(/^Powertrain \/ Engine Calibration \/ /);
      } else {
        expect(s.simulinkPath, s.type).toMatch(/^Powertrain Blockset\//);
      }
      expect(PT_SYMBOL_IDS, s.type).toContain(s.symbol);
      const b = POWERTRAIN_FACTORIES[s.type]('probe', {});
      expect(b.equation, s.type).toBeTruthy();
      expect(b.description, s.type).toBeTruthy();
    }
  });

  it('all blocks are in one "Powertrain Blockset" palette group in both palettes (user decision 2026-10-20), ordered by Simulink sub-library', () => {
    expect(POWERTRAIN_CATEGORIES.map(c => c.name)).toEqual(POWERTRAIN_SPECS.length ? ['Powertrain Blockset'] : []);
    const order = (s: PtBlockSpec) => PT_CATEGORY_ORDER.indexOf(s.category as any);
    const expected = [...POWERTRAIN_SPECS].sort((a, b) => order(a) - order(b)).map(s => s.type);
    for (const cats of [CANVAS_CATEGORIES, HELP_CATEGORIES]) {
      expect(cats.filter(c => c.name.startsWith('Powertrain')).map(c => c.name)).toEqual(POWERTRAIN_SPECS.length ? ['Powertrain Blockset'] : []);
      const group = cats.find(c => c.name === 'Powertrain Blockset');
      if (POWERTRAIN_SPECS.length) expect(group!.blocks.map(b => b.type)).toEqual(expected);
    }
    for (const s of POWERTRAIN_SPECS) expect(PT_CATEGORY_ORDER, s.type).toContain(s.category);
  });

  it('every block has complete help (no documentation gaps)', () => {
    const refs = getBlockHelpReferences();
    for (const s of POWERTRAIN_SPECS) {
      const r = refs.find(x => x.id === `xbridges:${s.type}`);
      expect(r, s.type).toBeDefined();
      expect(r!.documentationGaps, s.type).toEqual([]);
      expect(r!.availability).toBe('available');
    }
  });

  it('never uses || fallbacks on numbers in powertrain sources', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) files.push(p);
      }
    };
    walk(__dirname);
    walk(join(__dirname, '../../../components/xbridges/powertrain'));
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src.match(/\|\|\s*-?\d/g), f).toBeNull();
    }
  });

  it('type guard: specs are well-formed', () => {
    const check = (s: PtBlockSpec) => {
      const idx = (ps: PtPortSpec[]) => ps.map(p => p.simulinkIndex).sort((a, b) => a - b);
      expect(idx(s.inputs), s.type).toEqual(s.inputs.map((_, i) => i + 1));
      expect(idx(s.outputs), s.type).toEqual(s.outputs.map((_, i) => i + 1));
      expect(new Set([...s.inputs, ...s.outputs].map(p => p.id)).size, s.type).toBe(s.inputs.length + s.outputs.length);
    };
    POWERTRAIN_SPECS.forEach(check);
  });
});
