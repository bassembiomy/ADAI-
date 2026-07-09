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

});



