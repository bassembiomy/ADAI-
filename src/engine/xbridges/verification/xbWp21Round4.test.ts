/**
 * WP-21 round 4, batch E3 acceptance (controller): small canvas items.
 * XBV-041 / D14: Clock outputs the simulation time (Simulink Clock) - pinned in xbEquations.math.test.ts and parity.
 * XBV-065: DEADZONE is element-wise on vectors (Simulink Dead Zone): y = u - upper above, u - lower below, 0 inside.
 * XBV-169: MatrixConcat has a 'mode' parameter like Simulink Matrix Concatenate: 'vector' (default; 1-D inputs and scalars
 *   join into one 1-D vector; matrices concatenate along the axis) and 'multidimensional' (scalars and 1-D vectors are
 *   promoted to rows for axis 0 and to columns for axis 1).
 * XBV-165: a block fault raised only at a rejected trial point of a variable-step solver does not stop the run (the
 *   step is rejected and retried smaller); the OM 501 lab runs 5 s with ode45 at the default tolerances.
 * XBV-171: a continuous STATE_SPACE integrates whatever sampleTime holds (Simulink continuous State-Space has no sample
 *   time): x' = -x + 1, y(1) = 1 - e^-1.
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { buildModel, runModel, type ModelSpec } from '../testkit';
import { OM501_MRPLD_LAB } from '../powertrain/examples/om501MrPldLab';

const flat = (v: unknown): number[] => (Array.isArray(v) ? (v as unknown[]).flatMap(flat) : [Number(v)]);
const exec = (type: string, params: Record<string, unknown>, ins: unknown[]) => {
  const b = BLOCK_LIBRARY[type]('b', params);
  return b.execute(ins as never, b.params, b.state, 0);
};

describe('XBV-065: DEADZONE element-wise', () => {
  it('[-2 0.3 2] with [-0.5, 0.5] -> [-1.5 0 1.5]; vector limits lower [-1 0], upper [1 0] on [-2 2] -> [-1 2]', () => {
    expect(flat(exec('DEADZONE', {}, [[-2, 0.3, 2]]).outputs[0])).toEqual([-1.5, 0, 1.5]);
    expect(flat(exec('DEADZONE', { lowerLimit: [-1, 0], upperLimit: [1, 0] }, [[-2, 2]]).outputs[0])).toEqual([-1, 2]);
  });
});

describe('XBV-169: MatrixConcat mode', () => {
  it("default mode 'vector': scalars and 1-D vectors join into one 1-D vector on either axis", () => {
    expect(exec('MatrixConcat', { axis: 0 }, [1, 2]).outputs[0]).toEqual([1, 2]);
    expect(exec('MatrixConcat', { axis: 0 }, [[1, 2], [3]]).outputs[0]).toEqual([1, 2, 3]);
    expect(exec('MatrixConcat', { axis: 1 }, [[1, 2], [3]]).outputs[0]).toEqual([1, 2, 3]);
  });
  it("mode 'multidimensional': axis 0 stacks rows, axis 1 places columns", () => {
    expect(exec('MatrixConcat', { axis: 0, mode: 'multidimensional' }, [[1, 2], [3, 4]]).outputs[0]).toEqual([[1, 2], [3, 4]]);
    expect(exec('MatrixConcat', { axis: 0, mode: 'multidimensional' }, [1, 2]).outputs[0]).toEqual([[1], [2]]);
    expect(exec('MatrixConcat', { axis: 1, mode: 'multidimensional' }, [[1, 2], [3, 4]]).outputs[0]).toEqual([[1, 3], [2, 4]]);
    expect(exec('MatrixConcat', { axis: 1, mode: 'multidimensional' }, [1, 2]).outputs[0]).toEqual([[1, 2]]);
  });
  it("matrices concatenate along the axis in both modes; a size mismatch is a block error", () => {
    for (const mode of ['vector', 'multidimensional']) {
      expect(exec('MatrixConcat', { axis: 0, mode }, [[[1, 2]], [[3, 4]]]).outputs[0]).toEqual([[1, 2], [3, 4]]);
      expect(exec('MatrixConcat', { axis: 0, mode }, [[[1, 2]], [[3]]]).error).toBeTruthy();
    }
  });
});

describe('XBV-171: continuous STATE_SPACE ignores sampleTime', () => {
  for (const sampleTime of [-1, 0, 0.1]) {
    it(`representation continuous, sampleTime ${sampleTime}: y(1) = 1 - e^-1 within 1e-6 (rk4 0.01)`, () => {
      const spec: ModelSpec = { blocks: [{ id: 'k', type: 'Constant', params: { value: 1 } }, { id: 's', type: 'STATE_SPACE', params: { sampleTime } }], wires: ['k.out -> s.u'] };
      const r = runModel(buildModel(spec), { solver: 'rk4', dt: 0.01, stopTime: 1, probes: ['s.y'] });
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(Math.abs(flat(r.signals['s.y'][r.t.length - 1])[0] - (1 - Math.exp(-1)))).toBeLessThanOrEqual(1e-6);
    });
  }
});

describe('XBV-165: a fault at a rejected trial point does not stop a variable-step run', () => {
  it('OM 501 lab, ode45 at the default tolerances, 5 s: no error, the run reaches 5 s', () => {
    const spec: ModelSpec = {
      blocks: OM501_MRPLD_LAB.nodes.map((n) => ({ id: n.id, type: n.type, params: n.params })),
      wires: OM501_MRPLD_LAB.edges.map((e) => `${e.source}.${e.sourceHandle} -> ${e.target}.${e.targetHandle}`),
    };
    const r = runModel(buildModel(spec), { solver: 'ode45', dt: OM501_MRPLD_LAB.fixedStep, stopTime: 5, probes: [] });
    expect(r.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`)).toEqual([]);
    expect(r.t.at(-1)).toBeCloseTo(5, 9);
  }, 240_000);
});

// ---------------------------------------------------------------- batch J (schema and properties panel)
import { XbridgesEngine } from '../XbridgesEngine';
import { BLOCK_GUIDANCE } from '../../../help/blockGuidance';

describe('XBV-153: divisor parameters set to 0 are refused at compile', () => {
  for (const [type, param] of [['IM_FOC_CONTROL', 'Lm'], ['AIR_FRYER_LEARNING_MODEL', 'tau_h'], ['AIR_FRYER_LEARNING_MODEL', 'tau_f'], ['AIR_FRYER_LEARNING_MODEL', 'tau_c'], ['AIR_FRYER_LEARNING_MODEL', 'tau_s'], ['FABRIC_HARMONIC_ANALYZER', 'drum_mass']] as const) {
    it(`${type}.${param} = 0 gives a PARAMETER_* error naming the block`, () => {
      const e = new XbridgesEngine(buildModel({ blocks: [{ id: 'u', type, params: { [param]: 0 } }], wires: [] }));
      const errs = e.compile(0).filter((d) => d.severity === 'error' && d.code.startsWith('PARAMETER_'));
      expect(errs.length).toBeGreaterThan(0);
      expect(errs.some((d) => (d.blockIds ?? []).includes('u'))).toBe(true);
    });
  }
});

describe('XBV-156: help text follows the one-based SubMatrix', () => {
  it('blockGuidance for SubMatrix does not describe zero-based defaults', () => {
    const g = BLOCK_GUIDANCE['xbridges:SubMatrix']; // registry keys are namespaced by module
    expect(g).toBeDefined();
    expect(JSON.stringify(g)).not.toMatch(/defaults? \(0\)|zero-based|index defaults \(0\)/i);
  });
});

// ---------------------------------------------------------------- batch K (catalogue and documentation)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');

describe('batch K: documentation states what the code does', () => {
  it('XBV-166: the solver help no longer says the canvas applies ODE23/ODE45/ODE23tb once per tick without adapting (WP-21 E1)', () => {
    const text = read('src/help/moduleTopics.ts');
    expect(text).not.toMatch(/do not adapt it|once per tick\)/);
    expect(text).toMatch(/RelTol|relative tolerance/i);
  });
  it('XBV-162: xbAccurateMath does not claim glibc sin is correctly rounded', () => {
    expect(read('src/utils/stateMachine/xbAccurateMath.ts')).not.toMatch(/glibc[^\n]*correctly rounded in practice/);
  });
  it("XBV-108: the embedded codegen document states that under 'retain' the discrete sample-hit counter is frozen while the owning state is inactive", () => {
    const doc = read('docs/XBRIDGES_EMBEDDED_CODEGEN.md');
    expect(doc).toMatch(/retain[^]{0,600}(sample[- ]hit counter|sample hits?)[^]{0,300}(frozen|freezes|paused|does not advance)/i);
  });
  it('XBV-109: docs/powertrain/ledger.json records per-block gate verdicts for every PT_ block, each citing a test file that exists', () => {
    const ledger = JSON.parse(read('docs/powertrain/ledger.json')) as { blocks: Record<string, { gates: Record<string, string>; tests: string[] }> };
    const pt = Object.keys(BLOCK_LIBRARY).filter((t) => t.startsWith('PT_')).sort();
    expect(Object.keys(ledger.blocks ?? {}).sort()).toEqual(pt);
    for (const t of pt) {
      const b = ledger.blocks[t];
      expect(Object.keys(b.gates ?? {}).length, t).toBeGreaterThan(0);
      expect((b.tests ?? []).length, t).toBeGreaterThan(0);
      for (const f of b.tests) expect(() => read(f), `${t}: ${f}`).not.toThrow();
    }
  });
});


// ---------------------------------------------------------------- batch K rework 1 (WP-21 K verifier)
// 1. Optional control inputs keep their default after the control -> continuous port-type remap: a canvas PID with
//    Enable / Reset left open generates C without XB_PORT_DANGLING (Simulink: an unconnected optional input is not an
//    error; base before batch K: 0 errors).
// 2. The catalogue units and types added by batch K add no new compile warnings to shipped lab wiring
//    (robot_vacuum_twin: wheel control V_L / V_R -> motor pwm_duty; environment is_docked -> battery / navigation).
// 3. An '@angle' unit follows angle_unit when the parameter is edited after the block was created.
import { adaptXBModel } from '../../../utils/stateMachine/xbModelAdapter';
import { validateXBModel } from '../../../utils/stateMachine/xbSemanticValidator';
import { EMBEDDED_TARGET } from '../testkit/embedded';

describe('batch K rework: optional control inputs stay optional for Generate C', () => {
  for (const t of ['PID_CONTROLLER', 'PID_BASIC']) {
    it(`${t} with Enable and Reset open validates for the embedded target without errors`, () => {
      const c = BLOCK_LIBRARY['Constant']('c', { value: 1 });
      const p = BLOCK_LIBRARY[t]('p', { sampleTime: 0.01 });
      const nodes = [c, p].map((b) => ({ id: b.id, data: { type: b.type, params: b.params, inputs: b.inputs.map((x) => ({ ...x, direction: 'input' })), outputs: b.outputs.map((x) => ({ ...x, direction: 'output' })) } }));
      const edges = p.inputs.filter((x) => x.id !== 'enable' && x.id !== 'reset').map((x, i) => ({ id: `e${i}`, source: 'c', sourceHandle: 'out', target: 'p', targetHandle: x.id }));
      const ad = adaptXBModel({ nodes, edges } as never);
      expect(ad.model).toBeDefined();
      const errs = validateXBModel(ad.model!, {}, EMBEDDED_TARGET).filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`);
      expect(errs).toEqual([]);
    });
  }
});

describe('batch K rework: no new unit / type warnings on robot vacuum lab wiring', () => {
  it('wheel control V_L / V_R -> motor pwm_duty and is_docked -> battery / navigation compile without UNIT_INCONSISTENCY or SIGNAL_TYPE_MISMATCH', () => {
    const e = new XbridgesEngine(buildModel({
      blocks: [
        { id: 'pid', type: 'ROBOT_VACUUM_WHEEL_CONTROL', params: { Kp_wheel: 12, Ki_wheel: 45, V_bat: 12 } },
        { id: 'ml', type: 'ROBOT_VACUUM_MOTOR', params: {} }, { id: 'mr', type: 'ROBOT_VACUUM_MOTOR', params: {} },
        { id: 'env', type: 'ROBOT_VACUUM_ENVIRONMENT', params: {} },
        { id: 'bat', type: 'ROBOT_VACUUM_BATTERY', params: {} }, { id: 'nav', type: 'ROBOT_VACUUM_NAV', params: {} },
      ],
      wires: ['pid.V_L -> ml.pwm_duty', 'pid.V_R -> mr.pwm_duty', 'env.is_docked -> bat.is_docked', 'env.is_docked -> nav.is_docked'],
    }));
    const w = e.compile(0).filter((d) => d.code === 'UNIT_INCONSISTENCY' || d.code === 'SIGNAL_TYPE_MISMATCH').map((d) => d.message);
    expect(w).toEqual([]);
  });
});

describe("batch K rework: '@angle' units follow angle_unit edited after creation", () => {
  it('ACOS (deg) -> COS created in rad then edited to deg compiles without UNIT_INCONSISTENCY', () => {
    const m = buildModel({ blocks: [{ id: 'a', type: 'ACOS', params: { angle_unit: 'deg' } }, { id: 'c', type: 'COS', params: {} }], wires: ['a.y -> c.u'] });
    const cos = m.blocks.find((b) => b.id === 'c')!;
    cos.params = { ...cos.params, angle_unit: 'deg' }; // the properties panel edits params only
    const w = new XbridgesEngine(m).compile(0).filter((d) => d.code === 'UNIT_INCONSISTENCY').map((d) => d.message);
    expect(w).toEqual([]);
  });
});
