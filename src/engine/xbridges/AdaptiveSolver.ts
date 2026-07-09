// src/engine/xbridges/AdaptiveSolver.ts
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

export class AdaptiveSolver {
  static runODE45(engine: XbridgesEngine, options: SolverOptions) {
    const startTime = options.startTime;
    const stopTime = options.stopTime;
    const relTol = options.relTol || 1e-3;
    const absTol = options.absTol || 1e-6;

    let t = startTime;
    let h = options.fixedStep || Math.max(1e-4, Math.min(0.01, (stopTime - startTime) / 100));
    
    const hMin = options.minStep || 1e-6;
    const hMax = options.maxStep || 0.05;

    let isFsalAvailable = false;
    let k1: Map<string, any> = new Map();
    let cTime = 0.0; // Kahan compensation for time accumulation

    engine.compile(startTime);

    while (t < stopTime) {
      if (t + h > stopTime) {
        h = stopTime - t;
      }

      let stepAccepted = false;
      let nextStates = new Map<string, any>();
      let hNext = h;
      let nextK1: Map<string, any> = new Map();

      while (!stepAccepted) {
        if (h < hMin) {
          h = hMin;
          stepAccepted = true; 
        }

        // 1. Update discrete states at major time step t.
        // If a discrete state actually changes, we must invalidate FSAL and recompute k1.
        const prevDiscreteStates = new Map<string, string>();
        engine.executionOrder.forEach(b => {
          if (!b.evaluateDerivatives && b.params.sampleTime > 0) {
            prevDiscreteStates.set(b.id, JSON.stringify(b.state));
          }
        });

        engine.updateDiscreteStates(t);

        let discreteStateChanged = false;
        engine.executionOrder.forEach(b => {
          if (!b.evaluateDerivatives && b.params.sampleTime > 0) {
            if (prevDiscreteStates.get(b.id) !== JSON.stringify(b.state)) {
              discreteStateChanged = true;
            }
          }
        });

        if (discreteStateChanged) {
          isFsalAvailable = false;
        }

        // Stage 1 (k1)
        if (!isFsalAvailable) {
          engine.computeOutputs(t);
          k1 = engine.computeDerivatives(t);
        }

        const stages: Map<string, any>[] = [k1];

        // Stages 2 to 7
        for (let s = 1; s < 7; s++) {
          const state_s = new Map<string, any>();
          
          k1.forEach((_, blockId) => {
            const block = engine.getBlock(blockId);
            if (block) {
              let val = block.state;
              for (let j = 0; j < s; j++) {
                const coeff = A_DP[s][j];
                if (coeff !== 0 && stages[j].has(blockId)) {
                  val = VectorUtils.integrateState(val, stages[j].get(blockId), h * coeff);
                }
              }
              state_s.set(blockId, val);
            }
          });

          engine.computeOutputs(t + C_DP[s] * h, state_s);
          const k_s = engine.computeDerivatives(t + C_DP[s] * h, state_s);
          stages.push(k_s);
        }

        // Compute 5th-order state and error estimate
        const candidateStates = new Map<string, any>();
        let errNormSq = 0;
        let stateElementsCount = 0;

        k1.forEach((_, blockId) => {
          const block = engine.getBlock(blockId);
          if (block) {
            let y5 = block.state;
            for (let i = 0; i < 7; i++) {
              if (B5_DP[i] !== 0 && stages[i].has(blockId)) {
                y5 = VectorUtils.integrateState(y5, stages[i].get(blockId), h * B5_DP[i]);
              }
            }
            candidateStates.set(blockId, y5);

            let errorVec = VectorUtils.zeroLike(block.state);
            for (let i = 0; i < 7; i++) {
              if (E_DP[i] !== 0 && stages[i].has(blockId)) {
                errorVec = VectorUtils.integrateState(errorVec, stages[i].get(blockId), h * E_DP[i]);
              }
            }

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

        if (lte <= 1.0 || h <= hMin) {
          const statesPrev = new Map<string, any>();
          engine.executionOrder.forEach(b => {
            if (b.state !== undefined) statesPrev.set(b.id, JSON.parse(JSON.stringify(b.state)));
          });
          
          const zcPrev = engine.getZeroCrossings(t, statesPrev);
          const zcCurr = engine.getZeroCrossings(t + h, candidateStates);
          
          const zeroTol = options.zeroTol || 1e-6;
          if (engine.hasZeroCrossingSignChange(zcPrev, zcCurr)) {
             const tEvent = engine.bracketZeroCrossing(t, t + h, statesPrev, candidateStates, zeroTol);
             h = tEvent - t;
             hNext = h;
             stepAccepted = false;
             isFsalAvailable = false;
          } else {
             stepAccepted = true;
             nextStates = candidateStates;
             nextK1 = stages[6]; 

             const safety = 0.9;
             const exponent = -0.2;
             const factor = lte > 0 ? safety * Math.pow(lte, exponent) : 5.0;
             hNext = Math.max(hMin, Math.min(hMax, h * Math.max(0.1, Math.min(5.0, factor))));
          }
        } else {
          isFsalAvailable = false;
          const safety = 0.9;
          const exponent = -0.25;
          const factor = safety * Math.pow(lte, exponent);
          h = Math.max(hMin, h * Math.max(0.1, Math.min(0.9, factor)));
        }
      }

      engine.commitStateUpdates(nextStates);
      
      // Compensated time accumulation
      const yTime = h - cTime;
      const tempTime = t + yTime;
      cTime = (tempTime - t) - yTime;
      t = tempTime;

      h = hNext;
      k1 = nextK1;
      isFsalAvailable = stepAccepted;
    }

    engine.computeOutputs(stopTime);
  }

  static runODE23(engine: XbridgesEngine, options: SolverOptions) {
    const startTime = options.startTime;
    const stopTime = options.stopTime;
    const relTol = options.relTol || 1e-3;
    const absTol = options.absTol || 1e-6;

    let t = startTime;
    let h = options.fixedStep || Math.max(1e-4, Math.min(0.01, (stopTime - startTime) / 100));
    
    const hMin = options.minStep || 1e-6;
    const hMax = options.maxStep || 0.05;

    let isFsalAvailable = false;
    let k1: Map<string, any> = new Map();
    let cTime = 0.0; // Kahan compensation for time accumulation

    engine.compile(startTime);

    while (t < stopTime) {
      if (t + h > stopTime) {
        h = stopTime - t;
      }

      let stepAccepted = false;
      let nextStates = new Map<string, any>();
      let hNext = h;
      let nextK1: Map<string, any> = new Map();

      while (!stepAccepted) {
        if (h < hMin) {
          h = hMin;
          stepAccepted = true;
        }

        // 1. Update discrete states at major time step t.
        // If a discrete state actually changes, we must invalidate FSAL and recompute k1.
        const prevDiscreteStates = new Map<string, string>();
        engine.executionOrder.forEach(b => {
          if (!b.evaluateDerivatives && b.params.sampleTime > 0) {
            prevDiscreteStates.set(b.id, JSON.stringify(b.state));
          }
        });

        engine.updateDiscreteStates(t);

        let discreteStateChanged = false;
        engine.executionOrder.forEach(b => {
          if (!b.evaluateDerivatives && b.params.sampleTime > 0) {
            if (prevDiscreteStates.get(b.id) !== JSON.stringify(b.state)) {
              discreteStateChanged = true;
            }
          }
        });

        if (discreteStateChanged) {
          isFsalAvailable = false;
        }

        // Stage 1 (k1)
        if (!isFsalAvailable) {
          engine.computeOutputs(t);
          k1 = engine.computeDerivatives(t);
        }

        const stages: Map<string, any>[] = [k1];

        // Stages 2 to 4
        for (let s = 1; s < 4; s++) {
          const state_s = new Map<string, any>();
          k1.forEach((_, blockId) => {
            const block = engine.getBlock(blockId);
            if (block) {
              let val = block.state;
              for (let j = 0; j < s; j++) {
                const coeff = A_BS[s][j];
                if (coeff !== 0 && stages[j].has(blockId)) {
                  val = VectorUtils.integrateState(val, stages[j].get(blockId), h * coeff);
                }
              }
              state_s.set(blockId, val);
            }
          });

          engine.computeOutputs(t + C_BS[s] * h, state_s);
          const k_s = engine.computeDerivatives(t + C_BS[s] * h, state_s);
          stages.push(k_s);
        }

        // Compute 3rd-order state and error estimate (B3 - B2 = E)
        const candidateStates = new Map<string, any>();
        let errNormSq = 0;
        let stateElementsCount = 0;

        k1.forEach((_, blockId) => {
          const block = engine.getBlock(blockId);
          if (block) {
            let y3 = block.state;
            for (let i = 0; i < 4; i++) {
              if (B3_BS[i] !== 0 && stages[i].has(blockId)) {
                y3 = VectorUtils.integrateState(y3, stages[i].get(blockId), h * B3_BS[i]);
              }
            }
            candidateStates.set(blockId, y3);

            let errorVec = VectorUtils.zeroLike(block.state);
            for (let i = 0; i < 4; i++) {
              if (E_BS[i] !== 0 && stages[i].has(blockId)) {
                errorVec = VectorUtils.integrateState(errorVec, stages[i].get(blockId), h * E_BS[i]);
              }
            }

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
            calculateErrorMetric(errorVec, block.state, y3);
          }
        });

        const lte = stateElementsCount > 0 ? Math.sqrt(errNormSq / stateElementsCount) : 0;

        if (lte <= 1.0 || h <= hMin) {
          const statesPrev = new Map<string, any>();
          engine.executionOrder.forEach(b => {
            if (b.state !== undefined) statesPrev.set(b.id, JSON.parse(JSON.stringify(b.state)));
          });
          
          const zcPrev = engine.getZeroCrossings(t, statesPrev);
          const zcCurr = engine.getZeroCrossings(t + h, candidateStates);
          
          const zeroTol = options.zeroTol || 1e-6;
          if (engine.hasZeroCrossingSignChange(zcPrev, zcCurr)) {
             const tEvent = engine.bracketZeroCrossing(t, t + h, statesPrev, candidateStates, zeroTol);
             h = tEvent - t;
             hNext = h;
             stepAccepted = false;
             isFsalAvailable = false;
          } else {
             stepAccepted = true;
             nextStates = candidateStates;
             nextK1 = stages[3];

             const safety = 0.9;
             const exponent = -0.3333; // 1 / order
             const factor = lte > 0 ? safety * Math.pow(lte, exponent) : 5.0;
             hNext = Math.max(hMin, Math.min(hMax, h * Math.max(0.1, Math.min(5.0, factor))));
          }
        } else {
          isFsalAvailable = false;
          const safety = 0.9;
          const exponent = -0.5; // 1 / (order - 1)
          const factor = safety * Math.pow(lte, exponent);
          h = Math.max(hMin, h * Math.max(0.1, Math.min(0.9, factor)));
        }
      }

      engine.commitStateUpdates(nextStates);
      
      // Compensated time accumulation
      const yTime = h - cTime;
      const tempTime = t + yTime;
      cTime = (tempTime - t) - yTime;
      t = tempTime;

      h = hNext;
      k1 = nextK1;
      isFsalAvailable = stepAccepted;
    }

    engine.computeOutputs(stopTime);
  }

  /**
   * Perform a single Dormand-Prince (ODE45) step at time t with step size h.
   * Used for real-time interactive stepping from the UI.
   */
  static stepODE45(engine: XbridgesEngine, t: number, h: number) {
    engine.computeOutputs(t);
    engine.updateDiscreteStates(t);
    const k1 = engine.computeDerivatives(t);
    const stages: Map<string, any>[] = [k1];

    for (let s = 1; s < 7; s++) {
      const state_s = new Map<string, any>();
      k1.forEach((_, blockId) => {
        const block = engine.getBlock(blockId);
        if (block) {
          let val = block.state;
          for (let j = 0; j < s; j++) {
            const coeff = A_DP[s]?.[j] ?? 0;
            if (coeff !== 0 && stages[j].has(blockId)) {
              val = VectorUtils.integrateState(val, stages[j].get(blockId), h * coeff);
            }
          }
          state_s.set(blockId, val);
        }
      });
      engine.computeOutputs(t + C_DP[s] * h, state_s);
      stages.push(engine.computeDerivatives(t + C_DP[s] * h, state_s));
    }

    const nextStates = new Map<string, any>();
    k1.forEach((_, blockId) => {
      const block = engine.getBlock(blockId);
      if (block) {
        let delta = VectorUtils.zeroLike(block.state);
        for (let i = 0; i < 7; i++) {
          if (B5_DP[i] !== 0 && stages[i].has(blockId)) {
            delta = VectorUtils.integrateState(delta, stages[i].get(blockId), h * B5_DP[i]);
          }
        }
        nextStates.set(blockId, VectorUtils.integrateState(block.state, delta, 1));
      }
    });
    engine.commitStateUpdates(nextStates);
  }

  /**
   * Perform a single Bogacki-Shampine (ODE23) step at time t with step size h.
   * Used for real-time interactive stepping from the UI.
   */
  static stepODE23(engine: XbridgesEngine, t: number, h: number) {
    engine.computeOutputs(t);
    engine.updateDiscreteStates(t);
    const k1 = engine.computeDerivatives(t);
    const stages: Map<string, any>[] = [k1];

    for (let s = 1; s < 4; s++) {
      const state_s = new Map<string, any>();
      k1.forEach((_, blockId) => {
        const block = engine.getBlock(blockId);
        if (block) {
          let val = block.state;
          for (let j = 0; j < s; j++) {
            const coeff = A_BS[s]?.[j] ?? 0;
            if (coeff !== 0 && stages[j].has(blockId)) {
              val = VectorUtils.integrateState(val, stages[j].get(blockId), h * coeff);
            }
          }
          state_s.set(blockId, val);
        }
      });
      engine.computeOutputs(t + C_BS[s] * h, state_s);
      stages.push(engine.computeDerivatives(t + C_BS[s] * h, state_s));
    }

    const nextStates = new Map<string, any>();
    k1.forEach((_, blockId) => {
      const block = engine.getBlock(blockId);
      if (block) {
        let delta = VectorUtils.zeroLike(block.state);
        for (let i = 0; i < 4; i++) {
          if (B3_BS[i] !== 0 && stages[i]?.has(blockId)) {
            delta = VectorUtils.integrateState(delta, stages[i].get(blockId), h * B3_BS[i]);
          }
        }
        nextStates.set(blockId, VectorUtils.integrateState(block.state, delta, 1));
      }
    });
    engine.commitStateUpdates(nextStates);
  }
}
