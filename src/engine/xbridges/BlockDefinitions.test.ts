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

  it('TC-MATH-01: Max Block Element-Wise and Array Broadcasting', () => {
    const maxBlock = BLOCK_LIBRARY['Max']('max_test', {});
    
    // Single array input -> returns scalar max of elements
    const res1 = maxBlock.execute([[1, 5, 2]], maxBlock.params, null, 0);
    expect(res1.outputs[0]).toBe(5);

    // Multiple array inputs -> returns element-wise max
    const res2 = maxBlock.execute([[1, 5, 2], [3, 2, 4]], maxBlock.params, null, 0);
    expect(res2.outputs[0]).toEqual([3, 5, 4]);

    // Mixed array and scalar inputs -> broadcasts scalar
    const res3 = maxBlock.execute([[1, 5, 2], 3], maxBlock.params, null, 0);
    expect(res3.outputs[0]).toEqual([3, 5, 3]);
  });

  it('TC-MOD-01: THREE_PHASE_PWM with Saddle/Third-Harmonic Injection', () => {
    const pwmBlock = BLOCK_LIBRARY['THREE_PHASE_PWM']('pwm_test', { frequency: 5000, method: 'Saddle' });
    
    // With refs = [0.8, 0.4, -0.2], Saddle offset is (0.8 + (-0.2))/2 = 0.3.
    // Shifted refs = [0.8 - 0.3, 0.4 - 0.3, -0.2 - 0.3] = [0.5, 0.1, -0.5].
    // Normalized refs (mapped from -1..1 to 0..1) = [(0.5+1)/2, (0.1+1)/2, (-0.5+1)/2] = [0.75, 0.55, 0.25].
    // At tRel = 0.5 (mid-carrier), Ga and Gb should be 1 (ref > tRel), Gc should be 0.
    const refs = [0.8, 0.4, -0.2];
    const time = 0.0001; // tRel = (0.0001 % 0.0002) / 0.0002 = 0.5
    const res = pwmBlock.execute(refs, pwmBlock.params, null, time);
    
    expect(res.outputs).toEqual([1, 1, 0]);
  });

  it('TC-MOTOR-01: SENSORLESS_SIX_STEP Commutation Transitions', () => {
    const block = BLOCK_LIBRARY['SENSORLESS_SIX_STEP']('sensorless_test', {});
    let state = block.state;
    
    // Initial state step = 1 (looks at Phase C for falling Back-EMF).
    // Floating voltage = vc - vNeut.
    // Set Phase A = 12, Phase B = -12, Phase C = 2 (float voltage = 2 - 0.67 = 1.33 > 0, sign is 1)
    let res = block.execute([12, -12, 2, 24], block.params, state, 0.0);
    state = res.nextState;
    expect(res.outputs.slice(0, 3)).toEqual([1, -1, 0]); // Step 1 gates
    
    // Now trigger zero crossing: Phase C floats below neutral
    // Phase A = 12, Phase B = -12, Phase C = -2 (float voltage = -2 - 2.67 = -4.67 < 0, sign is -1)
    res = block.execute([12, -12, -2, 24], block.params, state, 0.005);
    state = res.nextState;
    
    // Zero crossing detected! Next step should be 2.
    expect(state.commutationStep).toBe(2);
    // Gates for Step 2: A+, C- (ga=1, gb=0, gc=-1)
    expect(res.outputs.slice(0, 3)).toEqual([1, 0, -1]);
    expect(state.estimatedSpeed).toBeGreaterThan(0);
  });

  it('TC-MOTOR-02: MTPA_FW_MANAGER Torque Tracking & Field Weakening', () => {
    const block = BLOCK_LIBRARY['MTPA_FW_MANAGER']('mtpa_fw_test', {
      Ld: 0.005, Lq: 0.012, psi_m: 0.12, i_max: 20, v_max: 300
    });
    
    // 1. Normal speed (MTPA region)
    // Low speed, no field weakening should trigger.
    const resNormal = block.execute([5.0, 50, 400], block.params, null, 0);
    expect(resNormal.outputs[2]).toBe(0); // FW inactive
    expect(resNormal.outputs[0] as number).toBeLessThan(0); // Id negative for salient MTPA
    expect(resNormal.outputs[1] as number).toBeGreaterThan(0); // Iq positive for positive torque
    
    // 2. High speed (Field Weakening active)
    // High speed, low DC link voltage (forces field weakening).
    const resFW = block.execute([5.0, 400, 100], block.params, null, 0);
    expect(resFW.outputs[2]).toBe(1); // FW active
    // Id in FW region should be much more negative than in MTPA region to suppress voltage
    expect(resFW.outputs[0] as number).toBeLessThan(resNormal.outputs[0] as number);
  });

  it('TC-MOTOR-03: ROTOR_POSITION_ESTIMATOR Back-EMF Observer Convergence', () => {
    const block = BLOCK_LIBRARY['ROTOR_POSITION_ESTIMATOR']('est_test', {
      method: 'Sensorless_SMO', Rs: 0.5, Ls: 0.01, P: 2
    });
    let state = block.state;
    
    // Feed voltages and currents corresponding to steady rotation.
    // eAlpha = vAlpha - Rs * iAlpha - Ls * diAlpha
    // For theta = PI/4:
    // eAlpha = -omega_e * psi_m * sin(theta)
    // eBeta  =  omega_e * psi_m * cos(theta)
    // If we establish current derivatives, the observer will extract back-EMF.
    // Let's run a few steps to let it compute finite-difference derivative.
    const dt = 0.001;
    let time = 0.0;
    
    for (let i = 0; i < 5; i++) {
      time += dt;
      // Synthesize voltages and currents for omega_e = 100 rad/s
      // ia = 10 * cos(100*t), ib = 10 * cos(100*t - 2pi/3)
      const wt = 100 * time;
      const ia = 10 * Math.cos(wt);
      const ib = 10 * Math.cos(wt - 2 * Math.PI / 3);
      const ic = -ia - ib;
      
      // va = 100 * sin(wt), vb = 100 * sin(wt - 2pi/3)
      const va = 100 * Math.sin(wt);
      const vb = 100 * Math.sin(wt - 2 * Math.PI / 3);
      const vc = -va - vb;
      
      const res = block.execute([ia, ib, ic, va, vb, vc], block.params, state, time);
      state = res.nextState;
    }
    
    // The estimated theta should be non-zero and speed should be estimated.
    expect(state.theta).not.toBe(0);
    expect(state.speed).not.toBe(0);
  });

});

