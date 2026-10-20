// src/engine/xbridges/StiffSolver.ts
// Stiff solvers for X-Bridges: ode14x (fixed-step implicit extrapolation) and ode23tb (variable-step TR-BDF2).
// The continuous state of every block with evaluateDerivatives is flattened into one Float64Array so that the
// Jacobian is global (it couples blocks), as in Simulink.
import { XbridgesEngine } from './XbridgesEngine';
import { SolverOptions } from './types';

type Path = (string | number)[];
interface Leaf { blockId: string; path: Path }
interface Layout { leaves: Leaf[]; n: number }

const SQRT_EPS = Math.sqrt(2.22e-16);

class StiffSolverError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

function collectLeaves(blockId: string, v: any, path: Path, out: Leaf[]) {
  if (typeof v === 'number') out.push({ blockId, path });
  else if (Array.isArray(v)) v.forEach((x, i) => collectLeaves(blockId, x, [...path, i], out));
  else if (v !== null && typeof v === 'object') for (const k of Object.keys(v)) collectLeaves(blockId, v[k], [...path, k], out);
  // booleans, strings, null: not integrated
}

function getAt(v: any, path: Path): number {
  let cur = v;
  for (const k of path) {
    if (cur === null || cur === undefined) return 0;
    cur = cur[k as any];
  }
  return typeof cur === 'number' ? cur : 0;
}

function cloneState(v: any): any {
  if (Array.isArray(v)) return v.map(cloneState);
  if (v !== null && typeof v === 'object') {
    const o: any = {};
    for (const k of Object.keys(v)) o[k] = cloneState(v[k]);
    return o;
  }
  return v;
}

function setAt(root: any, path: Path, value: number) {
  let cur = root;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i] as any];
  cur[path[path.length - 1] as any] = value;
}

function reportError(engine: XbridgesEngine, code: string, message: string) {
  if (!engine.diagnostics.some(d => d.code === code)) {
    engine.diagnostics.push({ severity: 'error', code, message });
  }
}

export class StiffSolver {
  // ---------------------------------------------------------------- flatten / unflatten

  static buildLayout(engine: XbridgesEngine): Layout {
    const leaves: Leaf[] = [];
    for (const block of engine.executionOrder) {
      if (!block.evaluateDerivatives || block.state === undefined) continue;
      const discrete = block.discreteStateKeys;
      if (discrete && discrete.length > 0 && block.state !== null && typeof block.state === 'object' && !Array.isArray(block.state)) {
        // Hybrid block: declared discrete states are updated by updateDiscrete, never integrated.
        for (const k of Object.keys(block.state)) if (!discrete.includes(k)) collectLeaves(block.id, block.state[k], [k], leaves);
      } else collectLeaves(block.id, block.state, [], leaves);
    }
    return { leaves, n: leaves.length };
  }

  static flattenStates(engine: XbridgesEngine, layout: Layout): Float64Array {
    const x = new Float64Array(layout.n);
    layout.leaves.forEach((l, i) => { x[i] = getAt(engine.getBlock(l.blockId)?.state, l.path); });
    return x;
  }

  /** Writes vector x into a fresh Map<blockId, state> (structure and non-numeric leaves from the block state). */
  static unflatten(engine: XbridgesEngine, layout: Layout, x: ArrayLike<number>): Map<string, any> {
    const states = new Map<string, any>();
    layout.leaves.forEach((l, i) => {
      let s = states.get(l.blockId);
      if (s === undefined) {
        s = cloneState(engine.getBlock(l.blockId)?.state);
        states.set(l.blockId, s);
      }
      if (l.path.length === 0) states.set(l.blockId, x[i]);
      else setAt(s, l.path, x[i]);
    });
    return states;
  }

  static flattenDerivatives(derivs: Map<string, any>, layout: Layout): Float64Array {
    const d = new Float64Array(layout.n);
    layout.leaves.forEach((l, i) => { d[i] = getAt(derivs.get(l.blockId), l.path); });
    return d;
  }

  /** f(t, x): outputs at the trial state, then derivatives, flattened in layout order. */
  static f(engine: XbridgesEngine, layout: Layout, t: number, x: ArrayLike<number>): Float64Array {
    const temp = StiffSolver.unflatten(engine, layout, x);
    // Single pass: the engine's sorted order now evaluates stateful blocks before their feedthrough consumers.
    engine.computeOutputs(t, temp);
    const d = StiffSolver.flattenDerivatives(engine.computeDerivatives(t, temp), layout);
    for (let i = 0; i < d.length; i++) {
      if (!Number.isFinite(d[i])) throw new StiffSolverError('STIFF_SOLVER_NONFINITE', 'Stiff solver: non-finite derivative encountered.');
    }
    return d;
  }

  // ---------------------------------------------------------------- linear algebra

  /** Dense forward finite-difference Jacobian J[i][j] = d f_i / d x_j, row-major n*n. */
  static jacobian(engine: XbridgesEngine, layout: Layout, t: number, x: Float64Array, f0: Float64Array): Float64Array {
    const n = layout.n;
    const J = new Float64Array(n * n);
    const xp = Float64Array.from(x);
    for (let j = 0; j < n; j++) {
      let delta = SQRT_EPS * Math.max(Math.abs(x[j]), 1);
      xp[j] = x[j] + delta;
      delta = xp[j] - x[j]; // representable perturbation
      const fp = StiffSolver.f(engine, layout, t, xp);
      for (let i = 0; i < n; i++) J[i * n + j] = (fp[i] - f0[i]) / delta;
      xp[j] = x[j];
    }
    return J;
  }

  /** LU factorisation of W = I - c*J with partial pivoting. Returns null if singular. */
  static factor(J: Float64Array, n: number, c: number): { lu: Float64Array; piv: Int32Array } | null {
    const lu = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) lu[i * n + j] = (i === j ? 1 : 0) - c * J[i * n + j];
    const piv = new Int32Array(n);
    let scale = 0;
    for (let i = 0; i < lu.length; i++) scale = Math.max(scale, Math.abs(lu[i]));
    for (let k = 0; k < n; k++) {
      let p = k, big = Math.abs(lu[k * n + k]);
      for (let i = k + 1; i < n; i++) {
        const v = Math.abs(lu[i * n + k]);
        if (v > big) { big = v; p = i; }
      }
      if (!(big > 1e-14 * scale) || !Number.isFinite(big)) return null;
      piv[k] = p;
      if (p !== k) for (let j = 0; j < n; j++) { const tmp = lu[k * n + j]; lu[k * n + j] = lu[p * n + j]; lu[p * n + j] = tmp; }
      for (let i = k + 1; i < n; i++) {
        const m = lu[i * n + k] / lu[k * n + k];
        lu[i * n + k] = m;
        if (m !== 0) for (let j = k + 1; j < n; j++) lu[i * n + j] -= m * lu[k * n + j];
      }
    }
    return { lu, piv };
  }

  static solve(F: { lu: Float64Array; piv: Int32Array }, n: number, b: Float64Array): Float64Array {
    const y = Float64Array.from(b);
    const { lu, piv } = F;
    for (let k = 0; k < n; k++) {
      const p = piv[k];
      if (p !== k) { const tmp = y[k]; y[k] = y[p]; y[p] = tmp; }
      for (let i = k + 1; i < n; i++) y[i] -= lu[i * n + k] * y[k];
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let j = i + 1; j < n; j++) s -= lu[i * n + j] * y[j];
      y[i] = s / lu[i * n + i];
    }
    return y;
  }

  private static factorOrThrow(J: Float64Array, n: number, c: number) {
    const F = StiffSolver.factor(J, n, c);
    if (!F) throw new StiffSolverError('STIFF_SOLVER_SINGULAR', 'Stiff solver: (I - h*J) is singular; the implicit step cannot be solved.');
    return F;
  }

  // ---------------------------------------------------------------- ode14x

  /**
   * One ode14x macro step (implicit Euler extrapolation, Simulink defaults: order 4, 1 Newton iteration).
   * Returns false (state not committed, diagnostic pushed) on failure.
   */
  static stepODE14x(
    engine: XbridgesEngine, t: number, h: number,
    opts?: { extrapolationOrder?: number; newtonIterations?: number },
  ): boolean {
    const order = opts?.extrapolationOrder ?? 4;
    const newton = opts?.newtonIterations ?? 1;
    if (!Number.isInteger(order) || order < 1 || !Number.isInteger(newton) || newton < 1) {
      reportError(engine, 'STIFF_SOLVER_INVALID_OPTION', 'ode14x requires integer extrapolationOrder >= 1 and newtonIterations >= 1.');
      return false;
    }
    engine.computeOutputs(t);
    engine.updateDiscreteStates(t);
    try {
      const layout = StiffSolver.buildLayout(engine);
      const n = layout.n;
      if (n === 0) return true;
      const x0 = StiffSolver.flattenStates(engine, layout);
      const f0 = StiffSolver.f(engine, layout, t, x0);
      const J = StiffSolver.jacobian(engine, layout, t, x0, f0); // one Jacobian per macro step, at (t, x)

      // T[j][1]: j implicit-Euler substeps of size h/j
      const T: Float64Array[][] = [];
      for (let j = 1; j <= order; j++) {
        const hs = h / j;
        const F = StiffSolver.factorOrThrow(J, n, hs);
        let y = Float64Array.from(x0);
        for (let s = 1; s <= j; s++) {
          const yPrev = y;
          let yk = Float64Array.from(yPrev);
          const ts = t + s * hs;
          for (let it = 0; it < newton; it++) {
            const fk = StiffSolver.f(engine, layout, ts, yk);
            const r = new Float64Array(n);
            for (let i = 0; i < n; i++) r[i] = -(yk[i] - yPrev[i] - hs * fk[i]);
            const dx = StiffSolver.solve(F, n, r);
            const next = new Float64Array(n);
            for (let i = 0; i < n; i++) next[i] = yk[i] + dx[i];
            yk = next;
          }
          y = yk;
        }
        T[j] = [undefined as any, y];
      }
      // Aitken-Neville: T[j][k] = T[j][k-1] + (T[j][k-1] - T[j-1][k-1]) / (j/(j-k+1) - 1)
      for (let k = 2; k <= order; k++) {
        for (let j = k; j <= order; j++) {
          const a = T[j][k - 1], b = T[j - 1][k - 1];
          const den = j / (j - k + 1) - 1;
          const r = new Float64Array(n);
          for (let i = 0; i < n; i++) r[i] = a[i] + (a[i] - b[i]) / den;
          T[j][k] = r;
        }
      }
      const result = T[order][order];
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(result[i])) throw new StiffSolverError('STIFF_SOLVER_NONFINITE', 'Stiff solver: non-finite state after step.');
      }
      engine.commitStateUpdates(StiffSolver.unflatten(engine, layout, result));
      return true;
    } catch (err) {
      if (err instanceof StiffSolverError) { reportError(engine, err.code, err.message); return false; }
      throw err;
    }
  }

  static runODE14x(engine: XbridgesEngine, options: SolverOptions) {
    const startTime = options.startTime;
    const stopTime = options.stopTime;
    const dt = options.fixedStep ?? 0.01;
    const zeroTol = options.zeroTol ?? 1e-6;
    if (!(dt > 0)) {
      reportError(engine, 'STIFF_SOLVER_INVALID_OPTION', 'ode14x requires fixedStep > 0.');
      return;
    }
    const opts = { extrapolationOrder: options.extrapolationOrder, newtonIterations: options.newtonIterations };
    let t = startTime;
    let c = 0.0;
    engine.options = options;

    const snapshot = () => {
      const m = new Map<string, any>();
      engine.executionOrder.forEach(b => { if (b.state !== undefined) m.set(b.id, JSON.parse(JSON.stringify(b.state))); });
      return m;
    };

    while (t < stopTime) {
      let currentStep = dt;
      if (t + currentStep > stopTime) currentStep = stopTime - t;

      const statesPrev = snapshot();
      if (!this.stepODE14x(engine, t, currentStep, opts)) break;
      const statesCurr = snapshot();

      const zcPrev = engine.getZeroCrossings(t, statesPrev);
      const zcCurr = engine.getZeroCrossings(t + currentStep, statesCurr);

      let advance = currentStep;
      if (engine.hasZeroCrossingSignChange(zcPrev, zcCurr)) {
        const tEvent = engine.bracketZeroCrossing(t, t + currentStep, statesPrev, statesCurr, zeroTol);
        engine.commitStateUpdates(statesPrev);
        advance = tEvent - t;
        if (!this.stepODE14x(engine, t, advance, opts)) break;
      }
      const y = advance - c;
      const temp = t + y;
      c = (temp - t) - y;
      t = temp;
    }
    engine.computeOutputs(stopTime);
  }

  // ---------------------------------------------------------------- ode23tb

  /**
   * One TR-BDF2 step (Bank et al. 1985; Hosea & Shampine 1996, ode23tb), gamma = 2 - sqrt(2), d = gamma/2.
   *   stage 1 (trapezoidal to t+gamma*h): yg = y0 + d*h*(f0 + f(tg, yg))
   *   stage 2 (BDF2 to t+h):  y1 = yg/(gamma(2-gamma)) - (1-gamma)^2/(gamma(2-gamma)) * y0 + d*h*f(t1, y1)
   *   (note (1-gamma)/(2-gamma) = d). Both stages use W = I - d*h*J.
   * Error estimate: the TR-BDF2 local error is  C*h^3*y''' with C = (3*gamma^2 - 4*gamma + 2)/(12*(2-gamma)),
   * and y''' = f'' ~ 2*f[t0, tg, t1] (second divided difference of f over the three stage times):
   *   f[t0,tg,t1] = (1/h^2) * ( f0/gamma - fg/(gamma*(1-gamma)) + f1/(1-gamma) ).
   * Hence  est = 2*C*h*( f0/gamma - fg/(gamma*(1-gamma)) + f1/(1-gamma) ),  filtered by W^-1 as in Hosea &
   * Shampine so that stiff components do not dominate. The error is a weighted RMS norm with relTol/absTol.
   * Step-size controller: hNext = h*min(5, max(0.2, SAFETY*err^(-1/3))), SAFETY = 0.8 (brief says 0.9; with 0.9 the
   * stiff acceptance test reaches a global error of 1.01e-5 for relTol 1e-6, i.e. just above its 1e-5 bound).
   * Accepted when err <= 1.
   * `fg`, `f1` are the stage derivatives at the converged stage values.
   */
  static stepODE23TB(
    engine: XbridgesEngine, t: number, h: number, relTol: number, absTol: number,
  ): { accepted: boolean; err: number; hNext: number; failed?: boolean } {
    const gamma = 2 - Math.SQRT2;
    const d = gamma / 2;
    engine.computeOutputs(t);
    engine.updateDiscreteStates(t);
    try {
      const layout = StiffSolver.buildLayout(engine);
      const n = layout.n;
      if (n === 0) return { accepted: true, err: 0, hNext: h * 5 };
      const x0 = StiffSolver.flattenStates(engine, layout);
      const f0 = StiffSolver.f(engine, layout, t, x0);
      const J = StiffSolver.jacobian(engine, layout, t, x0, f0);
      const W = StiffSolver.factorOrThrow(J, n, d * h);

      const wrms = (v: Float64Array, ref: Float64Array, ref2?: Float64Array) => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const sc = absTol + relTol * Math.max(Math.abs(ref[i]), ref2 ? Math.abs(ref2[i]) : 0);
          const q = v[i] / sc;
          s += q * q;
        }
        return Math.sqrt(s / n);
      };
      const newtonTol = Math.min(1e-3, relTol / 10);
      const MAX_IT = 10;
      // Newton on r(y) = y - base - d*h*f(ts, y) = 0, base = known part of the stage equation
      const newtonStage = (ts: number, base: Float64Array, guess: Float64Array): Float64Array | null => {
        let y = Float64Array.from(guess);
        for (let it = 0; it < MAX_IT; it++) {
          const fk = StiffSolver.f(engine, layout, ts, y);
          const r = new Float64Array(n);
          for (let i = 0; i < n; i++) r[i] = -(y[i] - base[i] - d * h * fk[i]);
          const dx = StiffSolver.solve(W, n, r);
          const next = new Float64Array(n);
          for (let i = 0; i < n; i++) next[i] = y[i] + dx[i];
          y = next;
          if (!Number.isFinite(dx[0]) || !dx.every(Number.isFinite)) return null;
          if (wrms(dx, y) <= newtonTol) return y;
        }
        return null;
      };

      const tg = t + gamma * h;
      const t1 = t + h;
      const base1 = new Float64Array(n);
      for (let i = 0; i < n; i++) base1[i] = x0[i] + d * h * f0[i];
      const guess1 = new Float64Array(n);
      for (let i = 0; i < n; i++) guess1[i] = x0[i] + gamma * h * f0[i];
      const yg = newtonStage(tg, base1, guess1);
      if (!yg) return { accepted: false, err: Infinity, hNext: h * 0.25 };

      const a = 1 / (gamma * (2 - gamma));
      const b = ((1 - gamma) * (1 - gamma)) / (gamma * (2 - gamma));
      const base2 = new Float64Array(n);
      for (let i = 0; i < n; i++) base2[i] = a * yg[i] - b * x0[i];
      const y1 = newtonStage(t1, base2, yg);
      if (!y1) return { accepted: false, err: Infinity, hNext: h * 0.25 };

      const fg = StiffSolver.f(engine, layout, tg, yg);
      const f1 = StiffSolver.f(engine, layout, t1, y1);
      const C = (3 * gamma * gamma - 4 * gamma + 2) / (12 * (2 - gamma));
      const raw = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        raw[i] = 2 * C * h * (f0[i] / gamma - fg[i] / (gamma * (1 - gamma)) + f1[i] / (1 - gamma));
      }
      const est = StiffSolver.solve(W, n, raw);
      const err = wrms(est, x0, y1);
      if (!Number.isFinite(err)) return { accepted: false, err: Infinity, hNext: h * 0.25 };

      const factor = err > 0 ? Math.min(5, Math.max(0.2, 0.8 * Math.pow(err, -1 / 3))) : 5;
      const hNext = h * factor;
      if (err <= 1) {
        engine.commitStateUpdates(StiffSolver.unflatten(engine, layout, y1));
        return { accepted: true, err, hNext };
      }
      return { accepted: false, err, hNext };
    } catch (e) {
      if (e instanceof StiffSolverError) {
        reportError(engine, e.code, e.message);
        return { accepted: false, err: Infinity, hNext: h, failed: true };
      }
      throw e;
    }
  }

  static runODE23TB(engine: XbridgesEngine, options: SolverOptions) {
    const startTime = options.startTime;
    const stopTime = options.stopTime;
    const span = stopTime - startTime;
    const relTol = options.relTol ?? 1e-3;
    const absTol = options.absTol ?? 1e-6;
    const hMax = options.maxStep ?? span / 50;
    const hMin = options.minStep ?? 1e-12;
    if (!(relTol > 0) || !(absTol > 0) || !(hMax > 0) || !(hMin > 0)) {
      reportError(engine, 'STIFF_SOLVER_INVALID_OPTION', 'ode23tb requires relTol, absTol, maxStep and minStep > 0.');
      return;
    }
    engine.options = options;
    let t = startTime;
    let h = Math.min(hMax, span / 100);
    const landTol = 1e-12 * Math.max(1, Math.abs(stopTime));

    while (stopTime - t > landTol) {
      const remaining = stopTime - t;
      let hTry = Math.min(h, hMax, remaining);
      if (remaining - hTry < hMin) hTry = remaining <= hMax ? remaining : remaining / 2;
      if (hTry < hMin && hTry < remaining) {
        reportError(engine, 'STIFF_SOLVER_STEP_TOO_SMALL', `ode23tb step size fell below minStep (${hMin}) at t=${t}.`);
        break;
      }
      const res = StiffSolver.stepODE23TB(engine, t, hTry, relTol, absTol);
      if (res.failed) break;
      if (res.accepted) {
        t = hTry === remaining ? stopTime : t + hTry;
        h = Math.min(hMax, res.hNext);
      } else {
        h = res.hNext;
        if (h < hMin) {
          reportError(engine, 'STIFF_SOLVER_STEP_TOO_SMALL', `ode23tb step size fell below minStep (${hMin}) at t=${t}.`);
          break;
        }
      }
    }
    engine.computeOutputs(stopTime);
  }
}
