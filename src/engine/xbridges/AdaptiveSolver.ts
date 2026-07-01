// src/engine/xbridges/AdaptiveSolver.ts
import { XbridgesEngine } from './XbridgesEngine';
import { SolverOptions } from './types';
import { VectorUtils } from './VectorUtils';

// Dormand-Prince (ODE45) Butcher Tableau Coefficients
const C = [0, 1/5, 3/10, 4/5, 8/9, 1, 1];

const A = [
  [],
  [1/5],
  [3/40, 9/40],
  [44/45, -56/15, 32/9],
  [19372/6561, -25360/2187, 64448/6561, -212/729],
  [9017/3168, -355/33, 46732/5247, 49/176, -5103/18656],
  [35/384, 0, 500/1113, 125/192, -2187/6784, 11/84]
];

// 5th-order coefficients (used for advancing the step)
const B5 = [35/384, 0, 500/1113, 125/192, -2187/6784, 11/84, 0];

// 4th-order coefficients (used for error estimation)
const B4 = [5179/57600, 0, 7571/16695, 393/640, -92097/339200, 187/2100, 1/40];

// Difference coefficients for error computation (B5 - B4)
const E_coeff = [
  35/384 - 5179/57600,
  0,
  500/1113 - 7571/16695,
  125/192 - 393/640,
  -2187/6784 - -92097/339200,
  11/84 - 187/2100,
  -1/40
];

export class AdaptiveSolver {
  static runODE45(engine: XbridgesEngine, options: SolverOptions) {
    const startTime = options.startTime;
    const stopTime = options.stopTime;
    const relTol = (options as any).relTol || 1e-3;
    const absTol = (options as any).absTol || 1e-6;

    let t = startTime;
    // Initial step size guess: 1ms or 1/100 of the total time
    let h = options.fixedStep || Math.max(1e-4, Math.min(0.01, (stopTime - startTime) / 100));
    
    // Bounds for step size
    const hMin = (options as any).minStep || 1e-6;
    const hMax = (options as any).maxStep || 0.05;

    while (t < stopTime) {
      if (t + h > stopTime) {
        h = stopTime - t;
      }

      let stepAccepted = false;
      let nextStates = new Map<string, any>();
      let hNext = h;

      while (!stepAccepted) {
        if (h < hMin) {
          h = hMin;
          stepAccepted = true; // Force step acceptance to avoid infinite loops at hMin
        }

        // --- Stage 1 (k1) ---
        engine.computeOutputs(t);
        engine.updateDiscreteStates(t);
        const k1 = engine.computeDerivatives(t);

        // Stages array to collect k1..k7
        const stages: Map<string, any>[] = [k1];

        // --- Stages 2 to 7 ---
        for (let s = 1; s < 7; s++) {
          const state_s = new Map<string, any>();
          
          k1.forEach((_, blockId) => {
            const block = engine.getBlock(blockId);
            if (block) {
              let val = block.state;
              for (let j = 0; j < s; j++) {
                const coeff = A[s][j];
                if (coeff !== 0 && stages[j].has(blockId)) {
                  val = VectorUtils.integrateState(val, stages[j].get(blockId), h * coeff);
                }
              }
              state_s.set(blockId, val);
            }
          });

          engine.computeOutputs(t + C[s] * h, state_s);
          const k_s = engine.computeDerivatives(t + C[s] * h, state_s);
          stages.push(k_s);
        }

        // --- Compute 5th-order state and error estimate ---
        const candidateStates = new Map<string, any>();
        let errNormSq = 0;
        let stateElementsCount = 0;

        k1.forEach((_, blockId) => {
          const block = engine.getBlock(blockId);
          if (block) {
            // y5 = x + h * sum(B5_i * k_i)
            let y5 = block.state;
            for (let i = 0; i < 7; i++) {
              if (B5[i] !== 0 && stages[i].has(blockId)) {
                y5 = VectorUtils.integrateState(y5, stages[i].get(blockId), h * B5[i]);
              }
            }
            candidateStates.set(blockId, y5);

            // error = h * sum(E_coeff_i * k_i)
            let errorVec: any = 0;
            for (let i = 0; i < 7; i++) {
              if (E_coeff[i] !== 0 && stages[i].has(blockId)) {
                errorVec = VectorUtils.integrateState(errorVec, stages[i].get(blockId), h * E_coeff[i]);
              }
            }

            // Calculate norm of error for this block's states
            const calculateErrorMetric = (errVal: any, stateVal: any, candidateVal: any) => {
              if (typeof errVal === 'number') {
                const tol = absTol + relTol * Math.max(Math.abs(stateVal), Math.abs(candidateVal));
                const ratio = errVal / tol;
                errNormSq += ratio * ratio;
                stateElementsCount++;
              } else if (Array.isArray(errVal)) {
                errVal.forEach((ev, idx) => {
                  const sv = stateVal[idx] ?? 0;
                  const cv = candidateVal[idx] ?? 0;
                  const tol = absTol + relTol * Math.max(Math.abs(sv), Math.abs(cv));
                  const ratio = ev / tol;
                  errNormSq += ratio * ratio;
                  stateElementsCount++;
                });
              } else if (typeof errVal === 'object' && errVal !== null) {
                for (const key in errVal) {
                  const ev = errVal[key];
                  const sv = stateVal[key] ?? 0;
                  const cv = candidateVal[key] ?? 0;
                  const tol = absTol + relTol * Math.max(Math.abs(sv), Math.abs(cv));
                  const ratio = ev / tol;
                  errNormSq += ratio * ratio;
                  stateElementsCount++;
                }
              }
            };
            calculateErrorMetric(errorVec, block.state, y5);
          }
        });

        const lte = stateElementsCount > 0 ? Math.sqrt(errNormSq / stateElementsCount) : 0;

        if (lte <= 1.0) {
          // Accept the step
          stepAccepted = true;
          nextStates = candidateStates;
          
          // Compute step size for next step
          const safety = 0.9;
          const exponent = -0.2;
          const factor = lte > 0 ? safety * Math.pow(lte, exponent) : 5.0;
          hNext = Math.max(hMin, Math.min(hMax, h * Math.max(0.1, Math.min(5.0, factor))));
        } else {
          // Reject the step and retry with smaller h
          const safety = 0.9;
          const exponent = -0.25;
          const factor = safety * Math.pow(lte, exponent);
          h = Math.max(hMin, h * Math.max(0.1, Math.min(0.9, factor)));
        }
      }

      // Commit accepted step updates
      engine.commitStateUpdates(nextStates);
      t += h;
      h = hNext;
    }
  }
}
