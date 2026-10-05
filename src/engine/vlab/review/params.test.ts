/**
 * WP-08: numeric parameter handling, asserted through the REAL path (1-block model -> validateTopology ->
 * DAEAssembler param resolution -> equation factory), never through the helper alone.
 *
 * Generated over every numeric parameter of every library block:
 *   0, a positive fraction, a negative fraction, the minimum valid value  -> accepted / rejected exactly per the
 *   physical bounds stored in vlabLibrary.ts, and an accepted value reaches the equation unchanged (never a default);
 *   invalid text -> structured diagnostic {blockId, param, raw, code, reason}, and the equation refuses to run;
 *   `{ value, unit }` wrappers are unwrapped; "1e-3" is 0.001.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import type { Node } from '@xyflow/react';
import { VLAB_LIBRARY, type VLabBlock, type VLabParamSpec } from '../../../utils/vlabLibrary';
import { DAEAssembler } from '../DAEAssembler';
import { blockEquations } from '../vlabEquations';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { TopologyValidationError, assertValidTopology, validateTopology } from '../vlabTopologyValidation';
import {
  VLabParamError, boundViolation, describeBounds, numericParam, parseNumeric, stringParam, validateBlockParams, vectorParam,
} from '../vlabParams';
import { REPO_ROOT, traceBlock, libraryDefaults } from './contractInventory';
import { ENGINE_CONSUMED_PARAMS } from './blockClassification';
import { LEARNING_LABS } from '../../../components/vlab/VLabWorkspace';

const BLOCKS: VLabBlock[] = VLAB_LIBRARY.flatMap(d => d.blocks);
const numericParamsOf = (b: VLabBlock) => Object.entries(b.params ?? {}).filter(([, s]) => typeof s.value === 'number') as [string, VLabParamSpec][];

const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// ── 1. the helper itself ──────────────────────────────────────────────────────────────────────────────────────
describe('numericParam / parseNumeric', () => {
  it('missing (undefined, null, empty or blank text) -> the default', () => {
    for (const raw of [undefined, null, '', '   ']) expect(numericParam({ x: raw }, 'x', 7)).toBe(7);
    expect(numericParam({}, 'x', 7)).toBe(7);
    expect(numericParam(undefined, 'x', 7)).toBe(7);
  });
  it('accepts 0, negatives, fractions and scientific notation, as numbers and as text', () => {
    const cases: [unknown, number][] = [
      [0, 0], ['0', 0], [-3, -3], ['-2.5E+4', -25000], ['1e-3', 0.001], ['  .5 ', 0.5], ['+7', 7], [1e-12, 1e-12], ['-0', -0],
    ];
    for (const [raw, want] of cases) expect(numericParam({ x: raw }, 'x', 99), String(raw)).toBe(want);
  });
  it('unwraps serialized { value, unit } (also nested)', () => {
    expect(numericParam({ x: { value: 0, unit: 'V', label: 'x' } }, 'x', 5)).toBe(0);
    expect(numericParam({ x: { value: '1e-3', unit: 'F' } }, 'x', 5)).toBe(0.001);
    expect(numericParam({ x: { value: { value: -2, unit: 'V' }, unit: 'V' } }, 'x', 5)).toBe(-2);
    expect(numericParam({ x: { value: undefined, unit: 'V' } }, 'x', 5)).toBe(5);
  });
  it('rejects NaN, +-Infinity, malformed text, booleans and lists with a structured diagnostic (never a default)', () => {
    const bad: unknown[] = [NaN, Infinity, -Infinity, 'abc', '1e', '1,5', '0x10', '1 2', 'Infinity', 'NaN', '1e999', true, {}, [1, 2]];
    for (const raw of bad) {
      let err: unknown;
      try { numericParam({ x: raw }, 'x', 42, 'blk1'); } catch (e) { err = e; }
      expect(err, `raw=${String(raw)}`).toBeInstanceOf(VLabParamError);
      const d = (err as VLabParamError).diagnostics[0];
      expect(d).toMatchObject({ blockId: 'blk1', param: 'x', code: 'invalid-parameter' });
      expect(typeof d.reason).toBe('string');
      expect(d.raw).toEqual(raw as any);
    }
  });
  it('parseNumeric classifies without throwing', () => {
    expect(parseNumeric('1e-3')).toEqual({ kind: 'ok', value: 0.001 });
    expect(parseNumeric(undefined)).toEqual({ kind: 'missing' });
    expect(parseNumeric('abc').kind).toBe('invalid');
  });
  it('stringParam and vectorParam never fall back for supplied values', () => {
    expect(stringParam({ s: '' }, 's', 'sin')).toBe('sin');
    expect(stringParam({ s: { value: 'cos' } }, 's', 'sin')).toBe('cos');
    expect(vectorParam({ v: '[1 2 3]' }, 'v', [0])).toEqual([1, 2, 3]);
    expect(vectorParam({ v: '[1; 0]' }, 'v', [9])).toEqual([1, 0]);
    expect(vectorParam({ v: [0, 1] }, 'v', [9])).toEqual([0, 1]);
    expect(vectorParam({}, 'v', [9])).toEqual([9]);
    expect(() => vectorParam({ v: '[1 x 3]' }, 'v', [0])).toThrow(VLabParamError);
  });
});

// ── 2. schema + source hygiene ────────────────────────────────────────────────────────────────────────────────
describe('physical bounds schema (vlabLibrary.ts)', () => {
  it('only numeric parameters carry bounds and every library default satisfies its own bounds', () => {
    const problems: string[] = [];
    for (const b of BLOCKS) for (const [k, s] of Object.entries(b.params ?? {})) {
      const bounded = s.min !== undefined || s.max !== undefined || s.nonZero;
      if (bounded && typeof s.value !== 'number') problems.push(`${b.id}.${k}: bound on a non-numeric parameter`);
      if (typeof s.value === 'number') {
        const v = boundViolation(s.value, s);
        if (v) problems.push(`${b.id}.${k}: default ${s.value} violates "${v}"`);
      }
      if ((s.exclusiveMin && s.min === undefined) || (s.exclusiveMax && s.max === undefined)) problems.push(`${b.id}.${k}: exclusive flag without bound`);
      if (s.min !== undefined && s.max !== undefined && s.min > s.max) problems.push(`${b.id}.${k}: min > max`);
    }
    expect(problems).toEqual([]);
  });
  it('legitimate zeros and signed values are NOT blocked (damping, offsets, initial values, negative sources)', () => {
    const lib = (id: string, key: string) => BLOCKS.find(b => b.id === id)!.params[key];
    for (const [id, key] of [
      ['rot_damper', 'b'], ['trans_damper', 'b'], ['mass', 'b'], ['inertia', 'B'], ['revolute_joint', 'damping'], ['spring_damper_force', 'x0'],
      ['dc_voltage', 'V'], ['dc_voltage', 'R_int'], ['dc_current', 'I'], ['ps_step', 'initial'], ['ps_ramp', 'start'], ['heat_src', 'Q'],
      ['force_source', 'F'], ['torque_source', 'T'], ['ang_vel_source', 'omega'], ['diode', 'Vf'], ['rot_friction', 'Ts'],
      ['neural_neuron_learning', 'initBias'], ['ac_voltage', 'phase'], ['variable_resistor', 'R_min'],
    ] as const) {
      expect(boundViolation(0, lib(id, key)), `${id}.${key}`).toBeNull();
    }
    for (const [id, key] of [['dc_voltage', 'V'], ['dc_current', 'I'], ['force_source', 'F'], ['ps_step', 'final'], ['neural_neuron_learning', 'initW2']] as const) {
      expect(boundViolation(-1.5, lib(id, key)), `${id}.${key}`).toBeNull();
    }
  });
  it('physically impossible values are rejected with the bound in the message', () => {
    const d = (id: string, key: string, v: unknown) => validateBlockParams('x', id, { [key]: { value: v } });
    expect(d('resistor', 'R', 0)).toHaveLength(1);
    expect(d('resistor', 'R', -5)[0].reason).toMatch(/> 0/);
    expect(d('capacitor', 'C', 0)).toHaveLength(1);
    expect(d('mass', 'm', 0)).toHaveLength(1);
    expect(d('gear_box', 'ratio', 0)[0].reason).toMatch(/!= 0/);
    expect(d('gear_box', 'ratio', -3)).toHaveLength(0);
    expect(d('rot_damper', 'b', -0.1)).toHaveLength(1);
    expect(d('temp_src', 'T', 0)).toHaveLength(1);
    expect(d('gas_chamber', 'T', -10)).toHaveLength(1);
    expect(d('radiative_heat', 'eps', 1.5)).toHaveLength(1);
    expect(describeBounds({ min: 0, exclusiveMin: true })).toBe('> 0');
  });
});

describe('no truthiness / silent numeric fallbacks left in the engine', () => {
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  it('vlabEquations.ts has no `params.X ||` fallback', () => {
    expect(stripComments(read('src/engine/vlab/vlabEquations.ts')).match(/params\??\.\w+\s*\|\|/g) ?? []).toEqual([]);
  });
  it('no engine file defaults a parameter with `??` / `!== undefined ? : <number>` outside numericParam', () => {
    for (const f of ['vlabEquations.ts', 'vlabPhysics.ts', 'DAEAssembler.ts', 'vlabUniversalJoint.ts', 'vlabFrameKinematics.ts', 'kernel/PhysicalNetworkExtractor.ts']) {
      const code = stripComments(read(`src/engine/vlab/${f}`));
      expect(code.match(/params\??\.\w+\s*\?\?\s*-?[\d.]/g) ?? [], f).toEqual([]);
      expect(code.match(/params\??\.\w+ !== undefined \? [^:]+ : -?[\d.]/g) ?? [], f).toEqual([]);
    }
  });
  it('every equation reads only canonical (library) keys: no alias chain', () => {
    const code = stripComments(read('src/engine/vlab/vlabEquations.ts'));
    expect(code.match(/numericParam\(params[^)]*\)\s*(\|\||\?\?)\s*(params|numericParam)/g) ?? []).toEqual([]);
    expect(code.match(/params\.\w+\s*(\|\||\?\?)\s*params\./g) ?? []).toEqual([]);
  });
  it('engine-consumed (non-equation) library parameters are really referenced by the named source', () => {
    for (const [block, entries] of Object.entries(ENGINE_CONSUMED_PARAMS)) {
      const lib = BLOCKS.find(b => b.id === block)!;
      for (const { file, params } of entries) {
        const src = read(file);
        for (const p of params) {
          expect(lib.params[p], `${block}.${p} must be a library param`).toBeDefined();
          expect(src.includes(p), `${file} must reference ${block}.${p}`).toBe(true);
        }
      }
    }
  });
  it('every parameter of every shipped learning lab is a library key (labs never rely on aliases or dropped keys)', () => {
    const bad: string[] = [];
    for (const lab of LEARNING_LABS as any[]) for (const n of lab.nodes) {
      const b = BLOCKS.find(x => x.id === n.blockId);
      if (!b) { bad.push(`${lab.id}: unknown block ${n.blockId}`); continue; }
      for (const k of Object.keys(n.params ?? {})) if (!b.params[k]) bad.push(`${lab.id}/${n.id} (${n.blockId}): "${k}" is not a library parameter`);
    }
    expect(bad).toEqual([]);
  });
});

// ── 3. generated boundary tests through the real path ─────────────────────────────────────────────────────────
const wrap = (b: VLabBlock, key: string, raw: unknown) => {
  const params: Record<string, any> = {};
  for (const [k, s] of Object.entries(b.params ?? {})) params[k] = { value: s.value, unit: s.unit, label: s.label };
  params[key] = raw !== null && typeof raw === 'object' && 'value' in (raw as object) ? raw : { value: raw, unit: b.params[key].unit, label: b.params[key].label };
  return params;
};
const dutNode = (b: VLabBlock, params: Record<string, any>) =>
  ({ id: 'dut', type: 'default', position: { x: 0, y: 0 }, data: { label: b.name, type: b.id, params, ports: b.ports } }) as unknown as Node;

const PARAM_CODES = new Set(['invalid-parameter', 'parameter-out-of-range']);
const paramDiagnostics = (node: Node, key: string) =>
  validateTopology([node], []).diagnostics.filter(d => PARAM_CODES.has(d.code) && (d as any).param === key);

/** Resolve the parameter exactly as the engine does: assembler param extraction + the equation's numericParam. */
function assemble(node: Node) {
  const sys = new DAEAssembler().assemble([node], []);
  const comp = sys.components.find(c => c.blockId === 'dut')!;
  (comp as any).__n = sys.systemSize;
  return comp;
}
const quiet = <T,>(fn: () => T): T => {
  const e = console.error, w = console.warn; console.error = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.error = e; console.warn = w; }
};
const probeCtx = (n: number) => ({
  dt: 1e-3, time: 0.2, parameters: {} as Record<string, any>, prevStates: new Array(n).fill(0), states: new Array(n).fill(0),
  stateDerivatives: new Array(n).fill(0), order: 1,
});
const probeVector = (n: number) => Array.from({ length: n }, (_, i) => 0.3 + 0.17 * i);

const VALID_CANDIDATES = [0.001, 0.25, 0.5, 2, 50, 1e3, 1e5];
const firstValid = (spec: VLabParamSpec): number | undefined => VALID_CANDIDATES.find(c => !boundViolation(c, spec));
const minimumValid = (spec: VLabParamSpec): number | undefined => {
  if (spec.min === undefined) return undefined;
  if (!spec.exclusiveMin) return spec.min;
  const nudged = spec.min + Math.max(1e-6, Math.abs(spec.min) * 1e-6);
  return spec.max !== undefined && nudged >= spec.max ? undefined : nudged;
};

describe('numeric parameters through the real path: every numeric parameter of every block', () => {
  for (const b of BLOCKS) {
    const nums = numericParamsOf(b);
    if (!nums.length) continue;
    const trace = traceBlock(b.id, libraryDefaults(b), b.ports.map(p => p.id));
    describe(b.id, () => {
      for (const [key, spec] of nums) {
        it(`${key}: 0, +/-fraction, minimum, wrapper, text, invalid text`, () => {
          const reads = !!trace && !trace.threw && trace.params.has(key);

          // accepted-or-rejected exactly per bounds, and an accepted value reaches the equation unchanged
          const check = (value: number, label: string) => {
            const violation = boundViolation(value, spec);
            const node = dutNode(b, wrap(b, key, value));
            const diags = paramDiagnostics(node, key);
            if (violation) {
              expect(diags, `${label} must be rejected (${violation})`).toHaveLength(1);
              expect(diags[0]).toMatchObject({ blockId: 'dut', code: 'parameter-out-of-range', param: key });
              expect((diags[0] as any).raw).toBe(value);
              expect(diags[0].reason).toContain(describeBounds(spec));
              expect(() => assertValidTopology([node], [])).toThrow(TopologyValidationError);
            } else {
              expect(diags, `${label} must be accepted`).toEqual([]);
              const comp = quiet(() => assemble(node));
              expect(numericParam(comp.params, key, Number.NaN), `${label} reaches the engine, not a default`).toBe(value);
            }
          };
          check(0, '0');
          check(0.25, 'positive fraction');
          check(-0.25, 'negative fraction');
          const min = minimumValid(spec);
          if (min !== undefined) { check(min, 'minimum valid'); expect(boundViolation(min, spec)).toBeNull(); }

          const ok = firstValid(spec);
          if (ok !== undefined) {
            // "1e-3"-style text and { value, unit } wrappers (single and nested) resolve to the number
            const text = boundViolation(0.001, spec) ? ok.toExponential() : '1e-3';
            const want = Number(text);
            const viaText = quiet(() => assemble(dutNode(b, wrap(b, key, text))));
            expect(numericParam(viaText.params, key, Number.NaN)).toBe(want);
            expect(paramDiagnostics(dutNode(b, wrap(b, key, text)), key)).toEqual([]);
            const nested = quiet(() => assemble(dutNode(b, wrap(b, key, { value: { value: ok, unit: spec.unit }, unit: spec.unit }))));
            expect(numericParam(nested.params, key, Number.NaN)).toBe(ok);
            expect(paramDiagnostics(dutNode(b, wrap(b, key, { value: { value: ok, unit: spec.unit }, unit: spec.unit })), key)).toEqual([]);
          }

          // invalid text -> structured diagnostic; the equation refuses to run instead of defaulting
          for (const raw of ['abc', 'NaN', '1e', 'Infinity']) {
            const node = dutNode(b, wrap(b, key, raw));
            const diags = paramDiagnostics(node, key);
            expect(diags, `"${raw}"`).toHaveLength(1);
            expect(diags[0]).toMatchObject({ blockId: 'dut', code: 'invalid-parameter', param: key });
            expect((diags[0] as any).raw).toBe(raw);
            expect(diags[0].reason.length).toBeGreaterThan(10);
            expect(() => assertValidTopology([node], [])).toThrow(TopologyValidationError);
            let comp: ReturnType<typeof assemble> | undefined;
            try { comp = quiet(() => assemble(node)); } catch (e) {
              // the assembler itself reads this parameter while assembling (belt material, reference nodes, joint setup)
              expect(e, `assembly of ${b.id} with "${raw}" for ${key}`).toBeInstanceOf(VLabParamError);
              expect((e as VLabParamError).diagnostics[0]).toMatchObject({ blockId: 'dut', param: key, code: 'invalid-parameter' });
              continue;
            }
            expect(() => numericParam(comp.params, key, 1)).toThrow(VLabParamError);
            if (reads) {
              let err: unknown;
              const n = (comp as any).__n as number;
              try { comp.residual(probeVector(n), probeVector(n), probeCtx(n) as any); } catch (e) { err = e; }
              expect(err, `equation of ${b.id} must reject "${raw}" for ${key}`).toBeInstanceOf(VLabParamError);
              expect((err as VLabParamError).diagnostics[0]).toMatchObject({ blockId: 'dut', param: key, code: 'invalid-parameter' });
            }
          }
        });
      }
    });
  }
});

// ── 4. no silent default: a parameter set to 0 changes the physics wherever the physics says it must ────────────
describe('a parameter set to 0 produces a different residual than the default (proves no silent default)', () => {
  const residualFor = (b: VLabBlock, overrides: Record<string, number>, sx = 1) => {
    const params = wrap(b, Object.keys(b.params)[0], b.params[Object.keys(b.params)[0]].value);
    for (const [k, v] of Object.entries(overrides)) params[k] = { value: v, unit: b.params[k].unit, label: b.params[k].label };
    const comp = quiet(() => assemble(dutNode(b, params)));
    const n = (comp as any).__n as number;
    return comp.residual(probeVector(n).map(v => v * sx), probeVector(n).map(v => v * sx), probeCtx(n) as any).map(Number);
  };
  // [block, param, probe scale]: scale moves the probe point so the block works in the region the parameter acts on
  const CASES: [string, string, number?][] = [
    ['dc_voltage', 'R_int'], ['dc_voltage', 'V'], ['dc_current', 'I'], ['rot_damper', 'b'], ['trans_damper', 'b'], ['mass', 'b'],
    ['inertia', 'B'], ['rot_spring', 'k'], ['trans_spring', 'k'], ['heat_src', 'Q'], ['force_source', 'F'],
    ['torque_source', 'T'], ['ang_vel_source', 'omega'], ['diode', 'Vf', -10], ['rot_friction', 'Ts'], ['rot_friction', 'Tv'],
    ['trans_friction', 'Fs'], ['trans_friction', 'Fv'], ['rot_hard_stop', 'c', 10], ['permanent_magnet', 'Hc'], ['mag_mmf_source', 'MMF'],
    ['mag_flux_source', 'phi'], ['gas_flow_source', 'mdot'], ['mass_flow_source', 'mdot'], ['ma_flow_source', 'rate'],
    ['ma_moisture_source', 'rate'], ['ps_constant', 'value'], ['constant', 'value'], ['ps_step', 'time'], ['ps_sine', 'amp'],
    ['ps_ramp', 'slope'], ['dc_motor', 'Ra'], ['dc_motor', 'B'], ['bldc_motor', 'B'], ['ac_voltage', 'Vpk'], ['pmsm', 'B'],
    ['washing_basket', 'damping'], ['ma_chamber', 'k_loss'], ['convective_heat', 'h'], ['conductive_heat', 'k'],
    ['ps_sine_3phase', 'Vpk'], ['controlled_voltage', 'R_int'], ['upper_heater', 'efficiency'],
    ['translational_electromechanical_converter', 'R'], ['rotational_electromechanical_converter', 'R'],
  ];
  for (const [id, key, sx] of CASES) {
    it(`${id}.${key} = 0 is honoured (differs from the default ${BLOCKS.find(b => b.id === id)?.params[key]?.value})`, () => {
      const b = BLOCKS.find(x => x.id === id)!;
      expect(b, `${id} exists`).toBeDefined();
      expect(b.params[key], `${id}.${key} is a library param`).toBeDefined();
      expect(boundViolation(0, b.params[key]), `0 is a legal ${id}.${key}`).toBeNull();
      expect(b.params[key].value, 'default must be non-zero for the comparison to prove anything').not.toBe(0);
      const def = residualFor(b, {}, sx ?? 1);
      const zero = residualFor(b, { [key]: 0 }, sx ?? 1);
      expect(zero.every(Number.isFinite)).toBe(true);
      const differs = def.some((v, i) => Math.abs(v - zero[i]) > 1e-12);
      expect(differs, `residual must change when ${id}.${key} goes from default to 0`).toBe(true);
    });
  }
});

// ── 5. failure surfaces: pre-solve diagnostics and the assembler never turn a bad parameter into a silent zero ──
describe('bad parameters fail fast with the same diagnostic path as topology errors', () => {
  const resistor = BLOCKS.find(b => b.id === 'resistor')!;
  const gnd = (id: string) => ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type: 'ground', params: {}, ports: BLOCKS.find(b => b.id === 'ground')!.ports } }) as unknown as Node;

  it('VLabPhysicsEngine.simulateStep throws TopologyValidationError with the parameter diagnostic before assembling', () => {
    const nodes = [dutNode(resistor, wrap(resistor, 'R', 'ten ohms')), gnd('g')];
    const engine = new VLabPhysicsEngine();
    let err: unknown;
    try { engine.simulateStep(nodes, [], null, 1e-3); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(TopologyValidationError);
    const d = (err as TopologyValidationError).diagnostics.find(x => x.code === 'invalid-parameter')!;
    expect(d).toMatchObject({ blockId: 'dut', param: 'R', code: 'invalid-parameter' });
    expect(d.reason).toContain('"R"');
  });
  it('R = 0 and R < 0 on a resistor are reported out of range; R = 1e-3 is accepted', () => {
    for (const bad of [0, -1]) {
      expect(validateTopology([dutNode(resistor, wrap(resistor, 'R', bad))], []).diagnostics.map(d => d.code)).toContain('parameter-out-of-range');
    }
    expect(validateTopology([dutNode(resistor, wrap(resistor, 'R', '1e-3'))], []).diagnostics.filter(d => PARAM_CODES.has(d.code))).toEqual([]);
  });
  it('the equation of an unvalidated direct call still refuses malformed text (no silent default)', () => {
    expect(() => blockEquations.resistor({ across: [1, 0], dAcross: [0, 0], branch: [0.1], dBranch: [0], state: [], dState: [], ctx: probeCtx(1) as any, params: { R: 'abc' }, ports: ['p', 'n'], nodeId: 'r1' })).toThrow(VLabParamError);
    const ok = blockEquations.resistor({ across: [1, 0], dAcross: [0, 0], branch: [0.1], dBranch: [0], state: [], dState: [], ctx: probeCtx(1) as any, params: { R: { value: '2e1', unit: 'Ω' } }, ports: ['p', 'n'], nodeId: 'r1' });
    expect(ok[0]).toBeCloseTo(1 - 0.1 * 20, 12);
  });
  it('the assembler residual rethrows VLabParamError with the block id instead of swallowing it as zeros', () => {
    const node = { ...dutNode(resistor, wrap(resistor, 'R', 'x')), id: 'r_bad' } as Node;
    const comp = quiet(() => new DAEAssembler().assemble([node], [])).components.find(c => c.blockId === 'r_bad')!;
    let err: unknown;
    try { comp.residual([0, 0, 0], [0, 0, 0], probeCtx(3) as any); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(VLabParamError);
    expect((err as VLabParamError).diagnostics[0]).toMatchObject({ blockId: 'r_bad', param: 'R' });
  });
});
