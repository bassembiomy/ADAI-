import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY, potential_field_escape, astar_planner, getTwinGridCoords } from './BlockDefinitions';
import { XbridgesEngine } from './XbridgesEngine';
import { Solvers } from './Solvers';
import { VectorUtils } from './VectorUtils';

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

  it('TC-MOD-02: PWM_GENERATOR with input execution and different carrier types', () => {
    const blockDefault = BLOCK_LIBRARY['PWM_GENERATOR']('pwm_default', {});
    expect(blockDefault.params.frequency).toBe(50);
    expect(blockDefault.inputs[0].value).toBe(0.5);

    const blockSawtooth = BLOCK_LIBRARY['PWM_GENERATOR']('pwm_sawtooth', { frequency: 5000, carrierType: 'sawtooth' });

    // At t = 0.00014 (70% of period), carrier is 0.7. duty=0.8 > carrier=0.7 => Output should be 1.
    const res1 = blockSawtooth.execute([0.8], blockSawtooth.params, null, 0.00014);
    expect(res1.outputs[0]).toBe(1);

    // At t = 0.00018 (90% of period), carrier is 0.9. duty=0.8 < carrier=0.9 => Output should be 0.
    const res2 = blockSawtooth.execute([0.8], blockSawtooth.params, null, 0.00018);
    expect(res2.outputs[0]).toBe(0);
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

  it('TC-ROBOT-01: Robot Vacuum Digital Twin Kinetics and SLAM', () => {
    const block = BLOCK_LIBRARY['ROBOT_VACUUM_DIGITAL_TWIN']('robot_test', {
      wheel_radius: 0.033,
      wheel_separation: 0.16,
      lidar_max_range: 4.0
    });

    let state = block.state;
    expect(state.x).toBe(-5.1);
    expect(state.y).toBe(-5.1);
    expect(state.bt_state).toBe('INIT');

    let res = block.execute([1.5, 1.5, 4], block.params, state, 0.02);
    state = res.nextState;

    expect(res.outputs.length).toBe(12);
    expect(Array.isArray(res.outputs[0])).toBe(true);
    expect(state.lidarRanges.length).toBe(45);
    
    let mappedCount = 0;
    for (let r = 0; r < 30; r++) {
      for (let c = 0; c < 30; c++) {
        if (state.grid[r][c] !== 0) mappedCount++;
      }
    }
    expect(mappedCount).toBeGreaterThan(0);

    const derivs = block.evaluateDerivatives!([1.5, 1.5, 4], block.params, state, 0.02);
    expect(typeof derivs).toBe('object');
    expect(typeof derivs.x).toBe('number');
  });

  it('TC-ROBOT-02: Modular Robot Vacuum Feedback Loop Compilation and Step', () => {
    const model = {
      blocks: [
        BLOCK_LIBRARY['Constant']('target_x', { value: 1.5 }),
        BLOCK_LIBRARY['Constant']('target_y', { value: 1.5 }),
        BLOCK_LIBRARY['Constant']('mode_select', { value: 4 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_NAV']('robot_nav', {}),
        BLOCK_LIBRARY['ROBOT_VACUUM_KINEMATICS']('robot_kinematics', { wheel_radius: 0.033, wheel_separation: 0.16 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_WHEEL_CONTROL']('robot_pid', { Kp_wheel: 12.0, Ki_wheel: 45.0, V_bat: 12.0 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_MOTOR']('motor_left', { motor_R: 2.5, motor_L: 0.005, motor_K: 0.04, inertia: 0.0075, encoder_cpr: 360 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_MOTOR']('motor_right', { motor_R: 2.5, motor_L: 0.005, motor_K: 0.04, inertia: 0.0075, encoder_cpr: 360 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_DYNAMICS']('robot_dynamics', { wheel_radius: 0.033, wheel_separation: 0.16 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_ENVIRONMENT']('robot_env', { lidar_max_range: 4.0, lidar_noise_std: 0.02 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_ODOMETRY']('robot_odom', { wheel_radius: 0.033, wheel_separation: 0.16, encoder_cpr: 360 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_FUSION']('robot_fusion', { filter_gain: 0.06 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_SLAM']('robot_slam', { lidar_max_range: 4.0 }),
        BLOCK_LIBRARY['Scope']('scope_pose', { numSignals: 3, bufferSize: 1000 })
      ],
      connections: [
        { sourceBlock: 'target_x', sourcePort: 'out', targetBlock: 'robot_nav', targetPort: 'target_x_in' },
        { sourceBlock: 'target_y', sourcePort: 'out', targetBlock: 'robot_nav', targetPort: 'target_y_in' },
        { sourceBlock: 'mode_select', sourcePort: 'out', targetBlock: 'robot_nav', targetPort: 'mode_select' },

        { sourceBlock: 'robot_nav', sourcePort: 'v_ref', targetBlock: 'robot_kinematics', targetPort: 'v_ref' },
        { sourceBlock: 'robot_nav', sourcePort: 'w_ref', targetBlock: 'robot_kinematics', targetPort: 'w_ref' },

        { sourceBlock: 'robot_kinematics', sourcePort: 'omegaL_ref', targetBlock: 'robot_pid', targetPort: 'omegaL_ref' },
        { sourceBlock: 'robot_kinematics', sourcePort: 'omegaR_ref', targetBlock: 'robot_pid', targetPort: 'omegaR_ref' },
        { sourceBlock: 'motor_left', sourcePort: 'omega', targetBlock: 'robot_pid', targetPort: 'omega_L' },
        { sourceBlock: 'motor_right', sourcePort: 'omega', targetBlock: 'robot_pid', targetPort: 'omega_R' },

        { sourceBlock: 'robot_pid', sourcePort: 'V_L', targetBlock: 'motor_left', targetPort: 'pwm_duty' },
        { sourceBlock: 'robot_pid', sourcePort: 'V_R', targetBlock: 'motor_right', targetPort: 'pwm_duty' },

        { sourceBlock: 'motor_left', sourcePort: 'omega', targetBlock: 'robot_dynamics', targetPort: 'omega_L' },
        { sourceBlock: 'motor_right', sourcePort: 'omega', targetBlock: 'robot_dynamics', targetPort: 'omega_R' },

        { sourceBlock: 'motor_left', sourcePort: 'encoder', targetBlock: 'robot_odom', targetPort: 'enc_L' },
        { sourceBlock: 'motor_right', sourcePort: 'encoder', targetBlock: 'robot_odom', targetPort: 'enc_R' },

        { sourceBlock: 'robot_odom', sourcePort: 'x_odom', targetBlock: 'robot_fusion', targetPort: 'x_odom' },
        { sourceBlock: 'robot_odom', sourcePort: 'y_odom', targetBlock: 'robot_fusion', targetPort: 'y_odom' },
        { sourceBlock: 'robot_odom', sourcePort: 'theta_odom', targetBlock: 'robot_fusion', targetPort: 'theta_odom' },
        { sourceBlock: 'robot_dynamics', sourcePort: 'x', targetBlock: 'robot_fusion', targetPort: 'x_true' },
        { sourceBlock: 'robot_dynamics', sourcePort: 'y', targetBlock: 'robot_fusion', targetPort: 'y_true' },
        { sourceBlock: 'robot_dynamics', sourcePort: 'theta', targetBlock: 'robot_fusion', targetPort: 'theta_true' },

        { sourceBlock: 'robot_fusion', sourcePort: 'x_est', targetBlock: 'robot_slam', targetPort: 'x_est' },
        { sourceBlock: 'robot_fusion', sourcePort: 'y_est', targetBlock: 'robot_slam', targetPort: 'y_est' },
        { sourceBlock: 'robot_fusion', sourcePort: 'theta_est', targetBlock: 'robot_slam', targetPort: 'theta_est' },
        { sourceBlock: 'robot_env', sourcePort: 'lidar_ranges', targetBlock: 'robot_slam', targetPort: 'lidar_ranges' },

        { sourceBlock: 'robot_fusion', sourcePort: 'x_est', targetBlock: 'robot_nav', targetPort: 'x_est' },
        { sourceBlock: 'robot_fusion', sourcePort: 'y_est', targetBlock: 'robot_nav', targetPort: 'y_est' },
        { sourceBlock: 'robot_fusion', sourcePort: 'theta_est', targetBlock: 'robot_nav', targetPort: 'theta_est' },
        { sourceBlock: 'robot_env', sourcePort: 'lidar_ranges', targetBlock: 'robot_nav', targetPort: 'lidar_ranges' },

        { sourceBlock: 'robot_dynamics', sourcePort: 'x', targetBlock: 'robot_env', targetPort: 'x' },
        { sourceBlock: 'robot_dynamics', sourcePort: 'y', targetBlock: 'robot_env', targetPort: 'y' },
        { sourceBlock: 'robot_dynamics', sourcePort: 'theta', targetBlock: 'robot_env', targetPort: 'theta' },
        { sourceBlock: 'robot_fusion', sourcePort: 'x_est', targetBlock: 'robot_env', targetPort: 'x_est' },
        { sourceBlock: 'robot_fusion', sourcePort: 'y_est', targetBlock: 'robot_env', targetPort: 'y_est' },
        { sourceBlock: 'robot_fusion', sourcePort: 'theta_est', targetBlock: 'robot_env', targetPort: 'theta_est' },
        { sourceBlock: 'robot_nav', sourcePort: 'target_x_active', targetBlock: 'robot_env', targetPort: 'target_x_in' },
        { sourceBlock: 'robot_nav', sourcePort: 'target_y_active', targetBlock: 'robot_env', targetPort: 'target_y_in' },
        { sourceBlock: 'robot_nav', sourcePort: 'nav_state', targetBlock: 'robot_env', targetPort: 'nav_state' },
        { sourceBlock: 'robot_slam', sourcePort: 'grid', targetBlock: 'robot_env', targetPort: 'grid' },

        { sourceBlock: 'robot_fusion', sourcePort: 'x_est', targetBlock: 'scope_pose', targetPort: 'in1' },
        { sourceBlock: 'robot_fusion', sourcePort: 'y_est', targetBlock: 'scope_pose', targetPort: 'in2' },
        { sourceBlock: 'robot_fusion', sourcePort: 'theta_est', targetBlock: 'scope_pose', targetPort: 'in3' }
      ]
    };

    const engine = new XbridgesEngine(model);
    const diags = engine.compile();
    expect(diags.filter(d => d.severity === 'error').length).toBe(0);

    const dynamicsBlock = engine.getBlock('robot_dynamics')!;
    const slamBlock = engine.getBlock('robot_slam')!;
    const motorLBlock = engine.getBlock('motor_left')!;

    expect(dynamicsBlock.state.x).toBe(0);
    expect(motorLBlock.state.omega).toBe(0);

    // Run 5 RK4 simulation steps
    let time = 0;
    const dt = 0.02;
    for (let i = 0; i < 5; i++) {
      Solvers.stepRK4(engine, time, dt);
      time += dt;
    }

    // After stepping, SLAM mapping grid should have updated cells
    let mappedCount = 0;
    const grid = slamBlock.state.grid;
    for (let r = 0; r < 30; r++) {
      for (let c = 0; c < 30; c++) {
        if (grid[r][c] !== 0) mappedCount++;
      }
    }
    expect(mappedCount).toBeGreaterThan(0);

    // Motor currents/speeds should have non-zero states due to control voltage integration
    expect(motorLBlock.state.omega).not.toBe(0);
    expect(motorLBlock.state.current).not.toBe(0);
  });

  it('TC-ROBOT-03: Decoupled Robot Vacuum Loop Compilation and Step', () => {
    const model = {
      blocks: [
        BLOCK_LIBRARY['Constant']('mode_select', { value: 4 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_MAPPING']('robot_map', {}),
        BLOCK_LIBRARY['ROBOT_VACUUM_COVERAGE']('robot_coverage', {}),
        BLOCK_LIBRARY['ROBOT_VACUUM_GLOBAL_PLANNER']('robot_global_planner', {}),
        BLOCK_LIBRARY['ROBOT_VACUUM_OBSTACLE_AVOIDANCE']('robot_obstacle_avoid', {}),
        BLOCK_LIBRARY['ROBOT_VACUUM_MOTION_CONTROLLER']('robot_motion_control', {}),
        BLOCK_LIBRARY['ROBOT_VACUUM_MOTOR_COMMAND']('robot_motor_command', {}),
        BLOCK_LIBRARY['ROBOT_VACUUM_MOTOR']('motor_left', { motor_R: 2.5, motor_L: 0.005, motor_K: 0.04, inertia: 0.0075, encoder_cpr: 360 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_MOTOR']('motor_right', { motor_R: 2.5, motor_L: 0.005, motor_K: 0.04, inertia: 0.0075, encoder_cpr: 360 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_BATTERY']('robot_battery', { nominal_voltage: 12.0, capacity_Ah: 2.6 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_DYNAMICS']('robot_dynamics', { wheel_radius: 0.033, wheel_separation: 0.16 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_ENCODER']('robot_encoder', {}),
        BLOCK_LIBRARY['ROBOT_VACUUM_ODOMETRY']('robot_odom', { wheel_radius: 0.033, wheel_separation: 0.16, encoder_cpr: 360 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_LIDAR']('robot_lidar', {}),
        BLOCK_LIBRARY['ROBOT_VACUUM_LOCALIZATION']('robot_localization', { filter_gain: 0.06 }),
        BLOCK_LIBRARY['ROBOT_VACUUM_VISUALIZATION']('robot_visualizer', {}),
        BLOCK_LIBRARY['Scope']('scope_pose', { numSignals: 3, bufferSize: 1000 })
      ],
      connections: [
        { sourceBlock: 'robot_dynamics', sourcePort: 'x', targetBlock: 'robot_visualizer', targetPort: 'x' },
        { sourceBlock: 'robot_dynamics', sourcePort: 'y', targetBlock: 'robot_visualizer', targetPort: 'y' },
        { sourceBlock: 'robot_dynamics', sourcePort: 'theta', targetBlock: 'robot_visualizer', targetPort: 'theta' },
        { sourceBlock: 'robot_dynamics', sourcePort: 'x', targetBlock: 'robot_lidar', targetPort: 'x' },
        { sourceBlock: 'robot_dynamics', sourcePort: 'y', targetBlock: 'robot_lidar', targetPort: 'y' },
        { sourceBlock: 'robot_dynamics', sourcePort: 'theta', targetBlock: 'robot_lidar', targetPort: 'theta' },
        { sourceBlock: 'robot_dynamics', sourcePort: 'x', targetBlock: 'robot_localization', targetPort: 'x_true' },
        { sourceBlock: 'robot_dynamics', sourcePort: 'y', targetBlock: 'robot_localization', targetPort: 'y_true' },
        { sourceBlock: 'robot_dynamics', sourcePort: 'theta', targetBlock: 'robot_localization', targetPort: 'theta_true' },
        { sourceBlock: 'robot_lidar', sourcePort: 'ranges', targetBlock: 'robot_map', targetPort: 'lidar_ranges' },
        { sourceBlock: 'robot_lidar', sourcePort: 'ranges', targetBlock: 'robot_obstacle_avoid', targetPort: 'lidar_ranges' },
        { sourceBlock: 'robot_lidar', sourcePort: 'ranges', targetBlock: 'robot_localization', targetPort: 'lidar_ranges' },
        { sourceBlock: 'robot_lidar', sourcePort: 'ranges', targetBlock: 'robot_visualizer', targetPort: 'lidar_ranges' },
        { sourceBlock: 'motor_left', sourcePort: 'omega', targetBlock: 'robot_dynamics', targetPort: 'omega_L' },
        { sourceBlock: 'motor_right', sourcePort: 'omega', targetBlock: 'robot_dynamics', targetPort: 'omega_R' },
        { sourceBlock: 'motor_left', sourcePort: 'omega', targetBlock: 'robot_encoder', targetPort: 'omega_L' },
        { sourceBlock: 'motor_right', sourcePort: 'omega', targetBlock: 'robot_encoder', targetPort: 'omega_R' },
        { sourceBlock: 'motor_left', sourcePort: 'omega', targetBlock: 'robot_motor_command', targetPort: 'omega_L' },
        { sourceBlock: 'motor_right', sourcePort: 'omega', targetBlock: 'robot_motor_command', targetPort: 'omega_R' },
        { sourceBlock: 'motor_left', sourcePort: 'current', targetBlock: 'robot_battery', targetPort: 'I_L' },
        { sourceBlock: 'motor_right', sourcePort: 'current', targetBlock: 'robot_battery', targetPort: 'I_R' },
        { sourceBlock: 'robot_battery', sourcePort: 'battery_voltage', targetBlock: 'motor_left', targetPort: 'v_bat' },
        { sourceBlock: 'robot_battery', sourcePort: 'battery_voltage', targetBlock: 'motor_right', targetPort: 'v_bat' },
        { sourceBlock: 'robot_battery', sourcePort: 'battery_level', targetBlock: 'robot_visualizer', targetPort: 'battery_level' },
        { sourceBlock: 'robot_encoder', sourcePort: 'enc_L', targetBlock: 'robot_odom', targetPort: 'enc_L' },
        { sourceBlock: 'robot_encoder', sourcePort: 'enc_R', targetBlock: 'robot_odom', targetPort: 'enc_R' },
        { sourceBlock: 'robot_odom', sourcePort: 'x_odom', targetBlock: 'robot_localization', targetPort: 'x_odom' },
        { sourceBlock: 'robot_odom', sourcePort: 'y_odom', targetBlock: 'robot_localization', targetPort: 'y_odom' },
        { sourceBlock: 'robot_odom', sourcePort: 'theta_odom', targetBlock: 'robot_localization', targetPort: 'theta_odom' },
        { sourceBlock: 'robot_localization', sourcePort: 'x_est', targetBlock: 'robot_map', targetPort: 'x_est' },
        { sourceBlock: 'robot_localization', sourcePort: 'y_est', targetBlock: 'robot_map', targetPort: 'y_est' },
        { sourceBlock: 'robot_localization', sourcePort: 'theta_est', targetBlock: 'robot_map', targetPort: 'theta_est' },
        { sourceBlock: 'robot_localization', sourcePort: 'x_est', targetBlock: 'robot_coverage', targetPort: 'x_est' },
        { sourceBlock: 'robot_localization', sourcePort: 'y_est', targetBlock: 'robot_coverage', targetPort: 'y_est' },
        { sourceBlock: 'robot_localization', sourcePort: 'x_est', targetBlock: 'robot_global_planner', targetPort: 'x_est' },
        { sourceBlock: 'robot_localization', sourcePort: 'y_est', targetBlock: 'robot_global_planner', targetPort: 'y_est' },
        { sourceBlock: 'robot_localization', sourcePort: 'x_est', targetBlock: 'robot_motion_control', targetPort: 'x_est' },
        { sourceBlock: 'robot_localization', sourcePort: 'y_est', targetBlock: 'robot_motion_control', targetPort: 'y_est' },
        { sourceBlock: 'robot_localization', sourcePort: 'theta_est', targetBlock: 'robot_motion_control', targetPort: 'theta_est' },
        { sourceBlock: 'robot_localization', sourcePort: 'x_est', targetBlock: 'robot_visualizer', targetPort: 'x_est' },
        { sourceBlock: 'robot_localization', sourcePort: 'y_est', targetBlock: 'robot_visualizer', targetPort: 'y_est' },
        { sourceBlock: 'robot_localization', sourcePort: 'theta_est', targetBlock: 'robot_visualizer', targetPort: 'theta_est' },
        { sourceBlock: 'robot_localization', sourcePort: 'confidence', targetBlock: 'robot_visualizer', targetPort: 'confidence' },
        { sourceBlock: 'robot_localization', sourcePort: 'x_est', targetBlock: 'scope_pose', targetPort: 'in1' },
        { sourceBlock: 'robot_localization', sourcePort: 'y_est', targetBlock: 'scope_pose', targetPort: 'in2' },
        { sourceBlock: 'robot_localization', sourcePort: 'theta_est', targetBlock: 'scope_pose', targetPort: 'in3' },
        { sourceBlock: 'robot_map', sourcePort: 'grid', targetBlock: 'robot_coverage', targetPort: 'grid' },
        { sourceBlock: 'robot_map', sourcePort: 'grid', targetBlock: 'robot_global_planner', targetPort: 'grid' },
        { sourceBlock: 'robot_map', sourcePort: 'grid', targetBlock: 'robot_visualizer', targetPort: 'grid' },
        { sourceBlock: 'robot_coverage', sourcePort: 'goal_x', targetBlock: 'robot_global_planner', targetPort: 'goal_x' },
        { sourceBlock: 'robot_coverage', sourcePort: 'goal_y', targetBlock: 'robot_global_planner', targetPort: 'goal_y' },
        { sourceBlock: 'robot_coverage', sourcePort: 'coverage_status', targetBlock: 'robot_visualizer', targetPort: 'nav_stats' },
        { sourceBlock: 'robot_global_planner', sourcePort: 'target_x', targetBlock: 'robot_obstacle_avoid', targetPort: 'target_x' },
        { sourceBlock: 'robot_global_planner', sourcePort: 'target_y', targetBlock: 'robot_obstacle_avoid', targetPort: 'target_y' },
        { sourceBlock: 'robot_obstacle_avoid', sourcePort: 'safe_x', targetBlock: 'robot_motion_control', targetPort: 'target_x' },
        { sourceBlock: 'robot_obstacle_avoid', sourcePort: 'safe_y', targetBlock: 'robot_motion_control', targetPort: 'target_y' },
        { sourceBlock: 'robot_obstacle_avoid', sourcePort: 'velocity_constraints', targetBlock: 'robot_motion_control', targetPort: 'velocity_constraints' },
        { sourceBlock: 'robot_obstacle_avoid', sourcePort: 'safe_x', targetBlock: 'robot_visualizer', targetPort: 'target_x' },
        { sourceBlock: 'robot_obstacle_avoid', sourcePort: 'safe_y', targetBlock: 'robot_visualizer', targetPort: 'target_y' },
        { sourceBlock: 'robot_obstacle_avoid', sourcePort: 'nav_state', targetBlock: 'robot_visualizer', targetPort: 'nav_state' },
        { sourceBlock: 'robot_motion_control', sourcePort: 'v_cmd', targetBlock: 'robot_motor_command', targetPort: 'v_cmd' },
        { sourceBlock: 'robot_motion_control', sourcePort: 'w_cmd', targetBlock: 'robot_motor_command', targetPort: 'w_cmd' },
        { sourceBlock: 'robot_motor_command', sourcePort: 'V_cmd_L', targetBlock: 'motor_left', targetPort: 'pwm_duty' },
        { sourceBlock: 'robot_motor_command', sourcePort: 'V_cmd_R', targetBlock: 'motor_right', targetPort: 'pwm_duty' }
      ]
    };

    const engine = new XbridgesEngine(model);
    const diags = engine.compile();

    expect(diags.filter(d => d.severity === 'error').length).toBe(0);

    const dynamicsBlock = engine.getBlock('robot_dynamics')!;
    const mapBlock = engine.getBlock('robot_map')!;
    const motorLBlock = engine.getBlock('motor_left')!;

    expect(dynamicsBlock.state.x).toBe(0);
    expect(motorLBlock.state.omega).toBe(0);

    let time = 0;
    const dt = 0.02;
    for (let i = 0; i < 5; i++) {
      Solvers.stepRK4(engine, time, dt);
      time += dt;
    }

    expect(motorLBlock.state.omega).not.toBe(0);
    expect(motorLBlock.state.current).not.toBe(0);

    let mappedCount = 0;
    const grid = mapBlock.state.grid;
    for (let r = 0; r < 30; r++) {
      for (let c = 0; c < 30; c++) {
        if (grid[r][c] !== 0) mappedCount++;
      }
    }
    expect(mappedCount).toBeGreaterThan(0);
  });

  it('TC-SOURCES-04: Step Block Simulation Behavior (Simulink-like)', () => {
    // 1. Default Step block: stepTime = 1, initialValue = 0, finalValue = 1
    const stepDefault = BLOCK_LIBRARY['Step']('step_default', {});
    
    // Test t < stepTime
    const outBefore1 = stepDefault.execute([], stepDefault.params, null, 0.5);
    expect(outBefore1.outputs[0]).toBe(0);

    // Test t >= stepTime
    const outAfter1 = stepDefault.execute([], stepDefault.params, null, 1.0);
    expect(outAfter1.outputs[0]).toBe(1);
    const outAfter2 = stepDefault.execute([], stepDefault.params, null, 2.5);
    expect(outAfter2.outputs[0]).toBe(1);

    // 2. Custom Step block: stepTime = 3.5, initialValue = -2.5, finalValue = 15.0
    const stepCustom = BLOCK_LIBRARY['Step']('step_custom', {
      stepTime: 3.5,
      initialValue: -2.5,
      finalValue: 15.0
    });
    
    expect(stepCustom.execute([], stepCustom.params, null, 0).outputs[0]).toBe(-2.5);
    expect(stepCustom.execute([], stepCustom.params, null, 3.49).outputs[0]).toBe(-2.5);
    expect(stepCustom.execute([], stepCustom.params, null, 3.5).outputs[0]).toBe(15.0);
    expect(stepCustom.execute([], stepCustom.params, null, 5.0).outputs[0]).toBe(15.0);

    // 3. Vector Step block (supporting multi-channel steps)
    const stepVector = BLOCK_LIBRARY['Step']('step_vector', {
      stepTime: 0.5,
      initialValue: '[0, 1]',
      finalValue: '[10, 20]'
    });

    expect(stepVector.execute([], stepVector.params, null, 0.4).outputs[0]).toEqual([0, 1]);
    expect(stepVector.execute([], stepVector.params, null, 0.5).outputs[0]).toEqual([10, 20]);
  });

  it('TC-ROBOT-05: Theta* Path Planner block and shortcutting', () => {
    const block = BLOCK_LIBRARY['ROBOT_VACUUM_THETA_STAR']('theta_star_test', {
      inflation: 0.3
    });
    const grid = Array.from({ length: 30 }, () => Array(30).fill(0));
    // Place a wall in the middle
    for (let r = 10; r < 20; r++) {
      grid[r][15] = 100;
    }

    const start = [0.0, 0.0];
    const goal = [2.0, 2.0];
    let state = block.state;
    const res = block.execute([grid, start, goal], block.params, state, 0.0);
    expect((res.outputs[0] as any).length).toBeGreaterThan(0); // Should find a path
    expect(res.outputs[2]).toBe(0); // Failed output should be 0 (false)
  });

  it('TC-ROBOT-06: Potential Field Escape (APF) and Collision Avoidance', () => {
    // 1. Test potential_field_escape directly
    const escapeDir = -1; // repelling to the right (negative angular velocity direction)
    const target_w = potential_field_escape(0, 0, 0, 1, 0, escapeDir);
    expect(target_w).toBeDefined();
    expect(typeof target_w).toBe('number');

    // 2. Test ROBOT_VACUUM_COLLISION_AVOID fallback when blocked
    const block = BLOCK_LIBRARY['ROBOT_VACUUM_COLLISION_AVOID']('col_avoid_test', {
      collision_dist: 0.4
    });
    
    // Simulate obstacle right in front (within 0.6m)
    const ranges = Array(45).fill(4.0);
    ranges[22] = 0.2; // Very close front obstacle

    const ins = [
      0.8, // current (not used)
      [1.0, 0.0], // waypoints (trying to go straight ahead)
      ranges, // LiDAR ranges
      0.0, // x_est
      0.0, // y_est
      0.0 // theta_est
    ];

    const res = block.execute(ins, block.params, null, 0.0);
    const [v, w] = res.outputs[0] as number[];
    expect(v).toBe(0.0); // Fallback velocity when blocked should be 0.0
    expect(w).not.toBe(0.0); // Should try to rotate
  });

  it('TC-ROBOT-07: Pure Pursuit Path Tracking', () => {
    const block = BLOCK_LIBRARY['ROBOT_VACUUM_MOTION_CONTROLLER']('pure_pursuit_test', {});
    const constraints = [0.22, 1.6]; // max_v, max_w

    // Simulate robot at 0,0 heading 0, target at 1.0, 1.0 (requires turning left and driving forward)
    const ins = [
      0.0, // x_est
      0.0, // y_est
      0.0, // theta_est
      1.0, // target_x
      1.0, // target_y
      constraints
    ];

    const res = block.execute(ins, block.params, null, 0.0);
    const [v_cmd, w_cmd] = res.outputs as number[];
    expect(v_cmd).toBeGreaterThan(0.0); // Should move forward
    expect(w_cmd).toBeGreaterThan(0.0); // Should steer left towards target
  });

  it('TC-ROBOT-08: SLAM EKF Localization and Mapping', () => {
    const block = BLOCK_LIBRARY['ROBOT_VACUUM_SLAM']('slam_test', {
      lidar_max_range: 4.0
    });
    
    let state = block.state;
    expect(state.grid.length).toBe(30);

    const ranges = Array(45).fill(4.0);
    ranges[0] = 2.0;

    const ins = [
      0.0, // x_est
      0.0, // y_est
      0.0, // theta_est
      ranges
    ];

    const res = block.execute(ins, block.params, state, 0.0);
    state = res.nextState;

    let mappedCount = 0;
    const grid = state.grid;
    for (let r = 0; r < 30; r++) {
      for (let c = 0; c < 30; c++) {
        if (grid[r][c] !== 0) mappedCount++;
      }
    }
    expect(mappedCount).toBeGreaterThan(0);
  });

  it('TC-ROBOT-09: Auto-detection of Room Layout in astar_planner', () => {
    // 1. Reset g_isMatlabActive via a simulation time step of 0
    const ts_block = BLOCK_LIBRARY['ROBOT_VACUUM_THETA_STAR']('theta_star_test_layout', {});
    ts_block.execute([Array.from({ length: 30 }, () => Array(30).fill(0)), [0, 0], [0, 0]], ts_block.params, ts_block.state, 0.0);

    // 2. Call astar_planner with standard bounds (start/goal within [-3, 3])
    const grid30 = Array.from({ length: 30 }, () => Array(30).fill(0));
    const path_std = astar_planner([-1.0, -1.0], [1.0, 1.0], grid30);
    expect(path_std.length).toBeGreaterThan(0);

    // 3. Call astar_planner with MATLAB bounds (out of [-3, 3])
    // it should auto-detect and switch to MATLAB bounds
    const path_matlab = astar_planner([-5.0, -5.0], [5.0, 5.0], grid30);
    expect(path_matlab.length).toBeGreaterThan(0);

    // 4. Verify getTwinGridCoords now defaults to MATLAB bounds
    const coords = getTwinGridCoords(-5.0, -5.0);
    expect(coords.row).toBe(2);
  });

  it('TC-MATH-01: TRANSFER_FUNCTION Continuous Integration and Outport y', () => {
    // A simple transfer function block: G(s) = 1 / (s + 1)
    const block = BLOCK_LIBRARY['TRANSFER_FUNCTION']('tf_test', {
      numerator: [1],
      denominator: [1, 1],
      representation: 'continuous'
    });
    
    expect(block.evaluateDerivatives).toBeDefined();

    // Initial state: x = [0]
    let state = block.state;
    expect(state.x).toEqual([0]);

    // Let's execute block: input = 1.0
    // y = C*x + D*u
    // In G(s) = 1 / (s + 1), C = [1], D = [0]
    let res = block.execute([1.0], block.params, state, 0.0);
    expect(res.outputs[0]).toEqual([0]); // C*x + D*u = 1*0 + 0*1 = 0

    // Evaluate derivatives
    // dx/dt = A*x + B*u = -1*0 + 1*1 = 1
    const deriv = block.evaluateDerivatives!([1.0], block.params, state, 0.0);
    expect(deriv).toEqual({ x: [1.0] });

    // Integrate state using VectorUtils
    const nextState = VectorUtils.integrateState(state, deriv, 0.1);
    expect(nextState.x).toEqual([0.1]); // 0 + 1 * 0.1 = 0.1

    // Execute with new state
    res = block.execute([1.0], block.params, nextState, 0.1);
    // y = C*x + D*u = 1*0.1 + 0*1 = 0.1
    expect((res.outputs[0] as number[])[0]).toBeCloseTo(0.1, 5);
  });

  it('TC-MATH-02: DISCRETE_TRANSFER_FUNCTION and Discrete Update', () => {
    // A simple discrete transfer function: H(z) = 1 / (z - 0.5)
    // which has A = [0.5], B = [1], C = [1], D = [0]
    const block = BLOCK_LIBRARY['DISCRETE_TRANSFER_FUNCTION']('dtf_test', {
      numerator: [1],
      denominator: [1, -0.5],
      representation: 'discrete'
    });

    // Discrete blocks should NOT have evaluateDerivatives
    expect(block.evaluateDerivatives).toBeUndefined();

    // Initial state: x = [0]
    let state = block.state;
    expect(state.x).toEqual([0]);

    // Step 1: Input = 1.0, Time = 0
    let res = block.execute([1.0], block.params, state, 0.0);
    // y = 1*0 + 0*1 = 0
    expect(res.outputs[0]).toEqual([0]);
    // nextState x = A*x + B*u = 0.5*0 + 1*1 = 1
    expect(res.nextState.x).toEqual([1.0]);

    // Step 2: Input = 1.0, Time = 0.1
    state = res.nextState;
    res = block.execute([1.0], block.params, state, 0.1);
    // y = 1*1 + 0*1 = 1
    expect(res.outputs[0]).toEqual([1.0]);
    // nextState x = A*x + B*u = 0.5*1 + 1*1 = 1.5
    expect(res.nextState.x).toEqual([1.5]);
  });

  it('TC-MATH-03: FUZZY_SURFACE_VIEWER Live Output evaluation', () => {
    const fisConfig = {
      rules: []
    };
    const block = BLOCK_LIBRARY['FUZZY_SURFACE_VIEWER']('fsv_test', {
      fisConfig,
      resolution: 3,
      input1_range: [-1, 1],
      input2_range: [-1, 1]
    });

    const res = block.execute([0, 0], block.params, block.state, 0.0);
    expect(res.outputs.length).toBe(2);
    expect(typeof res.outputs[1]).toBe('number');
  });

  it('TC-SIM-01: Standalone Integrator Block Test', () => {
    const block = BLOCK_LIBRARY['INTEGRATOR']('int_test', {
      initialCondition: 1.0,
      limitOutput: true,
      lowerLimit: 0.0,
      upperLimit: 2.0,
      externalReset: 'rising'
    });

    expect(block.isStateful).toBe(true);

    let res = block.execute([0.5, 0.0], block.params, block.state, 0.0);
    expect(res.outputs[0]).toBe(1.0);

    let dx = block.evaluateDerivatives!([0.5, 0.0], block.params, block.state, 0.0);
    expect(dx.x).toBe(0.5);

    let satState = { x: 2.0, prevReset: 0 };
    dx = block.evaluateDerivatives!([0.5, 0.0], block.params, satState, 0.0);
    expect(dx.x).toBe(0);

    let stateWithReset = { x: 1.8, prevReset: 0 };
    res = block.execute([0.5, 1.0], block.params, stateWithReset, 0.0);
    expect(res.outputs[0]).toBe(1.0);
    expect(res.nextState.prevReset).toBe(1.0);
  });

  it('TC-SIM-02: Transfer Function CCF Step Response', () => {
    const blocks = [
      {
        id: 'step',
        type: 'CONSTANT',
        params: { value: 1.0 },
        inputs: [],
        outputs: [{ id: 'out', name: 'out', type: 'continuous', direction: 'output', value: 1.0 }]
      },
      BLOCK_LIBRARY['TRANSFER_FUNCTION']('tf', { numerator: [1], denominator: [1, 1] })
    ];

    const connections = [
      { sourceBlock: 'step', sourcePort: 'out', targetBlock: 'tf', targetPort: 'u' }
    ];

    const model = { blocks, connections };
    const engine = new XbridgesEngine(model as any);

    Solvers.runFixedStep(engine, {
      solver: 'ode45',
      startTime: 0,
      stopTime: 1.0,
      fixedStep: 0.01,
      relTol: 1e-4,
      absTol: 1e-6
    });

    const tfVal = engine.getSignalValue('tf', 'y');
    expect(tfVal[0]).toBeCloseTo(0.63212, 3);
  });

  it('TC-SIM-03: Algebraic Loop Newton-Raphson Solver', () => {
    const blocks = [
      {
        id: 'u1',
        type: 'CONSTANT',
        params: { value: 1.0 },
        inputs: [],
        outputs: [{ id: 'out', name: 'out', type: 'continuous', direction: 'output', value: 1.0 }]
      },
      {
        id: 'sum',
        type: 'ADD',
        params: { numInputs: 2 },
        inputs: [
          { id: 'in1', name: 'A', type: 'continuous', direction: 'input', value: 0 },
          { id: 'in2', name: 'B', type: 'continuous', direction: 'input', value: 0 }
        ],
        outputs: [{ id: 'out', name: 'Out', type: 'continuous', direction: 'output', value: 0 }],
        execute: (ins: any[]) => ({ outputs: [Number(ins[0] ?? 0) + Number(ins[1] ?? 0)] })
      },
      {
        id: 'gain',
        type: 'GAIN',
        params: { gain: 2.0 },
        inputs: [{ id: 'in', name: 'In', type: 'continuous', direction: 'input', value: 0 }],
        outputs: [{ id: 'out', name: 'Out', type: 'continuous', direction: 'output', value: 0 }],
        execute: (ins: any[], p: any) => ({ outputs: [Number(ins[0] ?? 0) * p.gain] })
      }
    ];

    const connections = [
      { sourceBlock: 'u1', sourcePort: 'out', targetBlock: 'sum', targetPort: 'in1' },
      { sourceBlock: 'sum', sourcePort: 'out', targetBlock: 'gain', targetPort: 'in' },
      { sourceBlock: 'gain', sourcePort: 'out', targetBlock: 'sum', targetPort: 'in2' }
    ];

    const model = { blocks, connections };
    const engine = new XbridgesEngine(model as any);

    const diagnostics = engine.compile(0);
    expect(diagnostics.some(d => d.code === 'ALGEBRAIC_LOOP')).toBe(true);

    engine.computeOutputs(0);

    const sumVal = engine.getSignalValue('sum', 'out');
    const gainVal = engine.getSignalValue('gain', 'out');

    expect(sumVal).toBeCloseTo(-1.0, 4);
    expect(gainVal).toBeCloseTo(-2.0, 4);
  });

  it('TC-SIM-04: Fixed-Step Solvers Comparison on dx/dt = -x', () => {
    const createModel = () => {
      return {
        blocks: [
          BLOCK_LIBRARY['INTEGRATOR']('int', { initialCondition: 1.0 }),
          BLOCK_LIBRARY['GAIN']('gain', { gain: -1.0 })
        ],
        connections: [
          { sourceBlock: 'int', sourcePort: 'y', targetBlock: 'gain', targetPort: 'u' },
          { sourceBlock: 'gain', sourcePort: 'y', targetBlock: 'int', targetPort: 'u' }
        ]
      };
    };

    let engine = new XbridgesEngine(createModel() as any);
    Solvers.runFixedStep(engine, { solver: 'ode2', startTime: 0, stopTime: 1.0, fixedStep: 0.01 });
    let val = engine.getBlock('int')!.state.x;
    expect(val).toBeCloseTo(0.367879, 2);

    engine = new XbridgesEngine(createModel() as any);
    Solvers.runFixedStep(engine, { solver: 'ode3', startTime: 0, stopTime: 1.0, fixedStep: 0.01 });
    val = engine.getBlock('int')!.state.x;
    expect(val).toBeCloseTo(0.367879, 2);

    engine = new XbridgesEngine(createModel() as any);
    Solvers.runFixedStep(engine, { solver: 'ode4', startTime: 0, stopTime: 1.0, fixedStep: 0.01 });
    val = engine.getBlock('int')!.state.x;
    expect(val).toBeCloseTo(0.367879, 2);

    engine = new XbridgesEngine(createModel() as any);
    Solvers.runFixedStep(engine, { solver: 'ode5', startTime: 0, stopTime: 1.0, fixedStep: 0.01 });
    val = engine.getBlock('int')!.state.x;
    expect(val).toBeCloseTo(0.367879, 2);
  });

  it('TC-SIM-05: Selectable Discretization in PID Controller', () => {
    const blockFE = BLOCK_LIBRARY['PID_CONTROLLER']('pid', {
      mode: 'PI', Kp: 1.0, Ki: 2.0, sampleTime: 0.1, method: 'forward_euler'
    });
    
    let res = blockFE.execute([1.0, 0.0], blockFE.params, blockFE.state, 0.0);
    expect(res.outputs[0]).toBeCloseTo(1.0, 5);
    expect(res.nextState.i_state).toBeCloseTo(0.2, 5);

    const blockTrap = BLOCK_LIBRARY['PID_CONTROLLER']('pid', {
      mode: 'PI', Kp: 1.0, Ki: 2.0, sampleTime: 0.1, method: 'trapezoidal'
    });
    res = blockTrap.execute([1.0, 0.0], blockTrap.params, blockTrap.state, 0.0);
    expect(res.outputs[0]).toBeCloseTo(1.1, 5);
    expect(res.nextState.i_state).toBeCloseTo(0.1, 5);
  });

  it('TC-SIM-06: Unit Delay, Memory, and Filtered Derivative Blocks', () => {
    const ud = BLOCK_LIBRARY['UNIT_DELAY']('ud', { initialCondition: 1.0, sampleTime: 0.1 });
    let res = ud.execute([5.0], ud.params, ud.state, 0.0);
    expect(res.outputs[0]).toBe(1.0);
    expect(res.nextState.x).toBe(5.0);

    const mem = BLOCK_LIBRARY['MEMORY']('mem', { initialCondition: 2.0 });
    res = mem.execute([4.0], mem.params, mem.state, 0.0);
    expect(res.outputs[0]).toBe(2.0);
    expect(res.nextState.x).toBe(4.0);

    const deriv = BLOCK_LIBRARY['DERIVATIVE']('deriv', { tau: 0.1 });
    const dx = deriv.evaluateDerivatives!([1.0], deriv.params, { x: 0.0 }, 0.0);
    expect(dx.x).toBe(10);
  });

  it('TC-SIM-07: Variable Step Solver ODE23 Bogacki-Shampine Verification', () => {
    const createModel = () => {
      return {
        blocks: [
          BLOCK_LIBRARY['INTEGRATOR']('int', { initialCondition: 1.0 })
        ],
        connections: [
          { sourceBlock: 'int', sourcePort: 'y', targetBlock: 'int', targetPort: 'u' }
        ]
      };
    };

    const engine = new XbridgesEngine(createModel() as any);
    Solvers.runFixedStep(engine, {
      solver: 'ode23',
      startTime: 0,
      stopTime: 1.0,
      relTol: 1e-4,
      absTol: 1e-6
    });

    const val = engine.getBlock('int')!.state.x;
    expect(val).toBeCloseTo(2.71828, 3);
  });

  it('TC-SIM-08: Zero-Crossing Detection and Step Correction', () => {
    const evalTimes: number[] = [];
    const blocks = [
      BLOCK_LIBRARY['Step']('step_src', { stepTime: 0.573, initialValue: 0.0, finalValue: 2.0 }),
      {
        id: 'monitor',
        type: 'MONITOR',
        params: {},
        inputs: [{ id: 'in', name: 'in', type: 'continuous', direction: 'input', value: 0 }],
        outputs: [],
        execute: (ins: any[], p: any, state: any, time: number) => {
          evalTimes.push(time);
          return { outputs: [] };
        }
      }
    ];
    const connections = [
      { sourceBlock: 'step_src', sourcePort: 'out', targetBlock: 'monitor', targetPort: 'in' }
    ];
    
    const model = { blocks, connections };
    const engine = new XbridgesEngine(model as any);

    Solvers.runFixedStep(engine, {
      solver: 'rk4',
      startTime: 0,
      stopTime: 1.0,
      fixedStep: 0.1,
      zeroTol: 1e-6
    });

    // Verify that the event time (0.573) was hit exactly within tolerance
    const hasEventTime = evalTimes.some(t => Math.abs(t - 0.573) < 1e-4);
    expect(hasEventTime).toBe(true);
  });

  describe('Matrix Blocks and Operations', () => {
    it('should concatenate matrices horizontally and vertically', () => {
      const concatH = BLOCK_LIBRARY['MatrixConcat']('concat', { axis: 1 });
      const resH = concatH.execute([[[1, 2]], [[3, 4]]], concatH.params, {}, 0);
      expect(resH.outputs[0]).toEqual([[1, 2, 3, 4]]);

      const concatV = BLOCK_LIBRARY['MatrixConcat']('concat', { axis: 0 });
      const resV = concatV.execute([[[1, 2]], [[3, 4]]], concatV.params, {}, 0);
      expect(resV.outputs[0]).toEqual([[1, 2], [3, 4]]);
    });

    it('should create diagonal matrices and extract diagonals', () => {
      const diagBlock = BLOCK_LIBRARY['MatrixDiag']('diag', {});
      const resCreate = diagBlock.execute([[1, 2]], diagBlock.params, {}, 0);
      expect(resCreate.outputs[0]).toEqual([[1, 0], [0, 2]]);

      const resExtract = diagBlock.execute([[[1, 0], [0, 2]]], diagBlock.params, {}, 0);
      expect(resExtract.outputs[0]).toEqual([1, 2]);
    });

    it('should generate identity matrices', () => {
      const identityBlock = BLOCK_LIBRARY['IdentityMatrix']('ident', { dim: 2 });
      const res = identityBlock.execute([], identityBlock.params, {}, 0);
      expect(res.outputs[0]).toEqual([[1, 0], [0, 1]]);
    });

    it('should extract submatrices correctly', () => {
      const subBlock = BLOCK_LIBRARY['SubMatrix']('sub', { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 2 });
      const res = subBlock.execute([[[1, 2, 3], [4, 5, 6]]], subBlock.params, {}, 0);
      expect(res.outputs[0]).toEqual([[2, 3]]);
    });

    it('should solve linear systems', () => {
      const solveBlock = BLOCK_LIBRARY['MatrixSolve']('solve', {});
      // Solve A * x = B -> [[2, 1], [1, 3]] * x = [[5], [5]] -> x = [[2], [1]]
      const res = solveBlock.execute([[[2, 1], [1, 3]], [[5], [5]]], solveBlock.params, {}, 0);
      const out = res.outputs[0] as any;
      expect(out[0][0]).toBeCloseTo(2, 5);
      expect(out[1][0]).toBeCloseTo(1, 5);
    });

    it('should scale matrices/vectors with GAIN block', () => {
      const gainBlock = BLOCK_LIBRARY['GAIN']('gain', { gain: 2 });
      const res = gainBlock.execute([[[1, 2], [3, 4]]], gainBlock.params, {}, 0);
      expect(res.outputs[0]).toEqual([[2, 4], [6, 8]]);
    });

    it('should multiply two 2D matrices with MatrixMul block', () => {
      const mulBlock = BLOCK_LIBRARY['MatrixMul']('mul', {});
      const res = mulBlock.execute([[[1, 2], [3, 4]], [[5, 6], [7, 8]]], mulBlock.params, {}, 0);
      expect(res.outputs[0]).toEqual([[19, 22], [43, 50]]);
    });

    it('should handle matrix/vector inputs in Scope block', () => {
      const scopeBlock = BLOCK_LIBRARY['Scope']('scope', { numSignals: 1 });
      const res = scopeBlock.execute([[[1, 2], [3, 4]]], scopeBlock.params, { history: [], stepCount: 0, lastSampleTime: 0 }, 0);
      console.log('Scope history sample:', res.nextState?.history[0]);
    });
  });

  describe('MATLAB-style Array Parsing', () => {
    it('should parse MATLAB-style vectors in Constant block', () => {
      const constBlock = BLOCK_LIBRARY['Constant']('const', { value: '[1 2 3 4 5]' });
      const res = constBlock.execute([], constBlock.params, {}, 0);
      expect(res.outputs[0]).toEqual([1, 2, 3, 4, 5]);
    });

    it('should parse MATLAB-style matrices in Constant block', () => {
      const constBlock1 = BLOCK_LIBRARY['Constant']('const', { value: '[1 2; 3 4]' });
      const res1 = constBlock1.execute([], constBlock1.params, {}, 0);
      expect(res1.outputs[0]).toEqual([[1, 2], [3, 4]]);

      const constBlock2 = BLOCK_LIBRARY['Constant']('const', { value: '[[1 2], [3 5]]' });
      const res2 = constBlock2.execute([], constBlock2.params, {}, 0);
      expect(res2.outputs[0]).toEqual([[1, 2], [3, 5]]);

      const constBlock3 = BLOCK_LIBRARY['Constant']('const', { value: '[[1, 2], [3, 5]]' });
      const res3 = constBlock3.execute([], constBlock3.params, {}, 0);
      expect(res3.outputs[0]).toEqual([[1, 2], [3, 5]]);
    });

    it('should parse MATLAB-style vectors in Step block', () => {
      const stepBlock = BLOCK_LIBRARY['Step']('step', { stepTime: 1.0, initialValue: '[10 20]', finalValue: '[30 40]' });
      const resInit = stepBlock.execute([], stepBlock.params, {}, 0.5);
      expect(resInit.outputs[0]).toEqual([10, 20]);

      const resFinal = stepBlock.execute([], stepBlock.params, {}, 1.5);
      expect(resFinal.outputs[0]).toEqual([30, 40]);
    });

    it('should parse MATLAB-style vectors in GAIN block', () => {
      const gainBlock = BLOCK_LIBRARY['GAIN']('gain', { gain: '[2 3]' });
      const res = gainBlock.execute([[10, 20]], gainBlock.params, {}, 0);
      expect(res.outputs[0]).toEqual([20, 60]);
    });
  });

  describe('DEM Particle Simulation and Washing Machine Blocks', () => {
    it('should execute DEM_DRUM and update angle based on RPM', () => {
      const drumBlock = BLOCK_LIBRARY['DEM_DRUM']('drum_test', { drum_radius: 0.8 });
      const state = { angle: 0, initialized: true };
      const res = drumBlock.execute([45], drumBlock.params, state, 0);
      expect(res.outputs[0]).toBeGreaterThan(0); // angle
      expect(res.outputs[1]).toBeCloseTo((45 * 2 * Math.PI) / 60, 4); // omega
      expect(res.outputs[2]).toEqual([0.8, res.outputs[0], res.outputs[1]]); // drum_state
    });

    it('should execute DEM_PARTICLE_SYSTEM with contact, bond, and fluid forces', () => {
      const pSystem = BLOCK_LIBRARY['DEM_PARTICLE_SYSTEM']('ps_test', { num_particles: 32, particle_radius: 0.05 });
      const state = pSystem.state;
      const resInit = pSystem.execute([[], [], [], [0.8, 0, 0]], pSystem.params, state, 0);
      
      expect((resInit.outputs[0] as number[]).length).toBe(64); // 32 particles * 2D positions
      expect(resInit.nextState.initialized).toBe(true);
      expect(resInit.nextState.particles.length).toBe(32);
      expect(resInit.nextState.bonds.length).toBeGreaterThan(0);

      // Execute another step with contact forces
      const contactForces = new Array(64).fill(0.1);
      const resStep = pSystem.execute([contactForces, [], [], [0.8, 0.1, 1.5]], pSystem.params, resInit.nextState, 0.08);
      expect((resStep.outputs[0] as number[]).length).toBe(64);
      expect(resStep.nextState.drum_angle).toBe(0.1);
    });

    it('should execute DEM_HERTZ_CONTACT and compute contact forces', () => {
      const contactBlock = BLOCK_LIBRARY['DEM_HERTZ_CONTACT']('hertz_test', { stiffness_normal: 500 });
      const positions = new Array(64).fill(0).map((_, i) => (i % 2 === 0 ? 0.1 * i : 0));
      const velocities = new Array(64).fill(0);
      const drumState = [0.8, 0.2, 1.0];
      const radius = 0.05;

      const res = contactBlock.execute([positions, velocities, drumState, radius], contactBlock.params, { initialized: false }, 0);
      expect((res.outputs[0] as number[]).length).toBe(64); // force vector length
      expect(res.nextState.particles.length).toBe(32);
      expect(res.nextState.drum_angle).toBe(0.2);
    });

    it('should execute DEM_BOND_FABRIC and compute elastic forces', () => {
      const bondBlock = BLOCK_LIBRARY['DEM_BOND_FABRIC']('bond_test', { bond_stiffness: 150 });
      const positions = new Array(64).fill(0).map((_, i) => (i % 2 === 0 ? 0.05 * i : 0.01 * i));
      const velocities = new Array(64).fill(0);
      const radius = 0.05;

      const res = bondBlock.execute([positions, velocities, radius], bondBlock.params, { initialized: false }, 0);
      expect((res.outputs[0] as number[]).length).toBe(64); // forces
      expect((res.outputs[1] as number[]).length).toBeGreaterThan(0); // bonds output (forces magnitudes)
      expect(res.nextState.bonds.length).toBeGreaterThan(0);
      expect(res.nextState.particles.length).toBe(32);
    });

    it('should execute DEM_FLUID_COUPLING and compute drag forces', () => {
      const fluidBlock = BLOCK_LIBRARY['DEM_FLUID_COUPLING']('fluid_test', { drag_coeff: 0.8 });
      const positions = new Array(64).fill(0).map((_, i) => (i % 2 === 0 ? 0.1 : -0.5)); // particles placed in water region
      const velocities = new Array(64).fill(1.0);
      const fillLevel = 0.35;
      const drumState = [0.8, 0.2, 1.5];

      const res = fluidBlock.execute([positions, velocities, fillLevel, drumState], fluidBlock.params, { initialized: false }, 0);
      expect((res.outputs[0] as number[]).length).toBe(64);
      expect(res.nextState.particles.length).toBe(32);
      expect(res.nextState.drum_angle).toBe(0.2);
    });

    it('should compile and simulate the complete modular washing machine loop in XbridgesEngine', () => {
      const model = {
        blocks: [
          BLOCK_LIBRARY['Constant']('rpm_val', { value: 45 }),
          BLOCK_LIBRARY['Constant']('fill_val', { value: 0.35 }),
          BLOCK_LIBRARY['Constant']('const_two', { value: 2 }),
          BLOCK_LIBRARY['DEM_DRUM']('dem_drum', { drum_radius: 0.8 }),
          BLOCK_LIBRARY['DEM_PARTICLE_SYSTEM']('dem_particles', { num_particles: 32, particle_radius: 0.05 }),
          BLOCK_LIBRARY['DEM_HERTZ_CONTACT']('hertz_contact', { stiffness_normal: 500 }),
          BLOCK_LIBRARY['DEM_BOND_FABRIC']('bond_fabric', { bond_stiffness: 150 }),
          BLOCK_LIBRARY['DEM_FLUID_COUPLING']('fluid_coupling', { drag_coeff: 0.8 }),
          BLOCK_LIBRARY['VectorPow']('pow_block', {}),
          BLOCK_LIBRARY['SumElements']('sum_elements', {}),
          BLOCK_LIBRARY['GAIN']('ke_gain', { gain: 0.05 }),
          BLOCK_LIBRARY['Scope']('scope_ke', { numSignals: 2 })
        ],
        connections: [
          { sourceBlock: 'rpm_val', sourcePort: 'out', targetBlock: 'dem_drum', targetPort: 'rpm' },
          { sourceBlock: 'dem_drum', sourcePort: 'drum_state', targetBlock: 'hertz_contact', targetPort: 'drum_state' },
          { sourceBlock: 'dem_drum', sourcePort: 'drum_state', targetBlock: 'fluid_coupling', targetPort: 'drum_state' },
          { sourceBlock: 'dem_drum', sourcePort: 'drum_state', targetBlock: 'dem_particles', targetPort: 'drum_state' },
          
          { sourceBlock: 'dem_particles', sourcePort: 'positions', targetBlock: 'hertz_contact', targetPort: 'positions' },
          { sourceBlock: 'dem_particles', sourcePort: 'velocities', targetBlock: 'hertz_contact', targetPort: 'velocities' },
          { sourceBlock: 'dem_particles', sourcePort: 'positions', targetBlock: 'bond_fabric', targetPort: 'positions' },
          { sourceBlock: 'dem_particles', sourcePort: 'velocities', targetBlock: 'bond_fabric', targetPort: 'velocities' },
          { sourceBlock: 'dem_particles', sourcePort: 'positions', targetBlock: 'fluid_coupling', targetPort: 'positions' },
          { sourceBlock: 'dem_particles', sourcePort: 'velocities', targetBlock: 'fluid_coupling', targetPort: 'velocities' },
          
          { sourceBlock: 'fill_val', sourcePort: 'out', targetBlock: 'fluid_coupling', targetPort: 'fill_level' },
          { sourceBlock: 'hertz_contact', sourcePort: 'contact_forces', targetBlock: 'dem_particles', targetPort: 'contact_forces' },
          { sourceBlock: 'bond_fabric', sourcePort: 'bond_forces', targetBlock: 'dem_particles', targetPort: 'bond_forces' },
          { sourceBlock: 'fluid_coupling', sourcePort: 'fluid_forces', targetBlock: 'dem_particles', targetPort: 'fluid_forces' },
          
          { sourceBlock: 'dem_particles', sourcePort: 'velocities', targetBlock: 'pow_block', targetPort: 'in1' },
          { sourceBlock: 'const_two', sourcePort: 'out', targetBlock: 'pow_block', targetPort: 'in2' },
          { sourceBlock: 'pow_block', sourcePort: 'out', targetBlock: 'sum_elements', targetPort: 'in' },
          { sourceBlock: 'sum_elements', sourcePort: 'out', targetBlock: 'ke_gain', targetPort: 'u' },
          { sourceBlock: 'ke_gain', sourcePort: 'y', targetBlock: 'scope_ke', targetPort: 'in1' },
          { sourceBlock: 'dem_drum', sourcePort: 'omega', targetBlock: 'scope_ke', targetPort: 'in2' }
        ]
      };

      const engine = new XbridgesEngine(model);
      const diagnostics = engine.compile(0);
      expect(diagnostics.filter(d => d.severity === 'error').length).toBe(0);

      // Verify that no algebraic loops are flagged (since the loop starts at stateful dem_particles)
      const loops = diagnostics.filter(d => d.code === 'ALGEBRAIC_LOOP');
      expect(loops.length).toBe(0);

      // Simulate a few steps
      let time = 0;
      const dt = 0.08;
      for (let i = 0; i < 5; i++) {
        Solvers.stepEuler(engine, time, dt);
        time += dt;
      }

      // Check that the scope received data
      const scope = engine.executionOrder.find(b => b.id === 'scope_ke');
      expect(scope?.state?.history.length).toBe(5);
      expect(scope?.state?.history[4].t).toBeCloseTo(0.32, 4);
    });
  });

  describe('Washing Machine CFD-DEM Co-Simulation Blocks', () => {
    it('should initialize and execute CFD_SPH_WATER_SOLVER correctly', () => {
      const solverBlock = BLOCK_LIBRARY['CFD_SPH_WATER_SOLVER']('cfd_sph', {
        num_fluid_particles: 20,
        fluid_density: 1000,
        fluid_viscosity: 1.5,
        sph_smoothing_length: 0.12,
        sph_stiffness: 25
      });

      expect(solverBlock.isStateful).toBe(true);
      expect(solverBlock.state.initialized).toBe(false);

      // Execute initial step (initializes state)
      const resInit = solverBlock.execute([0.35, [0.8, 0.5, 2.5], []], solverBlock.params, solverBlock.state, 0);
      expect(resInit.nextState.initialized).toBe(true);
      expect(resInit.nextState.fluidParticles.length).toBe(20);
      expect((resInit.outputs[0] as number[]).length).toBe(40); // 20 * 2 (x, y)
      expect((resInit.outputs[1] as number[]).length).toBe(40); // 20 * 2 (vx, vy)

      // Execute next step (simulates motion)
      const resStep = solverBlock.execute([0.35, [0.8, 0.5, 2.5], []], solverBlock.params, resInit.nextState, 0);
      expect(resStep.nextState.fluidParticles.length).toBe(20);
      expect(resStep.nextState.fluidParticles[0].x).not.toBeNaN();
    });

    it('should initialize and execute DEM_CFD_COSIMULATION_INTERFACE correctly', () => {
      const couplerBlock = BLOCK_LIBRARY['DEM_CFD_COSIMULATION_INTERFACE']('coupler', {
        drag_model: 'Gidaspow',
        drag_coeff: 0.8
      });

      // Dummy fluid positions (4 particles) and DEM positions (4 particles)
      const demPos = [0.1, -0.2, 0.2, -0.3, -0.1, -0.4, 0.05, -0.5];
      const demVel = [0.1, 0, -0.1, 0.1, 0, -0.1, 0.2, 0.2];
      const fluidPos = [0.12, -0.18, 0.18, -0.32, -0.08, -0.38, 0.04, -0.52];
      const fluidVel = [0.08, -0.05, -0.12, 0.08, 0.02, -0.08, 0.18, 0.22];
      const drumState = [0.8, 0.2, 2.0];

      const res = couplerBlock.execute([demPos, demVel, fluidPos, fluidVel, drumState], couplerBlock.params, couplerBlock.state, 0);
      expect((res.outputs[0] as number[]).length).toBe(8); // dem coupling forces
      expect((res.outputs[1] as number[]).length).toBe(8); // fluid coupling forces
    });

    it('should execute FABRIC_HARMONIC_ANALYZER and suspension dynamics correctly', () => {
      const analyzerBlock = BLOCK_LIBRARY['FABRIC_HARMONIC_ANALYZER']('analyzer', {
        drum_mass: 15.0,
        suspension_stiffness: 8000
      });

      const demPos = [0.2, -0.3, 0.3, -0.4];
      const demVel = [0.5, 0.5, -0.5, -0.5];
      const fluidForces = [1.0, 1.0, -1.0, -1.0];
      const drumState = [0.8, 0.2, 5.0];

      let state = analyzerBlock.state;
      // Execute 3 steps to integrate suspension spring-damper system
      for (let i = 0; i < 3; i++) {
        const res = analyzerBlock.execute([demPos, demVel, fluidForces, drumState], analyzerBlock.params, state, 0);
        state = res.nextState;
        expect(res.outputs[0]).toBeGreaterThanOrEqual(0); // vibration amplitude
        expect(res.outputs[1]).toEqual([0.25, -0.35]); // eccentricity
        expect(state.dx).not.toBeNaN();
        expect(state.dy).not.toBeNaN();
      }
    });

    it('should train CFD_DEM_SURROGATE_LEARNER online and recommend optimal RPM and design parameters', () => {
      const learnerBlock = BLOCK_LIBRARY['CFD_DEM_SURROGATE_LEARNER']('learner', {
        learning_rate: 0.04,
        mode: 'training'
      });

      let state = learnerBlock.state;
      let lastRes: any = null;

      // Train surrogate on a mock trajectory (increasing RPM leads to cleaning but also vibration)
      for (let step = 0; step < 50; step++) {
        const rpm = 30 + (step % 5) * 15; // 30, 45, 60, 75, 90
        const fill = 0.35;
        // Vibration increases quadratically with RPM
        const actualVib = 0.01 + 0.0001 * rpm * rpm + (Math.random() - 0.5) * 0.01;
        // Cleanliness increases with RPM up to a threshold (centrifuging) then drops
        const actualClean = Math.min(100, rpm * 1.2 - 0.005 * rpm * rpm);
        const fluidTorque = 0.4 + (step % 3) * 0.1;
        const sloshIntensity = 0.3 + (step % 4) * 0.15;

        lastRes = learnerBlock.execute([rpm, fill, actualVib, actualClean, fluidTorque, sloshIntensity], learnerBlock.params, state, 0);
        state = lastRes.nextState;

        // Verify outputs are computed
        expect(lastRes.outputs[0]).toBeGreaterThanOrEqual(0);
        expect(lastRes.outputs[1]).toBeGreaterThanOrEqual(0);
        expect(lastRes.outputs[1]).toBeLessThanOrEqual(100);
      }

      // Check optimizer has recommended an optimal RPM and design parameters
      const recommendedRpm = lastRes.outputs[4] as number;
      expect(recommendedRpm).toBeGreaterThanOrEqual(15);
      expect(recommendedRpm).toBeLessThanOrEqual(140);

      const recommendedFill = lastRes.outputs[5] as number;
      expect(recommendedFill).toBeGreaterThanOrEqual(0.2);
      expect(recommendedFill).toBeLessThanOrEqual(0.6);

      const recommendedRad = lastRes.outputs[6] as number;
      expect(recommendedRad).toBeGreaterThanOrEqual(0.6);
      expect(recommendedRad).toBeLessThanOrEqual(1.0);

      const recommendedLifters = lastRes.outputs[7] as number;
      expect(recommendedLifters).toBeGreaterThanOrEqual(3);
      expect(recommendedLifters).toBeLessThanOrEqual(5);

      // Verify Classified Motion Pattern and Rotation Direction
      const motionPattern = lastRes.outputs[8] as number;
      expect([0, 1, 2]).toContain(motionPattern);

      const rotationDir = lastRes.outputs[9] as number;
      expect([0, 1, 2]).toContain(rotationDir);
    });
  });

  describe('Trigonometric & Hyperbolic Blocks', () => {
    it('should calculate inverse trigonometric functions in radians and degrees', () => {
      const asinRad = BLOCK_LIBRARY['ASIN']('asin_r', { angle_unit: 'radians' });
      const asinDeg = BLOCK_LIBRARY['ASIN']('asin_d', { angle_unit: 'degrees' });

      // ASIN
      expect(asinRad.execute([0.5], asinRad.params, null, 0).outputs[0]).toBeCloseTo(Math.asin(0.5), 5);
      expect(asinDeg.execute([0.5], asinDeg.params, null, 0).outputs[0]).toBeCloseTo(30, 5);

      // ACOS
      const acosRad = BLOCK_LIBRARY['ACOS']('acos_r', { angle_unit: 'radians' });
      const acosDeg = BLOCK_LIBRARY['ACOS']('acos_d', { angle_unit: 'degrees' });
      expect(acosRad.execute([0.5], acosRad.params, null, 0).outputs[0]).toBeCloseTo(Math.acos(0.5), 5);
      expect(acosDeg.execute([0.5], acosDeg.params, null, 0).outputs[0]).toBeCloseTo(60, 5);

      // ATAN
      const atanRad = BLOCK_LIBRARY['ATAN']('atan_r', { angle_unit: 'radians' });
      const atanDeg = BLOCK_LIBRARY['ATAN']('atan_d', { angle_unit: 'degrees' });
      expect(atanRad.execute([1.0], atanRad.params, null, 0).outputs[0]).toBeCloseTo(Math.atan(1.0), 5);
      expect(atanDeg.execute([1.0], atanDeg.params, null, 0).outputs[0]).toBeCloseTo(45, 5);

      // ACOT
      const acotRad = BLOCK_LIBRARY['ACOT']('acot_r', { angle_unit: 'radians' });
      expect(acotRad.execute([1.0], acotRad.params, null, 0).outputs[0]).toBeCloseTo(Math.atan(1.0), 5);
    });

    it('should calculate hyperbolic functions', () => {
      const sinhBlock = BLOCK_LIBRARY['SINH']('sinh', {});
      const coshBlock = BLOCK_LIBRARY['COSH']('cosh', {});
      const tanhBlock = BLOCK_LIBRARY['TANH']('tanh', {});
      const cothBlock = BLOCK_LIBRARY['COTH']('coth', {});

      expect(sinhBlock.execute([1.2], {}, null, 0).outputs[0]).toBeCloseTo(Math.sinh(1.2), 5);
      expect(coshBlock.execute([1.2], {}, null, 0).outputs[0]).toBeCloseTo(Math.cosh(1.2), 5);
      expect(tanhBlock.execute([1.2], {}, null, 0).outputs[0]).toBeCloseTo(Math.tanh(1.2), 5);
      expect(cothBlock.execute([1.2], {}, null, 0).outputs[0]).toBeCloseTo(1 / Math.tanh(1.2), 5);
    });

    it('should calculate inverse hyperbolic functions', () => {
      const asinhBlock = BLOCK_LIBRARY['ASINH']('asinh', {});
      const acoshBlock = BLOCK_LIBRARY['ACOSH']('acosh', {});
      const atanhBlock = BLOCK_LIBRARY['ATANH']('atanh', {});

      expect(asinhBlock.execute([0.8], {}, null, 0).outputs[0]).toBeCloseTo(Math.asinh(0.8), 5);
      expect(acoshBlock.execute([1.5], {}, null, 0).outputs[0]).toBeCloseTo(Math.acosh(1.5), 5);
      expect(atanhBlock.execute([0.5], {}, null, 0).outputs[0]).toBeCloseTo(Math.atanh(0.5), 5);
    });
  });

  describe('CURRENT_CONTROLLER_DQ Block', () => {
    it('should default Ki_d to 10 but respect user properties when they are changed', () => {
      const dqDefault = BLOCK_LIBRARY['CURRENT_CONTROLLER_DQ']('dq_def', {});
      expect(dqDefault.params.Ki_d).toBe(10);
      expect(dqDefault.params.iMax).toBe(100);

      const dqChanged = BLOCK_LIBRARY['CURRENT_CONTROLLER_DQ']('dq_chg', { Ki_d: 0, iMax: 50 });
      expect(dqChanged.params.Ki_d).toBe(0);
      expect(dqChanged.params.iMax).toBe(50);
    });

    it('should limit the reference currents using iMax', () => {
      const dq = BLOCK_LIBRARY['CURRENT_CONTROLLER_DQ']('dq', { Kp_d: 2, Ki_d: 0, Kp_q: 2, Ki_q: 0, iMax: 10 });
      
      // Reference currents are [12, 5], magnitude = 13, greater than iMax = 10.
      // Ratio = 10 / 13.
      // Limited id_ref = 12 * 10 / 13 = 9.230769
      // Limited iq_ref = 5 * 10 / 13 = 3.84615
      // With measured current id = 0, iq = 0, error is [9.230769, 3.84615]
      // Output is Kp * error = [18.461538, 7.6923]
      const res = dq.execute([12, 5, 0, 0], dq.params, dq.state, 0.1);
      expect(res.outputs[0]).toBeCloseTo(18.461538, 4);
      expect(res.outputs[1]).toBeCloseTo(7.6923, 4);
    });
  });

  describe('DISCRETE_IMPULSE Block', () => {
    it('should generate an impulse at the specified delay', () => {
      const impulseBlock = BLOCK_LIBRARY['DISCRETE_IMPULSE']('imp', { amplitude: 5, delay: 2, sampleTime: 0.1 });
      
      // At t = 0 (step 0), output should be 0 (since delay is 2)
      const res0 = impulseBlock.execute([], impulseBlock.params, null, 0.0);
      expect(res0.outputs[0]).toBe(0);

      // At t = 0.1 (step 1), output should be 0
      const res1 = impulseBlock.execute([], impulseBlock.params, null, 0.1);
      expect(res1.outputs[0]).toBe(0);

      // At t = 0.2 (step 2), output should be amplitude (5)
      const res2 = impulseBlock.execute([], impulseBlock.params, null, 0.2);
      expect(res2.outputs[0]).toBe(5);

      // At t = 0.3 (step 3), output should be 0
      const res3 = impulseBlock.execute([], impulseBlock.params, null, 0.3);
      expect(res3.outputs[0]).toBe(0);
    });

    it('should default amplitude to 1, delay to 0, and sampleTime to 0.1', () => {
      const impulseDefault = BLOCK_LIBRARY['DISCRETE_IMPULSE']('imp_def', {});
      expect(impulseDefault.params.amplitude).toBe(1);
      expect(impulseDefault.params.delay).toBe(0);
      expect(impulseDefault.params.sampleTime).toBe(0.1);

      // At t = 0, step = 0, which matches delay 0, output should be 1
      const res0 = impulseDefault.execute([], impulseDefault.params, null, 0.0);
      expect(res0.outputs[0]).toBe(1);

      // At t = 0.1, step = 1, output should be 0
      const res1 = impulseDefault.execute([], impulseDefault.params, null, 0.1);
      expect(res1.outputs[0]).toBe(0);
    });
  });

  describe('Extended Kalman Filter (EKF) Block', () => {
    it('should behave exactly like linear Kalman Filter on linear system equations', () => {
      const p = {
        A: [[1, 0.01], [0, 1]],
        B: [[0.00005], [0.01]],
        C: [[1, 0]],
        Q: [[0.01, 0], [0, 0.01]],
        R: [[0.1]],
        P0: [[1, 0], [0, 1]]
      };

      const kf = BLOCK_LIBRARY['KALMAN_FILTER']('kf', p);
      const ekf = BLOCK_LIBRARY['EXTENDED_KALMAN_FILTER']('ekf', {
        f: ["x1 + 0.01 * x2 + 0.00005 * u1", "x2 + 0.01 * u1"],
        h: ["x1"],
        Q: p.Q,
        R: p.R,
        P0: p.P0,
        x0: [0, 0]
      });

      let stateKf = kf.state;
      let stateEkf = ekf.state;

      // Simulate 5 steps with some inputs
      for (let step = 1; step <= 5; step++) {
        const u = [Math.sin(step)];
        const y_meas = [0.5 * step];

        const resKf = kf.execute([u, y_meas], kf.params, stateKf, step * 0.1);
        const resEkf = ekf.execute([u, y_meas], ekf.params, stateEkf, step * 0.1);

        stateKf = resKf.nextState;
        stateEkf = resEkf.nextState;

        // Verify outputs are identical
        const xHatEkf = resEkf.outputs[0] as number[];
        const xHatKf = resKf.outputs[0] as number[];
        const yHatEkf = resEkf.outputs[1] as number[];
        const yHatKf = resKf.outputs[1] as number[];
        const innEkf = resEkf.outputs[2] as number[];
        const innKf = resKf.outputs[2] as number[];
        const kEkf = resEkf.outputs[3] as number[];
        const kKf = resKf.outputs[3] as number[];

        expect(xHatEkf[0]).toBeCloseTo(xHatKf[0], 4);
        expect(xHatEkf[1]).toBeCloseTo(xHatKf[1], 4);
        expect(yHatEkf[0]).toBeCloseTo(yHatKf[0], 4);
        expect(innEkf[0]).toBeCloseTo(innKf[0], 4);
        
        // Kalman Gain flat vector
        expect(kEkf[0]).toBeCloseTo(kKf[0], 4);
        expect(kEkf[1]).toBeCloseTo(kKf[1], 4);
      }
    });

    it('should successfully estimate states in a non-linear model', () => {
      // E.g., system: x(k+1) = sin(x(k)) + u(k)
      // y(k) = x(k)^2
      const ekf = BLOCK_LIBRARY['EXTENDED_KALMAN_FILTER']('ekf_nonlin', {
        f: ["sin(x1) + u1"],
        h: ["x1^2"],
        Q: [[0.01]],
        R: [[0.05]],
        P0: [[0.5]],
        x0: [0.5]
      });

      let state = ekf.state;
      
      // Step 1: Input u = 0.2, y_meas = 0.36
      const res = ekf.execute([0.2, 0.36], ekf.params, state, 0.1);
      
      // Verify outputs has length 4
      expect(res.outputs.length).toBe(4);
      
      // State estimate x_hat should be a 1-element array
      const xHat = res.outputs[0] as number[];
      expect(Array.isArray(xHat)).toBe(true);
      expect(xHat.length).toBe(1);
      
      // P covariance in nextState should be 1x1 matrix
      expect(res.nextState.P.length).toBe(1);
      expect(res.nextState.P[0].length).toBe(1);
      
      // Verify estimation does not throw and yields reasonable values
      expect(xHat[0]).toBeGreaterThan(0);
    });
  });

  describe('Note Block', () => {
    it('should initialize with default text and no ports', () => {
      const noteBlock = BLOCK_LIBRARY['Note']('note1', {});
      expect(noteBlock.type).toBe('Note');
      expect(noteBlock.params.text).toBe('Double click or edit properties to write notes here...');
      expect(noteBlock.inputs.length).toBe(0);
      expect(noteBlock.outputs.length).toBe(0);
      expect(noteBlock.execute([], noteBlock.params, null, 0.0).outputs.length).toBe(0);
    });

    it('should initialize with custom text and retain it', () => {
      const noteBlock = BLOCK_LIBRARY['Note']('note2', { text: 'My custom simulation note.' });
      expect(noteBlock.params.text).toBe('My custom simulation note.');
      expect(noteBlock.execute([], noteBlock.params, null, 1.0).outputs.length).toBe(0);
    });
  });

  describe('NUMERIC_REPRESENTATION Block', () => {
    it('should initialize with default parameters', () => {
      const block = BLOCK_LIBRARY['NUMERIC_REPRESENTATION']('numrep1', {});
      expect(block.params.mode).toBe('fixed_point');
      expect(block.params.output_type).toBe('fixed_point'); // mode-aware default
      expect(block.params.wordLength).toBe(16);
      expect(block.params.fractionLength).toBe(8);
      expect(block.params.rounding).toBe('floor');
    });

    it('should perform fixed-point quantization with default scale (2^8)', () => {
      const block = BLOCK_LIBRARY['NUMERIC_REPRESENTATION']('numrep2', {
        mode: 'fixed_point',
        rounding: 'floor',
        fractionLength: 8
      });
      const res = block.execute([1.2345], block.params, null, 0);
      const expectedY = Math.floor(1.2345 * 256) / 256;
      expect(res.outputs[0]).toBeCloseTo(expectedY, 6);
      expect(res.outputs[1]).toBeCloseTo(Math.abs(1.2345 - expectedY), 6);
    });

    it('should respect fractionLength = 0 for integer-like step quantization', () => {
      const block = BLOCK_LIBRARY['NUMERIC_REPRESENTATION']('numrep3', {
        mode: 'fixed_point',
        rounding: 'ceil',
        fractionLength: 0
      });
      const res = block.execute([1.2345], block.params, null, 0);
      expect(res.outputs[0]).toBe(2);
      expect(res.outputs[1]).toBeCloseTo(0.7655, 4);
    });

    it('should dynamically override wordLength/fractionLength when integer output_type is selected', () => {
      const block = BLOCK_LIBRARY['NUMERIC_REPRESENTATION']('numrep4', {
        mode: 'fixed_point',
        output_type: 'int32',
        rounding: 'round'
      });
      const res = block.execute([5.67], block.params, null, 0);
      expect(res.outputs[0]).toBe(6);
      expect(res.outputs[1]).toBeCloseTo(0.33, 4);
    });

    it('should support floating-point mode: float16 simulates IEEE 754 half-precision', () => {
      const block = BLOCK_LIBRARY['NUMERIC_REPRESENTATION']('numrep5', {
        mode: 'floating_point',
        output_type: 'float16'
      });
      const res = block.execute([Math.PI], block.params, null, 0);
      // float16: exp=1, step=2^(1-10)=1/512=0.001953125
      // round(3.14159/0.001953125)=round(1608.495)=1608 → 1608/512 = 3.140625
      expect(res.outputs[0]).toBeCloseTo(3.140625, 5);
      expect(res.outputs[1]).toBeCloseTo(Math.abs(Math.PI - 3.140625), 6);
    });

    it('should produce different results for floating-point vs fixed-point mode', () => {
      // float32 mode: Math.fround, very high precision
      const blockFP = BLOCK_LIBRARY['NUMERIC_REPRESENTATION']('numrep6', {
        mode: 'floating_point', output_type: 'float32'
      });
      const resFP = blockFP.execute([1.2345], blockFP.params, null, 0);

      // fixed-point mode: WL=8, FL=4 → step = 1/16 = 0.0625
      const blockFX = BLOCK_LIBRARY['NUMERIC_REPRESENTATION']('numrep7', {
        mode: 'fixed_point', output_type: 'fixed_point', wordLength: 8, fractionLength: 4, rounding: 'floor'
      });
      const resFX = blockFX.execute([1.2345], blockFX.params, null, 0);
      // floor(1.2345 * 16) / 16 = floor(19.752)/16 = 19/16 = 1.1875
      expect(resFX.outputs[0]).toBeCloseTo(1.1875, 6);

      // float32 output is essentially 1.2345 (no coarse quantization)
      expect(Math.abs((resFP.outputs[0] as number) - 1.2345)).toBeLessThan(0.001);
      // The two modes must differ when quantization step is coarse
      expect(Math.abs((resFP.outputs[0] as number) - (resFX.outputs[0] as number))).toBeGreaterThan(0.04);
    });
  });

});



