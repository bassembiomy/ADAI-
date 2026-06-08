// src/engine/xbridges/Solvers.ts
import { XbridgesEngine } from './XbridgesEngine';
import { SolverOptions } from './types';
import { VectorUtils } from './VectorUtils';

export class Solvers {
  static stepEuler(engine: XbridgesEngine, t: number, dt: number) {
      engine.computeOutputs(t);
      engine.updateDiscreteStates(t);
      const dx = engine.computeDerivatives(t);
      const nextStates = new Map<string, any>();
      dx.forEach((deriv, blockId) => {
        const block = engine['executionOrder'].find(b => b.id === blockId);
        if (block) {
           const nextState = VectorUtils.integrateState(block.state, deriv, dt);
           nextStates.set(blockId, nextState);
        }
      });
      engine.commitStateUpdates(nextStates);
  }

  // ODE1: Euler Method (Full Simulation)
  static runEuler(engine: XbridgesEngine, options: SolverOptions) {
    let t = options.startTime;
    const dt = options.fixedStep || 0.01;
    
    while (t < options.stopTime) {
      this.stepEuler(engine, t, dt);
      t += dt;
    }
  }

  static stepRK4(engine: XbridgesEngine, t: number, dt: number) {
      const dt2 = dt / 2;
      
      // k1
      engine.computeOutputs(t);
      engine.updateDiscreteStates(t);
      const k1 = engine.computeDerivatives(t);

      // k2
      const state_k2 = new Map<string, any>();
      k1.forEach((deriv, blockId) => {
        const block = engine['executionOrder'].find(b => b.id === blockId);
        if (block) {
          state_k2.set(blockId, VectorUtils.integrateState(block.state, deriv, dt2));
        }
      });
      engine.computeOutputs(t + dt2, state_k2);
      const k2 = engine.computeDerivatives(t + dt2, state_k2);

      // k3
      const state_k3 = new Map<string, any>();
      k2.forEach((deriv, blockId) => {
        const block = engine['executionOrder'].find(b => b.id === blockId);
        if (block) {
          state_k3.set(blockId, VectorUtils.integrateState(block.state, deriv, dt2));
        }
      });
      engine.computeOutputs(t + dt2, state_k3);
      const k3 = engine.computeDerivatives(t + dt2, state_k3);

      // k4
      const state_k4 = new Map<string, any>();
      k3.forEach((deriv, blockId) => {
        const block = engine['executionOrder'].find(b => b.id === blockId);
        if (block) {
          state_k4.set(blockId, VectorUtils.integrateState(block.state, deriv, dt));
        }
      });
      engine.computeOutputs(t + dt, state_k4);
      const k4 = engine.computeDerivatives(t + dt, state_k4);

      // Final combination
      const nextStates = new Map<string, any>();
      k1.forEach((deriv1, blockId) => {
        const block = engine['executionOrder'].find(b => b.id === blockId);
        if (block) {
          const deriv2 = k2.get(blockId);
          const deriv3 = k3.get(blockId);
          const deriv4 = k4.get(blockId);
          
          let sum = VectorUtils.applyElementWise(deriv1, VectorUtils.applyElementWise(deriv2, 2, 'multiply'), 'add');
          sum = VectorUtils.applyElementWise(sum, VectorUtils.applyElementWise(deriv3, 2, 'multiply'), 'add');
          sum = VectorUtils.applyElementWise(sum, deriv4, 'add');
          
          const delta = VectorUtils.applyElementWise(sum, dt / 6, 'multiply');
          nextStates.set(blockId, VectorUtils.integrateState(block.state, delta, 1));
        }
      });

      engine.commitStateUpdates(nextStates);
  }

  // ODE4: Runge-Kutta 4th Order (Full Simulation)
  static runRK4(engine: XbridgesEngine, options: SolverOptions) {
    let t = options.startTime;
    const dt = options.fixedStep || 0.01;
    
    while (t < options.stopTime) {
      this.stepRK4(engine, t, dt);
      t += dt;
    }
  }

  static runFixedStep(engine: XbridgesEngine, options: SolverOptions) {
      if (options.solver === 'rk4' || options.solver === 'ode4' as any) {
          this.runRK4(engine, options);
      } else {
          this.runEuler(engine, options);
      }
  }
}
