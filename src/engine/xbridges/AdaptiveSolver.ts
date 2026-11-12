// src/engine/xbridges/AdaptiveSolver.ts
// Variable-step explicit Runge-Kutta solvers: ode45 (Dormand-Prince) and ode23 (Bogacki-Shampine).
// One error-controlled integration core serves the batch runs (Solvers.runFixedStep) and the live canvas step
// (decision D3: the canvas controls the error with RelTol / AbsTol inside each output step).
import { XbridgesEngine } from './XbridgesEngine';
import { SolverOptions } from './types';
import { VectorUtils } from './VectorUtils';

// Dormand-Prince (ODE45) Butcher Tableau Coefficients
const C_DP = [0, 1/5, 3/10, 4/5, 8/9, 1, 1];
const A_DP = [
  [],
  [1/5],
  [3/40, 9/40],
  [44/45, -56/15, 32/9],
  [19372/6561, -25360/2187, 64448/6561, -212/729],
  [9017/3168, -355/33, 46732/5247, 49/176, -5103/18656],
  [35/384, 0, 500/1113, 125/192, -2187/6784, 11/84]
];
const B5_DP = [35/384, 0, 500/1113, 125/192, -2187/6784, 11/84, 0];
const E_DP = [
  35/384 - 5179/57600,
  0,
  500/1113 - 7571/16695,
  125/192 - 393/640,
  -2187/6784 - -92097/339200,
  11/84 - 187/2100,
  -1/40
];

// Bogacki-Shampine (ODE23) Coefficients
const C_BS = [0, 1/2, 3/4, 1];
const A_BS = [
  [],
  [1/2],
  [0, 3/4],
  [2/9, 1/3, 4/9]
];
const B3_BS = [2/9, 1/3, 4/9, 0];
const E_BS = [
  2/9 - 7/24,
  1/3 - 1/4,
  4/9 - 1/3,
  -1/8
];

/** Explicit Runge-Kutta pair with an embedded error estimate (both pairs are FSAL: the last stage is f(t+h, y_new)). */
interface Tableau {
  c: number[];
  a: number[][];
  b: number[];
  e: number[];
  /** Step-size exponent after an accepted step (-1/order of the estimate) and after a rejected one. */
  acceptExponent: number;
  rejectExponent: number;
}

const TAB_DP: Tableau = { c: C_DP, a: A_DP, b: B5_DP, e: E_DP, acceptExponent: -0.2, rejectExponent: -0.25 };
const TAB_BS: Tableau = { c: C_BS, a: A_BS, b: B3_BS, e: E_BS, acceptExponent: -0.3333, rejectExponent: -0.5 };

interface IntegrateConfig {
  relTol: number;
  absTol: number;
  hMin: number;
  hMax: number;
  h0: number;
  /**
   * Batch semantics (Solvers.runFixedStep): discrete states are updated at every trial, the last stage is reused as the
   * next first stage, and a step at the minimum step is accepted. Live semantics: the caller updated the discrete states
   * once for the output step, and a step that cannot meet the tolerance at the minimum step is a failure.
   */
  batch: boolean;
  /** Live: computeOutputs(t0) already ran for this interval. */
  outputsReady?: boolean;
}

/** Bisection precision of an event time; the located bracket [tLow, tHigh] is at most this wide. */
const EVENT_TIME_TOL = 1e-9;

/** Step-size hint carried between the output steps of a live run, per engine and solver. */
const LIVE_STEP_HINT = new WeakMap<object, Map<Tableau, number>>();

function reportError(engine: XbridgesEngine, code: string, message: string) {
  if (!engine.diagnostics.some(d => d.code === code)) engine.diagnostics.push({ severity: 'error', code, message });
}

function snapshotStates(engine: XbridgesEngine): Map<string, any> {
  const m = new Map<string, any>();
  engine.executionOrder.forEach(b => { if (b.state !== undefined) m.set(b.id, JSON.parse(JSON.stringify(b.state))); });
  return m;
}

type ErrorTerm = { err: any; state: any; cand: any };

export class AdaptiveSolver {
  /** One trial step of size h from the committed state with the first stage k1; no state is committed. */
  private static trial(engine: XbridgesEngine, tab: Tableau, t: number, h: number, k1: Map<string, any>) {
    const nStages = tab.b.length;
    const stages: Map<string, any>[] = [k1];
    for (let s = 1; s < nStages; s++) {
      const state_s = new Map<string, any>();
      k1.forEach((_, blockId) => {
        const block = engine.getBlock(blockId);
        if (block) {
          let val = block.state;
          for (let j = 0; j < s; j++) {
            const coeff = tab.a[s][j];
            if (coeff !== 0 && stages[j].has(blockId)) {
              val = VectorUtils.integrateState(val, stages[j].get(blockId), h * coeff);
            }
          }
          state_s.set(blockId, val);
        }
      });
      engine.computeOutputs(t + tab.c[s] * h, state_s);
      stages.push(engine.computeDerivatives(t + tab.c[s] * h, state_s));
    }

    const candidate = new Map<string, any>();
    const errors: ErrorTerm[] = [];
    k1.forEach((_, blockId) => {
      const block = engine.getBlock(blockId);
      if (!block) return;
      let y = block.state;
      for (let i = 0; i < tab.b.length; i++) {
        if (tab.b[i] !== 0 && stages[i].has(blockId)) y = VectorUtils.integrateState(y, stages[i].get(blockId), h * tab.b[i]);
      }
      candidate.set(blockId, y);
      let errorVec = VectorUtils.zeroLike(block.state);
      for (let i = 0; i < tab.e.length; i++) {
        if (tab.e[i] !== 0 && stages[i].has(blockId)) errorVec = VectorUtils.integrateState(errorVec, stages[i].get(blockId), h * tab.e[i]);
      }
      errors.push({ err: errorVec, state: block.state, cand: y });
    });
    return { stages, candidate, errors };
  }

  /** Weighted RMS of the local error estimate; NaN counts as an infinite error. */
  private static errorNorm(errors: ErrorTerm[], relTol: number, absTol: number): number {
    let sq = 0;
    let count = 0;
    const add = (ev: number, sv: number, cv: number) => {
      const tol = absTol + relTol * Math.max(Math.abs(sv), Math.abs(cv));
      const ratio = ev / tol;
      sq += ratio * ratio;
      count++;
    };
    // Nested states (object of arrays, array of arrays) are walked leaf by leaf; non-numeric leaves are ignored.
    const walk = (err: any, state: any, cand: any) => {
      if (typeof err === 'number') add(err, typeof state === 'number' ? state : 0, typeof cand === 'number' ? cand : 0);
      else if (Array.isArray(err)) err.forEach((ev, idx) => walk(ev, state?.[idx], cand?.[idx]));
      else if (typeof err === 'object' && err !== null) for (const key in err) walk(err[key], state?.[key], cand?.[key]);
    };
    for (const { err, state, cand } of errors) walk(err, state, cand);
    const lte = count > 0 ? Math.sqrt(sq / count) : 0;
    return Number.isNaN(lte) ? Number.POSITIVE_INFINITY : lte;
  }

  /**
   * Locates a zero crossing inside (tLo, tHi) by bisection on states interpolated between the two ends.
   * Returns the bracket [tLow, tHigh]: no sign change between tLo and tLow, a sign change between tLow and tHigh.
   * (Own bisection: engine.bracketZeroCrossing compares against the signals left by the previous evaluation, which
   * are not the values at tLo.)
   */
  private static locateEvent(
    engine: XbridgesEngine, tLo: number, tHi: number,
    sLo: Map<string, any>, sHi: Map<string, any>, zcLo: Map<string, number[]>,
  ): { tLow: number; tHigh: number } {
    let lo = tLo;
    let hi = tHi;
    for (let iter = 0; iter < 80 && hi - lo > EVENT_TIME_TOL; iter++) {
      const mid = (lo + hi) / 2;
      if (!(mid > lo && mid < hi)) break;
      const frac = (mid - tLo) / (tHi - tLo);
      const sMid = new Map<string, any>();
      sLo.forEach((sPrev, blockId) => {
        const sCurr = sHi.get(blockId);
        sMid.set(blockId, sCurr === undefined ? sPrev
          : VectorUtils.integrateState(sPrev, VectorUtils.applyElementWise(sCurr, sPrev, 'subtract'), frac));
      });
      engine.computeOutputs(mid, sMid);
      const zcMid = engine.getZeroCrossings(mid, sMid);
      if (engine.hasZeroCrossingSignChange(zcLo, zcMid)) hi = mid; else lo = mid;
    }
    return { tLow: lo, tHigh: hi };
  }

  /**
   * Error-controlled integration from t0 to tEnd (the shared core of the batch runs and the live canvas step).
   * Rejected steps are retried with a smaller step. A zero crossing inside a step is located; the solver then steps to
   * just before it and over the (tiny) bracket without a further event test, so a located event is never found again.
   */
  private static integrate(
    engine: XbridgesEngine, tab: Tableau, t0: number, tEnd: number, cfg: IntegrateConfig,
  ): { ok: boolean; hNext: number } {
    const lastStage = tab.b.length - 1;
    const hasZc = engine.executionOrder.some(b => !!b.ZeroCrossingFn);
    let t = t0;
    let h = cfg.h0;
    let cTime = 0.0; // Kahan compensation for time accumulation
    let k1: Map<string, any> = new Map();
    let k1Valid = false;
    let outputsReady = cfg.outputsReady === true;
    let event: { tLow: number; tHigh: number } | null = null;
    let zcBase: Map<string, number[]> | null = null;
    let baseStates: Map<string, any> | null = null;

    while (t < tEnd && !engine.hasFatalError()) {
      const target = event === null ? tEnd : (t < event.tLow ? event.tLow : event.tHigh);
      const sliver = event !== null && t >= event.tLow;
      const remaining = target - t;
      let hTry = h;
      let reachesTarget = false;
      if (hTry >= remaining - cfg.hMin) { hTry = remaining; reachesTarget = true; }
      if (!reachesTarget && hTry < cfg.hMin) hTry = cfg.hMin;

      if (cfg.batch) {
        // Discrete states are updated at major time step t; a change invalidates the reused first stage.
        const isDiscrete = (b: { updateDiscrete?: unknown; evaluateDerivatives?: unknown; params: Record<string, any> }) =>
          !!b.updateDiscrete || (!b.evaluateDerivatives && b.params.sampleTime > 0);
        const prev = new Map<string, string>();
        engine.executionOrder.forEach(b => { if (isDiscrete(b)) prev.set(b.id, JSON.stringify(b.state)); });
        engine.updateDiscreteStates(t);
        engine.executionOrder.forEach(b => {
          if (isDiscrete(b) && prev.get(b.id) !== JSON.stringify(b.state)) k1Valid = false;
        });
      }
      if (!k1Valid) {
        if (outputsReady) outputsReady = false; else engine.computeOutputs(t);
        k1 = engine.computeDerivatives(t);
        k1Valid = true;
        zcBase = null;
        baseStates = null;
      }
      if (engine.hasFatalError()) break;

      const tr = AdaptiveSolver.trial(engine, tab, t, hTry, k1);
      if (engine.hasFatalError()) break;
      const lte = AdaptiveSolver.errorNorm(tr.errors, cfg.relTol, cfg.absTol);
      const atMinStep = hTry <= cfg.hMin;
      const accept = sliver || lte <= 1 || (cfg.batch && atMinStep);

      if (!accept) {
        if (atMinStep) {
          reportError(engine, 'STIFF_SOLVER_STEP_TOO_SMALL',
            `Variable-step solver cannot meet RelTol ${cfg.relTol} / AbsTol ${cfg.absTol} at t = ${t}: the step fell to the minimum step ${cfg.hMin}.`);
          return { ok: false, hNext: h };
        }
        const factor = 0.9 * Math.pow(lte, tab.rejectExponent);
        h = Math.max(cfg.hMin, hTry * Math.max(0.1, Math.min(0.9, factor)));
        continue;
      }

      if (!sliver && event === null && hasZc) {
        if (zcBase === null) {
          baseStates = snapshotStates(engine);
          engine.computeOutputs(t, baseStates);
          zcBase = engine.getZeroCrossings(t, baseStates);
        }
        engine.computeOutputs(t + hTry, tr.candidate);
        const zcCurr = engine.getZeroCrossings(t + hTry, tr.candidate);
        if (engine.hasZeroCrossingSignChange(zcBase, zcCurr)) {
          const located = AdaptiveSolver.locateEvent(engine, t, t + hTry, baseStates!, tr.candidate, zcBase);
          event = located.tLow - t < cfg.hMin ? { tLow: t, tHigh: located.tHigh } : located;
          continue; // same base state and first stage, new target
        }
      }

      engine.commitStateUpdates(tr.candidate);
      if (reachesTarget) { t = target; cTime = 0.0; }
      else {
        const y = hTry - cTime;
        const temp = t + y;
        cTime = (temp - t) - y;
        t = temp;
      }
      if (!sliver) {
        const factor = lte > 0 ? 0.9 * Math.pow(lte, tab.acceptExponent) : 5.0;
        let hNew = Math.max(cfg.hMin, Math.min(cfg.hMax, hTry * Math.max(0.1, Math.min(5.0, factor))));
        // A step shortened to land on the target says nothing against the step that was asked for.
        if (hTry < h) hNew = Math.max(hNew, Math.min(h, cfg.hMax));
        h = hNew;
      }
      if (sliver && reachesTarget) event = null;
      k1 = tr.stages[lastStage];
      k1Valid = cfg.batch; // FSAL in batch runs; live steps recompute the first stage at the new base
      zcBase = null;
      baseStates = null;
    }
    return { ok: !engine.hasFatalError(), hNext: h };
  }

  private static runVariable(engine: XbridgesEngine, options: SolverOptions, tab: Tableau) {
    const startTime = options.startTime;
    const stopTime = options.stopTime;
    const relTol = options.relTol ?? 1e-3;
    const absTol = options.absTol ?? 1e-6;
    if (!(Number.isFinite(relTol) && relTol > 0) || !(Number.isFinite(absTol) && absTol > 0)) {
      reportError(engine, 'STIFF_SOLVER_INVALID_OPTION', `Relative and absolute tolerance must be finite and > 0 (relTol = ${relTol}, absTol = ${absTol}).`);
      return;
    }
    const h0 = options.fixedStep ?? Math.max(1e-4, Math.min(0.01, (stopTime - startTime) / 100));
    const hMin = options.minStep ?? 1e-6;
    const hMax = options.maxStep ?? 0.05;

    engine.compile(startTime);
    AdaptiveSolver.integrate(engine, tab, startTime, stopTime, { relTol, absTol, hMin, hMax, h0, batch: true });
    engine.computeOutputs(stopTime);
  }

  static runODE45(engine: XbridgesEngine, options: SolverOptions) {
    AdaptiveSolver.runVariable(engine, options, TAB_DP);
  }

  static runODE23(engine: XbridgesEngine, options: SolverOptions) {
    AdaptiveSolver.runVariable(engine, options, TAB_BS);
  }

  /**
   * One live output step [t, t + dt] with error-controlled internal steps (decision D3): RelTol / AbsTol from `tol`,
   * else from engine.options, else the Simulink defaults 1e-3 / 1e-6. Lands exactly on t + dt. Returns false on failure.
   */
  private static stepLive(
    engine: XbridgesEngine, tab: Tableau, t: number, dt: number, tol?: { relTol?: number; absTol?: number },
  ): boolean {
    const relTol = tol?.relTol ?? engine.options?.relTol ?? 1e-3;
    const absTol = tol?.absTol ?? engine.options?.absTol ?? 1e-6;
    if (!(Number.isFinite(relTol) && relTol > 0) || !(Number.isFinite(absTol) && absTol > 0)) {
      reportError(engine, 'STIFF_SOLVER_INVALID_OPTION', `Relative and absolute tolerance must be finite and > 0 (relTol = ${relTol}, absTol = ${absTol}).`);
      return false;
    }
    engine.computeOutputs(t);
    engine.updateDiscreteStates(t);
    if (engine.hasFatalError()) return false;
    let hints = LIVE_STEP_HINT.get(engine);
    if (!hints) { hints = new Map(); LIVE_STEP_HINT.set(engine, hints); }
    const hint = hints.get(tab);
    const res = AdaptiveSolver.integrate(engine, tab, t, t + dt, {
      relTol, absTol,
      hMin: Math.max(engine.options?.minStep ?? 0, 16 * Number.EPSILON * Math.max(1, Math.abs(t))),
      hMax: engine.options?.maxStep ?? Number.POSITIVE_INFINITY,
      h0: Math.min(hint ?? dt, dt),
      batch: false,
      outputsReady: true,
    });
    if (res.ok && Number.isFinite(res.hNext) && res.hNext > 0) hints.set(tab, res.hNext);
    return res.ok;
  }

  /** Live canvas step with Dormand-Prince (ode45) over [t, t + h], error-controlled with RelTol / AbsTol. */
  static stepODE45(engine: XbridgesEngine, t: number, h: number, tol?: { relTol?: number; absTol?: number }): boolean {
    return AdaptiveSolver.stepLive(engine, TAB_DP, t, h, tol);
  }

  /** Live canvas step with Bogacki-Shampine (ode23) over [t, t + h], error-controlled with RelTol / AbsTol. */
  static stepODE23(engine: XbridgesEngine, t: number, h: number, tol?: { relTol?: number; absTol?: number }): boolean {
    return AdaptiveSolver.stepLive(engine, TAB_BS, t, h, tol);
  }
}
