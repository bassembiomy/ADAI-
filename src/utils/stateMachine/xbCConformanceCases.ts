import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import {
  hybridXBridgesFixture,
  type DifferentialFixture,
  type DifferentialScenarioStep,
} from './smFixtures';
import type { XBEdgeV1, XBMappingV1, XBNodeV1 } from './xbModel';
import type { XBConformanceCoverage, XBSignalShape } from './xbCapabilities';

export interface XBExecutableConformanceCase {
  readonly id: string;
  readonly coverage: readonly XBConformanceCoverage[];
  readonly fixture: DifferentialFixture;
  readonly tolerance: Readonly<{ absolute: number; relative: number }>;
}

const scalarCoverage = (blockType: string): XBConformanceCoverage => ({
  blockType,
  inputShapes: ['scalar'],
  outputShapes: ['scalar'],
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
  ...[
    'Sum',
    'SUM_JUNCTION',
    'GAIN',
    'PRODUCT',
    'UnaryNeg',
    'Abs',
    'DATA_TYPE_CONVERSION',
    'NUMERIC_REPRESENTATION',
  ].map(scalarCoverage),
  shapedCoverage('TERMINATOR', ['scalar'], []),
];

const LOGIC_BITWISE_COVERAGE: readonly XBConformanceCoverage[] = [
  'AND',
  'OR',
  'NOT',
  'NAND',
  'NOR',
  'XOR',
  'BitwiseAND',
  'BitwiseOR',
  'BitwiseXOR',
  'BitwiseNOT',
  'ShiftLeft',
  'ShiftRight',
].map(scalarCoverage);

const SIGNAL_ROUTING_COVERAGE: readonly XBConformanceCoverage[] = [
  'SWITCH',
  'MUX',
  'DEMUX',
  'IF_ELSE',
].map((type) => shapedCoverage(type, ['scalar', 'vector', 'matrix']));

const TRIGONOMETRY_COVERAGE: readonly XBConformanceCoverage[] = [
  'SIN',
  'COS',
  'TAN',
  'COT',
  'SEC',
  'COSEC',
  'ASIN',
  'ACOS',
  'ATAN',
  'ACOT',
  'ASEC',
  'ACOSEC',
  'SINH',
  'COSH',
  'TANH',
  'COTH',
  'SECH',
  'COSECH',
  'ASINH',
  'ACOSH',
  'ATANH',
  'ACOTH',
  'ASECH',
  'ACOSECH',
].map(scalarCoverage);

const VECTOR_COVERAGE: readonly XBConformanceCoverage[] = [
  'VectorAdd',
  'VectorSub',
  'VectorMul',
  'VectorDiv',
].map((type) => shapedCoverage(type, ['scalar', 'vector', 'matrix']));

const MATRIX_COVERAGE: readonly XBConformanceCoverage[] = [
  ...[
    'MatrixMul',
    'Transpose',
    'MatrixConcat',
    'SubMatrix',
    'MatrixSolve',
  ].map((type) => shapedCoverage(type, ['matrix'])),
  shapedCoverage('MatrixDiag', ['vector'], ['matrix']),
];

const TRANSFORM_COVERAGE: readonly XBConformanceCoverage[] = [
  'CLARKE_TRANSFORM',
  'PARK_TRANSFORM',
  'INVERSE_PARK',
  'INVERSE_CLARKE',
].map(scalarCoverage);

const DISCONTINUOUS_COVERAGE: readonly XBConformanceCoverage[] = [
  scalarCoverage('SATURATION'),
  scalarCoverage('DEADZONE'),
  scalarCoverage('RATE_LIMITER'),
  scalarCoverage('RELAY'),
];

const createNode = (
  id: string,
  type: string,
  params: Record<string, any> = {},
): XBNodeV1 => {
  const builder = BLOCK_LIBRARY[type];
  if (!builder) throw new Error(`Unknown block type ${type}`);
  const block = builder(id, params);
  const transformPort = (p: any) => {
    let inferredShape = p.shape ?? (['scalar', 'vector', 'matrix'].includes(p.type) ? p.type : 'scalar');
    let inferredDimensions = p.dimensions ?? [];
    // If block is a Constant and value is an array, override shape.
    if (type === 'Constant' && Array.isArray(params.value)) {
      inferredShape = 'vector';
      inferredDimensions = [params.value.length];
      // Basic check for matrix
      if (Array.isArray(params.value[0])) {
        inferredShape = 'matrix';
        inferredDimensions = [params.value.length, params.value[0].length];
      }
    }
    return {
      id: p.id,
      direction: p.direction,
      shape: inferredShape,
      dimensions: inferredDimensions,
      dataType: p.dataType ?? 'float32',
    };
  };
  return {
    id,
    type,
    label: id,
    parameters: {
      ...(block.inputs ? { inputs: block.inputs.map(transformPort) } : {}),
      ...(block.outputs ? { outputs: block.outputs.map(transformPort) } : {}),
      ...params,
    },
  };
};

function makeXBridgesFixture(
  nodes: readonly XBNodeV1[],
  edges: readonly XBEdgeV1[] = [],
  mappings: readonly XBMappingV1[] = [],
  steps: readonly DifferentialScenarioStep[] = [
    { kind: 'step' },
    { kind: 'step' },
  ],
): DifferentialFixture {
  const model = hybridXBridgesFixture();
  const ordinary = model.states.find((s) => s.id === 'ordinary')!;
  const controller = model.states.find((s) => s.id === 'controller')!;
  ordinary.autostart = false;
  controller.autostart = true;
  controller.xBridgesModel = {
    schemaVersion: 1,
    nodes,
    edges,
    mappings,
    solver: { kind: 'euler', stepSeconds: 0.002 },
    policy: { memory: 'reset', numericFault: 'escalate' },
  };
  return {
    name: 'flat-priority',
    model,
    steps,
  };
}

const DEFAULT_TOLERANCE = Object.freeze({ absolute: 1e-4, relative: 1e-4 });

const FILTER_INPUT_SEQUENCE: readonly DifferentialScenarioStep[] = [
  // Constant zero input; filter runs at t=0 using initial condition.
  { kind: 'step', inputs: { u: 0 } },
  { kind: 'step', inputs: { u: 0 } },
  { kind: 'step', inputs: { u: 0 } },
  { kind: 'step', inputs: { u: 0 } },
  { kind: 'step', inputs: { u: 0 } },
  // Step up to +10 (positive transition); filter internal sample still reads u=0.
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
  // t=0.1 s: filter runs again at u=10 (sample time boundary).
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
  // Step down to -5 (negative transition).
  { kind: 'step', inputs: { u: -5 } },
  { kind: 'step', inputs: { u: -5 } },
  { kind: 'step', inputs: { u: -5 } },
  { kind: 'step', inputs: { u: -5 } },
  { kind: 'step', inputs: { u: -5 } },
  // t=0.2 s: filter runs at u=-5.
  { kind: 'step', inputs: { u: -5 } },
  { kind: 'step', inputs: { u: -5 } },
  { kind: 'step', inputs: { u: -5 } },
  { kind: 'step', inputs: { u: -5 } },
  { kind: 'step', inputs: { u: -5 } },
  // Sinusoidal input variation.
  { kind: 'step', inputs: { u: 5 * Math.sin(25) } },
  { kind: 'step', inputs: { u: 5 * Math.sin(26) } },
  { kind: 'step', inputs: { u: 5 * Math.sin(27) } },
  { kind: 'step', inputs: { u: 5 * Math.sin(28) } },
  { kind: 'step', inputs: { u: 5 * Math.sin(29) } },
  // t=0.3 s: filter runs at sinusoidal sample.
  { kind: 'step', inputs: { u: 5 * Math.sin(30) } },
  { kind: 'step', inputs: { u: 5 * Math.sin(31) } },
  { kind: 'step', inputs: { u: 5 * Math.sin(32) } },
  { kind: 'step', inputs: { u: 5 * Math.sin(33) } },
  { kind: 'step', inputs: { u: 5 * Math.sin(34) } },
  // Reset to exercise reinitialization and buffer/index rollback.
  { kind: 'reset' },
  // After reset, constant zero input again; filter runs at first sample boundary.
  { kind: 'step', inputs: { u: 0 } },
  { kind: 'step', inputs: { u: 0 } },
  { kind: 'step', inputs: { u: 0 } },
  { kind: 'step', inputs: { u: 0 } },
  { kind: 'step', inputs: { u: 0 } },
  // Step up to +10 after reset.
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
  // t=0.1 s after reset: filter runs at u=10 from zero initial condition.
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
  { kind: 'step', inputs: { u: 10 } },
];

const filterFixture = (): DifferentialFixture => {
  const fixture = makeXBridgesFixture(
    [
      createNode('inport', 'Inport', { smVarId: 'u' }),
      createNode('lpf1', 'LOW_PASS_FILTER', { cutoff_frequency: 1, sample_time: 0.1, initial_condition: 0 }),
      createNode('hpf1', 'HIGH_PASS_FILTER', { cutoff_frequency: 1, sample_time: 0.1, initial_condition: 0 }),
      createNode('ma1', 'MOVING_AVERAGE', { window_size: 4, sample_time: 0.1, initial_condition: 0 }),
    ],
    [
      { id: 'e1', sourceNodeId: 'inport', sourcePortId: 'out', targetNodeId: 'lpf1', targetPortId: 'u' },
      { id: 'e2', sourceNodeId: 'inport', sourcePortId: 'out', targetNodeId: 'hpf1', targetPortId: 'u' },
      { id: 'e3', sourceNodeId: 'inport', sourcePortId: 'out', targetNodeId: 'ma1', targetPortId: 'u' },
    ],
    [
      { smVarId: 'u', blockId: 'inport', portId: 'in', direction: 'in' },
    ],
    FILTER_INPUT_SEQUENCE,
  );
  fixture.model.variables.push({
    id: 'u',
    name: 'u',
    type: 'float',
    initialValue: '0',
    currentValue: 0,
    visibleInScope: true,
  });
  const controller = fixture.model.states.find((state) => state.id === 'controller');
  if (controller?.xBridgesModel?.solver) {
    controller.xBridgesModel.solver.stepSeconds = 0.01;
  }
  return fixture;
};

export const XB_EXECUTABLE_C_CASES: Readonly<
  Record<string, XBExecutableConformanceCase>
> = Object.freeze({
  'T14-C99-CORE-DIRECT': {
    id: 'T14-C99-CORE-DIRECT',
    coverage: CORE_SCALAR_COVERAGE,
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: 5 }),
        createNode('g1', 'GAIN', { gain: 2 }),
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'g1', targetPortId: 'u' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T14-C99-SHAPED-CONSTANT': {
    id: 'T14-C99-SHAPED-CONSTANT',
    coverage: [
      shapedCoverage('Constant', [], ['vector', 'matrix']),
      shapedCoverage('TERMINATOR', ['vector', 'matrix'], []),
    ],
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: [1, 2, 3] }),
        createNode('t1', 'TERMINATOR'),
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 't1', targetPortId: 'u' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-FILTERS': {
    id: 'T10-C99-FILTERS',
    coverage: [
      shapedCoverage('LOW_PASS_FILTER', ['scalar', 'vector', 'matrix']),
      shapedCoverage('HIGH_PASS_FILTER', ['scalar', 'vector', 'matrix']),
      shapedCoverage('MOVING_AVERAGE', ['scalar', 'vector', 'matrix']),
    ],
    fixture: filterFixture(),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T14-C99-STATEFUL': {
    id: 'T14-C99-STATEFUL',
    coverage: [
      scalarCoverage('UNIT_DELAY'),
      scalarCoverage('MEMORY'),
      scalarCoverage('INTEGRATOR_DISCRETE'),
    ],
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: 3 }),
        createNode('ud1', 'UNIT_DELAY', { initialCondition: 0 }),
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'ud1', targetPortId: 'u' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T14-C99-CONTINUOUS': {
    id: 'T14-C99-CONTINUOUS',
    coverage: [
      scalarCoverage('DELAY'),
      scalarCoverage('INTEGRATOR_CONTINUOUS'),
      scalarCoverage('Integrator'),
    ],
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: 1 }),
        createNode('del1', 'DELAY', { delayTime: 0.01, initialCondition: 0 }),
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'del1', targetPortId: 'u' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T14-C99-STEP': {
    id: 'T14-C99-STEP',
    coverage: [shapedCoverage('Step', [], ['scalar'])],
    fixture: makeXBridgesFixture(
      [
        createNode('step1', 'Step', { stepTime: 0, initialValue: 0, finalValue: 1 }),
        createNode('t1', 'TERMINATOR'),
      ],
      [
        { id: 'e1', sourceNodeId: 'step1', sourcePortId: 'out', targetNodeId: 't1', targetPortId: 'u' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T14-C99-DISCONTINUOUS': {
    id: 'T14-C99-DISCONTINUOUS',
    coverage: DISCONTINUOUS_COVERAGE,
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: 2.5 }),
        createNode('sat1', 'SATURATION', { lowerLimit: -1, upperLimit: 1 }),
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'sat1', targetPortId: 'u' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-DISCONTINUOUS': {
    id: 'T10-C99-DISCONTINUOUS',
    coverage: DISCONTINUOUS_COVERAGE,
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: -0.5 }),
        createNode('dz1', 'DEADZONE', { lowerLimit: -1, upperLimit: 1 }),
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'dz1', targetPortId: 'u' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-VECTOR-MATRIX': {
    id: 'T10-C99-VECTOR-MATRIX',
    coverage: [...VECTOR_COVERAGE, ...MATRIX_COVERAGE],
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: [1, 2] }),
        createNode('c2', 'Constant', { value: [3, 4] }),
        createNode('vadd', 'VectorAdd'),
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'vadd', targetPortId: 'in1' },
        { id: 'e2', sourceNodeId: 'c2', sourcePortId: 'out', targetNodeId: 'vadd', targetPortId: 'in2' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-PID-BASIC': {
    id: 'T10-C99-PID-BASIC',
    coverage: [scalarCoverage('PID_BASIC')],
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: 0.5 }),
        createNode('pid1', 'PID_BASIC', { Kp: 1, Ki: 0.1, Kd: 0.01, sampleTime: 0.01 }),
        createNode('enable', 'Constant', { value: 1 }),
        createNode('reset', 'Constant', { value: 0 }),
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'pid1', targetPortId: 'e' },
        { id: 'e2', sourceNodeId: 'enable', sourcePortId: 'out', targetNodeId: 'pid1', targetPortId: 'enable' },
        { id: 'e3', sourceNodeId: 'reset', sourcePortId: 'out', targetNodeId: 'pid1', targetPortId: 'reset' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-PID-CONTROLLER': {
    id: 'T10-C99-PID-CONTROLLER',
    coverage: [scalarCoverage('PID_CONTROLLER')],
    fixture: makeXBridgesFixture(
      [
        createNode('r', 'Constant', { value: 1.0 }),
        createNode('y', 'Constant', { value: 0.5 }),
        createNode('pid1', 'PID_CONTROLLER', { Kp: 1.5, Ki: 0.1, Kd: 0.05, N: 10, beta: 1.0, gamma: 1.0, min: -10, max: 10, method: 'ForwardEuler', sampleTime: 0.01 }),
        createNode('enable', 'Constant', { value: 1 }),
        createNode('reset', 'Constant', { value: 0 }),
      ],
      [
        { id: 'e1', sourceNodeId: 'r', sourcePortId: 'out', targetNodeId: 'pid1', targetPortId: 'r' },
        { id: 'e2', sourceNodeId: 'y', sourcePortId: 'out', targetNodeId: 'pid1', targetPortId: 'y' },
        { id: 'e3', sourceNodeId: 'enable', sourcePortId: 'out', targetNodeId: 'pid1', targetPortId: 'enable' },
        { id: 'e4', sourceNodeId: 'reset', sourcePortId: 'out', targetNodeId: 'pid1', targetPortId: 'reset' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-DISCRETE-REALIZATION': {
    id: 'T10-C99-DISCRETE-REALIZATION',
    coverage: [
      shapedCoverage('DISCRETE_TRANSFER_FUNCTION', ['vector']),
      shapedCoverage('STATE_SPACE', ['vector']),
    ],
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: [1] }),
        createNode('tf1', 'DISCRETE_TRANSFER_FUNCTION', { numerator: [1], denominator: [1, -0.5], sampleTime: 0.01 }),
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'tf1', targetPortId: 'u' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-TRANSFORMS': {
    id: 'T10-C99-TRANSFORMS',
    coverage: TRANSFORM_COVERAGE,
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: 1 }),
        createNode('c2', 'Constant', { value: -0.5 }),
        createNode('c3', 'Constant', { value: -0.5 }),
        createNode('clarke1', 'CLARKE_TRANSFORM'),
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'clarke1', targetPortId: 'ia' },
        { id: 'e2', sourceNodeId: 'c2', sourcePortId: 'out', targetNodeId: 'clarke1', targetPortId: 'ib' },
        { id: 'e3', sourceNodeId: 'c3', sourcePortId: 'out', targetNodeId: 'clarke1', targetPortId: 'ic' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-LOGIC-BITWISE': {
    id: 'T10-C99-LOGIC-BITWISE',
    coverage: LOGIC_BITWISE_COVERAGE,
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: 1 }),
        createNode('not1', 'NOT'),
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'not1', targetPortId: 'in' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-SIGNAL-ROUTING': {
    id: 'T10-C99-SIGNAL-ROUTING',
    coverage: SIGNAL_ROUTING_COVERAGE,
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: 1 }),
        createNode('c2', 'Constant', { value: 2 }),
        createNode('cond', 'Constant', { value: 1 }),
        createNode('sw1', 'SWITCH', { threshold: 0.5 }),
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'sw1', targetPortId: 'u1' },
        { id: 'e2', sourceNodeId: 'cond', sourcePortId: 'out', targetNodeId: 'sw1', targetPortId: 'ctrl' },
        { id: 'e3', sourceNodeId: 'c2', sourcePortId: 'out', targetNodeId: 'sw1', targetPortId: 'u2' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-SIX-STEP': {
    id: 'T10-C99-SIX-STEP',
    coverage: [scalarCoverage('SIX_STEP_COMMUTATION')],
    fixture: makeXBridgesFixture(
      [
        createNode('h1', 'Constant', { value: 1 }),
        createNode('h2', 'Constant', { value: 0 }),
        createNode('h3', 'Constant', { value: 1 }),
        createNode('comm', 'SIX_STEP_COMMUTATION', {}),
      ],
      [
        { id: 'e1', sourceNodeId: 'h1', sourcePortId: 'out', targetNodeId: 'comm', targetPortId: 'h1' },
        { id: 'e2', sourceNodeId: 'h2', sourcePortId: 'out', targetNodeId: 'comm', targetPortId: 'h2' },
        { id: 'e3', sourceNodeId: 'h3', sourcePortId: 'out', targetNodeId: 'comm', targetPortId: 'h3' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-TRIGONOMETRY': {
    id: 'T10-C99-TRIGONOMETRY',
    coverage: TRIGONOMETRY_COVERAGE,
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: 0.5 }),
        createNode('sin1', 'SIN'),
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'sin1', targetPortId: 'u' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-FLIPFLOPS': {
    id: 'T10-C99-FLIPFLOPS',
    coverage: [
      scalarCoverage('DFlipFlop'),
      scalarCoverage('JKFlipFlop'),
    ],
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: 1 }),
        createNode('c0', 'Constant', { value: 0 }),
        createNode('clk', 'Step', { stepTime: 0 }),
        
        createNode('dff', 'DFlipFlop'),
        createNode('jk', 'JKFlipFlop'),
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'dff', targetPortId: 'd' },
        { id: 'e2', sourceNodeId: 'clk', sourcePortId: 'out', targetNodeId: 'dff', targetPortId: 'clk' },
        { id: 'e3', sourceNodeId: 'c0', sourcePortId: 'out', targetNodeId: 'dff', targetPortId: 'rst' },
        
        { id: 'e4', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'jk', targetPortId: 'j' },
        { id: 'e5', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'jk', targetPortId: 'k' },
        { id: 'e6', sourceNodeId: 'clk', sourcePortId: 'out', targetNodeId: 'jk', targetPortId: 'clk' },
        { id: 'e7', sourceNodeId: 'c0', sourcePortId: 'out', targetNodeId: 'jk', targetPortId: 'rst' },
      ],
      [],
      [
        { kind: 'step' },
        { kind: 'step' },
        { kind: 'step' },
      ]
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-REGISTER-COUNTER': {
    id: 'T10-C99-REGISTER-COUNTER',
    coverage: [
      scalarCoverage('Register'),
      scalarCoverage('Counter'),
    ],
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: 1 }),
        createNode('c0', 'Constant', { value: 0 }),
        createNode('clk', 'Step', { stepTime: 0 }),
        
        createNode('reg', 'Register', { bitWidth: 8 }),
        createNode('cnt', 'Counter', { maxValue: 255 }),
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'reg', targetPortId: 'in' },
        { id: 'e2', sourceNodeId: 'clk', sourcePortId: 'out', targetNodeId: 'reg', targetPortId: 'clk' },
        { id: 'e3', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'reg', targetPortId: 'en' },
        { id: 'e4', sourceNodeId: 'c0', sourcePortId: 'out', targetNodeId: 'reg', targetPortId: 'rst' },
        
        { id: 'e5', sourceNodeId: 'clk', sourcePortId: 'out', targetNodeId: 'cnt', targetPortId: 'clk' },
        { id: 'e6', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'cnt', targetPortId: 'en' },
        { id: 'e7', sourceNodeId: 'c0', sourcePortId: 'out', targetNodeId: 'cnt', targetPortId: 'rst' },
      ],
      [],
      [
        { kind: 'step' },
        { kind: 'step' },
        { kind: 'step' },
      ]
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-WAVEFORMS': {
    id: 'T10-C99-WAVEFORMS',
    coverage: [
      shapedCoverage('Clock', [], ['scalar']),
      shapedCoverage('WaveformGen', [], ['scalar']),
    ],
    fixture: makeXBridgesFixture(
      [
        createNode('clk1', 'Clock', { freq: 1 }),
        createNode('wav1', 'WaveformGen', { type: 'Sine', freq: 2, amp: 5, offset: 1 }),
        createNode('wav2', 'WaveformGen', { type: 'Square', freq: 3, amp: 2 }),
      ],
      [],
      [],
      [
        { kind: 'step' },
        { kind: 'step' },
        { kind: 'step' },
        { kind: 'step' },
        { kind: 'step' },
      ]
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'XB-W5-NOISE': {
    id: 'XB-W5-NOISE',
    coverage: [
      shapedCoverage('WHITE_NOISE', [], ['scalar']),
      shapedCoverage('BAND_LIMITED_NOISE', [], ['scalar']),
    ],
    fixture: makeXBridgesFixture(
      [
        createNode('n1', 'WHITE_NOISE', { seed: 1831565813, mean: 0, variance: 1 }),
        createNode('XBNOISE10A-BandLimited', 'BAND_LIMITED_NOISE', { seed: 1831565814, mean: 0, variance: 1, fc: 10, sampleTime: 0.1 }),
      ],
      [],
      [],
      [
        { kind: 'step' },
        { kind: 'step' },
        { kind: 'step' },
        { kind: 'step' },
      ]
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-VECTOR-POW': {
    id: 'T10-C99-VECTOR-POW',
    coverage: [
      shapedCoverage('VectorPow', ['scalar', 'vector', 'matrix']),
    ],
    fixture: makeXBridgesFixture(
      [
        createNode('c_base', 'Constant', { value: [2, 3] }),
        createNode('c_exp', 'Constant', { value: [3, 2] }),
        createNode('pow1', 'VectorPow', {
          inputs: [
            { id: 'in1', direction: 'input', shape: 'vector', dimensions: [2] },
            { id: 'in2', direction: 'input', shape: 'vector', dimensions: [2] },
          ],
          outputs: [{ id: 'y', direction: 'output', shape: 'vector', dimensions: [2] }],
        }),
      ],
      [
        { id: 'e1', sourceNodeId: 'c_base', sourcePortId: 'out', targetNodeId: 'pow1', targetPortId: 'in1' },
        { id: 'e2', sourceNodeId: 'c_exp', sourcePortId: 'out', targetNodeId: 'pow1', targetPortId: 'in2' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-REDUCTIONS': {
    id: 'T10-C99-REDUCTIONS',
    coverage: [
      shapedCoverage('SumElements', ['vector', 'matrix'], ['scalar']),
      shapedCoverage('Mean', ['vector', 'matrix'], ['scalar']),
      shapedCoverage('Max', ['vector', 'matrix'], ['scalar']),
    ],
    fixture: makeXBridgesFixture(
      [
        createNode('c_v', 'Constant', { value: [1, 2, 3, 4] }),
        createNode('sum1', 'SumElements', {
          inputs: [{ id: 'in', direction: 'input', shape: 'vector', dimensions: [4] }],
          outputs: [{ id: 'y', direction: 'output', shape: 'scalar' }],
        }),
        createNode('mean1', 'Mean', {
          inputs: [{ id: 'in', direction: 'input', shape: 'vector', dimensions: [4] }],
          outputs: [{ id: 'y', direction: 'output', shape: 'scalar' }],
        }),
        createNode('max1', 'Max', {
          inputs: [{ id: 'in', direction: 'input', shape: 'vector', dimensions: [4] }],
          outputs: [{ id: 'y', direction: 'output', shape: 'scalar' }],
        }),
      ],
      [
        { id: 'e1', sourceNodeId: 'c_v', sourcePortId: 'out', targetNodeId: 'sum1', targetPortId: 'in' },
        { id: 'e2', sourceNodeId: 'c_v', sourcePortId: 'out', targetNodeId: 'mean1', targetPortId: 'in' },
        { id: 'e3', sourceNodeId: 'c_v', sourcePortId: 'out', targetNodeId: 'max1', targetPortId: 'in' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'T10-C99-IDENTITY-MATRIX': {
    id: 'T10-C99-IDENTITY-MATRIX',
    coverage: [
      shapedCoverage('IdentityMatrix', [], ['matrix']),
    ],
    fixture: makeXBridgesFixture(
      [
        createNode('id1', 'IdentityMatrix', {
          dimension: 2,
          outputs: [{ id: 'y', direction: 'output', shape: 'matrix', dimensions: [2, 2] }],
        }),
      ],
      [],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
  'subsystem_gain_sum': {
    id: 'subsystem_gain_sum',
    coverage: [
      shapedCoverage('Subsystem', ['scalar'], ['scalar']),
      shapedCoverage('Inport', ['scalar'], ['scalar']),
      shapedCoverage('Outport', ['scalar'], ['scalar']),
    ],
    fixture: makeXBridgesFixture(
      [
        createNode('c1', 'Constant', { value: 10 }),
        createNode('sub1', 'Subsystem', {
          name: 'GainSub',
          inputs: [{ id: 'in1', direction: 'input', shape: 'scalar' }],
          outputs: [{ id: 'out1', direction: 'output', shape: 'scalar' }],
        }),
        { ...createNode('in1', 'Inport', { name: 'in1' }), parentId: 'sub1' },
        { ...createNode('gain1', 'GAIN', { gain: 3 }), parentId: 'sub1' },
        { ...createNode('out1', 'Outport', { name: 'out1' }), parentId: 'sub1' },
      ],
      [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'sub1', targetPortId: 'in1' },
        { id: 'e2', sourceNodeId: 'in1', sourcePortId: 'out', targetNodeId: 'gain1', targetPortId: 'u' },
        { id: 'e3', sourceNodeId: 'gain1', sourcePortId: 'y', targetNodeId: 'out1', targetPortId: 'in' },
      ],
    ),
    tolerance: DEFAULT_TOLERANCE,
  },
});

export const getExecutedCoverage = (
  caseId: string,
): readonly XBConformanceCoverage[] => {
  const testCase = XB_EXECUTABLE_C_CASES[caseId];
  if (!testCase)
    throw new Error(`Unknown executable X-Bridges C case '${caseId}'.`);
  return testCase.coverage;
};
