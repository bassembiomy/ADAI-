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

export const XB_PARAMETER_SCHEMA: Record<string, Record<string, ParameterKind>> = {
  // Sources
  Constant: { value: numeric, output_type: option('auto', 'float64', 'float32', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'boolean') },
  WaveformGen: { type: option('Sine', 'Square'), amp: number, freq: number, offset: number, phase: number },
  Clock: { freq: positive },
  Step: { stepTime: number, initialValue: numeric, finalValue: numeric },

  // Element-wise math and reductions
  Sum: { numInputs: int1 },
  VectorAdd: { numInputs: int1 },
  VectorMul: { numInputs: int1 },
  GAIN: { gain: number },
  PRODUCT: { numInputs: int1, operation: option('multiply', 'divide') },
  Max: { numInputs: int1 },

  // Linear algebra
  MatrixConcat: { axis: { kind: 'integer', min: 0, max: 1 }, numInputs: int1 },
  MatrixDiag: { diagMode: option('create', 'extract') },
  IdentityMatrix: { dim: int1 },
  SubMatrix: { rowStart: int0, rowEnd: int0, colStart: int0, colEnd: int0 },

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
  DELAY: { delay_length: int1, initial_condition: numeric, sampleTime },
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
    method: option('Sensorless_SMO', 'Hall_sensor'), Rs: number, Ls: number, psi_m: number, P: number,
  },

  // Signal processing and observers
  LOW_PASS_FILTER: { fc: positive, sampleTime },
  HIGH_PASS_FILTER: { fc: positive, sampleTime },
  MOVING_AVERAGE: { window_size: int1 },
  WHITE_NOISE: { mean: number, variance: nonnegative },
  BAND_LIMITED_NOISE: { mean: number, variance: nonnegative, fc: positive },
  KALMAN_FILTER: { A: matrix, B: matrix, C: matrix, Q: matrix, R: matrix, P0: matrix },
  EXTENDED_KALMAN_FILTER: { Q: matrix, R: matrix, P0: matrix, x0: vector },

  // Routing and control flow
  SWITCH: { threshold: number, criteria: option('>', '<', '>=', '<=') },
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

  // Sinks
  Scope: {
    numSignals: int1, bufferSize: int1, decimation: int1, sampleTime,
    timeRange: option('auto', '1', '2', '5', '10', '30', '60'),
  },
};

/** The schema kind of a block parameter, or undefined when the parameter is not in the schema. */
export function parameterKind(blockType: string, param: string): ParameterKind | undefined {
  const block = Object.prototype.hasOwnProperty.call(XB_PARAMETER_SCHEMA, blockType) ? XB_PARAMETER_SCHEMA[blockType] : undefined;
  return block && Object.prototype.hasOwnProperty.call(block, param) ? block[param] : undefined;
}
