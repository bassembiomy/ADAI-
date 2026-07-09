import { XbridgesEngine } from './XbridgesEngine';
import { SolverOptions } from './types';
import { VectorUtils } from './VectorUtils';
import { AdaptiveSolver } from './AdaptiveSolver';

// Dormand-Prince coefficients for ODE5 fixed step
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

export class Solvers {
  // ODE1: Euler Method
  static stepEuler(engine: XbridgesEngine, t: number, dt: number) {
      engine.computeOutputs(t);
      engine.updateDiscreteStates(t);
      const dx = engine.computeDerivatives(t);
      const nextStates = new Map<string, any>();
      dx.forEach((deriv, blockId) => {
        const block = engine.getBlock(blockId);
        if (block) {
           const nextState = VectorUtils.integrateState(block.state, deriv, dt);
           nextStates.set(blockId, nextState);
        }
      });
      engine.commitStateUpdates(nextStates);
  }

  static runEuler(engine: XbridgesEngine, options: SolverOptions) {
    const startTime = options.startTime;
    const stopTime = options.stopTime;
    const dt = options.fixedStep || 0.01;
    const zeroTol = options.zeroTol || 1e-6;
    
    let t = startTime;
    let c = 0.0;
    
    engine.options = options;
    
    while (t < stopTime) {
      let currentStep = dt;
      if (t + currentStep > stopTime) {
        currentStep = stopTime - t;
      }
      
      const statesPrev = new Map<string, any>();
      engine.executionOrder.forEach(b => {
        if (b.state !== undefined) statesPrev.set(b.id, JSON.parse(JSON.stringify(b.state)));
      });
      
      this.stepEuler(engine, t, currentStep);
      
      const statesCurr = new Map<string, any>();
      engine.executionOrder.forEach(b => {
        if (b.state !== undefined) statesCurr.set(b.id, JSON.parse(JSON.stringify(b.state)));
      });
      
      const zcPrev = engine.getZeroCrossings(t, statesPrev);
      const zcCurr = engine.getZeroCrossings(t + currentStep, statesCurr);
      
      if (engine.hasZeroCrossingSignChange(zcPrev, zcCurr)) {
        const tEvent = engine.bracketZeroCrossing(t, t + currentStep, statesPrev, statesCurr, zeroTol);
        engine.commitStateUpdates(statesPrev);
        
        const hEvent = tEvent - t;
        this.stepEuler(engine, t, hEvent);
        
        const y = hEvent - c;
        const temp = t + y;
        c = (temp - t) - y;
        t = temp;
      } else {
        const y = currentStep - c;
        const temp = t + y;
        c = (temp - t) - y;
        t = temp;
      }
    }
    engine.computeOutputs(stopTime);
  }

  // ODE2: Heun's Method
  static stepODE2(engine: XbridgesEngine, t: number, dt: number) {
      engine.computeOutputs(t);
      engine.updateDiscreteStates(t);
      const k1 = engine.computeDerivatives(t);

      const state_k2 = new Map<string, any>();
      k1.forEach((deriv, blockId) => {
        const block = engine.getBlock(blockId);
        if (block) {
          state_k2.set(blockId, VectorUtils.integrateState(block.state, deriv, dt));
        }
      });

      engine.computeOutputs(t + dt, state_k2);
      const k2 = engine.computeDerivatives(t + dt, state_k2);

      const nextStates = new Map<string, any>();
      k1.forEach((deriv1, blockId) => {
        const block = engine.getBlock(blockId);
        if (block) {
          const deriv2 = k2.get(blockId) ?? deriv1;
          const sum = VectorUtils.applyElementWise(deriv1, deriv2, 'add');
          const delta = VectorUtils.applyElementWise(sum, dt / 2, 'multiply');
          nextStates.set(blockId, VectorUtils.integrateState(block.state, delta, 1));
        }
      });
      engine.commitStateUpdates(nextStates);
  }

  static runODE2(engine: XbridgesEngine, options: SolverOptions) {
    const startTime = options.startTime;
    const stopTime = options.stopTime;
    const dt = options.fixedStep || 0.01;
    const zeroTol = options.zeroTol || 1e-6;
    
    let t = startTime;
    let c = 0.0;
    
    engine.options = options;
    
    while (t < stopTime) {
      let currentStep = dt;
      if (t + currentStep > stopTime) {
        currentStep = stopTime - t;
      }
      
      const statesPrev = new Map<string, any>();
      engine.executionOrder.forEach(b => {
        if (b.state !== undefined) statesPrev.set(b.id, JSON.parse(JSON.stringify(b.state)));
      });
      
      this.stepODE2(engine, t, currentStep);
      
      const statesCurr = new Map<string, any>();
      engine.executionOrder.forEach(b => {
        if (b.state !== undefined) statesCurr.set(b.id, JSON.parse(JSON.stringify(b.state)));
      });
      
      const zcPrev = engine.getZeroCrossings(t, statesPrev);
      const zcCurr = engine.getZeroCrossings(t + currentStep, statesCurr);
      
      if (engine.hasZeroCrossingSignChange(zcPrev, zcCurr)) {
        const tEvent = engine.bracketZeroCrossing(t, t + currentStep, statesPrev, statesCurr, zeroTol);
        engine.commitStateUpdates(statesPrev);
        
        const hEvent = tEvent - t;
        this.stepODE2(engine, t, hEvent);
        
        const y = hEvent - c;
        const temp = t + y;
        c = (temp - t) - y;
        t = temp;
      } else {
        const y = currentStep - c;
        const temp = t + y;
        c = (temp - t) - y;
        t = temp;
      }
    }
    engine.computeOutputs(stopTime);
  }

  // ODE3: Bogacki-Shampine 3rd Order Fixed-Step
  static stepODE3(engine: XbridgesEngine, t: number, dt: number) {
      engine.computeOutputs(t);
      engine.updateDiscreteStates(t);
      const k1 = engine.computeDerivatives(t);

      const dt2 = dt / 2;
      const state_k2 = new Map<string, any>();
      k1.forEach((deriv, blockId) => {
        const block = engine.getBlock(blockId);
        if (block) {
          state_k2.set(blockId, VectorUtils.integrateState(block.state, deriv, dt2));
        }
      });

      engine.computeOutputs(t + dt2, state_k2);
      const k2 = engine.computeDerivatives(t + dt2, state_k2);

      const dt34 = dt * 0.75;
      const state_k3 = new Map<string, any>();
      k2.forEach((deriv, blockId) => {
        const block = engine.getBlock(blockId);
        if (block) {
          state_k3.set(blockId, VectorUtils.integrateState(block.state, deriv, dt34));
        }
      });

      engine.computeOutputs(t + dt34, state_k3);
      const k3 = engine.computeDerivatives(t + dt34, state_k3);

      const nextStates = new Map<string, any>();
      k1.forEach((deriv1, blockId) => {
        const block = engine.getBlock(blockId);
        if (block) {
          const deriv2 = k2.get(blockId) ?? deriv1;
          const deriv3 = k3.get(blockId) ?? deriv1;

          const term1 = VectorUtils.applyElementWise(deriv1, 2/9, 'multiply');
          const term2 = VectorUtils.applyElementWise(deriv2, 1/3, 'multiply');
          const term3 = VectorUtils.applyElementWise(deriv3, 4/9, 'multiply');

          let sum = VectorUtils.applyElementWise(term1, term2, 'add');
          sum = VectorUtils.applyElementWise(sum, term3, 'add');

          const delta = VectorUtils.applyElementWise(sum, dt, 'multiply');
          nextStates.set(blockId, VectorUtils.integrateState(block.state, delta, 1));
        }
      });
      engine.commitStateUpdates(nextStates);
  }

  static runODE3(engine: XbridgesEngine, options: SolverOptions) {
    const startTime = options.startTime;
    const stopTime = options.stopTime;
    const dt = options.fixedStep || 0.01;
    const zeroTol = options.zeroTol || 1e-6;
    
    let t = startTime;
    let c = 0.0;
    
    engine.options = options;
    
    while (t < stopTime) {
      let currentStep = dt;
      if (t + currentStep > stopTime) {
        currentStep = stopTime - t;
      }
      
      const statesPrev = new Map<string, any>();
      engine.executionOrder.forEach(b => {
        if (b.state !== undefined) statesPrev.set(b.id, JSON.parse(JSON.stringify(b.state)));
      });
      
      this.stepODE3(engine, t, currentStep);
      
      const statesCurr = new Map<string, any>();
      engine.executionOrder.forEach(b => {
        if (b.state !== undefined) statesCurr.set(b.id, JSON.parse(JSON.stringify(b.state)));
      });
      
      const zcPrev = engine.getZeroCrossings(t, statesPrev);
      const zcCurr = engine.getZeroCrossings(t + currentStep, statesCurr);
      
      if (engine.hasZeroCrossingSignChange(zcPrev, zcCurr)) {
        const tEvent = engine.bracketZeroCrossing(t, t + currentStep, statesPrev, statesCurr, zeroTol);
        engine.commitStateUpdates(statesPrev);
        
        const hEvent = tEvent - t;
        this.stepODE3(engine, t, hEvent);
        
        const y = hEvent - c;
        const temp = t + y;
        c = (temp - t) - y;
        t = temp;
      } else {
        const y = currentStep - c;
        const temp = t + y;
        c = (temp - t) - y;
        t = temp;
      }
    }
    engine.computeOutputs(stopTime);
  }

  // ODE4: Runge-Kutta 4th Order
  static stepRK4(engine: XbridgesEngine, t: number, dt: number) {
      const dt2 = dt / 2;
      
      // k1
      engine.computeOutputs(t);
      engine.updateDiscreteStates(t);
      const k1 = engine.computeDerivatives(t);

      // k2
      const state_k2 = new Map<string, any>();
      k1.forEach((deriv, blockId) => {
        const block = engine.getBlock(blockId);
        if (block) {
          state_k2.set(blockId, VectorUtils.integrateState(block.state, deriv, dt2));
        }
      });
      engine.computeOutputs(t + dt2, state_k2);
      const k2 = engine.computeDerivatives(t + dt2, state_k2);

      // k3
      const state_k3 = new Map<string, any>();
      k2.forEach((deriv, blockId) => {
        const block = engine.getBlock(blockId);
        if (block) {
          state_k3.set(blockId, VectorUtils.integrateState(block.state, deriv, dt2));
        }
      });
      engine.computeOutputs(t + dt2, state_k3);
      const k3 = engine.computeDerivatives(t + dt2, state_k3);

      // k4
      const state_k4 = new Map<string, any>();
      k3.forEach((deriv, blockId) => {
        const block = engine.getBlock(blockId);
        if (block) {
          state_k4.set(blockId, VectorUtils.integrateState(block.state, deriv, dt));
        }
      });
      engine.computeOutputs(t + dt, state_k4);
      const k4 = engine.computeDerivatives(t + dt, state_k4);

      // Final combination
      const nextStates = new Map<string, any>();
      k1.forEach((deriv1, blockId) => {
        const block = engine.getBlock(blockId);
        if (block) {
          const deriv2 = k2.get(blockId) ?? deriv1;
          const deriv3 = k3.get(blockId) ?? deriv1;
          const deriv4 = k4.get(blockId) ?? deriv1;
          
          let sum = VectorUtils.applyElementWise(deriv1, VectorUtils.applyElementWise(deriv2, 2, 'multiply'), 'add');
          sum = VectorUtils.applyElementWise(sum, VectorUtils.applyElementWise(deriv3, 2, 'multiply'), 'add');
          sum = VectorUtils.applyElementWise(sum, deriv4, 'add');
          
          const delta = VectorUtils.applyElementWise(sum, dt / 6, 'multiply');
          nextStates.set(blockId, VectorUtils.integrateState(block.state, delta, 1));
        }
      });

      engine.commitStateUpdates(nextStates);
  }

  static runRK4(engine: XbridgesEngine, options: SolverOptions) {
    const startTime = options.startTime;
    const stopTime = options.stopTime;
    const dt = options.fixedStep || 0.01;
    const zeroTol = options.zeroTol || 1e-6;
    
    let t = startTime;
    let c = 0.0;
    
    engine.options = options;
    
    while (t < stopTime) {
      let currentStep = dt;
      if (t + currentStep > stopTime) {
        currentStep = stopTime - t;
      }
      
      const statesPrev = new Map<string, any>();
      engine.executionOrder.forEach(b => {
        if (b.state !== undefined) statesPrev.set(b.id, JSON.parse(JSON.stringify(b.state)));
      });
      
      this.stepRK4(engine, t, currentStep);
      
      const statesCurr = new Map<string, any>();
      engine.executionOrder.forEach(b => {
        if (b.state !== undefined) statesCurr.set(b.id, JSON.parse(JSON.stringify(b.state)));
      });
      
      const zcPrev = engine.getZeroCrossings(t, statesPrev);
      const zcCurr = engine.getZeroCrossings(t + currentStep, statesCurr);
      
      if (engine.hasZeroCrossingSignChange(zcPrev, zcCurr)) {
        const tEvent = engine.bracketZeroCrossing(t, t + currentStep, statesPrev, statesCurr, zeroTol);
        engine.commitStateUpdates(statesPrev);
        
        const hEvent = tEvent - t;
        this.stepRK4(engine, t, hEvent);
        
        const y = hEvent - c;
        const temp = t + y;
        c = (temp - t) - y;
        t = temp;
      } else {
        const y = currentStep - c;
        const temp = t + y;
        c = (temp - t) - y;
        t = temp;
      }
    }
    engine.computeOutputs(stopTime);
  }

  // ODE5: Dormand-Prince Fixed-Step
  static stepODE5(engine: XbridgesEngine, t: number, h: number) {
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

  static runODE5(engine: XbridgesEngine, options: SolverOptions) {
    const startTime = options.startTime;
    const stopTime = options.stopTime;
    const h = options.fixedStep || 0.01;
    const zeroTol = options.zeroTol || 1e-6;
    
    let t = startTime;
    let c = 0.0;
    
    engine.options = options;
    
    while (t < stopTime) {
      let currentStep = h;
      if (t + currentStep > stopTime) {
        currentStep = stopTime - t;
      }
      
      const statesPrev = new Map<string, any>();
      engine.executionOrder.forEach(b => {
        if (b.state !== undefined) statesPrev.set(b.id, JSON.parse(JSON.stringify(b.state)));
      });
      
      this.stepODE5(engine, t, currentStep);
      
      const statesCurr = new Map<string, any>();
      engine.executionOrder.forEach(b => {
        if (b.state !== undefined) statesCurr.set(b.id, JSON.parse(JSON.stringify(b.state)));
      });
      
      const zcPrev = engine.getZeroCrossings(t, statesPrev);
      const zcCurr = engine.getZeroCrossings(t + currentStep, statesCurr);
      
      if (engine.hasZeroCrossingSignChange(zcPrev, zcCurr)) {
        const tEvent = engine.bracketZeroCrossing(t, t + currentStep, statesPrev, statesCurr, zeroTol);
        engine.commitStateUpdates(statesPrev);
        
        const hEvent = tEvent - t;
        this.stepODE5(engine, t, hEvent);
        
        const y = hEvent - c;
        const temp = t + y;
        c = (temp - t) - y;
        t = temp;
      } else {
        const y = currentStep - c;
        const temp = t + y;
        c = (temp - t) - y;
        t = temp;
      }
    }
    engine.computeOutputs(stopTime);
  }

  static runFixedStep(engine: XbridgesEngine, options: SolverOptions) {
      engine.options = options;
      engine.compile(options.startTime);

      const solver = options.solver as string;
      if (solver === 'ode45') {
          AdaptiveSolver.runODE45(engine, options);
      } else if (solver === 'ode23') {
          AdaptiveSolver.runODE23(engine, options);
      } else if (solver === 'ode4' || solver === 'rk4') {
          this.runRK4(engine, options);
      } else if (solver === 'ode3') {
          this.runODE3(engine, options);
      } else if (solver === 'ode2') {
          this.runODE2(engine, options);
      } else if (solver === 'ode5') {
          this.runODE5(engine, options);
      } else {
          this.runEuler(engine, options);
      }
  }
}
