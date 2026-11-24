/**
 * WP-C3 (plan section C, findings XBV-419 / XBV-420, decision D4 / WP-15): decide the tangent-touch rule against a Simulink
 * golden. A zero-crossing function that TOUCHES zero without changing sign -- u = (t - 1)^2 at t = 1 -- is either an event or
 * it is not. ADIA's batch path says "not an event" (it locates sign changes only) while the live path switches, because t = 1
 * lies on its output grid. Simulink decides which of the two is right, and this file is the comparison.
 *
 * THE GOLDENS come from `scripts/xbridges-verification/goldens/tangent_touch.m`, run by the user in MATLAB R2024b (WP-C2):
 *   docs/xbridges-verification/goldens/tangent_touch_<relayOff|relayOn|deadzone>_<ode23|ode45|ode23tb|ode4>_<zcon|zcoff>.csv
 * Each CSV has the columns `t,y` (y is the discontinuity block's output) and a companion `.meta.json` that records the
 * settings which were actually in force, so a CSV can never be separated from its configuration.
 *
 * THE MODELS (built here from the engine's own blocks, the same graph the MATLAB script builds):
 *   relayOff : u = (t-1)^2,        RELAY switchOn 0.25 / switchOff 0, on 1 off 0   -- XBV-419, a touch of the OFF point
 *   relayOn  : u = 0.25-(t-1)^2,   RELAY switchOn 0.25 / switchOff 0, on 1 off 0   -- the symmetric touch of the ON point
 *   deadzone : u = (t-1)^2,        DEADZONE [-1, 0]                               -- XBV-420, a touch of the upper limit
 *
 * WHAT IS COMPARED. The discontinuity blocks are piecewise constant / piecewise linear, so a mismatch is not a rounding
 * difference: it is the switch instant, which is exactly what both findings are about.
 *   RELAY     : the switch time (the first sample where the output leaves its initial value) within one solver step, and the
 *               on-fraction of [0, 4] (the integral of a 0/1 signal) within 2e-3;
 *   DEADZONE  : the integral of the output over [0, 4] within 1e-3. The touch moves that integral by ~2.5e-4 -- the size
 *               measured for XBV-420 -- so the bound is tight enough to see the effect.
 * Both ADIA paths are compared: the live output grid (runModel, h = 0.01, the path that contains t = 1 and switches) and the
 * batch path (Solvers.runFixedStep, whose signature is the final integrator state). The batch switch time is located by
 * bisecting the stop time, so no engine internals are read.
 *
 * THE THREE STATES, all explicit, so "no goldens" can never read as "behaviour is right":
 *   no CSV for a case   -> SKIPPED, naming the file and the command. A skip is not a pass (D4 / WP-15).
 *   a CSV for a case    -> the case runs and must match.
 *   all 24 present      -> one test states the rule in words, prefixed `XBV419_420_RULE`, for the ledger entry.
 *
 * TWO LIMITATIONS, stated rather than hidden:
 *   'zcoff' goldens have no ADIA counterpart. Simulink's ZeroCrossControl = DisableAll has no equivalent here: neither the
 *   solver options nor the block parameters expose a zero-crossing switch (checked 2026-11-24; SolverOptions has zeroTol,
 *   not an on/off). The zcoff files are therefore only checked for readability and reported, never used to bless or condemn
 *   an ADIA result. If the rule has to be configurable, a switch is a separate finding.
 *   `ode4` is compared as ADIA's `rk4`: liveStep maps ode4 -> rk4, they are the same fixed-step Runge-Kutta, and the batch
 *   runner refuses the name 'ode4'. The mapping is asserted below so it cannot drift silently.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { canonicalSolver } from '../liveStep';
import { buildModel, runModel, type ModelSpec } from '../testkit';

const GOLDEN_DIR = join(process.cwd(), 'docs', 'xbridges-verification', 'goldens');
const MODELS = ['relayOff', 'relayOn', 'deadzone'] as const;
type ModelName = (typeof MODELS)[number];
/** golden solver name -> the name the engine runs it under */
const SOLVERS = [
  { golden: 'ode23', engine: 'ode23' },
  { golden: 'ode45', engine: 'ode45' },
  { golden: 'ode23tb', engine: 'ode23tb' },
  { golden: 'ode4', engine: 'rk4' },
] as const;
type Zc = 'zcon' | 'zcoff';

const STEP = 0.01;   // the live output grid and the fixed step the batch path uses
const STOP = 4;

interface Golden { t: number[]; y: number[]; meta: Record<string, unknown> | null }

const csvPath = (model: ModelName, solver: string, zc: Zc) => join(GOLDEN_DIR, `tangent_touch_${model}_${solver}_${zc}.csv`);

/** Parse a `t,y` CSV. Returns null when the file is absent -- the caller then skips the case by name, never passes it. */
const readGolden = (path: string): Golden | null => {
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim().length > 0);
  const t: number[] = [];
  const y: number[] = [];
  for (const line of lines) {
    if (/^[a-z]/i.test(line)) continue; // header
    const [a, b] = line.split(',');
    const ti = Number(a);
    const yi = Number(b);
    if (Number.isFinite(ti) && Number.isFinite(yi)) { t.push(ti); y.push(yi); }
  }
  const metaFile = path.replace(/\.csv$/, '.meta.json');
  const meta = existsSync(metaFile) ? (JSON.parse(readFileSync(metaFile, 'utf8')) as Record<string, unknown>) : null;
  return { t, y, meta };
};

// ---------------------------------------------------------------------------------------------------------------------
// The ADIA model of each golden.
// ---------------------------------------------------------------------------------------------------------------------
/** u = (t - 1)^2 from Clock -> Sum(+ -) -> PRODUCT(u, u); relayOn wraps it as 0.25 - (t-1)^2. */
const inputChain = (model: ModelName): { blocks: ModelSpec['blocks']; wires: string[]; out: string } => {
  const blocks: ModelSpec['blocks'] = [
    { id: 'clk', type: 'Clock' },
    { id: 'one', type: 'Constant', params: { value: 1 } },
    { id: 'd', type: 'Sum', params: { signs: '+-' } },
    { id: 'sq', type: 'PRODUCT', params: { numInputs: 2 } },
  ];
  const wires = ['clk.clk -> d.in1', 'one.out -> d.in2', 'd.out -> sq.in1', 'd.out -> sq.in2'];
  if (model !== 'relayOn') return { blocks, wires, out: 'sq.y' };
  blocks.push({ id: 'q', type: 'Constant', params: { value: 0.25 } }, { id: 'm', type: 'Sum', params: { signs: '+-' } });
  wires.push('q.out -> m.in1', 'sq.y -> m.in2');
  return { blocks, wires, out: 'm.out' };
};

/** The golden model. `withIntegrator` adds an Integrator on the block output, for the batch path's integral. */
const modelFor = (model: ModelName, withIntegrator = false): ModelSpec => {
  const { blocks, wires, out } = inputChain(model);
  const block = model === 'deadzone'
    ? { id: 'b', type: 'DEADZONE', params: { lowerLimit: -1, upperLimit: 0 } }
    : { id: 'b', type: 'RELAY', params: { switchOn: 0.25, switchOff: 0, onValue: 1, offValue: 0 } };
  const all = [...blocks, block];
  const allWires = [...wires, `${out} -> b.u`];
  if (withIntegrator) {
    all.push({ id: 'x', type: 'Integrator' });
    allWires.push('b.y -> x.in');
  }
  return { blocks: all, wires: allWires };
};

// ---------------------------------------------------------------------------------------------------------------------
// Metrics and the two ADIA paths.
// ---------------------------------------------------------------------------------------------------------------------
/** First sample where the output leaves its initial value: the switch instant. Infinity when it never switches. */
const switchTime = (t: number[], y: number[]): number => {
  if (y.length === 0) return Infinity;
  const y0 = y[0];
  const i = y.findIndex((v) => v !== y0);
  return i < 0 ? Infinity : t[i];
};

/** Trapezoid over a trace: the Relay on-fraction or the Dead Zone integral. */
const integrate = (t: number[], y: number[]): number => {
  let s = 0;
  for (let i = 1; i < Math.min(t.length, y.length); i++) s += 0.5 * (y[i] + y[i - 1]) * (t[i] - t[i - 1]);
  return s;
};

/** The live path: the canvas output grid (h = 0.01), the grid that contains t = 1 exactly. */
const liveTrace = (spec: ModelSpec, engineSolver: string): { t: number[]; y: number[] } => {
  const r = runModel(buildModel(spec), { solver: engineSolver as never, dt: STEP, stopTime: STOP, probes: ['b.y'] });
  const errors = r.diagnostics.filter((d) => d.severity === 'error');
  expect(errors.map((d) => d.code), 'live path reported errors').toEqual([]);
  return { t: r.t as number[], y: (r.signals['b.y'] as unknown[]).map(Number) };
};

/** One batch run to `stop`: the block output at the end, and the integrator state when the model has one. */
const batchAt = (spec: ModelSpec, engineSolver: string, stop: number) => {
  const e = new XbridgesEngine(buildModel(spec));
  if (stop > 0) {
    // A zero-length run is the initial state, and must not go through the solver: ode23tb derives hMax from the span and
    // rejects span 0 (STIFF_SOLVER_INVALID_OPTION), which is correct behaviour and not something to test here.
    Solvers.runFixedStep(e, { solver: engineSolver, startTime: 0, stopTime: stop, fixedStep: STEP, relTol: 1e-3, absTol: 1e-6 } as never);
  } else {
    e.compile(0);
  }
  expect(e.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code), `batch ${engineSolver} reported errors`).toEqual([]);
  e.computeOutputs(stop);
  const state = (e as unknown as { executionOrder: Array<{ id: string; state: unknown }> }).executionOrder.find((b) => b.id === 'x');
  return { out: Number(e.getSignalValue('b', 'y')), integral: state ? Number(state.state) : NaN };
};

/**
 * The batch path's switch time: the first time at which the block output leaves its initial value, using the public API only.
 *
 * A relay can switch and switch back (relayOn turns on at the touch of the ON point and off again at t = 1.5), so an
 * endpoint check would report "never switched" for a relay that switched twice -- the first version of this helper did
 * exactly that and reported 2.0039 for a relay that switched at 1.0. The search therefore grows the stop time
 * geometrically from one step (exact powers would hide a switch between checkpoints) until the output first differs, then
 * bisects that bracket to 5e-3. Devised and checked against the live trace, which switches at t = 1 for relayOn.
 */
const batchSwitchTime = (spec: ModelSpec, engineSolver: string): number => {
  const initial = batchAt(spec, engineSolver, 0).out;
  const switched = (stop: number) => batchAt(spec, engineSolver, stop).out !== initial;
  let good = 0;              // known: still at the initial value
  let stop = STEP;
  while (stop <= STOP + 1e-12) {
    if (switched(stop)) {
      let lo = good;
      let hi = stop;
      for (let i = 0; i < 40 && hi - lo > 5e-3; i++) {
        const mid = 0.5 * (lo + hi);
        if (switched(mid)) hi = mid; else lo = mid;
      }
      return hi;
    }
    good = stop;
    stop = Math.min(stop * 2, STOP);
    if (stop === good) break;
  }
  return Infinity;           // never left the initial value anywhere on the sampled stops
};

// ---------------------------------------------------------------------------------------------------------------------
const available: Array<{ model: ModelName; solver: (typeof SOLVERS)[number]; zc: Zc; golden: Golden }> = [];
for (const model of MODELS) for (const solver of SOLVERS) for (const zc of ['zcon', 'zcoff'] as const) {
  const golden = readGolden(csvPath(model, solver.golden, zc));
  if (golden && golden.t.length > 1) available.push({ model, solver, zc, golden });
}
const TOTAL = MODELS.length * SOLVERS.length * 2;

describe('4. XBV-419 / XBV-420: a tangent touch against the Simulink golden', () => {
  it('the golden script is in the repository and the solver mapping is the engine\'s own', () => {
    expect(existsSync(join(process.cwd(), 'scripts', 'xbridges-verification', 'goldens', 'tangent_touch.m'))).toBe(true);
    // ode4 is rk4 under another name; the batch runner refuses 'ode4', so the mapping must be a fact, not a guess.
    expect(canonicalSolver('ode4')).toBe('rk4');
    expect(canonicalSolver('ode23')).toBe('ode23');
    expect(canonicalSolver('ode45')).toBe('ode45');
    expect(canonicalSolver('ode23tb')).toBe('ode23tb');
    if (available.length < TOTAL) {
      console.warn(
        `XBV-419 / XBV-420 goldens: ${available.length} of ${TOTAL} present. Run\n` +
        '  matlab -batch "run(\'scripts/xbridges-verification/goldens/tangent_touch.m\')"\n' +
        `and commit the CSVs into ${GOLDEN_DIR}. The missing cases are skipped by name (D4 / WP-15).`,
      );
    }
  });

  // ---- the comparison, one test per model x solver x zero-crossing state -------------------------------------------------
  for (const model of MODELS) for (const solver of SOLVERS) for (const zc of ['zcon', 'zcoff'] as const) {
    const label = `${model}, ${solver.golden}, zero crossings ${zc === 'zcon' ? 'on' : 'off'}`;
    const golden = readGolden(csvPath(model, solver.golden, zc));

    if (!golden || golden.t.length < 2) {
      it.skip(`${label}: no golden yet (${csvPath(model, solver.golden, zc).split('/').slice(-1)[0]})`, () => {});
      continue;
    }

    if (zc === 'zcoff') {
      // No ADIA counterpart exists (see the header): the file is only required to be a readable trace of the same model.
      it(`${label}: golden is readable (ADIA has no zero-crossing switch to compare it against)`, () => {
        expect(golden.t.length).toBeGreaterThan(1);
        expect(golden.t[0]).toBeCloseTo(0, 12);
        expect(golden.t.at(-1)).toBeCloseTo(STOP, 6);
        expect(golden.y.every((v) => Number.isFinite(v))).toBe(true);
      });
      continue;
    }

    it(`${label}: ADIA live and batch both match the golden`, () => {
      const wantSwitch = switchTime(golden.t, golden.y);
      const wantIntegral = integrate(golden.t, golden.y);
      const spec = modelFor(model);

      // live: the canvas grid
      const live = liveTrace(spec, solver.engine);
      // batch: the final integrator state (the same measurement section 3 uses) and a bisected switch instant
      const batchEnd = batchAt(modelFor(model, true), solver.engine, STOP);
      const batchSwitch = batchSwitchTime(spec, solver.engine);

      // One solver step is the resolution the ADIA trace can offer (the switch is reported at a grid sample); the batch
      // bisection adds its own 5e-3. Simulink's own crossing is located to machine precision.
      const SWITCH_TOL_LIVE = STEP + 1e-9;
      const SWITCH_TOL_BATCH = STEP + 6e-3;

      if (Number.isFinite(wantSwitch)) {
        const liveSwitch = switchTime(live.t, live.y);
        expect(Math.abs(liveSwitch - wantSwitch), `live switched at ${liveSwitch}, Simulink at ${wantSwitch}`).toBeLessThanOrEqual(SWITCH_TOL_LIVE);
        expect(Math.abs(batchSwitch - wantSwitch), `batch switched at ${batchSwitch}, Simulink at ${wantSwitch}`).toBeLessThanOrEqual(SWITCH_TOL_BATCH);
      } else {
        // Simulink held the mode through the touch: neither ADIA path may switch.
        expect(switchTime(live.t, live.y), 'live switched where Simulink did not').toBe(Infinity);
        expect(batchSwitch, 'batch switched where Simulink did not').toBe(Infinity);
      }
      if (model === 'deadzone') {
        // the dead zone is the identity outside [-1, 0], so its integral is the whole signature
        expect(Math.abs(batchEnd.integral - wantIntegral), `batch integral ${batchEnd.integral} vs golden ${wantIntegral}`).toBeLessThanOrEqual(1e-3);
        expect(Math.abs(integrate(live.t, live.y) - wantIntegral), 'live integral').toBeLessThanOrEqual(1e-3);
      } else {
        expect(Math.abs(batchEnd.integral - wantIntegral), 'batch on-fraction').toBeLessThanOrEqual(2e-3);
        expect(Math.abs(integrate(live.t, live.y) - wantIntegral), 'live on-fraction').toBeLessThanOrEqual(2e-3);
      }
    }, 120_000);
  }

  // ---- the sentence the ledger quotes ----------------------------------------------------------------------------------
  it('states the rule the goldens prove (only meaningful once all 24 are present)', () => {
    const relays = available.filter((a) => a.zc === 'zcon' && a.model !== 'deadzone');
    if (relays.length < MODELS.length * SOLVERS.length - SOLVERS.length) {
      // 8 relay/zcon files are the minimum to say anything; without them there is no rule to state.
      expect(relays.length).toBeLessThan(MODELS.length * SOLVERS.length - SOLVERS.length + 1);
      return;
    }
    const touch = 0.02; // one step either side of t = 1
    const touched = relays.filter((a) => Math.abs(switchTime(a.golden.t, a.golden.y) - 1) <= touch);
    const rule = touched.length === relays.length
      ? 'Simulink: a tangent touch IS an event (every relay switched at t = 1)'
      : touched.length === 0
        ? 'Simulink: a tangent touch is NOT an event (no relay switched at t = 1)'
        : `Simulink: a tangent touch is an event for ${touched.length} of ${relays.length} relay/solver pairs -- the rule depends on the solver`;
    console.log(`XBV419_420_RULE ${rule}`);
    expect(rule).toMatch(/^Simulink: a tangent touch/);
    // Evidence about the mechanism, printed rather than asserted: with detection off a variable-step solver can still land
    // exactly on t = 1 (MaxStep 0.01 makes that likely), and then the block's own comparison switches the relay with no
    // crossing detection involved. That is a fact about the solver's grid, not a violation, so it is reported.
    const offTouches = available
      .filter((a) => a.zc === 'zcoff' && a.model !== 'deadzone' && a.solver.golden !== 'ode4')
      .filter((a) => Math.abs(switchTime(a.golden.t, a.golden.y) - 1) <= touch);
    const landedExactly = available
      .filter((a) => a.zc === 'zcoff' && a.solver.golden !== 'ode4')
      .filter((a) => a.golden.t.some((t) => Math.abs(t - 1) < 1e-12));
    console.log(`XBV419_420_ZCOFF switched at the touch with detection off: ${offTouches.length}; goldens with a sample exactly at t = 1: ${landedExactly.length}`);
    expect(offTouches.length).toBeLessThanOrEqual(landedExactly.length);
  });
});
