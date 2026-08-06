export type XBSignalShape = 'scalar' | 'vector' | 'matrix';

export type XBTargetRequirement = 'math-library';

/**
 * The explicit execution contract for one X-Bridges block type.
 *
 * `codegen` is intentionally opt-in: types missing from this registry are
 * unsupported by the embedded pipeline.
 */
export interface XBBlockCapability {
  codegen: boolean;
  directFeedthrough: boolean;
  shapes: readonly XBSignalShape[];
  /** Optional direction-specific shapes where a block's ports differ. */
  inputShapes?: readonly XBSignalShape[];
  outputShapes?: readonly XBSignalShape[];
  reason?: string;
  requiredTargetCapabilities?: readonly XBTargetRequirement[];
  /** Stable executable interpreter conformance cases. */
  interpreterConformanceCaseIds?: readonly string[];
  /** Stable executable strict-C99 conformance cases. */
  cConformanceCaseIds?: readonly string[];
}

export const XB_INTERPRETER_CONFORMANCE_CASE_IDS = [
  'T10-INT-VECTOR-ELEMENTWISE', 'T10-INT-MATRIX-OPS', 'T10-INT-PID-BASIC',
  'T10-INT-DISCRETE-REALIZATION', 'T10-INT-TRANSFORMS',
  'T10-INT-LOGIC-BITWISE', 'T10-INT-SIGNAL-ROUTING', 'T10-INT-TRIGONOMETRY',
  'T10-INT-DISCONTINUOUS', 'T14-INT-DISCONTINUOUS',
  'T14-INT-CORE-DIRECT', 'T14-INT-SHAPED-CONSTANT',
  'T14-INT-STATEFUL', 'T14-INT-CONTINUOUS',
] as const;

export const XB_C_CONFORMANCE_CASE_IDS = [
  'T10-C99-VECTOR-MATRIX', 'T10-C99-PID-BASIC', 'T10-C99-DISCRETE-REALIZATION',
  'T10-C99-TRANSFORMS', 'T10-C99-LOGIC-BITWISE', 'T10-C99-SIGNAL-ROUTING', 'T10-C99-TRIGONOMETRY',
  'T10-C99-DISCONTINUOUS', 'T14-C99-DISCONTINUOUS',
  'T14-C99-CORE-DIRECT', 'T14-C99-SHAPED-CONSTANT',
  'T14-C99-STATEFUL', 'T14-C99-CONTINUOUS',
] as const;

export interface XBConformanceCoverage {
  readonly blockType: string;
  readonly inputShapes: readonly XBSignalShape[];
  readonly outputShapes: readonly XBSignalShape[];
}

const scalarCoverage = (blockType: string): XBConformanceCoverage => ({
  blockType, inputShapes: ['scalar'], outputShapes: ['scalar'],
});

const shapedCoverage = (
  blockType: string,
  inputShapes: readonly XBSignalShape[],
  outputShapes: readonly XBSignalShape[] = inputShapes,
): XBConformanceCoverage => ({ blockType, inputShapes, outputShapes });

const CORE_SCALAR_COVERAGE: readonly XBConformanceCoverage[] = [
  shapedCoverage('Constant', [], ['scalar']),
  shapedCoverage('Inport', ['scalar'], ['scalar']),
  shapedCoverage('Outport', ['scalar'], ['scalar']),
  ...['Sum', 'SUM_JUNCTION', 'GAIN', 'PRODUCT', 'UnaryNeg', 'Abs',
    'DATA_TYPE_CONVERSION', 'NUMERIC_REPRESENTATION']
    .map(scalarCoverage),
  shapedCoverage('TERMINATOR', ['scalar'], []),
];

const LOGIC_BITWISE_COVERAGE: readonly XBConformanceCoverage[] =
  ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'BitwiseAND', 'BitwiseOR', 'BitwiseXOR', 'BitwiseNOT', 'ShiftLeft', 'ShiftRight']
    .map(scalarCoverage);

const SIGNAL_ROUTING_COVERAGE: readonly XBConformanceCoverage[] =
  ['SWITCH', 'MUX', 'DEMUX', 'IF_ELSE']
    .map((type) => shapedCoverage(type, ['scalar', 'vector', 'matrix']));

const TRIGONOMETRY_COVERAGE: readonly XBConformanceCoverage[] = [
  'SIN', 'COS', 'TAN', 'COT', 'SEC', 'COSEC', 'ASIN', 'ACOS', 'ATAN',
  'ACOT', 'ASEC', 'ACOSEC', 'SINH', 'COSH', 'TANH', 'COTH', 'SECH',
  'COSECH', 'ASINH', 'ACOSH', 'ATANH', 'ACOTH', 'ASECH', 'ACOSECH',
].map(scalarCoverage);

const VECTOR_COVERAGE: readonly XBConformanceCoverage[] =
  ['VectorAdd', 'VectorSub', 'VectorMul', 'VectorDiv']
    .map((type) => shapedCoverage(type, ['vector']));

const MATRIX_COVERAGE: readonly XBConformanceCoverage[] = [
  ...['MatrixMul', 'Transpose', 'MatrixConcat', 'SubMatrix', 'MatrixSolve']
    .map((type) => shapedCoverage(type, ['matrix'])),
  shapedCoverage('MatrixDiag', ['vector'], ['matrix']),
];

const TRANSFORM_COVERAGE: readonly XBConformanceCoverage[] =
  ['CLARKE_TRANSFORM', 'PARK_TRANSFORM', 'INVERSE_PARK', 'INVERSE_CLARKE']
    .map(scalarCoverage);

const DISCONTINUOUS_COVERAGE: readonly XBConformanceCoverage[] = [
  scalarCoverage('SATURATION'),
  scalarCoverage('DEADZONE'),
  scalarCoverage('RATE_LIMITER'),
  scalarCoverage('RELAY'),
];

export const XB_INTERPRETER_CONFORMANCE_CASES: Readonly<Record<
string, readonly XBConformanceCoverage[]
>> = Object.freeze({
  'T10-INT-VECTOR-ELEMENTWISE': VECTOR_COVERAGE,
  'T10-INT-MATRIX-OPS': MATRIX_COVERAGE,
  'T10-INT-PID-BASIC': [scalarCoverage('PID_BASIC')],
  'T10-INT-DISCRETE-REALIZATION': [
    shapedCoverage('DISCRETE_TRANSFER_FUNCTION', ['vector']),
    shapedCoverage('STATE_SPACE', ['vector']),
  ],
  'T10-INT-TRANSFORMS': TRANSFORM_COVERAGE,
  'T10-INT-LOGIC-BITWISE': LOGIC_BITWISE_COVERAGE,
  'T10-INT-SIGNAL-ROUTING': SIGNAL_ROUTING_COVERAGE,
  'T10-INT-TRIGONOMETRY': TRIGONOMETRY_COVERAGE,
  'T10-INT-DISCONTINUOUS': DISCONTINUOUS_COVERAGE,
  'T14-INT-DISCONTINUOUS': DISCONTINUOUS_COVERAGE,
  'T14-INT-CORE-DIRECT': CORE_SCALAR_COVERAGE,
  'T14-INT-SHAPED-CONSTANT': [
    shapedCoverage('Constant', [], ['vector', 'matrix']),
    shapedCoverage('TERMINATOR', ['vector', 'matrix'], []),
  ],
  'T14-INT-STATEFUL': [
    scalarCoverage('UNIT_DELAY'), scalarCoverage('MEMORY'),
    scalarCoverage('INTEGRATOR_DISCRETE'),
    shapedCoverage('WHITE_NOISE', [], ['scalar']),
    shapedCoverage('BAND_LIMITED_NOISE', [], ['scalar']),
  ],
  'T14-INT-CONTINUOUS': [
    scalarCoverage('DELAY'), scalarCoverage('INTEGRATOR_CONTINUOUS'),
    scalarCoverage('Integrator'),
  ],
});

export const XB_C_CONFORMANCE_CASES: Readonly<Record<
string, readonly XBConformanceCoverage[]
>> = Object.freeze({
  'T10-C99-VECTOR-MATRIX': [...VECTOR_COVERAGE, ...MATRIX_COVERAGE],
  'T10-C99-PID-BASIC': [scalarCoverage('PID_BASIC')],
  'T10-C99-DISCRETE-REALIZATION': [
    shapedCoverage('DISCRETE_TRANSFER_FUNCTION', ['vector']),
    shapedCoverage('STATE_SPACE', ['vector']),
  ],
  'T10-C99-TRANSFORMS': TRANSFORM_COVERAGE,
  'T10-C99-LOGIC-BITWISE': LOGIC_BITWISE_COVERAGE,
  'T10-C99-SIGNAL-ROUTING': SIGNAL_ROUTING_COVERAGE,
  'T10-C99-TRIGONOMETRY': TRIGONOMETRY_COVERAGE,
  'T10-C99-DISCONTINUOUS': DISCONTINUOUS_COVERAGE,
  'T14-C99-DISCONTINUOUS': DISCONTINUOUS_COVERAGE,
  'T14-C99-CORE-DIRECT': CORE_SCALAR_COVERAGE,
  'T14-C99-SHAPED-CONSTANT': [
    shapedCoverage('Constant', [], ['vector', 'matrix']),
    shapedCoverage('TERMINATOR', ['vector', 'matrix'], []),
  ],
  'T14-C99-STATEFUL': [
    scalarCoverage('UNIT_DELAY'), scalarCoverage('MEMORY'),
    scalarCoverage('INTEGRATOR_DISCRETE'),
    shapedCoverage('WHITE_NOISE', [], ['scalar']),
    shapedCoverage('BAND_LIMITED_NOISE', [], ['scalar']),
  ],
  'T14-C99-CONTINUOUS': [
    scalarCoverage('DELAY'), scalarCoverage('INTEGRATOR_CONTINUOUS'),
    scalarCoverage('Integrator'),
  ],
});

type XBCodegenCapability = Omit<XBBlockCapability, 'codegen'> & {
  codegen: true;
};

type XBHostOnlyCapability = Omit<XBBlockCapability, 'codegen' | 'reason'> & {
  codegen: false;
  reason: string;
};

const scalar: readonly XBSignalShape[] = ['scalar'];
const allShapes: readonly XBSignalShape[] = ['scalar', 'vector', 'matrix'];
const vectorOrMatrix: readonly XBSignalShape[] = ['vector', 'matrix'];

const direct = (
  shapes: readonly XBSignalShape[] = allShapes,
  requiredTargetCapabilities?: readonly XBTargetRequirement[],
  interpreterConformanceCaseIds: readonly string[] = ['T14-INT-CORE-DIRECT'],
  cConformanceCaseIds: readonly string[] = ['T14-C99-CORE-DIRECT'],
  directionalShapes: Pick<XBBlockCapability, 'inputShapes' | 'outputShapes'> = {},
): XBCodegenCapability => ({
  codegen: true,
  directFeedthrough: true,
  shapes,
  requiredTargetCapabilities,
  interpreterConformanceCaseIds,
  cConformanceCaseIds,
  ...directionalShapes,
});

const stateful = (
  shapes: readonly XBSignalShape[] = allShapes,
  requiredTargetCapabilities?: readonly XBTargetRequirement[],
  interpreterConformanceCaseIds: readonly string[] = ['T14-INT-STATEFUL'],
  cConformanceCaseIds: readonly string[] = ['T14-C99-STATEFUL'],
  directionalShapes: Pick<XBBlockCapability, 'inputShapes' | 'outputShapes'> = {},
): XBCodegenCapability => ({
  codegen: true,
  directFeedthrough: false,
  shapes,
  requiredTargetCapabilities,
  interpreterConformanceCaseIds,
  cConformanceCaseIds,
  ...directionalShapes,
});

const hostOnly = (reason: string): XBHostOnlyCapability => ({
  codegen: false,
  directFeedthrough: false,
  shapes: allShapes,
  reason,
});

const hostOnlySet = (
  types: readonly string[],
  reason: string,
): Record<string, XBHostOnlyCapability> => Object.fromEntries(
  types.map((type) => [type, hostOnly(reason)]),
);

const UNCLASSIFIED_HOST_ONLY = hostOnlySet([
  'DFlipFlop', 'JKFlipFlop', 'Register', 'Counter', 'Clock', 'WaveformGen',
  'Inverse', 'Determinant', 'Subsystem', 'PWM_GENERATOR', 'THREE_PHASE_PWM',
  'SIX_STEP_COMMUTATION', 'SENSORLESS_SIX_STEP', 'THREE_PHASE_INVERTER',
  'SINGLE_PHASE_H_BRIDGE', 'VOLTAGE_REFERENCE_GENERATOR',
  'FIELD_ORIENTED_CONTROL', 'CURRENT_CONTROLLER_DQ', 'DOE_MODEL',
  'SPEED_CONTROLLER', 'FLUX_REFERENCE', 'ROTOR_POSITION_ESTIMATOR',
  'SVPWM_CORE', 'SECTOR_SELECTOR', 'SWITCHING_TIME_CALCULATOR',
  'SVPWM_GATE_GENERATOR', 'ZERO_SEQUENCE_INJECTION', 'SVPWM_MODULATOR',
  'SWITCH_CASE', 'INTEGRATOR', 'DERIVATIVE', 'TRANSFER_FUNCTION',
  'ZERO_POLE_GAIN', 'LAPLACE_TRANSFORM', 'DISCRETE_IMPULSE', 'KALMAN_FILTER',
  'EXTENDED_KALMAN_FILTER', 'MPC_CONTROLLER', 'DOE_MODULE',
  'AC_INDUCTION_MOTOR', 'IM_SCALAR_CONTROL', 'IM_FOC_CONTROL',
  'IM_FLUX_OBSERVER', 'VF_SLIP_COMP', 'FIELD_WEAKENING', 'MTPA_CONTROLLER',
  'MTPA_FW_MANAGER', 'AC_MOTOR_PID_CONTROL', 'NEURAL_NEURON_LEARNING',
  'RL_Q_LEARNING_CONTROLLER', 'AIR_FRYER_LEARNING_MODEL',
  'ROBOT_VACUUM_BATTERY', 'ROBOT_VACUUM_COMM',
  'ROBOT_VACUUM_BOUSTROPHEDON_SWEEP', 'ROBOT_VACUUM_ERODE_MASK',
  'ROBOT_VACUUM_DOOR_TRACKER', 'ROBOT_VACUUM_DOOR_CROSSING',
  'ROBOT_VACUUM_CONTINUOUS_ENERGY', 'ROBOT_VACUUM_TOPOLOGY_RETURN',
  'ROBOT_VACUUM_THETA_STAR', 'ROBOT_VACUUM_DIGITAL_TWIN',
  'ROBOT_VACUUM_MOTOR', 'ROBOT_VACUUM_DYNAMICS',
  'ROBOT_VACUUM_ENVIRONMENT', 'ROBOT_VACUUM_ODOMETRY',
  'ROBOT_VACUUM_FUSION', 'ROBOT_VACUUM_SLAM', 'ROBOT_VACUUM_NAV',
  'ROBOT_VACUUM_KINEMATICS', 'ROBOT_VACUUM_WHEEL_CONTROL',
  'ROBOT_VACUUM_ENCODER', 'ROBOT_VACUUM_LIDAR',
  'ROBOT_VACUUM_LOCALIZATION', 'ROBOT_VACUUM_MAPPING',
  'ROBOT_VACUUM_COVERAGE', 'ROBOT_VACUUM_GLOBAL_PLANNER',
  'ROBOT_VACUUM_OBSTACLE_AVOIDANCE', 'ROBOT_VACUUM_MOTION_CONTROLLER',
  'ROBOT_VACUUM_MOTOR_COMMAND', 'ROBOT_VACUUM_VISUALIZATION',
  'ROBOT_VACUUM_LIDAR_SENSOR', 'ROBOT_VACUUM_ODOMETRY_SENSOR',
  'ROBOT_VACUUM_CLIFF_IR', 'ROBOT_VACUUM_DUSTBIN_SENSOR',
  'ROBOT_VACUUM_MOTOR_CURRENT', 'ROBOT_VACUUM_SENSOR_FUSION_EKF',
  'ROBOT_VACUUM_ROOM_SEGMENTATION', 'ROBOT_VACUUM_SEMANTIC_MAP',
  'ROBOT_VACUUM_COVERAGE_PLANNER', 'ROBOT_VACUUM_ROOM_SCHEDULER',
  'ROBOT_VACUUM_BATTERY_MONITOR', 'ROBOT_VACUUM_GOAL_MANAGER',
  'ROBOT_VACUUM_3D_VIZ_COLORS', 'ROBOT_VACUUM_WAYPOINT_GEN',
  'ROBOT_VACUUM_COLLISION_AVOID', 'ROBOT_VACUUM_SURFACE_ADAPTER',
  'ROBOT_VACUUM_CLIFF_HALT', 'ROBOT_VACUUM_VELOCITY_PID',
  'ROBOT_VACUUM_MODE_SUPERVISOR', 'ROBOT_VACUUM_BUMPER_SENSOR',
  'ROBOT_VACUUM_SIDE_BRUSH', 'ROBOT_VACUUM_SUCTION_PWM',
  'ROBOT_VACUUM_TERRAIN_MODEL', 'ROBOT_VACUUM_COLLISION_MESH',
  'ROBOT_VACUUM_DOCK_BEACON', 'ROBOT_VACUUM_CAPACITY_THRESHOLD',
  'ROBOT_VACUUM_HALT_ALERT', 'ROBOT_VACUUM_DOCK_DETECT',
  'ROBOT_VACUUM_RESUME_SCHEDULER', 'ROBOT_VACUUM_3D_SCENE_VIEW',
  'ROBOT_VACUUM_FURNITURE_MESH', 'ROBOT_VACUUM_DIRT_DENSITY',
  'ROBOT_VACUUM_ROOM_ZONE_COLORS', 'ROBOT_VACUUM_COVERAGE_HEATMAP',
  'ROBOT_VACUUM_DOCK_ICON', 'ROBOT_VACUUM_BATTERY_HUD',
  'ROBOT_VACUUM_DUSTBIN_HUD', 'FUZZY_MF_TRIMF', 'FUZZY_MF_TRAPMF',
  'FUZZY_MF_GAUSSMF', 'FUZZY_MF_SIGMF', 'FUZZY_AND', 'FUZZY_OR',
  'FUZZY_NOT', 'FUZZY_RULE', 'FUZZY_INFERENCE_SYSTEM',
  'FUZZY_DEFUZZIFY', 'FUZZY_PID_CONTROLLER', 'FUZZY_SURFACE_VIEWER',
  'DEM_WASHING_MACHINE_TWIN', 'DEM_DRUM', 'DEM_PARTICLE_SYSTEM',
  'DEM_HERTZ_CONTACT', 'DEM_BOND_FABRIC', 'DEM_FLUID_COUPLING',
  'CFD_SPH_WATER_SOLVER', 'DEM_CFD_COSIMULATION_INTERFACE',
  'FABRIC_HARMONIC_ANALYZER', 'CFD_DEM_SURROGATE_LEARNER',
  'ROOT_LOCUS', 'Note',
], 'No paired canonical-interpreter and strict-C99 embedded conformance case is registered.');



const UNPAIRED_EMBEDDED_OPERATIONS = hostOnlySet([
  'Step', 'VectorPow', 'SumElements', 'Mean', 'Max', 'IdentityMatrix',
  'LOW_PASS_FILTER', 'HIGH_PASS_FILTER', 'MOVING_AVERAGE',
], 'The canonical interpreter and generated-C paths do not yet have paired executable conformance coverage.');

/**
 * Embedded-safe X-Bridges block types. This registry is declarative and never
 * imports or invokes UI block factories.
 */
export const XB_CAPABILITIES: Readonly<Record<string, XBBlockCapability>> = {
  // Sources and state-machine mappings.
  Constant: direct(
    allShapes,
    undefined,
    ['T14-INT-CORE-DIRECT', 'T14-INT-SHAPED-CONSTANT'],
    ['T14-C99-CORE-DIRECT', 'T14-C99-SHAPED-CONSTANT'],
    { inputShapes: [], outputShapes: allShapes },
  ),
  Inport: direct(scalar, undefined, undefined, undefined, {
    inputShapes: scalar, outputShapes: scalar,
  }),
  Outport: direct(scalar, undefined, undefined, undefined, {
    inputShapes: scalar, outputShapes: scalar,
  }),
  Step: direct(scalar),

  // Deterministic arithmetic and reductions.
  Sum: direct(scalar),
  SUM_JUNCTION: direct(scalar),
  GAIN: direct(scalar),
  PRODUCT: direct(scalar),
  VectorAdd: direct(['vector'], undefined, ['T10-INT-VECTOR-ELEMENTWISE'], ['T10-C99-VECTOR-MATRIX']),
  VectorSub: direct(['vector'], undefined, ['T10-INT-VECTOR-ELEMENTWISE'], ['T10-C99-VECTOR-MATRIX']),
  VectorMul: direct(['vector'], undefined, ['T10-INT-VECTOR-ELEMENTWISE'], ['T10-C99-VECTOR-MATRIX']),
  VectorDiv: direct(['vector'], undefined, ['T10-INT-VECTOR-ELEMENTWISE'], ['T10-C99-VECTOR-MATRIX']),
  VectorPow: direct(allShapes),
  UnaryNeg: direct(scalar),
  Abs: direct(scalar),
  SumElements: direct(vectorOrMatrix),
  Mean: direct(vectorOrMatrix),
  Max: direct(vectorOrMatrix),

  // Statically bounded linear algebra. Each entry has interpreter and C99
  // conformance coverage in xbInterpreter/xbCGenerator tests (Task 10).
  MatrixMul: direct(['matrix'], undefined, ['T10-INT-MATRIX-OPS'], ['T10-C99-VECTOR-MATRIX']),
  Transpose: direct(['matrix'], undefined, ['T10-INT-MATRIX-OPS'], ['T10-C99-VECTOR-MATRIX']),
  MatrixConcat: direct(['matrix'], undefined, ['T10-INT-MATRIX-OPS'], ['T10-C99-VECTOR-MATRIX']),
  MatrixDiag: direct(vectorOrMatrix, undefined, ['T10-INT-MATRIX-OPS'], ['T10-C99-VECTOR-MATRIX'], {
    inputShapes: ['vector'], outputShapes: ['matrix'],
  }),
  IdentityMatrix: direct(vectorOrMatrix),
  SubMatrix: direct(['matrix'], undefined, ['T10-INT-MATRIX-OPS'], ['T10-C99-VECTOR-MATRIX']),
  MatrixSolve: direct(['matrix'], undefined, ['T10-INT-MATRIX-OPS'], ['T10-C99-VECTOR-MATRIX']),

  // Logic and bitwise operations.
  AND: direct(scalar, undefined, ['T10-INT-LOGIC-BITWISE'], ['T10-C99-LOGIC-BITWISE']),
  OR: direct(scalar, undefined, ['T10-INT-LOGIC-BITWISE'], ['T10-C99-LOGIC-BITWISE']),
  NOT: direct(scalar, undefined, ['T10-INT-LOGIC-BITWISE'], ['T10-C99-LOGIC-BITWISE']),
  NAND: direct(scalar, undefined, ['T10-INT-LOGIC-BITWISE'], ['T10-C99-LOGIC-BITWISE']),
  NOR: direct(scalar, undefined, ['T10-INT-LOGIC-BITWISE'], ['T10-C99-LOGIC-BITWISE']),
  XOR: direct(scalar, undefined, ['T10-INT-LOGIC-BITWISE'], ['T10-C99-LOGIC-BITWISE']),
  BitwiseAND: direct(scalar, undefined, ['T10-INT-LOGIC-BITWISE'], ['T10-C99-LOGIC-BITWISE']),
  BitwiseOR: direct(scalar, undefined, ['T10-INT-LOGIC-BITWISE'], ['T10-C99-LOGIC-BITWISE']),
  BitwiseXOR: direct(scalar, undefined, ['T10-INT-LOGIC-BITWISE'], ['T10-C99-LOGIC-BITWISE']),
  BitwiseNOT: direct(scalar, undefined, ['T10-INT-LOGIC-BITWISE'], ['T10-C99-LOGIC-BITWISE']),
  ShiftLeft: direct(scalar, undefined, ['T10-INT-LOGIC-BITWISE'], ['T10-C99-LOGIC-BITWISE']),
  ShiftRight: direct(scalar, undefined, ['T10-INT-LOGIC-BITWISE'], ['T10-C99-LOGIC-BITWISE']),

  // Signal routing.
  SWITCH: direct(allShapes, undefined, ['T10-INT-SIGNAL-ROUTING'], ['T10-C99-SIGNAL-ROUTING']),
  MUX: direct(allShapes, undefined, ['T10-INT-SIGNAL-ROUTING'], ['T10-C99-SIGNAL-ROUTING']),
  DEMUX: direct(allShapes, undefined, ['T10-INT-SIGNAL-ROUTING'], ['T10-C99-SIGNAL-ROUTING']),
  IF_ELSE: direct(allShapes, undefined, ['T10-INT-SIGNAL-ROUTING'], ['T10-C99-SIGNAL-ROUTING']),
  TERMINATOR: direct(
    allShapes,
    undefined,
    ['T14-INT-CORE-DIRECT', 'T14-INT-SHAPED-CONSTANT'],
    ['T14-C99-CORE-DIRECT', 'T14-C99-SHAPED-CONSTANT'],
    {
      inputShapes: allShapes, outputShapes: [],
    },
  ),

  // Stateful primitives.
  DELAY: stateful(scalar, undefined, ['T14-INT-CONTINUOUS'], ['T14-C99-CONTINUOUS']),
  UNIT_DELAY: stateful(scalar),
  MEMORY: stateful(scalar, undefined, ['T14-INT-STATEFUL'], ['T14-C99-STATEFUL']),
  INTEGRATOR_DISCRETE: stateful(scalar, undefined, ['T14-INT-STATEFUL'], ['T14-C99-STATEFUL']),
  INTEGRATOR_CONTINUOUS: stateful(scalar, undefined, ['T14-INT-CONTINUOUS'], ['T14-C99-CONTINUOUS']),
  Integrator: stateful(scalar, undefined, ['T14-INT-CONTINUOUS'], ['T14-C99-CONTINUOUS']),
  WHITE_NOISE: stateful(scalar, ['math-library'], undefined, undefined, { inputShapes: [], outputShapes: scalar }),
  BAND_LIMITED_NOISE: stateful(scalar, ['math-library'], undefined, undefined, { inputShapes: [], outputShapes: scalar }),

  // Bounded control and linear-system blocks. Each entry is enabled only with
  // paired interpreter and compiled-C conformance coverage (Task 10).
  PID_BASIC: stateful(scalar, undefined, ['T10-INT-PID-BASIC'], ['T10-C99-PID-BASIC']),
  PID_CONTROLLER: hostOnly('PID_CONTROLLER has no compiled-C conformance contract.'),
  LOW_PASS_FILTER: stateful(allShapes),
  HIGH_PASS_FILTER: stateful(allShapes),
  MOVING_AVERAGE: stateful(allShapes),
  DISCRETE_TRANSFER_FUNCTION: stateful(['vector'], undefined, ['T10-INT-DISCRETE-REALIZATION'], ['T10-C99-DISCRETE-REALIZATION']),
  STATE_SPACE: stateful(['vector'], undefined, ['T10-INT-DISCRETE-REALIZATION'], ['T10-C99-DISCRETE-REALIZATION']),

  // Discontinuities: saturation, dead zone, rate limiter, and relay.
  SATURATION:   direct(scalar, ['math-library'], ['T10-INT-DISCONTINUOUS'], ['T10-C99-DISCONTINUOUS']),
  DEADZONE:     direct(scalar, ['math-library'], ['T10-INT-DISCONTINUOUS'], ['T10-C99-DISCONTINUOUS']),
  RATE_LIMITER: stateful(scalar, ['math-library'], ['T10-INT-DISCONTINUOUS'], ['T10-C99-DISCONTINUOUS']),
  RELAY:        stateful(scalar, undefined, ['T10-INT-DISCONTINUOUS'], ['T10-C99-DISCONTINUOUS']),

  // Motor-control transforms, covered against fixed reference vectors in both
  // the interpreter and generated C conformance suites (Task 10).
  CLARKE_TRANSFORM: direct(scalar, ['math-library'], ['T10-INT-TRANSFORMS'], ['T10-C99-TRANSFORMS']),
  PARK_TRANSFORM: direct(scalar, ['math-library'], ['T10-INT-TRANSFORMS'], ['T10-C99-TRANSFORMS']),
  INVERSE_PARK: direct(scalar, ['math-library'], ['T10-INT-TRANSFORMS'], ['T10-C99-TRANSFORMS']),
  INVERSE_CLARKE: direct(scalar, ['math-library'], ['T10-INT-TRANSFORMS'], ['T10-C99-TRANSFORMS']),

  // Trigonometry requires a target-provided math library.
  SIN: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  COS: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  TAN: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  COT: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  SEC: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  COSEC: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  ASIN: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  ACOS: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  ATAN: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  ACOT: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  ASEC: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  ACOSEC: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  SINH: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  COSH: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  TANH: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  COTH: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  SECH: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  COSECH: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  ASINH: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  ACOSH: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  ATANH: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  ACOTH: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  ASECH: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),
  ACOSECH: direct(scalar, ['math-library'], ['T10-INT-TRIGONOMETRY'], ['T10-C99-TRIGONOMETRY']),

  // Explicit numeric representation changes.
  DATA_TYPE_CONVERSION: direct(scalar),
  NUMERIC_REPRESENTATION: direct(scalar),

  // Host-only blocks intentionally rejected by embedded code generation.
  Scope: hostOnly('Visualization requires the host runtime.'),
  LMS_ADAPTIVE_FILTER: hostOnly('Online learning is not in the embedded-safe set.'),

  // Every public UI block is classified. The final spread intentionally
  // overrides family-level entries that still lack paired executable evidence.
  ...UNCLASSIFIED_HOST_ONLY,
  ...UNPAIRED_EMBEDDED_OPERATIONS,
};

export const getXBBlockCapability = (
  type: string,
): XBBlockCapability | null => (
  Object.prototype.hasOwnProperty.call(XB_CAPABILITIES, type)
    ? XB_CAPABILITIES[type]
    : null
);
