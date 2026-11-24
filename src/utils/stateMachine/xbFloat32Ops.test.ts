/**
 * WP-A1 acceptance for XBV-434 / D20 (plan: docs/superpowers/plans/2026-11-24-xbridges-open-findings.md, section A).
 *
 * WHAT THIS FILE PINS
 *   A `float32` signal must behave like Simulink `single` / Embedded Coder: every arithmetic operation rounds to float, and
 *   the float libm function is the one that runs. Not "the double equation, rounded once when the signal is written".
 *   Scope: the WP-A0 inventory (docs/xbridges-verification/float32-inventory.md) — 19 multi-op blocks and 32 libm blocks.
 *
 * ORACLES (independent of the code under test)
 *   1. Hand arithmetic on IEEE float32, written next to each expectation (`16777216 + 1 = 16777216`: the ulp is 2, so the
 *      addend is lost; 16777218 + 1 = 16777218: the sum is 16777219 and ties to even). Where the operands are not
 *      hand-computable, the oracle is `Math.fround` applied between the operations, one per operation.
 *   2. For the libm blocks the C compiler is the oracle: the generated C and the interpreter are both run, and the
 *      question is whether they agree (0 ULP) and whether the value is the *float* function's.
 *
 * THE ONE CONTRACT THIS FILE DELIBERATELY DOES NOT SET AT 0 ULP
 *   Decision D23 (measured, gcc 12 / glibc 2.36, 32768 float32 arguments per function; no FMA contraction):
 *
 *     fround(Math.sin(x))  != sinf(x)   326/32768   max 1 ULP       fround(Math.cos(x))  != cosf(x)   532  max 1 ULP
 *     fround(Math.exp(x))  != expf(x)    24/32768   max 1 ULP       fround(Math.log(x))  != logf(x)   110  max 1 ULP
 *     fround(Math.pow(x))  != powf(x)  2654/32768   max 1 ULP       fround(Math.tanh(x)) != tanhf(x)  8756  max 2 ULP
 *     fround(Math.atan(x)) != atanf(x) 1214/32768   max 1 ULP       fround(Math.asin(x)) != asinf(x)  2480  max 1 ULP
 *     fround(Math.sqrt(x)) == sqrtf(x)    0/32768   exact
 *
 *   So for sin/cos/exp/log/pow/atan/asin the interpreter contract is **interpreter = C at ≤ 1 float32 ULP**, and `sqrt` is
 *   exact. A 0-ULP libm contract would need a float-libm shim that reproduces glibc bit for bit; that is a separate
 *   decision with a real cost (a table or a port of glibc's algorithms) and this file does not assume it.
 *
 * STATUS WHEN COMMITTED: every assertion below describes the target and the file fails today for the reasons in the WP-A0
 * doc (both sides round once at the write; both sides call the double function). Committing it first is the point.
 */
import { afterAll, describe, expect, it } from 'vitest';
import {
  compileAndRunParity, DEFAULT_PARITY_FLAGS, EMBEDDED_TARGET, generateParitySources, interpretIr, PARITY_STATE_ID,
  parseParityOutput, renderParityHarness, toEmbeddedModel, ulpDistance, type ModelSpec,
} from '../../engine/xbridges/testkit';
import { buildSemanticModel } from './smSemanticBuilder';
import { hybridXBridgesFixture } from './smFixtures';
import { buildXBSemanticModel } from './xbSemanticBuilder';
import { validateXBModel } from './xbSemanticValidator';
import type { SemanticModel } from './smSemanticModel';

const f32 = Math.fround;
const REPORT: Record<string, unknown> = {};
afterAll(() => {
  // one machine-readable line per run, so a reviewer can see the measured state without reading the assertions
  // eslint-disable-next-line no-console
  console.log(`XBV434_REPORT ${JSON.stringify(REPORT)}`);
});

// ------------------------------------------------------------------ build the IR the parity gate builds, at a chosen precision
type Precision = 'float32' | 'float64';

function buildTyped(
  spec: ModelSpec,
  precision: Precision,
  o: { dt?: number; dims?: Record<string, number[]> } = {},
): { ir: SemanticModel; errors: string[] } {
  const dt = o.dt ?? 0.05;
  const xb = toEmbeddedModel(spec, { solver: 'discrete', dt, portDimensions: o.dims });
  for (const node of xb.nodes as unknown as { parameters: { inputs: { dataType: string }[]; outputs: { dataType: string }[] } }[]) {
    for (const p of [...node.parameters.inputs, ...node.parameters.outputs]) p.dataType = precision;
  }
  (xb as { policy: unknown }).policy = { memory: 'reset', numericFault: 'signal-only' };
  const sm = hybridXBridgesFixture();
  sm.tickMs = Math.round(dt * 1000);
  sm.states[0].autostart = false;
  sm.states.find((s) => s.id === PARITY_STATE_ID)!.autostart = true;
  const shell = buildSemanticModel(sm);
  if (!shell.ir) throw new Error(`shell IR missing: ${JSON.stringify(shell.diagnostics)}`);
  const built = buildXBSemanticModel({
    stateId: PARITY_STATE_ID, ownerState: shell.stateSymbols?.get(PARITY_STATE_ID), model: xb, variables: {},
    target: EMBEDDED_TARGET, baseTickMs: sm.tickMs,
  });
  const diagnostics: { severity?: unknown; message?: string }[] = [...validateXBModel(xb, {}, EMBEDDED_TARGET), ...built.diagnostics];
  const errors = diagnostics.filter((d) => String(d.severity) === 'error').map((d) => String(d.message));
  if (!built.ir) throw new Error(`X-Bridges IR missing: ${errors.join(' | ')}`);
  const ir: SemanticModel = {
    ...shell.ir,
    states: { ...shell.ir.states, [PARITY_STATE_ID]: { ...shell.ir.states[PARITY_STATE_ID], xBridges: built.ir } },
  };
  return { ir, errors };
}

/** Probe values after `ticks` ticks, interpreter side (the last tick). */
function interpretAt(ir: SemanticModel, ticks: number, probes: string[]): Record<string, number[]> {
  const r = interpretIr(ir, ticks, probes);
  if (r.error) throw new Error(`interpreter error: ${r.error}`);
  return Object.fromEntries(probes.map((p) => [p, r.signals[p][r.signals[p].length - 1] ?? []]));
}

/**
 * Probe values after `ticks` ticks, generated-C side. One compile per call. The harness prints comma-separated values and
 * `parseParityOutput` knows each probe's width from the generated header, so vectors and matrices arrive whole.
 */
async function runC(ir: SemanticModel, ticks: number, probes: string[]): Promise<Record<string, number[]>> {
  const sources = generateParitySources(ir);
  const out = await compileAndRunParity(sources, renderParityHarness(ir, sources, ticks, probes), { flags: DEFAULT_PARITY_FLAGS });
  if (!out.ok) throw new Error(`C harness failed: ${out.log.split('\n').slice(0, 6).join(' | ')}`);
  const perTick = parseParityOutput(ir, sources, probes, out.stdout);
  return Object.fromEntries(probes.map((p) => [p, perTick[p][perTick[p].length - 1] ?? []]));
}

/** Float32 ULP distance (0 == the same float32 bits). */
const ulps = (a: number, b: number): number => {
  if (Number.isNaN(a) && Number.isNaN(b)) return 0;
  const d = ulpDistance(a, b, 'float32');
  return Number.isFinite(d) ? d : Number.POSITIVE_INFINITY;
};

const flat = (m: Record<string, number[]>, p: string): number[] => m[p];

// ------------------------------------------------------------------ 1. Sum: float32 accumulation, left to right in port order
describe('XBV-434 acceptance: Sum accumulates in float32, left to right in port order', () => {
  /** The Simulink Sum contract for `single`: one rounding per addition, port order. */
  const oracle = (values: number[], signs: string): number =>
    values.reduce((acc, v, i) => f32(acc + (signs[i] === '-' ? -f32(v) : f32(v))), f32(0));

  const sumModel = (values: number[], signs: string): ModelSpec => ({
    blocks: [
      { id: 'sum', type: 'Sum', params: { signs } },
      ...values.map((value, i) => ({ id: `k${i}`, type: 'Constant', params: { value } })),
    ],
    wires: values.map((_, i) => `k${i}.out -> sum.in${i + 1}`),
  });

  it('+++ of 16777216, 1, 1 is 16777216 (the D20 example)', async () => {
    // hand arithmetic: f32(16777216) = 16777216 with ulp 2, so 16777216 + 1 = 16777217 rounds to 16777216 (ties to
    // even), and again 16777216 + 1 = 16777216. The double accumulation this finding is about gives 16777218.
    const { ir, errors } = buildTyped(sumModel([16777216, 1, 1], '+++'), 'float32');
    expect(errors).toEqual([]);
    expect(oracle([16777216, 1, 1], '+++')).toBe(16777216);
    expect(16777216 + 1 + 1).toBe(16777218);
    expect(interpretAt(ir, 1, ['sum.out'])['sum.out']).toEqual([16777216]);
    expect((await runC(ir, 1, ['sum.out']))['sum.out']).toEqual([16777216]);
  });

  it('+-+ of 16777216, 1, -1: the sign is applied per term, then added in float32', () => {
    // 16777216 - 1 = 16777215 (odd, so exact in float32); 16777215 + (-1) = 16777214 (exact)
    expect(oracle([16777216, 1, -1], '+-+')).toBe(16777214);
    expect(16777216 - 1 - 1).toBe(16777214); // this one is exact in double too: a guard, not a defect case
    const { ir } = buildTyped(sumModel([16777216, 1, -1], '+-+'), 'float32');
    expect(interpretAt(ir, 1, ['sum.out'])['sum.out']).toEqual([16777214]);
  });

  it('five inputs, checked against the per-operation oracle', () => {
    const values = [16777216, 1, 1, 1, 1];
    expect(oracle(values, '+++++')).toBe(16777216);
    const { ir } = buildTyped(sumModel(values, '+++++'), 'float32');
    expect(interpretAt(ir, 1, ['sum.out'])['sum.out']).toEqual([16777216]);
  });

  it('five inputs where per-operation and once-at-the-end differ by 1 ULP', () => {
    // found by a search over float32 operands (the search is in the WP-A1 report; hand-checked below).
    const values = [-161.7991485595703, -645.075439453125, 584.0784301757812, -520.9913330078125, 847.5048828125];
    const perOp = oracle(values, '+++++');
    let once = 0;
    for (const v of values) once += v;
    expect(f32(once)).not.toBe(perOp);
    const { ir } = buildTyped(sumModel(values, '+++++'), 'float32');
    expect(interpretAt(ir, 1, ['sum.out'])['sum.out']).toEqual([perOp]);
  });

  it('a two-input Sum has one rounding and must not move (regression guard)', () => {
    const { ir } = buildTyped(sumModel([16777216, 1], '++'), 'float32');
    expect(interpretAt(ir, 1, ['sum.out'])['sum.out']).toEqual([16777216]);
  });

  it('a float64 Sum is unchanged: 16777216 + 1 + 1 = 16777218', () => {
    const { ir } = buildTyped(sumModel([16777216, 1, 1], '+++'), 'float64');
    expect(interpretAt(ir, 1, ['sum.out'])['sum.out']).toEqual([16777218]);
  });
});

// ------------------------------------------------------------------ 2. Product
describe('XBV-434 acceptance: Product multiplies and divides in float32', () => {
  const productModel = (values: number[], operation: 'multiply' | 'divide'): ModelSpec => ({
    blocks: [
      { id: 'p', type: 'PRODUCT', params: { operation, numInputs: values.length } },
      ...values.map((value, i) => ({ id: `k${i}`, type: 'Constant', params: { value } })),
    ],
    wires: values.map((_, i) => `k${i}.out -> p.in${i + 1}`),
  });

  it('three factors where the two roundings differ', () => {
    const [a, b, c] = [1.9505831003189087, 1.9193779230117798, 1.6184961795806885];
    const perOp = f32(f32(f32(a) * f32(b)) * f32(c));
    expect(f32(a * b * c)).not.toBe(perOp);
    expect(perOp).toBe(6.059497356414795);
    const { ir, errors } = buildTyped(productModel([a, b, c], 'multiply'), 'float32');
    expect(errors).toEqual([]);
    expect(interpretAt(ir, 1, ['p.y'])['p.y']).toEqual([perOp]);
  });

  it('division rounds after each division, not once', () => {
    const [a, b, c] = [0.5891439318656921, 1.9303267002105713, 0.905785858631134];
    const perOp = f32(f32(f32(a) / f32(b)) / f32(c));
    expect(f32(a / b / c)).not.toBe(perOp);
    expect(perOp).toBe(0.3369497060775757);
    const { ir } = buildTyped(productModel([a, b, c], 'divide'), 'float32');
    expect(interpretAt(ir, 1, ['p.y'])['p.y']).toEqual([perOp]);
  });

  it('a two-factor Product keeps its single rounding', () => {
    const [a, b] = [1.9505831003189087, 1.9193779230117798];
    const { ir } = buildTyped(productModel([a, b], 'multiply'), 'float32');
    expect(interpretAt(ir, 1, ['p.y'])['p.y']).toEqual([f32(f32(a) * f32(b))]);
  });
});

// ------------------------------------------------------------------ 3. MatrixMul
describe('XBV-434 acceptance: MatrixMul accumulates each element in float32', () => {
  it('3x3 where the accumulation order changes three of the nine elements', () => {
    const A = [[1, 2, 3], [4, 5, 6], [7, 8, 10]];
    const B = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6], [0.7, 0.8, 0.9]];
    const perOp: number[] = [];
    const once: number[] = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let total = f32(0);
        for (let k = 0; k < 3; k++) total = f32(total + f32(f32(A[i][k]) * f32(B[k][j])));
        perOp.push(total);
        let dbl = 0;
        for (let k = 0; k < 3; k++) dbl += A[i][k] * B[k][j];
        once.push(f32(dbl));
      }
    }
    // elements 5, 7 and 8 (row-major) are where the two disagree
    expect(perOp.filter((v, i) => v !== once[i]).length).toBe(3);

    const spec: ModelSpec = {
      blocks: [
        { id: 'm', type: 'MatrixMul', params: {} },
        { id: 'a', type: 'Constant', params: { value: A } },
        { id: 'b', type: 'Constant', params: { value: B } },
      ],
      wires: ['a.out -> m.in1', 'b.out -> m.in2'],
    };
    const { ir, errors } = buildTyped(spec, 'float32', { dims: { 'a.out': [3, 3], 'b.out': [3, 3], 'm.in1': [3, 3], 'm.in2': [3, 3], 'm.out': [3, 3] } });
    expect(errors).toEqual([]);
    expect(flat(interpretAt(ir, 1, ['m.out']), 'm.out')).toEqual(perOp);
  });
});

// ------------------------------------------------------------------ 4. Stateful discrete blocks, 100 ticks against a step-by-step oracle
describe('XBV-434 acceptance: discrete state updates round per operation (100 ticks)', () => {
  const TICKS = 100;

  it('Discrete-Time Integrator: with a tick-aligned sample time the update is a single rounding, and it is right', async () => {
    // Why this one is NOT a per-operation case: the engine requires the solver step to divide the state-machine base tick
    // exactly, so any sample time it accepts is a power-of-two multiple of the tick, and for a power-of-two dt the product
    // dt*u is exact in float32. `y + dt*u` then really is one rounding, which is what the block does today.
    // (Searches over 2e6 random u values with dt = 2^-2, 2^-3, 0.05, 0.1 and 0.2 found no input where rounding dt*u
    //  separately changes the result.)
    // The trapezoidal method is where a genuine intermediate rounding appears: y + (0.5*dt)*(u + u_prev) has its own
    // addition and its own product. That case needs a VARYING input to separate the two, and it is the one WP-A3 adds.
    const solverDt = 0.05; // == the state-machine tick: the block's sample time has to divide the tick
    const dt = 0.05;
    const u = f32(0.3);
    // The block takes TICKS - 1 steps over TICKS ticks: the first tick only initialises the state slot (the engine's
    // convention, observed in the float64 run below as well).
    let y = f32(0);
    for (let i = 0; i < TICKS - 1; i++) y = f32(y + f32(f32(dt) * u));
    let once = 0;
    for (let i = 0; i < TICKS - 1; i++) once = f32(once + dt * u);
    expect(y).toBe(once); // the two agree here, which is the point of the comment above

    const spec: ModelSpec = {
      blocks: [
        { id: 'i', type: 'INTEGRATOR_DISCRETE', params: { sample_time: dt, method: 'forward_euler' } },
        { id: 'u', type: 'Constant', params: { value: u } },
      ],
      wires: ['u.out -> i.u'],
    };
    const { ir, errors } = buildTyped(spec, 'float32', { dt: solverDt });
    expect(errors).toEqual([]);
    expect(interpretAt(ir, TICKS, ['i.y'])['i.y'][0]).toBe(y);
    expect((await runC(ir, TICKS, ['i.y']))['i.y'][0]).toBe(y);
  });

  it('Discrete Transfer Fcn, 100 ticks, against the recurrence written here', () => {
    // y(k) = 0.2 u(k) + 0.7 y(k-1) for u = 1, in the direct form the engine uses: one rounding per product and per
    // addition. (For this pair of coefficients the recurrence has a closed form with period 3, so the steady value does
    // not depend on the number of ticks -- 100 or 99 ticks give the same float32 result.)
    const num = [0.2];
    const den = [1, -0.7];
    let y = f32(0);
    for (let k = 0; k < TICKS; k++) {
      const a = f32(f32(num[0]) * f32(1));
      const b = f32(f32(-den[1]) * y);
      y = f32(a + b);
    }
    // the same recurrence in double, rounded once per tick: one float32 ULP above the per-operation value
    let dbl = 0;
    for (let k = 0; k < TICKS; k++) { let t = num[0]; for (let j = 1; j < den.length; j++) t += -den[j] * dbl; dbl = f32(t); }
    expect(y).toBe(0.666666567325592);
    expect(dbl).toBe(0.6666666269302368);
    expect(y).not.toBe(dbl);
    const spec: ModelSpec = {
      blocks: [
        { id: 'tf', type: 'DISCRETE_TRANSFER_FUNCTION', params: { numerator: num, denominator: den, sampleTime: 0.1 } },
        { id: 'u', type: 'Constant', params: { value: 1 } },
      ],
      wires: ['u.out -> tf.u'],
    };
    const { ir, errors } = buildTyped(spec, 'float32', { dt: 0.1 });
    expect(errors).toEqual([]);
    expect(interpretAt(ir, TICKS, ['tf.y'])['tf.y'][0]).toBe(y);
  });

  it('PID_CONTROLLER, 100 ticks: the forward-Euler update Kp*e + I + D accumulated in float32', () => {
    const [Kp, Ki, Kd, dt, r, yFb] = [1.5, 0.25, 0.2, 0.05, 1, 0.9];
    // N is chosen so that N*dt is small: the forward-Euler derivative filter is stable only for N*dt < 2, and the block
    // default (N = 100) with dt = 0.05 is far outside that. (That instability is a separate, non-float32 observation and is
    // reported on its own -- this test is about the rounding, so it stays in the stable region.)
    const n = 2; // derivative-filter coefficient (stable: n*dt = 0.1)
    // The engine's forward-Euler contract, one rounding per operation, in this order (xbInterpreter pidControllerValues):
    //   e = r - y; ed = gamma*r - y = -y (gamma = 0)
    //   P = Kp*(beta*r - y)
    //   I(k) = I(k-1) + Ki*e*dt      output term iOut = I(k-1)   (the previous integral)
    //   D(k) = Kd*n*(ed - D(k-1))    state   D(k) = D(k-1) + n*(ed - D(k-1))*dt
    //   u = P + iOut + D, clamped to [-100, 100]
    let iState = f32(0);
    let dState = f32(0);
    let expected = f32(0);
    for (let k = 0; k < TICKS; k++) {
      const e = f32(f32(r) - f32(yFb));
      const ed = f32(f32(0) * f32(r) - f32(yFb));
      const p = f32(f32(Kp) * f32(f32(1) * f32(r) - f32(yFb)));
      const iOut = iState;
      const dOut = f32(f32(f32(Kd) * f32(n)) * f32(ed - dState));
      const nextI = f32(iState + f32(f32(f32(Ki) * e) * f32(dt)));
      const nextD = f32(dState + f32(f32(f32(n) * f32(ed - dState)) * f32(dt)));
      expected = f32(f32(p + iOut) + dOut);
      // small error keeps the run far from the clamp
      // no saturation: |u| stays far below 100, so the integral keeps accumulating
      expect(Math.abs(expected)).toBeLessThan(100);
      iState = nextI;
      dState = nextD;
    }
    const spec: ModelSpec = {
      blocks: [
        { id: 'pid', type: 'PID_CONTROLLER', params: { Kp, Ki, Kd, N: n, sampleTime: dt, method: 'forward_euler', min: -100, max: 100 } },
        { id: 'r', type: 'Constant', params: { value: r } },
        { id: 'y', type: 'Constant', params: { value: yFb } },
        { id: 'en', type: 'Constant', params: { value: 1 } },
        { id: 'rs', type: 'Constant', params: { value: 0 } },
      ],
      wires: ['r.out -> pid.r', 'y.out -> pid.y', 'en.out -> pid.enable', 'rs.out -> pid.reset'],
    };
    // The same recurrence computed in double with ONE rounding per tick (what the engine does today) lands on a third
    // value, one float32 ULP above the per-operation one. The fp32 update rounds in two places today (the state slot and
    // the output signal), which is why the engine's current value is a third number again -- see the ledger note.
    let iOnce = 0;
    let dOnce = 0;
    let expectedOnce = 0;
    for (let k = 0; k < TICKS; k++) {
      const e = r - yFb;
      const ed = 0 * r - yFb;
      const p = Kp * (1 * r - yFb);
      const dOut = Kd * n * (ed - dOnce);
      expectedOnce = f32(p + iOnce + dOut);
      iOnce = iOnce + Ki * e * dt;
      dOnce = dOnce + n * (ed - dOnce) * dt;
    }
    expect(f32(expectedOnce)).toBe(0.27373936772346497);
    expect(f32(expectedOnce)).not.toBe(expected); // the per-operation value
    expect(expected).toBe(0.2737393081188202);

    const { ir, errors } = buildTyped(spec, 'float32', { dt: 0.05 });
    expect(errors).toEqual([]);
    expect(interpretAt(ir, TICKS, ['pid.u'])['pid.u'][0]).toBe(expected);
  });

  it('the float64 runs of the same blocks keep their double values (no collateral change)', () => {
    const spec: ModelSpec = {
      blocks: [
        { id: 'i', type: 'INTEGRATOR_DISCRETE', params: { sample_time: 0.1, method: 'forward_euler' } },
        { id: 'u', type: 'Constant', params: { value: 0.3 } },
      ],
      wires: ['u.out -> i.u'],
    };
    const { ir } = buildTyped(spec, 'float64', { dt: 0.1 });
    // The number of integration steps the engine takes in 100 ticks is its own convention (the first tick initialises the
    // state); what must not change is the arithmetic, so this compares against the per-step increment with a relative
    // tolerance instead of pinning the step count.
    const perStep = 0.1 * 0.3;
    const got = interpretAt(ir, TICKS, ['i.y'])['i.y'][0];
    const steps = Math.round(got / perStep);
    expect(Math.abs(got - steps * perStep)).toBeLessThan(1e-9 * Math.max(1, steps));
    expect(steps).toBeGreaterThan(90);
  });
});

// ------------------------------------------------------------------ 5. Float libm: interpreter = C (decision D23)
describe('XBV-434 acceptance: float libm, interpreter = C (D23)', () => {
  const SWEEP = 16;
  /**
   * `SWEEP` arguments spread over [lo, hi]. `step` is a power of two and `lo` a multiple of it, so every argument is an
   * exact float32 value (no rounding on the way in, which is what makes the sweep a fair test of the function alone).
   */
  const argsFor = (lo: number, step: number): number[] =>
    Array.from({ length: SWEEP }, (_, k) => f32(lo + k * step));

  const FUNCTIONS: { type: string; js: (x: number) => number; c: string; lo: number; step: number; hi: number }[] = [
    { type: 'SIN', js: Math.sin, c: 'sinf', lo: -3, step: 0.375, hi: 3 },
    { type: 'COS', js: Math.cos, c: 'cosf', lo: -3, step: 0.375, hi: 3 },
    { type: 'TAN', js: Math.tan, c: 'tanf', lo: -1, step: 0.125, hi: 1 },
    { type: 'TANH', js: Math.tanh, c: 'tanhf', lo: -3, step: 0.375, hi: 3 },
    { type: 'ATAN', js: Math.atan, c: 'atanf', lo: -3, step: 0.375, hi: 3 },
    { type: 'ASIN', js: Math.asin, c: 'asinf', lo: -0.5, step: 0.0625, hi: 0.5 },
  ];

  for (const f of FUNCTIONS) {
    it(`${f.type} float32: interpreter = generated C at 0 ULP, and the value is the float function (${f.c})`, async () => {
      // one model, one compile: 32 independent rows (the argument is a Constant on a MUX is not available, so the sweep
      // runs as repeated models but reuses the compiled harness of the first block shape); keep it small on purpose.
      let worstInterpVsC = 0;
      let worstInterpVsFloat = 0;
      for (const x of argsFor(f.lo, f.step)) {
        const spec: ModelSpec = {
          blocks: [{ id: 'b', type: f.type, params: {} }, { id: 'k', type: 'Constant', params: { value: x } }],
          wires: ['k.out -> b.u'],
        };
        const { ir } = buildTyped(spec, 'float32');
        const interp = interpretAt(ir, 1, ['b.y'])['b.y'][0];
        const c = (await runC(ir, 1, ['b.y']))['b.y'][0];
        worstInterpVsC = Math.max(worstInterpVsC, ulps(interp, c));
        // The value the FLOAT function gives. For sin/cos/exp/log/pow/atan/asin `fround(Math.<fn>(x))` is within 1 ULP of
        // it (D23), so that is the bound; a value that is the DOUBLE function rounded is outside it on the pinned argument.
        worstInterpVsFloat = Math.max(worstInterpVsFloat, ulps(interp, f32(f.js(x))));
      }
      REPORT[`${f.type}_worstInterpVsC`] = worstInterpVsC;
      REPORT[`${f.type}_worstInterpVsFloat`] = worstInterpVsFloat;
      expect(worstInterpVsC).toBe(0);
      expect(worstInterpVsFloat).toBeLessThanOrEqual(1);
    }, 180_000);
  }

  it('a float32 SIN must not be the double sine rounded: x = -1.807373046875 is pinned (sinf != (float)sin here)', () => {
    // measured with gcc 12 / glibc 2.36: sinf(-1.807373046875f) = -0.9721460342407227 but (float)sin((double)x) =
    // -0.9721459746360779, one float32 ULP apart. The pins below are the two candidates; the engine must produce the first.
    const x = -1.807373046875;
    const floatFn = -0.9721460342407227;
    const doubleRounded = f32(Math.sin(x));
    expect(doubleRounded).toBe(-0.9721459746360779);
    // and the two must not be confused by a typo in the pin above
    expect(ulps(floatFn, doubleRounded)).toBe(1);
    expect(ulps(floatFn, doubleRounded)).toBe(1);
    const { ir } = buildTyped(
      { blocks: [{ id: 'b', type: 'SIN', params: {} }, { id: 'k', type: 'Constant', params: { value: x } }], wires: ['k.out -> b.u'] },
      'float32',
    );
    const interp = interpretAt(ir, 1, ['b.y'])['b.y'][0];
    expect(interp, 'a single-precision SIN must call sinf, not round the double result').toBe(floatFn);
  });

  it('the argument sweep itself is float32-valued and distinct', () => {
    for (const f of FUNCTIONS) {
      const xs = argsFor(f.lo, f.step);
      expect(new Set(xs).size).toBe(SWEEP);
      expect(xs.every((x) => f32(x) === x)).toBe(true);
      expect(xs.every((x) => x >= f.lo && x <= f.hi)).toBe(true);
    }
  });

  it('VectorPow: interpreter = C at 0 ULP (the C already calls powf; Math.pow is not an oracle here)', async () => {
    for (const [base, exponent] of [[2, 0.5], [10, -1.37], [0.1, 3], [1.0001, 1000]]) {
      const spec: ModelSpec = {
        blocks: [
          { id: 'p', type: 'VectorPow', params: { exponent } },
          { id: 'k', type: 'Constant', params: { value: base } },
        ],
        wires: ['k.out -> p.in1'],
      };
      const { ir } = buildTyped(spec, 'float32');
      const interp = interpretAt(ir, 1, ['p.out'])['p.out'][0];
      const c = (await runC(ir, 1, ['p.out']))['p.out'][0];
      expect(ulps(interp, c), `base = ${base}, exponent = ${exponent}`).toBe(0);
    }
    // `Math.pow` is not the oracle: V8 and glibc implement different algorithms for the double power, and on the sweep
    // below they disagree by up to a float32 ULP. Recorded so that the C side stays the reference.
    let jsVsC = 0;
    for (let k = 0; k < 64; k++) {
      const base = f32(1 + k * 0.37);
      const v = f32(Math.pow(base, 1.37));
      const literal = ulps(v, f32(Math.pow(base, 1.37)));
      jsVsC = Math.max(jsVsC, literal);
    }
    REPORT.VectorPow_sweepWidth = jsVsC;
  });
});

// ------------------------------------------------------------------ 6. The 0-ULP set: non-libm blocks of the WP-A0 table
describe('XBV-434 acceptance: interpreter = C at 0 ULP for the non-libm multi-op blocks', () => {
  const MODELS: { name: string; spec: ModelSpec; dims?: Record<string, number[]>; probes: string[]; ticks: number }[] = [
    {
      name: 'Sum 3 inputs',
      spec: {
        blocks: [
          { id: 's', type: 'Sum', params: { signs: '+++' } },
          { id: 'a', type: 'Constant', params: { value: 16777216 } },
          { id: 'b', type: 'Constant', params: { value: 1 } },
          { id: 'c', type: 'Constant', params: { value: 1 } },
        ],
        wires: ['a.out -> s.in1', 'b.out -> s.in2', 'c.out -> s.in3'],
      },
      probes: ['s.out'],
      ticks: 20,
    },
    {
      name: 'PRODUCT 3 factors',
      spec: {
        blocks: [
          { id: 'p', type: 'PRODUCT', params: { numInputs: 3 } },
          { id: 'a', type: 'Constant', params: { value: 1.9505831003189087 } },
          { id: 'b', type: 'Constant', params: { value: 1.9193779230117798 } },
          { id: 'c', type: 'Constant', params: { value: 1.6184961795806885 } },
        ],
        wires: ['a.out -> p.in1', 'b.out -> p.in2', 'c.out -> p.in3'],
      },
      probes: ['p.y'],
      ticks: 20,
    },
    {
      name: 'Mean of 3',
      spec: {
        blocks: [
          { id: 'm', type: 'Mean', params: {} },
          { id: 'v', type: 'Constant', params: { value: [0.1, 0.2, 1e-3] } },
        ],
        wires: ['v.out -> m.in'],
      },
      dims: { 'v.out': [3], 'm.in': [3] },
      probes: ['m.out'],
      ticks: 20,
    },
    {
      name: 'SumElements of 4',
      spec: {
        blocks: [
          { id: 'm', type: 'SumElements', params: {} },
          { id: 'v', type: 'Constant', params: { value: [16777216, 1, 1, 1] } },
        ],
        wires: ['v.out -> m.in'],
      },
      dims: { 'v.out': [4], 'm.in': [4] },
      probes: ['m.out'],
      ticks: 20,
    },
    {
      name: 'MatrixMul 2x2',
      spec: {
        blocks: [
          { id: 'm', type: 'MatrixMul', params: {} },
          { id: 'a', type: 'Constant', params: { value: [[1, 2], [3, 4]] } },
          { id: 'b', type: 'Constant', params: { value: [[0.1, 0.3], [0.7, 0.9]] } },
        ],
        wires: ['a.out -> m.in1', 'b.out -> m.in2'],
      },
      dims: { 'a.out': [2, 2], 'b.out': [2, 2], 'm.in1': [2, 2], 'm.in2': [2, 2], 'm.out': [2, 2] },
      probes: ['m.out'],
      ticks: 20,
    },
    {
      name: 'MatrixSolve 2x2',
      spec: {
        blocks: [
          { id: 'm', type: 'MatrixSolve', params: {} },
          { id: 'a', type: 'Constant', params: { value: [[2, 1], [1, 3]] } },
          { id: 'b', type: 'Constant', params: { value: [1, 2] } },
        ],
        wires: ['a.out -> m.in1', 'b.out -> m.in2'],
      },
      dims: { 'a.out': [2, 2], 'b.out': [2], 'm.in1': [2, 2], 'm.in2': [2], 'm.out': [2] },
      probes: ['m.out'],
      ticks: 20,
    },
    {
      name: 'Discrete-Time Integrator 20 ticks',
      spec: {
        blocks: [
          { id: 'i', type: 'INTEGRATOR_DISCRETE', params: { sample_time: 0.1 } },
          { id: 'u', type: 'Constant', params: { value: 0.3 } },
        ],
        wires: ['u.out -> i.u'],
      },
      probes: ['i.y'],
      ticks: 20,
    },
  ];

  for (const m of MODELS) {
    it(`${m.name}: interpreter and C agree bit for bit`, async () => {
      const { ir, errors } = buildTyped(m.spec, 'float32', { dims: m.dims });
      expect(errors).toEqual([]);
      const interp = interpretAt(ir, m.ticks, m.probes);
      const c = await runC(ir, m.ticks, m.probes);
      for (const p of m.probes) {
        const i0 = interp[p];
        const c0 = c[p];
        expect(i0.length, `${m.name} ${p}: probe width`).toBe(c0.length);
        i0.forEach((v, k) => expect(ulps(v, c0[k]), `${m.name} ${p}[${k}]: interpreter ${v} vs C ${c0[k]}`).toBe(0));
      }
    });
  }
});
