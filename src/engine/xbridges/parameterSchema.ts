/**
 * Parameter kinds of the X-Bridges blocks the user can edit (numeric and enumerated parameters).
 * Contract: docs/superpowers/plans/2026-11-08-xbridges-parameter-errors.md (WP2).
 *
 * Option lists come from the Properties panel (src/components/xbridges/XbridgesPropertiesPanel.tsx) and from the
 * values each block's execute accepts (src/engine/xbridges/BlockDefinitions.ts). Derived TF-family values (A, B, C, D,
 * x0 of TRANSFER_FUNCTION, DISCRETE_TRANSFER_FUNCTION, ZERO_POLE_GAIN, LAPLACE_TRANSFORM) are not user-editable and are
 * not listed.
 */
import type { ParameterKind } from './parameterEvaluation';

const number: ParameterKind = { kind: 'number' };
const numeric: ParameterKind = { kind: 'numeric' };
const vector: ParameterKind = { kind: 'vector' };
const matrix: ParameterKind = { kind: 'matrix' };
const sampleTime: ParameterKind = { kind: 'sampleTime' };
const positive: ParameterKind = { kind: 'positive' };
const nonnegative: ParameterKind = { kind: 'nonnegative' };
const int1: ParameterKind = { kind: 'integer', min: 1 };
const int0: ParameterKind = { kind: 'integer', min: 0 };
const option = (...options: string[]): ParameterKind => ({ kind: 'option', options });

const CONTINUOUS_DISCRETE = option('continuous', 'discrete');
const PID_METHOD = option('forward_euler', 'backward_euler', 'tustin');
const OUTPUT_TYPE_ALL = option(
  'fixed_point', 'float16', 'float32', 'float64', 'boolean', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32',
);
const ROUNDING = option('floor', 'ceil', 'ceiling', 'zero', 'nearest', 'round', 'convergent', 'simplest');
const OVERFLOW = option('saturate', 'wrap', 'error');

const BASE_SCHEMA: Record<string, Record<string, ParameterKind>> = {
  // Sources
  Constant: { value: numeric, output_type: option('auto', 'float64', 'float32', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'boolean') },
  WaveformGen: { type: option('Sine', 'Square'), amp: number, freq: number, offset: number, phase: number },
  Step: { stepTime: number, initialValue: numeric, finalValue: numeric },

  // Element-wise math and reductions
  Sum: { numInputs: int1 },
  VectorAdd: { numInputs: int1 },
  VectorMul: { numInputs: int1 },
  GAIN: { gain: number },
  PRODUCT: { numInputs: int1, operation: option('multiply', 'divide') },
  Max: { numInputs: int1 },

  // Linear algebra
  MatrixConcat: { axis: { kind: 'integer', min: 0, max: 1 }, mode: option('vector', 'multidimensional'), numInputs: int1 },
  MatrixDiag: { diagMode: option('create', 'extract') },
  IdentityMatrix: { dim: int1 },
  SubMatrix: { rowStart: int1, rowEnd: int1, colStart: int1, colEnd: int1 },

  // Continuous systems
  Integrator: { initialCondition: numeric },
  INTEGRATOR_CONTINUOUS: { initial_condition: numeric },
  STATE_SPACE: {
    A: matrix, B: matrix, C: matrix, D: matrix, x0: vector,
    representation: CONTINUOUS_DISCRETE, sampleTime,
  },
  TRANSFER_FUNCTION: { numerator: vector, denominator: vector, representation: CONTINUOUS_DISCRETE, sampleTime },
  ZERO_POLE_GAIN: { numerator: vector, denominator: vector, representation: CONTINUOUS_DISCRETE, sampleTime },
  ROOT_LOCUS: {
    numerator: vector, denominator: vector, gain: number, maxGain: number,
    simulationType: option('open_loop', 'closed_loop'), sampleTime,
  },
  LAPLACE_TRANSFORM: {
    numerator: vector, denominator: vector, mappingType: option('denominator', 'numerator'), maxDegree: int1,
    defaultDenominator: vector, representation: CONTINUOUS_DISCRETE, sampleTime,
  },

  // Discontinuities
  SATURATION: { lowerLimit: number, upperLimit: number },
  DEADZONE: { lowerLimit: number, upperLimit: number },
  RATE_LIMITER: { risingSlewRate: number, fallingSlewRate: number, initialCondition: number, sampleTime },
  RELAY: { switchOn: number, switchOff: number, onValue: number, offValue: number },

  // Discrete and delay
  DELAY: { delay_length: int0, initial_condition: numeric, sampleTime },
  INTEGRATOR_DISCRETE: { initial_condition: numeric, sample_time: sampleTime, method: option('forward_euler', 'backward_euler', 'tustin') },
  DISCRETE_TRANSFER_FUNCTION: { numerator: vector, denominator: vector, representation: CONTINUOUS_DISCRETE, sampleTime },
  Counter: { maxValue: int1 },
  DISCRETE_IMPULSE: { amplitude: number, delay: int0, sampleTime },
  UNIT_DELAY: { initialCondition: numeric, sampleTime },
  MEMORY: { initialCondition: numeric },

  // Trigonometric (hyperbolic blocks have no parameters)
  SIN: { angle_unit: option('radians', 'degrees') },
  COS: { angle_unit: option('radians', 'degrees') },
  TAN: { angle_unit: option('radians', 'degrees') },
  COT: { angle_unit: option('radians', 'degrees') },
  SEC: { angle_unit: option('radians', 'degrees') },
  COSEC: { angle_unit: option('radians', 'degrees') },
  ASIN: { angle_unit: option('radians', 'degrees') },
  ACOS: { angle_unit: option('radians', 'degrees') },
  ATAN: { angle_unit: option('radians', 'degrees') },
  ACOT: { angle_unit: option('radians', 'degrees') },
  ASEC: { angle_unit: option('radians', 'degrees') },
  ACOSEC: { angle_unit: option('radians', 'degrees') },

  // Control and feedback
  PID_BASIC: {
    mode: option('P', 'PI', 'PD', 'PID'), method: PID_METHOD,
    Kp: number, Ki: number, Kd: number, N: number, min: number, max: number, sampleTime,
  },
  PID_CONTROLLER: {
    mode: option('P', 'PI', 'PD', 'PID'), method: PID_METHOD,
    Kp: number, Ki: number, Kd: number, N: number, beta: number, gamma: number, min: number, max: number, sampleTime,
  },
  SPEED_CONTROLLER: { Kp: number, Ki: number, maxIq: number },
  CURRENT_CONTROLLER_DQ: { Kp_d: number, Ki_d: number, Kp_q: number, Ki_q: number, iMax: number },
  VOLTAGE_REFERENCE_GENERATOR: { frequency: number, amplitude: number },
  FLUX_REFERENCE: { mode: option('constant', 'field_weakening'), value: number },
  FIELD_ORIENTED_CONTROL: { Kp: number, Ki: number },
  ROTOR_POSITION_ESTIMATOR: {
    method: option('Sensorless_SMO', 'Hall_sensor'), Rs: number, Ls: number, psi_m: number, P: positive,
  },

  // Signal processing and observers
  LOW_PASS_FILTER: { fc: positive, sampleTime },
  HIGH_PASS_FILTER: { fc: positive, sampleTime },
  MOVING_AVERAGE: { window_size: int1 },
  ROBOT_VACUUM_COMM: { seed: number },
  ROBOT_VACUUM_DUSTBIN_SENSOR: { seed: number },
  ROBOT_VACUUM_ENCODER: { seed: number },
  ROBOT_VACUUM_ENVIRONMENT: { seed: number },
  ROBOT_VACUUM_LIDAR: { seed: number, dropout_rate: nonnegative },
  ROBOT_VACUUM_LIDAR_SENSOR: { seed: number },
  ROBOT_VACUUM_SLAM: { seed: number },
  DEM_PARTICLE_SYSTEM: { seed: number },
  CFD_SPH_WATER_SOLVER: { seed: number },
  ROBOT_VACUUM_THETA_STAR: { inflation: nonnegative, robot_radius: nonnegative },
  ROBOT_VACUUM_GLOBAL_PLANNER: { inflation: nonnegative, robot_radius: nonnegative },
  WHITE_NOISE: { mean: number, variance: nonnegative, seed: number },
  BAND_LIMITED_NOISE: { mean: number, variance: nonnegative, fc: positive, sampleTime, seed: number },
  KALMAN_FILTER: { A: matrix, B: matrix, C: matrix, Q: matrix, R: matrix, P0: matrix },
  EXTENDED_KALMAN_FILTER: { Q: matrix, R: matrix, P0: matrix, x0: vector },

  // Routing and control flow
  SWITCH: { threshold: number, criteria: option('>', '<', '>=', '<=', '~=0') },
  SWITCH_CASE: { numCases: int1 },
  MUX: { numInputs: int1 },
  DEMUX: { numOutputs: int1 },
  DATA_TYPE_CONVERSION: {
    output_type: OUTPUT_TYPE_ALL, rounding: ROUNDING, overflow: OVERFLOW, wordLength: int1, fractionLength: int0,
  },
  NUMERIC_REPRESENTATION: {
    mode: option('floating_point', 'fixed_point'), output_type: OUTPUT_TYPE_ALL, rounding: ROUNDING, overflow: OVERFLOW,
    wordLength: int1, fractionLength: int0,
  },

  // Logic gates and bitwise
  AND: { numInputs: int1 },
  OR: { numInputs: int1 },
  NAND: { numInputs: int1 },
  NOR: { numInputs: int1 },
  XOR: { numInputs: int1 },
  Register: { bitWidth: int1 },

  // Sequential
  // (no numeric parameters beyond those above)

  // Ports
  Inport: { port_index: int1, value: numeric, dimension: int1 },
  Outport: { port_index: int1, dimension: int1 },

  // Parameters that are a divisor, a count or a grid size in the block equation: 0 is kept in the block and rejected
  // at compile (the factory never replaces it with a default).
  DERIVATIVE: { tau: positive },
  AC_INDUCTION_MOTOR: { J: positive, Ls: positive, Lr: positive, Rr: positive },
  AC_MOTOR_PID_CONTROL: { J: positive, Ls: positive, Lr: positive, Rr: positive },
  IM_FLUX_OBSERVER: { Lr: positive, Rr: positive },
  MTPA_CONTROLLER: { psi_m: positive, P: positive },
  MTPA_FW_MANAGER: { Ld: positive, Lq: nonnegative, P: positive, psi_m: positive },
  VF_SLIP_COMP: { rated_iq: positive },
  SVPWM_CORE: { Vdc: positive },
  SVPWM_MODULATOR: { Vdc: positive },
  SWITCHING_TIME_CALCULATOR: { Vdc: positive },
  MPC_CONTROLLER: { Np: int1, Nc: int1 },
  FUZZY_RULE: { numAntecedents: int1 },
  FUZZY_AND: { numInputs: int1 },
  FUZZY_OR: { numInputs: int1 },
  FUZZY_INFERENCE_SYSTEM: { numInputs: int1, defuzzResolution: { kind: 'integer', min: 2 } },
  FUZZY_PID_CONTROLLER: { numMFs: int1 },
  FUZZY_DEFUZZIFY: { resolution: { kind: 'integer', min: 2 } },
  FUZZY_SURFACE_VIEWER: { resolution: { kind: 'integer', min: 2 } },
  RL_Q_LEARNING_CONTROLLER: { numStates: int1, numActions: int1, seed: int0 },
  ROBOT_VACUUM_BATTERY: { capacity_Ah: positive },
  ROBOT_VACUUM_BOUSTROPHEDON_SWEEP: { spacing: positive },
  ROBOT_VACUUM_CONTINUOUS_ENERGY: { energy_per_meter: nonnegative },
  ROBOT_VACUUM_DIGITAL_TWIN: { motor_L: positive, robot_inertia: positive, wheel_radius: positive, wheel_separation: positive, seed: number },
  ROBOT_VACUUM_DYNAMICS: { robot_mass: positive, wheel_separation: positive },
  ROBOT_VACUUM_KINEMATICS: { wheel_radius: positive },
  ROBOT_VACUUM_MOTOR: { inertia: positive, motor_L: positive, seed: number },
  ROBOT_VACUUM_MOTOR_COMMAND: { wheel_radius: positive },
  ROBOT_VACUUM_ODOMETRY: { encoder_cpr: positive, wheel_separation: positive, seed: number, slip_noise: nonnegative },
  ROBOT_VACUUM_ODOMETRY_SENSOR: { encoder_cpr: positive, wheel_separation: positive },

  // Sinks
  Scope: {
    numSignals: int1, bufferSize: int1, decimation: int1, sampleTime,
    timeRange: option('auto', '1', '2', '5', '10', '30', '60'),
  },
};

const intAny: ParameterKind = { kind: 'integer' };
const P = positive;
const N = nonnegative;
const R = number;

/**
 * XBV-011 / XBV-137: every numeric parameter of every palette block has a kind. Ranges follow the block equation:
 *  - positive: divisors, time constants, masses, inertias, lengths, absolute temperatures and pressures, gas constants;
 *  - nonnegative: rates, damping, friction, resistances and coefficients that are physically 0 or more, but whose value 0
 *    is legitimate (no divisor);
 *  - integer kinds: counts, sizes, tooth counts and seeds;
 *  - number (unbounded): gains, offsets, initial conditions, limits and angles that may be negative or zero.
 * These add to (and never replace) the entries of BASE_SCHEMA.
 */
const EXTRA_SCHEMA: Record<string, Record<string, ParameterKind>> = {
  AC_INDUCTION_MOTOR: { B: N, Lm: N, P, Rs: N },
  AC_MOTOR_PID_CONTROL: { B: N, Kd: R, Ki: R, Kp: R, Lm: N, N: R, P, Rs: N, tl: R, w_ref: R },
  AIR_FRYER_LEARNING_MODEL: {
    K_c: N, K_evap: N, K_f: N, K_h: N, K_loss: N, T_ambient: R, learning_rate: N, sampleTime,
    tau_c: P, tau_f: P, tau_h: P, tau_s: P, theta: R,
  },
  FABRIC_HARMONIC_ANALYZER: { drum_mass: P, suspension_stiffness: N },
  BUS_CREATOR: { Inputs: int1 },
  DOE_MODULE: { maxLayers: int1, neuronsPerLayer: int1 },
  FIELD_WEAKENING: { Ki: R, Kp: R, id_max: R, id_min: R, v_max: R },
  FUZZY_DEFUZZIFY: { range_max: R, range_min: R },
  FUZZY_MF_GAUSSMF: { c: R, sigma: P },
  FUZZY_MF_SIGMF: { a: R, c: R },
  FUZZY_MF_TRAPMF: { a: R, b: R, c: R, d: R },
  FUZZY_MF_TRIMF: { a: R, b: R, c: R },
  FUZZY_PID_CONTROLLER: { Kd_base: R, Ki_base: R, Kp_base: R, N: R, max: R, min: R },
  IM_FLUX_OBSERVER: { Lm: N, P },
  IM_FOC_CONTROL: { Ki_curr: R, Ki_speed: R, Kp_curr: R, Kp_speed: R, Lm: P, Lr: N, P: N, Rr: N, psi_ref: R },
  IM_SCALAR_CONTROL: { boost: R, rated_f: N, v_f_ratio: R },
  INTERP_PRELOOKUP: { NumberOfTableDimensions: int1 },
  LOOKUP_ND: { NumberOfTableDimensions: int1 },
  LMS_ADAPTIVE_FILTER: { lr: N },
  MPC_CONTROLLER: { u_max: R, u_min: R },
  MTPA_CONTROLLER: { Ld: N, Lq: N },
  MTPA_FW_MANAGER: { i_max: R, v_max: R },
  NEURAL_NEURON_LEARNING: { initBias: R, initW1: R, initW2: R, lr: N },
  PWM_GENERATOR: { frequency: P },
  THREE_PHASE_PWM: { frequency: P },
  RL_Q_LEARNING_CONTROLLER: { alpha: N, epsilon: N, gamma: N },
  SENSORLESS_SIX_STEP: { threshold: N },
  SINGLE_PHASE_H_BRIDGE: { Ron: N },
  THREE_PHASE_INVERTER: { Ron: N, Vf: N },
  SVPWM_CORE: { Ts: N },
  SVPWM_GATE_GENERATOR: { Ts: P },
  SVPWM_MODULATOR: { Ts: P },
  VF_SLIP_COMP: { rated_slip: N, v_f_ratio: R },


  // DEM / CFD / power-electronics blocks that joined the canvas palette (XBV-007)
  CFD_DEM_SURROGATE_LEARNER: { learning_rate: N },
  CFD_SPH_WATER_SOLVER: { fluid_density: P, fluid_viscosity: N, num_fluid_particles: int1, sph_smoothing_length: P, sph_stiffness: N },
  DC_VOLTAGE_SOURCE: { voltage: R },
  DEM_BOND_FABRIC: { bond_stiffness: N },
  DEM_CFD_COSIMULATION_INTERFACE: { drag_coeff: N },
  DEM_DRUM: { drum_radius: P, pulsator_speed_ratio: R },
  DEM_FLUID_COUPLING: { drag_coeff: N },
  DEM_HERTZ_CONTACT: { stiffness_normal: N },
  DEM_PARTICLE_SYSTEM: { particle_radius: P },
  SWITCHING_TIME_CALCULATOR: { Ts: N },
  THREE_PHASE_LOAD: { R: P },

  // Robot vacuum
  ROBOT_VACUUM_BATTERY_MONITOR: { drain_rate: N, safety_margin: N },
  ROBOT_VACUUM_CAPACITY_THRESHOLD: { limit: R },
  ROBOT_VACUUM_CLIFF_IR: { cliff_threshold: R },
  ROBOT_VACUUM_COLLISION_AVOID: { collision_dist: N },
  ROBOT_VACUUM_LIDAR_SENSOR: { lidar_max_range: P, lidar_noise_std: N },
  ROBOT_VACUUM_ODOMETRY_SENSOR: { wheel_radius: P },
  ROBOT_VACUUM_SENSOR_FUSION_EKF: { filter_gain: N },
  ROBOT_VACUUM_VELOCITY_PID: { Ki: R, Kp: R },
  ROBOT_VACUUM_BATTERY: { charge_rate: N, nominal_voltage: N, static_draw_A: N },
  ROBOT_VACUUM_COMM: { latency_ms: N, packet_loss_rate: N },
  ROBOT_VACUUM_CONTINUOUS_ENERGY: { safety_margin: N },
  ROBOT_VACUUM_DIGITAL_TWIN: {
    Ki_wheel: R, Kp_wheel: R, encoder_cpr: P, lidar_max_range: P, lidar_noise_std: N, motor_K: N, motor_R: N, robot_mass: P,
  },
  ROBOT_VACUUM_DYNAMICS: { cg_offset: R, robot_inertia: P, wheel_friction: N, wheel_radius: P },
  ROBOT_VACUUM_ENCODER: { encoder_cpr: P, noise_std: N },
  ROBOT_VACUUM_ENVIRONMENT: { lidar_max_range: P, lidar_noise_std: N },
  ROBOT_VACUUM_ERODE_MASK: { radius: N },
  ROBOT_VACUUM_FUSION: { filter_gain: N },
  ROBOT_VACUUM_KINEMATICS: { wheel_separation: P },
  ROBOT_VACUUM_LIDAR: { lidar_max_range: P, lidar_noise_std: N },
  ROBOT_VACUUM_LOCALIZATION: { filter_gain: N },
  ROBOT_VACUUM_MAPPING: { lidar_max_range: P },
  ROBOT_VACUUM_MOTOR: { encoder_cpr: P, encoder_noise_std: N, motor_K: N, motor_R: N },
  ROBOT_VACUUM_MOTOR_COMMAND: { Ki_wheel: R, Kp_wheel: R, wheel_separation: P },
  ROBOT_VACUUM_ODOMETRY: { wheel_radius: P },
  ROBOT_VACUUM_SLAM: { lidar_max_range: P },
  ROBOT_VACUUM_THETA_STAR: { inflation: N },
  ROBOT_VACUUM_WHEEL_CONTROL: { Ki_wheel: R, Kp_wheel: R, V_bat: N },

  // Powertrain (PT_*) blocks are not listed: their factories are registered unwrapped (ptContract), carry their own
  // parameter specs (powertrain/ptSpec.ts: min, max, exclusive bounds) and report BLOCK_RUNTIME_FAULT for text that is not
  // a number or a value outside the range. The properties panel derives its kinds from those specs (XBV-137).
};

/** BASE_SCHEMA and EXTRA_SCHEMA merged per block; a parameter present in both keeps the BASE_SCHEMA kind. */
export const XB_PARAMETER_SCHEMA: Record<string, Record<string, ParameterKind>> = (() => {
  const out: Record<string, Record<string, ParameterKind>> = {};
  for (const [type, params] of Object.entries(EXTRA_SCHEMA)) out[type] = { ...params };
  for (const [type, params] of Object.entries(BASE_SCHEMA)) out[type] = { ...(out[type] ?? {}), ...params };
  return out;
})();

/** The schema kind of a block parameter, or undefined when the parameter is not in the schema. */
export function parameterKind(blockType: string, param: string): ParameterKind | undefined {
  const block = Object.prototype.hasOwnProperty.call(XB_PARAMETER_SCHEMA, blockType) ? XB_PARAMETER_SCHEMA[blockType] : undefined;
  return block && Object.prototype.hasOwnProperty.call(block, param) ? block[param] : undefined;
}
