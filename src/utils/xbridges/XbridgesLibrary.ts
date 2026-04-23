// src/utils/xbridges/XbridgesLibrary.ts

export const XBRIDGES_CATEGORIES = [
  {
    name: 'Sources',
    blocks: [
      { type: 'Constant', label: 'Constant', icon: 'square' },
      { type: 'WaveformGen', label: 'Waveform Gen', icon: 'activity' },
    ]
  },
  {
    name: 'Element-wise Math',
    blocks: [
      { type: 'VectorAdd', label: 'Add', icon: 'plus' },
      { type: 'VectorSub', label: 'Subtract', icon: 'minus' },
      { type: 'VectorMul', label: 'Multiply', icon: 'x' },
      { type: 'VectorDiv', label: 'Divide', icon: 'divide' },
      { type: 'VectorPow', label: 'Power', icon: 'chevron-up' },
      { type: 'UnaryNeg', label: 'Unary Minus', icon: 'minus-circle' },
      { type: 'Abs', label: 'Absolute Value', icon: 'maximize' },
    ]
  },
  {
    name: 'Reductions',
    blocks: [
      { type: 'SumElements', label: 'Sum of Elements', icon: 'sigma' },
      { type: 'Mean', label: 'Mean', icon: 'bar-chart' },
      { type: 'Max', label: 'Max', icon: 'arrow-up' },
    ]
  },
  {
    name: 'Linear Algebra',
    blocks: [
      { type: 'MatrixMul', label: 'Matrix Multiply', icon: 'grid' },
      { type: 'Transpose', label: 'Transpose', icon: 'rotate-cw' },
      { type: 'Inverse', label: 'Inverse', icon: 'refresh-ccw' },
      { type: 'Determinant', label: 'Determinant', icon: 'hash' },
    ]
  },
  {
    name: 'Continuous',
    blocks: [
      { type: 'Integrator', label: 'Integrator', icon: 'integral' },
    ]
  },
  {
    name: 'Logic Gates',
    blocks: [
      { type: 'AND', label: 'AND Gate', icon: 'plus' },
      { type: 'OR', label: 'OR Gate', icon: 'grid' },
      { type: 'NOT', label: 'NOT Gate', icon: 'minus-circle' },
      { type: 'NAND', label: 'NAND Gate', icon: 'plus' },
      { type: 'NOR', label: 'NOR Gate', icon: 'grid' },
      { type: 'XOR', label: 'XOR Gate', icon: 'plus' },
    ]
  },
  {
    name: 'Bitwise',
    blocks: [
      { type: 'BitwiseAND', label: 'Bitwise AND', icon: 'plus' },
      { type: 'BitwiseOR', label: 'Bitwise OR', icon: 'grid' },
      { type: 'BitwiseXOR', label: 'Bitwise XOR', icon: 'plus' },
      { type: 'BitwiseNOT', label: 'Bitwise NOT', icon: 'minus-circle' },
      { type: 'ShiftLeft', label: 'Shift Left', icon: 'chevron-left' },
      { type: 'ShiftRight', label: 'Shift Right', icon: 'chevron-right' },
    ]
  },
  {
    name: 'Sequential',
    blocks: [
      { type: 'DFlipFlop', label: 'D Flip-Flop', icon: 'refresh-ccw' },
      { type: 'JKFlipFlop', label: 'JK Flip-Flop', icon: 'refresh-ccw' },
      { type: 'Register', label: 'Register', icon: 'box' },
      { type: 'Counter', label: 'Counter', icon: 'trending-up' },
      { type: 'Clock', label: 'Clock', icon: 'rotate-cw' },
    ]
  },
  {
    name: 'Sinks',
    blocks: [
      { type: 'Scope', label: 'Scope', icon: 'monitor' },
    ]
  },
  {
    name: 'Ports',
    blocks: [
      { type: 'Inport', label: 'Inport', icon: 'log-in' },
      { type: 'Outport', label: 'Outport', icon: 'log-out' },
    ]
  },
  {
    name: 'DC-AC Inverters',
    blocks: [
      { type: 'THREE_PHASE_INVERTER', label: '3-Phase Inverter', icon: 'zap' },
      { type: 'SINGLE_PHASE_H_BRIDGE', label: 'H-Bridge', icon: 'zap' },
    ]
  },
  {
    name: 'PWM Generators',
    blocks: [
      { type: 'PWM_GENERATOR', label: 'PWM Generator', icon: 'layers' },
      { type: 'THREE_PHASE_PWM', label: '3-Phase PWM', icon: 'layers' },
      { type: 'SIX_STEP_COMMUTATION', label: '6-Step Commutation', icon: 'settings' },
    ]
  },
  {
    name: 'Reference Frame Transformations',
    blocks: [
      { type: 'CLARKE_TRANSFORM', label: 'Clarke Transform', icon: 'refresh-ccw' },
      { type: 'PARK_TRANSFORM', label: 'Park Transform', icon: 'refresh-ccw' },
      { type: 'INVERSE_PARK', label: 'Inverse Park', icon: 'refresh-ccw' },
      { type: 'INVERSE_CLARKE', label: 'Inverse Clarke', icon: 'refresh-ccw' },
    ]
  },
  {
    name: 'FOC Control Blocks',
    blocks: [
      { type: 'CURRENT_CONTROLLER_DQ', label: 'DQ Current Controller', icon: 'cpu' },
      { type: 'SPEED_CONTROLLER', label: 'Speed Controller', icon: 'cpu' },
      { type: 'PID_CONTROLLER', label: 'PID Controller', icon: 'cpu' },
      { type: 'FLUX_REFERENCE', label: 'Flux Reference', icon: 'activity' },
      { type: 'ROTOR_POSITION_ESTIMATOR', label: 'Rotor Estimator', icon: 'bar-chart' },
      { type: 'VOLTAGE_REFERENCE_GENERATOR', label: 'Voltage Ref Gen', icon: 'activity' },
    ]
  },
  {
    name: 'SVPWM Core',
    blocks: [
      { type: 'SVPWM_CORE', label: 'SVPWM Core', icon: 'activity' },
      { type: 'SECTOR_SELECTOR', label: 'Sector Selector', icon: 'rotate-cw' },
      { type: 'SWITCHING_TIME_CALCULATOR', label: 'Switching Time Calc', icon: 'activity' },
    ]
  },
  {
    name: 'Gate Signal Generation',
    blocks: [
      { type: 'SVPWM_GATE_GENERATOR', label: 'SVPWM Gate Gen', icon: 'activity' },
    ]
  },
  {
    name: 'Advanced SVPWM',
    blocks: [
      { type: 'ZERO_SEQUENCE_INJECTION', label: 'Zero Sequence Injection', icon: 'plus' },
      { type: 'SVPWM_MODULATOR', label: 'SVPWM Modulator', icon: 'activity' },
    ]
  },
  {
    name: 'Control Systems',
    blocks: [
      { type: 'PID_CONTROLLER', label: 'PID Controller (Ind)', icon: 'settings' },
      { type: 'PID_BASIC', label: 'PID Controller (Signal)', icon: 'settings' },
      { type: 'INTEGRATOR_CONTINUOUS', label: 'Continuous Integrator', icon: 'trending-up' },
      { type: 'INTEGRATOR_DISCRETE', label: 'Discrete Integrator', icon: 'trending-up' },
    ]
  },
  {
    name: 'Memory & Delay',
    blocks: [
      { type: 'DELAY', label: 'Delay', icon: 'trending-up' },
    ]
  },
  {
    name: 'Signal Routing',
    blocks: [
      { type: 'MUX', label: 'Mux', icon: 'layers' },
      { type: 'DEMUX', label: 'Demux', icon: 'grid' },
    ]
  },
  {
    name: 'Math Operations',
    blocks: [
      { type: 'GAIN', label: 'Gain', icon: 'maximize' },
      { type: 'PRODUCT', label: 'Product', icon: 'x' },
    ]
  },
  {
    name: 'Logic & Control Flow',
    blocks: [
      { type: 'SWITCH', label: 'Switch', icon: 'settings' },
      { type: 'IF_ELSE', label: 'If-Else', icon: 'settings' },
      { type: 'SWITCH_CASE', label: 'Switch-Case', icon: 'settings' },
    ]
  },
  {
    name: 'Signal Management',
    blocks: [
      { type: 'DATA_TYPE_CONVERSION', label: 'Type Conversion', icon: 'hash' },
      { type: 'TERMINATOR', label: 'Terminator', icon: 'zap-off' },
    ]
  },
  {
    name: 'Trigonometric Functions',
    blocks: [
      { type: 'SIN', label: 'Sine', icon: 'trending-up' },
      { type: 'COS', label: 'Cosine', icon: 'trending-up' },
      { type: 'TAN', label: 'Tangent', icon: 'trending-up' },
      { type: 'COT', label: 'Cotangent', icon: 'trending-up' },
      { type: 'SEC', label: 'Secant', icon: 'trending-up' },
      { type: 'COSEC', label: 'Cosecant', icon: 'trending-up' },
    ]
  },
  {
    name: 'Linear Systems',
    blocks: [
      { type: 'TRANSFER_FUNCTION', label: 'Transfer Function', icon: 'activity' },
      { type: 'STATE_SPACE', label: 'State-Space', icon: 'activity' },
      { type: 'ZERO_POLE_GAIN', label: 'Zero-Pole-Gain', icon: 'activity' },
      { type: 'DISCRETE_TRANSFER_FUNCTION', label: 'Discrete TF', icon: 'activity' },
    ]
  },
  {
    name: 'Noise Sources',
    blocks: [
      { type: 'WHITE_NOISE', label: 'White Noise', icon: 'wind' },
      { type: 'BAND_LIMITED_NOISE', label: 'Band-Limited Noise', icon: 'wind' },
    ]
  },
  {
    name: 'Basic Filters',
    blocks: [
      { type: 'LOW_PASS_FILTER', label: 'Low-Pass Filter', icon: 'filter' },
      { type: 'HIGH_PASS_FILTER', label: 'High-Pass Filter', icon: 'filter' },
      { type: 'MOVING_AVERAGE', label: 'Moving Average', icon: 'filter' },
    ]
  },
  {
    name: 'Estimation & Observers',
    blocks: [
      { type: 'KALMAN_FILTER', label: 'Kalman Filter', icon: 'eye' },
      { type: 'EXTENDED_KALMAN_FILTER', label: 'Extended Kalman', icon: 'eye' },
    ]
  },
  {
    name: 'Advanced Control & MPC',
    blocks: [
      { type: 'MPC_CONTROLLER', label: 'MPC Controller', icon: 'cpu' }
    ]
  }
];
