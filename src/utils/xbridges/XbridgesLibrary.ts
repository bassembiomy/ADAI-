// src/utils/xbridges/XbridgesLibrary.ts

export const XBRIDGES_CATEGORIES = [
  {
    name: 'DEM & Particle Simulation',
    blocks: [
      { type: 'DEM_WASHING_MACHINE_TWIN', label: 'Washing Machine Twin', icon: 'rotate-cw' },
      { type: 'DEM_DRUM', label: 'DEM Drum Geometry', icon: 'rotate-cw' },
      { type: 'DEM_PARTICLE_SYSTEM', label: 'DEM Particle System', icon: 'layers' },
      { type: 'DEM_HERTZ_CONTACT', label: 'Hertz Contact Model', icon: 'activity' },
      { type: 'DEM_BOND_FABRIC', label: 'Fabric Bond Model', icon: 'network' },
      { type: 'DEM_FLUID_COUPLING', label: 'Fluid Phase Coupling', icon: 'wind' },
      { type: 'CFD_SPH_WATER_SOLVER', label: 'CFD SPH Water Solver', icon: 'wind' },
      { type: 'DEM_CFD_COSIMULATION_INTERFACE', label: 'CFD-DEM 2-Way Coupling', icon: 'refresh-ccw' },
      { type: 'FABRIC_HARMONIC_ANALYZER', label: 'Fabric Harmonic Analyzer', icon: 'activity' }
    ]
  },
  {
    name: 'Robot Vacuum Learning',
    blocks: [
      { type: 'ROBOT_VACUUM_LIDAR_SENSOR', label: 'Lidar Sensor', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_ODOMETRY_SENSOR', label: 'Odometry Sensor', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_CLIFF_IR', label: 'Cliff IR Sensor', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_DUSTBIN_SENSOR', label: 'Dustbin Sensor', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_MOTOR_CURRENT', label: 'Motor Current', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_SENSOR_FUSION_EKF', label: 'EKF Localization', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_ROOM_SEGMENTATION', label: 'Room Segmentation', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_SEMANTIC_MAP', label: 'Semantic Zone Map', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_COVERAGE_PLANNER', label: 'Coverage Planner', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_ROOM_SCHEDULER', label: 'Room Scheduler', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_BATTERY_MONITOR', label: 'Battery Monitor', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_GOAL_MANAGER', label: 'Goal Manager', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_3D_VIZ_COLORS', label: '3D Visualization (Room Colors)', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_WAYPOINT_GEN', label: 'Waypoint Generation', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_COLLISION_AVOID', label: 'Collision Avoidance', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_SURFACE_ADAPTER', label: 'Surface Adapter', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_CLIFF_HALT', label: 'Cliff Halt Logic', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_VELOCITY_PID', label: 'Velocity PID', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_MODE_SUPERVISOR', label: 'Mode Supervisor', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_BUMPER_SENSOR', label: 'Bumper Sensor', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_SIDE_BRUSH', label: 'Side Brush Model', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_SUCTION_PWM', label: 'Variable Suction', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_TERRAIN_MODEL', label: 'Terrain Model', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_COLLISION_MESH', label: 'Collision Mesh', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_DOCK_BEACON', label: 'Dock Station (Beacon)', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_CAPACITY_THRESHOLD', label: 'Capacity Threshold', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_HALT_ALERT', label: 'Halt & Alert State', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_DOCK_DETECT', label: 'Dock Detect Logic', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_RESUME_SCHEDULER', label: 'Resume Scheduler', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_3D_SCENE_VIEW', label: '3D Scene View', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_FURNITURE_MESH', label: 'Furniture Mesh 3D', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_DIRT_DENSITY', label: 'Dirt Density Map', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_ROOM_ZONE_COLORS', label: 'Room Zone Colors', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_COVERAGE_HEATMAP', label: 'Coverage Heatmap', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_DOCK_ICON', label: 'Dock Station Icon', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_BATTERY_HUD', label: 'Battery HUD', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_DUSTBIN_HUD', label: 'Dustbin Level HUD', icon: 'graduation-cap' }
    ]
  },
  {
    name: 'Navigation & Autonomous',
    blocks: [
      { type: 'ROBOT_VACUUM_BOUSTROPHEDON_SWEEP', label: 'Boustrophedon Sweep', icon: 'navigation' },
      { type: 'ROBOT_VACUUM_ERODE_MASK', label: 'Room Mask Erosion', icon: 'crop' },
      { type: 'ROBOT_VACUUM_DOOR_TRACKER', label: 'Entry Door Tracker', icon: 'log-in' },
      { type: 'ROBOT_VACUUM_DOOR_CROSSING', label: 'Door Crossing Detector', icon: 'check-square' },
      { type: 'ROBOT_VACUUM_CONTINUOUS_ENERGY', label: 'Continuous Energy Monitor', icon: 'battery-charging' },
      { type: 'ROBOT_VACUUM_TOPOLOGY_RETURN', label: 'Topology Return Planner', icon: 'git-branch' },
      { type: 'ROBOT_VACUUM_THETA_STAR', label: 'Theta* Path Planner', icon: 'activity' }
    ]
  },
  {
    name: 'Learning Models',
    blocks: [
      { type: 'AC_MOTOR_PID_CONTROL', label: 'AC Motor PID Control', icon: 'graduation-cap' },
      { type: 'LMS_ADAPTIVE_FILTER', label: 'LMS Adaptive Filter', icon: 'graduation-cap' },
      { type: 'NEURAL_NEURON_LEARNING', label: 'Neural Neuron Learner', icon: 'graduation-cap' },
      { type: 'RL_Q_LEARNING_CONTROLLER', label: 'RL Q-Learning Agent', icon: 'graduation-cap' },
      { type: 'CFD_DEM_SURROGATE_LEARNER', label: 'CFD-DEM Surrogate Learner', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_DIGITAL_TWIN', label: 'Robot Vacuum Twin (Single)', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_DYNAMICS', label: 'Robot Vacuum Dynamics', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_MOTOR', label: 'Robot Vacuum Motor', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_ODOMETRY', label: 'Robot Vacuum Odometry', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_FUSION', label: 'Robot Vacuum Fusion', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_SLAM', label: 'Robot Vacuum SLAM Map', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_NAV', label: 'Robot Vacuum Navigation', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_KINEMATICS', label: 'Robot Vacuum Kinematics', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_WHEEL_CONTROL', label: 'Robot Wheel Speed PI', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_ENVIRONMENT', label: 'Robot Vacuum Environment', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_BATTERY', label: 'Robot Battery System', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_COMM', label: 'Robot Communication Link', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_ENCODER', label: 'Robot Wheel Encoder', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_LIDAR', label: 'Robot LiDAR Sensor', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_LOCALIZATION', label: 'Robot Localization (EKF)', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_MAPPING', label: 'Robot Mapping Grid', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_COVERAGE', label: 'Robot Coverage Planner', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_GLOBAL_PLANNER', label: 'Robot Global Path Planner', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_OBSTACLE_AVOIDANCE', label: 'Robot Obstacle Avoidance', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_MOTION_CONTROLLER', label: 'Robot Motion Controller', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_MOTOR_COMMAND', label: 'Robot Motor Command Gen', icon: 'graduation-cap' },
      { type: 'ROBOT_VACUUM_VISUALIZATION', label: 'Robot Visualization Twin', icon: 'graduation-cap' }
    ]
  },
  {
    name: 'Sources',
    blocks: [
      { type: 'Constant', label: 'Constant', icon: 'square' },
      { type: 'WaveformGen', label: 'Waveform Gen', icon: 'activity' },
      { type: 'Step', label: 'Step', icon: 'trending-up' }
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
      { type: 'DELAY', label: 'Delay (Solver Substeps)', icon: 'database' },
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
      { type: 'NUMERIC_REPRESENTATION', label: 'Numeric Rep', icon: 'bar-chart' },
      { type: 'TERMINATOR', label: 'Terminator', icon: 'zap-off' },
    ]
  },
  {
    name: 'Trigonometric & Hyperbolic Functions',
    blocks: [
      { type: 'SIN', label: 'Sine', icon: 'trending-up' },
      { type: 'COS', label: 'Cosine', icon: 'trending-up' },
      { type: 'TAN', label: 'Tangent', icon: 'trending-up' },
      { type: 'COT', label: 'Cotangent', icon: 'trending-up' },
      { type: 'SEC', label: 'Secant', icon: 'trending-up' },
      { type: 'COSEC', label: 'Cosecant', icon: 'trending-up' },
      { type: 'ASIN', label: 'Arcsine', icon: 'trending-up' },
      { type: 'ACOS', label: 'Arccosine', icon: 'trending-up' },
      { type: 'ATAN', label: 'Arctangent', icon: 'trending-up' },
      { type: 'ACOT', label: 'Arccotangent', icon: 'trending-up' },
      { type: 'ASEC', label: 'Arcsecant', icon: 'trending-up' },
      { type: 'ACOSEC', label: 'Arccosecant', icon: 'trending-up' },
      { type: 'SINH', label: 'Hyperbolic Sine', icon: 'trending-up' },
      { type: 'COSH', label: 'Hyperbolic Cosine', icon: 'trending-up' },
      { type: 'TANH', label: 'Hyperbolic Tangent', icon: 'trending-up' },
      { type: 'COTH', label: 'Hyperbolic Cotangent', icon: 'trending-up' },
      { type: 'SECH', label: 'Hyperbolic Secant', icon: 'trending-up' },
      { type: 'COSECH', label: 'Hyperbolic Cosecant', icon: 'trending-up' },
      { type: 'ASINH', label: 'Inverse Hyperbolic Sine', icon: 'trending-up' },
      { type: 'ACOSH', label: 'Inverse Hyperbolic Cosine', icon: 'trending-up' },
      { type: 'ATANH', label: 'Inverse Hyperbolic Tangent', icon: 'trending-up' },
      { type: 'ACOTH', label: 'Inverse Hyperbolic Cotangent', icon: 'trending-up' },
      { type: 'ASECH', label: 'Inverse Hyperbolic Secant', icon: 'trending-up' },
      { type: 'ACOSECH', label: 'Inverse Hyperbolic Cosecant', icon: 'trending-up' }
    ]
  },
  {
    name: 'Linear Systems',
    blocks: [
      { type: 'TRANSFER_FUNCTION', label: 'Transfer Function', icon: 'activity' },
      { type: 'STATE_SPACE', label: 'State-Space', icon: 'activity' },
      { type: 'ZERO_POLE_GAIN', label: 'Zero-Pole-Gain', icon: 'activity' },
      { type: 'DISCRETE_TRANSFER_FUNCTION', label: 'Discrete TF', icon: 'activity' },
      { type: 'ROOT_LOCUS', label: 'Root Locus Plotter', icon: 'activity' },
      { type: 'LAPLACE_TRANSFORM', label: 'Laplace Transform', icon: 'activity' }
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
      { type: 'DISCRETE_IMPULSE', label: 'Discrete Impulse', icon: 'zap' },
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
  },
  {
    name: 'Analysis & DOE',
    blocks: [
      { type: 'DOE_MODULE', label: 'DOE Module', icon: 'bar-chart' }
    ]
  },
  {
    name: 'Fuzzy Logic',
    blocks: [
      { type: 'FUZZY_MF_TRIMF', label: 'Triangular MF', icon: 'activity' },
      { type: 'FUZZY_MF_TRAPMF', label: 'Trapezoidal MF', icon: 'activity' },
      { type: 'FUZZY_MF_GAUSSMF', label: 'Gaussian MF', icon: 'activity' },
      { type: 'FUZZY_MF_SIGMF', label: 'Sigmoid MF', icon: 'activity' },
      { type: 'FUZZY_AND', label: 'Fuzzy AND (T-Norm)', icon: 'plus' },
      { type: 'FUZZY_OR', label: 'Fuzzy OR (S-Norm)', icon: 'grid' },
      { type: 'FUZZY_NOT', label: 'Fuzzy NOT', icon: 'minus-circle' },
      { type: 'FUZZY_RULE', label: 'Fuzzy Rule', icon: 'settings' },
      { type: 'FUZZY_DEFUZZIFY', label: 'Defuzzifier', icon: 'filter' }
    ]
  },
  {
    name: 'Fuzzy Control Systems',
    blocks: [
      { type: 'FUZZY_INFERENCE_SYSTEM', label: 'Fuzzy Inference (FIS)', icon: 'cpu' },
      { type: 'FUZZY_PID_CONTROLLER', label: 'Fuzzy PID Controller', icon: 'cpu' },
      { type: 'FUZZY_SURFACE_VIEWER', label: 'Control Surface Viewer', icon: 'bar-chart' }
    ]
  }
];
