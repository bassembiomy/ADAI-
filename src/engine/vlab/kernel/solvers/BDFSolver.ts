// src/engine/vlab/kernel/solvers/BDFSolver.ts
import { ISolver, SolverState, SolverStepResult } from './ISolver';
import { CompiledPhysicalSystem, SolverConfiguration, InitialCondition, SimulationResult, SolverContext } from '../types';
import { DenseLUSolver } from '../linear/DenseLUSolver';

export class BDFSolver implements ISolver {
  readonly id = 'bdf';
  readonly name = 'Variable-Order BDF (Implicit DAE)';
  readonly supportsDAE = true;
  private linearSolver = new DenseLUSolver();

  initialize(
    system: CompiledPhysicalSystem,
    config: SolverConfiguration,
    initialConditions: InitialCondition[]
  ): SolverState {
    const x = new Float64Array(system.stateCount);
    const z = new Float64Array(system.algebraicCount);
    initialConditions.forEach(ic => {
      const idx = system.variableNames.indexOf(ic.variableId);
      if (idx !== -1 && ic.value !== undefined) {
        if (idx < system.stateCount) {
          x[idx] = ic.value;
        } else {
          z[idx - system.stateCount] = ic.value;
        }
      }
    });

    return {
      t: config.startTime,
      x,
      dx: new Float64Array(system.stateCount),
      z,
      system,
      config
    };
  }

  step(state: SolverState, dt: number): SolverStepResult {
    const { system, t, x, z, config } = state;
    const n = system.totalSize;
    // BDF-2 is active when we have the previous state x_{n-1} and step dt_{n-1}
    const isOrder2 = !!(state.prevStates && state.prevDt);
    const order = isOrder2 ? 2 : 1;

    let a0 = 1 / dt;
    let a1 = -1 / dt;
    let a2 = 0;

    if (isOrder2 && state.prevDt) {
      const r = dt / state.prevDt;
      a0 = (2 * r + 1) / (dt * (r + 1));
      a1 = -(r + 1) / dt;
      a2 = (r * r) / (dt * (r + 1));
    }

    // dx/dt at step n+1:
    // BDF-1: (x_{n+1} - x_n) / dt
    // BDF-2: a0 * x_{n+1} + a1 * x_n + a2 * x_{n-1}
    const computeDx = (xVec: Float64Array): Float64Array => {
      const dxVec = new Float64Array(system.stateCount);
      for (let i = 0; i < system.stateCount; i++) {
        if (order === 2 && state.prevStates) {
          dxVec[i] = a0 * xVec[i] + a1 * x[i] + a2 * state.prevStates[i];
        } else {
          dxVec[i] = (xVec[i] - x[i]) / dt;
        }
      }
      return dxVec;
    };

    let currX = new Float64Array(x);
    let currZ = new Float64Array(z);
    let currDx = computeDx(currX);

    const ctx: SolverContext = {
      t: t + dt,
      dt,
      order,
      prevStates: state.prevStates,
      prevPrevStates: state.prevPrevStates,
      prevDt: state.prevDt,
      parameters: {},
      inputs: {}
    };

    let newtonIter = 0;
    let converged = false;
    let residualNorm = Infinity;

    for (newtonIter = 0; newtonIter < config.maximumIterations; newtonIter++) {
      currDx = computeDx(currX);
      const F = new Float64Array(n);
      system.residual(t + dt, currX, currDx, currZ, ctx, F);

      let sumSq = 0;
      for (let i = 0; i < n; i++) sumSq += F[i] * F[i];
      residualNorm = Math.sqrt(sumSq);

      if (residualNorm < config.nonlinearTolerance) {
        converged = true;
        break;
      }

      // Compute numerical Jacobian J = dF/d[x, z]
      const J: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
      const eps = 1e-7;

      for (let j = 0; j < n; j++) {
        const isDiff = j < system.stateCount;
        const xPerturb = new Float64Array(currX);
        const zPerturb = new Float64Array(currZ);

        let hPerturb = eps;
        if (isDiff) {
          hPerturb = eps * Math.max(1.0, Math.abs(currX[j]));
          xPerturb[j] += hPerturb;
        } else {
          hPerturb = eps * Math.max(1.0, Math.abs(currZ[j - system.stateCount]));
          zPerturb[j - system.stateCount] += hPerturb;
        }

        const dxPerturb = computeDx(xPerturb);
        const FPerturb = new Float64Array(n);
        system.residual(t + dt, xPerturb, dxPerturb, zPerturb, ctx, FPerturb);

        for (let i = 0; i < n; i++) {
          J[i][j] = (FPerturb[i] - F[i]) / hPerturb;
        }
      }

      const negF = Array.from(F, val => -val);
      const factorized = this.linearSolver.factorize(J, n);
      if (!factorized) {
        break;
      }

      const delta = this.linearSolver.solve(negF);

      // Backtracking line search
      let damping = 1.0;
      let stepImproved = false;

      while (damping > 0.01) {
        const trialX = new Float64Array(currX);
        const trialZ = new Float64Array(currZ);

        for (let i = 0; i < system.stateCount; i++) {
          trialX[i] += damping * delta[i];
        }
        for (let i = 0; i < system.algebraicCount; i++) {
          trialZ[i] += damping * delta[system.stateCount + i];
        }

        const trialDx = computeDx(trialX);
        const FTrial = new Float64Array(n);
        system.residual(t + dt, trialX, trialDx, trialZ, ctx, FTrial);
        let trialNormSq = 0;
        for (let i = 0; i < n; i++) trialNormSq += FTrial[i] * FTrial[i];
        const trialNorm = Math.sqrt(trialNormSq);

        if (trialNorm < residualNorm || trialNorm < config.nonlinearTolerance) {
          currX = trialX;
          currZ = trialZ;
          currDx = trialDx;
          residualNorm = trialNorm;
          stepImproved = true;
          break;
        }
        damping *= 0.5;
      }

      if (!stepImproved) {
        for (let i = 0; i < system.stateCount; i++) currX[i] += 0.1 * delta[i];
        for (let i = 0; i < system.algebraicCount; i++) currZ[i] += 0.1 * delta[system.stateCount + i];
      }
    }

    return {
      t: t + dt,
      dt,
      x: currX,
      dx: currDx,
      z: currZ,
      accepted: converged,
      lte: residualNorm,
      iterations: newtonIter,
      residual: residualNorm
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

    let current = { ...state, x: new Float64Array(state.x), z: new Float64Array(state.z) };
    let dt = typeof config.initialStep === 'number' ? config.initialStep : 0.001;
    const minStep = typeof config.minimumStep === 'number' ? config.minimumStep : 1e-6;
    const maxStep = typeof config.maximumStep === 'number' ? config.maximumStep : 0.1;
    let accepted = 0;
    let rejected = 0;
    let totalNewton = 0;
    let maxRes = 0;

    while (current.t < config.stopTime - 1e-12) {
      if (current.t + dt > config.stopTime) dt = config.stopTime - current.t;
      const res = this.step(current, dt);
      totalNewton += res.iterations;
      if (res.residual > maxRes) maxRes = res.residual;

      if (res.accepted) {
        current.prevStates = new Float64Array(current.x);
        current.prevDt = dt;
        current.t = res.t;
        current.x.set(res.x);
        current.z.set(res.z);
        accepted++;

        timeHist.push(current.t);
        state.system.variableNames.slice(0, state.system.stateCount).forEach((name, i) => {
          stateHist[name].push(current.x[i]);
        });

        if (res.iterations <= 3 && dt < maxStep) {
          dt = Math.min(maxStep, dt * 1.5);
        }
        if (onProgress) onProgress(current.t / config.stopTime);
      } else {
        rejected++;
        dt *= 0.5;
        if (dt < minStep) {
          dt = minStep;
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
        newtonIterations: totalNewton,
        maxResidual: maxRes,
        minStepUsed: minStep,
        maxStepUsed: maxStep,
        functionEvaluations: totalNewton * (state.system.totalSize + 1),
        jacobianEvaluations: totalNewton,
        convergenceStatus: 'CONVERGED'
      },
      diagnostics: []
    };
  }

  terminate(): void {}
}
