// src/engine/vlab/kernel/solvers/RK4Solver.ts
import { ISolver, SolverState, SolverStepResult } from './ISolver';
import { CompiledPhysicalSystem, SolverConfiguration, InitialCondition, SimulationResult } from '../types';

export class RK4Solver implements ISolver {
  readonly id = 'rk4';
  readonly name = 'Runge-Kutta 4th Order (Explicit)';
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
    const { system, t, x } = state;
    const n = system.stateCount;
    const k1 = this.evalDeriv(system, t, x, dt);

    const x2 = new Float64Array(n);
    for (let i = 0; i < n; i++) x2[i] = x[i] + 0.5 * dt * k1[i];
    const k2 = this.evalDeriv(system, t + 0.5 * dt, x2, dt);

    const x3 = new Float64Array(n);
    for (let i = 0; i < n; i++) x3[i] = x[i] + 0.5 * dt * k2[i];
    const k3 = this.evalDeriv(system, t + 0.5 * dt, x3, dt);

    const x4 = new Float64Array(n);
    for (let i = 0; i < n; i++) x4[i] = x[i] + dt * k3[i];
    const k4 = this.evalDeriv(system, t + dt, x4, dt);

    const nextX = new Float64Array(n);
    const nextDx = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const avgDeriv = (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6;
      nextDx[i] = avgDeriv;
      nextX[i] = x[i] + dt * avgDeriv;
    }

    return {
      t: t + dt,
      dt,
      x: nextX,
      dx: nextDx,
      z: new Float64Array(system.algebraicCount),
      accepted: true,
      lte: 0,
      iterations: 4,
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
    const dt = typeof config.initialStep === 'number' ? config.initialStep : 0.001;
    let accepted = 0;

    while (current.t < config.stopTime - 1e-12) {
      const stepDt = Math.min(dt, config.stopTime - current.t);
      const res = this.step(current, stepDt);
      current.t = res.t;
      current.x.set(res.x);
      accepted++;

      timeHist.push(current.t);
      state.system.variableNames.slice(0, state.system.stateCount).forEach((name, i) => {
        stateHist[name].push(current.x[i]);
      });
      if (onProgress) onProgress(current.t / config.stopTime);
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
        rejectedSteps: 0,
        newtonIterations: 0,
        maxResidual: 0,
        minStepUsed: dt,
        maxStepUsed: dt,
        functionEvaluations: accepted * 4,
        jacobianEvaluations: 0,
        convergenceStatus: 'CONVERGED'
      },
      diagnostics: []
    };
  }

  terminate(): void {}
}
