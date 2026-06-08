import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from './BlockDefinitions';
import { XbridgesEngine } from './XbridgesEngine';
import { Solvers } from './Solvers';

describe('X-Bridges Learning Models Block Tests', () => {

  it('TC-LEARN-01: LMS Adaptive Filter Convergence', () => {
    // Instantiate LMS block
    const lmsBlock = BLOCK_LIBRARY['LMS_ADAPTIVE_FILTER']('lms_test', { lr: 0.1 });
    
    let state = lmsBlock.state;
    
    // Simple LCG random generator for deterministic results
    let seed = 123;
    function random() {
      let x = Math.sin(seed++) * 10000;
      return x - Math.floor(x) - 0.5; // range -0.5 to 0.5
    }

    let x_prev = 0;
    // Run 1000 learning steps with random inputs to ensure full convergence
    for (let step = 0; step < 1000; step++) {
      const x = random();
      // Desired relation: d = 0.8 * x + 0.4 * x_prev
      const d = 0.8 * x + 0.4 * x_prev;
      
      const res = lmsBlock.execute([x, d, 0.1], lmsBlock.params, state, step * 0.01);
      state = res.nextState;
      x_prev = x;
    }
    
    // Weights should converge very close to 0.8 and 0.4
    expect(state.w1).toBeCloseTo(0.8, 3);
    expect(state.w2).toBeCloseTo(0.4, 3);
  });

  it('TC-LEARN-02: Neural Neuron Online Gradient Descent Learner', () => {
    // Instantiate Neural Neuron block
    const neuronBlock = BLOCK_LIBRARY['NEURAL_NEURON_LEARNING']('neuron_test', {
      lr: 0.15,
      initW1: 0.2,
      initW2: -0.2,
      initBias: 0.0
    });
    
    let state = neuronBlock.state;
    let finalError = 1.0;
    
    // Teach the neuron to learn a simple tanh function: target = tanh(0.7 * x1 + 0.3 * x2 + 0.1)
    for (let step = 0; step < 200; step++) {
      const x1 = Math.sin(step * 0.5);
      const x2 = Math.cos(step * 0.5);
      const target = Math.tanh(0.7 * x1 + 0.3 * x2 + 0.1);
      
      const res = neuronBlock.execute([x1, x2, target, 0.15], neuronBlock.params, state, step * 0.01);
      state = res.nextState;
      finalError = res.outputs[1] as number; // err = target - y
    }
    
    // Verify weights shifted in the correct direction (converging toward target coefficients)
    expect(state.w1).toBeCloseTo(0.7, 1);
    expect(state.w2).toBeCloseTo(0.3, 1);
    expect(state.bias).toBeCloseTo(0.1, 1);
    // Final error magnitude should be small
    expect(Math.abs(finalError)).toBeLessThan(0.02);
  });

  it('TC-LEARN-03: RL Q-Learning Agent Decision Making & Updates', () => {
    // Instantiate RL Q-Learning block
    const rlBlock = BLOCK_LIBRARY['RL_Q_LEARNING_CONTROLLER']('rl_test', {
      alpha: 0.2,
      gamma: 0.8,
      epsilon: 0.0 // greedy for testing deterministic updates
    });
    
    let state = rlBlock.state;
    
    // Scenario: The agent starts with all Q-values as 0.
    // 1. Initial step at error = 1.5 (state bin 4). It will pick action 0 (since all are 0)
    let res = rlBlock.execute([1.5, 0.0, false], rlBlock.params, state, 0);
    state = res.nextState;
    expect(res.outputs[0]).toBe(-1.0); // first action selected (index 0)
    
    // 2. Next step, we are at error = 0.0 (state bin 2), reward is +10.
    // The previous state-action pair (state bin 4, action index 0) should receive update.
    res = rlBlock.execute([0.0, 10.0, false], rlBlock.params, state, 0);
    state = res.nextState;
    
    // Q[4][0] should be updated: 0 + 0.2 * (10 + 0.8 * 0 - 0) = 2.0
    expect(state.qTable[4][0]).toBeCloseTo(2.0, 5);
    
    // 3. Test Reset
    res = rlBlock.execute([0.0, 0.0, true], rlBlock.params, state, 0);
    state = res.nextState;
    expect(state.qTable[4][0]).toBe(0);
    expect(state.hasPrev).toBe(1); // after executing the reset step, it now has a current state (to be used in next step)
  });

  it('TC-SOLVER-01: Object-Based Continuous Integration via INTEGRATOR_CONTINUOUS', () => {
    const model = {
      blocks: [
        BLOCK_LIBRARY['Constant']('const1', { value: 5.0 }),
        BLOCK_LIBRARY['INTEGRATOR_CONTINUOUS']('integ1', { initial_condition: 2.0 })
      ],
      connections: [
        { sourceBlock: 'const1', sourcePort: 'out', targetBlock: 'integ1', targetPort: 'u' }
      ]
    };

    const engine = new XbridgesEngine(model);
    engine.compile();

    // The state of INTEGRATOR_CONTINUOUS is { y: 2.0 }.
    const block = engine['blockMap'].get('integ1')!;
    expect(block.state.y).toBe(2.0);

    // Let's run 1 step using RK4 solver
    // dy/dt = u = 5.0. 
    // y(next) = y(0) + u * dt = 2.0 + 5.0 * 0.1 = 2.5
    Solvers.stepRK4(engine, 0, 0.1);

    expect(block.state.y).toBeCloseTo(2.5, 5);
  });

});
