// src/engine/vlab/kernel/solvers/AdaptiveRKSolver.ts
import { ISolver, SolverState, SolverStepResult } from './ISolver';
import { CompiledPhysicalSystem, SolverConfiguration, InitialCondition, SimulationResult } from '../types';

// Fehlberg (RKF45) constants
const c2 = 1/4, a21 = 1/4;
const c3 = 3/8, a31 = 3/32, a32 = 9/32;
const c4 = 12/13, a41 = 1932/2197, a42 = -7200/2197, a43 = 7296/2197;
const c5 = 1, a51 = 439/216, a52 = -8, a53 = 3680/513, a54 = -845/4104;
const c6 = 1/2, a61 = -8/27, a62 = 2, a63 = -3544/2565, a64 = 1859/4104, a65 = -11/40;

const b1 = 25/216, b3 = 1408/2565, b4 = 2197/4104, b5 = -1/5;
const bStar1 = 16/135, bStar3 = 6656/12825, bStar4 = 28561/56430, bStar5 = -9/50, bStar6 = 2/55;

export class AdaptiveRKSolver implements ISolver {
  readonly id = 'rk_adaptive';
  readonly name = 'Adaptive Runge-Kutta (RKF45)';
  readonly supportsDAE = false;

  initialize(
    system: CompiledPhysicalSystem,
    config: SolverConfiguration,
    initialConditions: InitialCondition[]
  ): SolverState {
    const x = new Float64Array(system.stateCount);
    initialConditions.forEach((ic, i) => {
      if (i < system.stateCount && ic.value !== undefined) {
        x[i] = ic.value;
      }
    });
    return {
      t: config.startTime,
      x,
      dx: new Float64Array(system.stateCount),
      z: new Float64Array(system.algebraicCount),
      system,
      config
    };
  }

  private evalDeriv(system: CompiledPhysicalSystem, t: number, x: Float64Array, dt: number): Float64Array {
    const n = system.stateCount;
    const f = new Float64Array(n);
    const dummyDx = new Float64Array(n);
    const z = new Float64Array(system.algebraicCount);
    system.residual(t, x, dummyDx, z, { t, dt, parameters: {}, inputs: {} }, f);
    const dx = new Float64Array(n);
    for (let i = 0; i < n; i++) dx[i] = -f[i];
    return dx;
  }

  step(state: SolverState, dt: number): SolverStepResult {
    const { system, t, x, config } = state;
    const n = system.stateCount;

    const k1 = this.evalDeriv(system, t, x, dt);

    const x2 = new Float64Array(n);
    for (let i = 0; i < n; i++) x2[i] = x[i] + dt * a21 * k1[i];
    const k2 = this.evalDeriv(system, t + c2 * dt, x2, dt);

    const x3 = new Float64Array(n);
    for (let i = 0; i < n; i++) x3[i] = x[i] + dt * (a31 * k1[i] + a32 * k2[i]);
    const k3 = this.evalDeriv(system, t + c3 * dt, x3, dt);

    const x4 = new Float64Array(n);
    for (let i = 0; i < n; i++) x4[i] = x[i] + dt * (a41 * k1[i] + a42 * k2[i] + a43 * k3[i]);
    const k4 = this.evalDeriv(system, t + c4 * dt, x4, dt);

    const x5 = new Float64Array(n);
    for (let i = 0; i < n; i++) x5[i] = x[i] + dt * (a51 * k1[i] + a52 * k2[i] + a53 * k3[i] + a54 * k4[i]);
    const k5 = this.evalDeriv(system, t + c5 * dt, x5, dt);

    const x6 = new Float64Array(n);
    for (let i = 0; i < n; i++) x6[i] = x[i] + dt * (a61 * k1[i] + a62 * k2[i] + a63 * k3[i] + a64 * k4[i] + a65 * k5[i]);
    const k6 = this.evalDeriv(system, t + c6 * dt, x6, dt);

    const x4th = new Float64Array(n);
    const x5th = new Float64Array(n);
    let maxErrorRatio = 0;

    for (let i = 0; i < n; i++) {
      x4th[i] = x[i] + dt * (b1 * k1[i] + b3 * k3[i] + b4 * k4[i] + b5 * k5[i]);
      x5th[i] = x[i] + dt * (bStar1 * k1[i] + bStar3 * k3[i] + bStar4 * k4[i] + bStar5 * k5[i] + bStar6 * k6[i]);
      const lte = Math.abs(x5th[i] - x4th[i]);
      const tol = config.relativeTolerance * Math.abs(x5th[i]) + config.absoluteTolerance;
      const ratio = lte / tol;
      if (ratio > maxErrorRatio) maxErrorRatio = ratio;
    }

    const accepted = maxErrorRatio <= 1.0;
    return {
      t: accepted ? t + dt : t,
      dt,
      x: accepted ? x5th : x,
      dx: k1,
      z: new Float64Array(system.algebraicCount),
      accepted,
      lte: maxErrorRatio,
      iterations: 6,
      residual: 0
    };
  }

  solve(
    state: SolverState,
    config: SolverConfiguration,
    onProgress?: (progress: number) => void
  ): SimulationResult {
    const startTime = performance.now();
    const timeHist: number[] = [state.t];
    const stateHist: Record<string, number[]> = {};
    state.system.variableNames.slice(0, state.system.stateCount).forEach((name, i) => {
      stateHist[name] = [state.x[i]];
    });

    let current = { ...state, x: new Float64Array(state.x) };
    let dt = typeof config.initialStep === 'number' ? config.initialStep : 0.001;
    const minStep = typeof config.minimumStep === 'number' ? config.minimumStep : 1e-6;
    const maxStep = typeof config.maximumStep === 'number' ? config.maximumStep : 0.1;
    let accepted = 0;
    let rejected = 0;

    while (current.t < config.stopTime - 1e-12) {
      if (current.t + dt > config.stopTime) dt = config.stopTime - current.t;
      const res = this.step(current, dt);

      if (res.accepted) {
        current.t = res.t;
        current.x.set(res.x);
        accepted++;
        timeHist.push(current.t);
        state.system.variableNames.slice(0, state.system.stateCount).forEach((name, i) => {
          stateHist[name].push(current.x[i]);
        });
        const factor = res.lte > 0 ? 0.9 * Math.pow(1 / res.lte, 0.2) : 1.5;
        dt = Math.min(maxStep, Math.max(minStep, dt * Math.min(2.0, Math.max(0.5, factor))));
        if (onProgress) onProgress(current.t / config.stopTime);
      } else {
        rejected++;
        const factor = 0.9 * Math.pow(1 / res.lte, 0.25);
        dt = Math.max(minStep, dt * Math.min(0.5, Math.max(0.1, factor)));
        if (dt <= minStep) {
          current.t += minStep;
          current.x.set(res.x);
          timeHist.push(current.t);
          state.system.variableNames.slice(0, state.system.stateCount).forEach((name, i) => {
            stateHist[name].push(current.x[i]);
          });
        }
      }
    }

    return {
      jobId: 'sim_' + Date.now(),
      status: 'SUCCESS',
      time: timeHist,
      states: stateHist,
      algebraicVariables: {},
      outputs: {},
      solverStatistics: {
        simulationTime: config.stopTime - config.startTime,
        cpuTimeMs: performance.now() - startTime,
        acceptedSteps: accepted,
        rejectedSteps: rejected,
        newtonIterations: 0,
        maxResidual: 0,
        minStepUsed: minStep,
        maxStepUsed: maxStep,
        functionEvaluations: (accepted + rejected) * 6,
        jacobianEvaluations: 0,
        convergenceStatus: 'CONVERGED'
      },
      diagnostics: []
    };
  }

  terminate(): void {}
}
