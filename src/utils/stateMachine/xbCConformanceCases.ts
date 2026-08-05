import type { StateMachineModelV4 } from './smModel';
import type { DifferentialScenarioStep } from './smFixtures';
import { hybridXBridgesFixture } from './smFixtures';
import type { XBConformanceCoverage, XBSignalShape } from './xbCapabilities';

type PortDirection = 'input' | 'output';
type NumericPortType = 'float32' | 'boolean' | 'int32';

interface PortContract {
  readonly id: string;
  readonly direction: PortDirection;
  readonly shape: XBSignalShape;
  readonly dimensions: readonly number[];
  readonly dataType: NumericPortType;
}

interface PersistedNode {
  readonly id: string;
  readonly type: string;
  readonly parameters: Record<string, unknown>;
}

export interface XBExecutableCConformanceCase {
  readonly id: string;
  readonly conformanceCaseId:
    | 'T10-C99-LOGIC-BITWISE'
    | 'T10-C99-SIGNAL-ROUTING'
    | 'T10-C99-TRIGONOMETRY'
    | 'T10-C99-DISCONTINUOUS';
  readonly coverage: readonly XBConformanceCoverage[];
  readonly model: StateMachineModelV4;
  readonly steps: readonly DifferentialScenarioStep[];
  readonly expectedFinalSignals: Readonly<Record<string, number | boolean | readonly number[]>>;
  readonly expectedFrames?: readonly {
    readonly signals?: Readonly<Record<string, number | boolean | readonly number[]>>;
    readonly blockState?: Readonly<Record<
    string,
    Readonly<Record<string, number | boolean | readonly number[]>>
    >>;
  }[];
}

const port = (
  id: string,
  direction: PortDirection,
  shape: XBSignalShape = 'scalar',
  dimensions: readonly number[] = shape === 'scalar' ? [] : shape === 'vector' ? [3] : [2, 2],
  dataType: NumericPortType = 'float32',
): PortContract => ({ id, direction, shape, dimensions, dataType });

const node = (
  id: string,
  type: string,
  inputs: readonly PortContract[],
  outputs: readonly PortContract[],
  parameters: Readonly<Record<string, unknown>> = {},
): PersistedNode => ({
  id,
  type,
  parameters: { ...parameters, inputs, outputs },
});

const constant = (
  id: string,
  value: number | boolean | readonly number[],
  shape: XBSignalShape = 'scalar',
  dimensions?: readonly number[],
  dataType: NumericPortType = 'float32',
): PersistedNode => node(
  id,
  'Constant',
  [],
  [port('y', 'output', shape, dimensions, dataType)],
  { value },
);

const edge = (
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  targetPortId: string,
  sourcePortId = 'y',
) => ({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId });

const embeddedModel = (
  nodes: readonly PersistedNode[],
  edges: readonly ReturnType<typeof edge>[],
  mappings: readonly Record<string, string>[] = [],
  variables: readonly { id: string; type?: 'float' | 'bool' | 'int32'; initialValue?: string }[] = [],
): StateMachineModelV4 => {
  const model = hybridXBridgesFixture();
  model.states[0].autostart = false;
  const controller = model.states.find((state) => state.id === 'controller')!;
  controller.autostart = true;
  controller.xBridgesModel = {
    schemaVersion: 1,
    nodes: nodes as any,
    edges,
    mappings: mappings as any,
    solver: { kind: 'euler', stepSeconds: 0.01 },
    policy: { memory: 'reset', numericFault: 'escalate' },
  };
  for (const variable of variables) {
    const initialValue = variable.initialValue ?? '0';
    model.variables.push({
      id: variable.id,
      name: variable.id,
      type: variable.type ?? 'float',
      initialValue,
      currentValue: variable.type === 'bool'
        ? initialValue === 'true'
        : Number(initialValue),
      visibleInScope: true,
    });
  }
  return model;
};

const trigSpecs = [
  ['SIN', 0.5, Math.sin(0.5)], ['COS', 0.5, Math.cos(0.5)],
  ['TAN', 0.5, Math.tan(0.5)], ['COT', 0.5, 1 / Math.tan(0.5)],
  ['SEC', 0.5, 1 / Math.cos(0.5)], ['COSEC', 0.5, 1 / Math.sin(0.5)],
  ['ASIN', 0.5, Math.asin(0.5)], ['ACOS', 0.5, Math.acos(0.5)],
  ['ATAN', 0.5, Math.atan(0.5)], ['ACOT', 0.5, Math.atan(1 / 0.5)],
  ['ASEC', 2, Math.acos(0.5)], ['ACOSEC', 2, Math.asin(0.5)],
  ['SINH', 0.5, Math.sinh(0.5)], ['COSH', 0.5, Math.cosh(0.5)],
  ['TANH', 0.5, Math.tanh(0.5)], ['COTH', 0.5, 1 / Math.tanh(0.5)],
  ['SECH', 0.5, 1 / Math.cosh(0.5)], ['COSECH', 0.5, 1 / Math.sinh(0.5)],
  ['ASINH', 0.5, Math.asinh(0.5)], ['ACOSH', 2, Math.acosh(2)],
  ['ATANH', 0.5, Math.atanh(0.5)], ['ACOTH', 2, Math.atanh(0.5)],
  ['ASECH', 0.5, Math.acosh(2)], ['ACOSECH', 2, Math.asinh(0.5)],
] as const;

const trigNodes: PersistedNode[] = [];
const trigEdges: ReturnType<typeof edge>[] = [];
const trigExpected: Record<string, number> = {};
for (const [type, input, expected] of trigSpecs) {
  const sourceId = `source_${type}`;
  const operationId = `operation_${type}`;
  trigNodes.push(
    constant(sourceId, input),
    node(operationId, type, [port('u', 'input')], [port('y', 'output')]),
  );
  trigEdges.push(edge(`edge_${type}`, sourceId, operationId, 'u'));
  trigExpected[`${operationId}:y`] = expected;
}

const logicSpecs = [
  ['AND', [true, false], false, 'boolean'],
  ['OR', [true, false], true, 'boolean'],
  ['NOT', [false], true, 'boolean'],
  ['NAND', [true, true], false, 'boolean'],
  ['NOR', [false, false], true, 'boolean'],
  ['XOR', [true, false], true, 'boolean'],
  ['BitwiseAND', [-2, 3], 2, 'int32'],
  ['BitwiseOR', [-8, 3], -5, 'int32'],
  ['BitwiseXOR', [-1, 5], -6, 'int32'],
  ['BitwiseNOT', [6], -7, 'int32'],
  ['ShiftLeft', [-3, 2], -12, 'int32'],
  ['ShiftRight', [-8, 2], -2, 'int32'],
] as const;

const logicNodes: PersistedNode[] = [];
const logicEdges: ReturnType<typeof edge>[] = [];
const logicExpected: Record<string, number | boolean> = {};
for (const [type, inputs, expected, dataType] of logicSpecs) {
  const operationId = `operation_${type}`;
  const inputIds = inputs.length === 1 ? ['u'] : type.startsWith('Shift') ? ['u', 'amount'] : ['a', 'b'];
  inputs.forEach((value, index) => {
    const sourceId = `source_${type}_${index}`;
    logicNodes.push(constant(sourceId, value, 'scalar', [], dataType));
    logicEdges.push(edge(`edge_${type}_${index}`, sourceId, operationId, inputIds[index]));
  });
  logicNodes.push(node(
    operationId,
    type,
    inputIds.map((id) => port(id, 'input', 'scalar', [], dataType)),
    [port('y', 'output', 'scalar', [], dataType)],
  ));
  logicExpected[`${operationId}:y`] = expected;
}

const routingNodes: PersistedNode[] = [];
const routingEdges: ReturnType<typeof edge>[] = [];
const routingExpected: Record<string, number | boolean | readonly number[]> = {};
const shapedValues = {
  scalar: { dimensions: [] as const, first: 10, second: 20 },
};
for (const shape of ['scalar'] as const) {
  const values = shapedValues.scalar;
  for (const type of ['SWITCH', 'IF_ELSE'] as const) {
    const operationId = `operation_${type}_${shape}`;
    const firstId = `source_${type}_${shape}_first`;
    const secondId = `source_${type}_${shape}_second`;
    const controlId = `source_${type}_${shape}_control`;
    const valuePorts = type === 'SWITCH' ? ['u1', 'u2'] : ['u_true', 'u_false'];
    const controlPort = type === 'SWITCH' ? 'control' : 'cond';
    routingNodes.push(
      constant(firstId, values.first, shape, values.dimensions),
      constant(secondId, values.second, shape, values.dimensions),
      constant(controlId, true, 'scalar', [], 'boolean'),
      node(operationId, type, [
        port(valuePorts[0], 'input', shape, values.dimensions),
        port(valuePorts[1], 'input', shape, values.dimensions),
        port(controlPort, 'input', 'scalar', [], 'boolean'),
      ], [port('y', 'output', shape, values.dimensions)]),
    );
    routingEdges.push(
      edge(`edge_${operationId}_first`, firstId, operationId, valuePorts[0]),
      edge(`edge_${operationId}_second`, secondId, operationId, valuePorts[1]),
      edge(`edge_${operationId}_control`, controlId, operationId, controlPort),
    );
    routingExpected[`${operationId}:y`] = values.first;
  }
}
for (const [criteria, control, expected] of [
  ['>', 0, 20],
  ['>=', 0, 10],
  ['<', -1, 10],
  ['<=', 0, 10],
] as const) {
  const suffix = criteria === '>' ? 'gt'
    : criteria === '>=' ? 'ge'
      : criteria === '<' ? 'lt' : 'le';
  const operationId = `operation_SWITCH_${suffix}`;
  const firstId = `source_SWITCH_${suffix}_first`;
  const secondId = `source_SWITCH_${suffix}_second`;
  const controlId = `source_SWITCH_${suffix}_control`;
  routingNodes.push(
    constant(firstId, 10),
    constant(secondId, 20),
    constant(controlId, control),
    node(operationId, 'SWITCH', [
      port('u1', 'input'), port('u2', 'input'), port('control', 'input'),
    ], [port('y', 'output')], { criteria, threshold: 0 }),
  );
  routingEdges.push(
    edge(`edge_${operationId}_first`, firstId, operationId, 'u1'),
    edge(`edge_${operationId}_second`, secondId, operationId, 'u2'),
    edge(`edge_${operationId}_control`, controlId, operationId, 'control'),
  );
  routingExpected[`${operationId}:y`] = expected;
}
routingNodes.push(
  constant('source_MUX_0', 3),
  constant('source_MUX_1', 4),
  node('operation_MUX', 'MUX', [port('in1', 'input'), port('in2', 'input')], [port('y', 'output', 'vector', [2])]),
  constant('source_DEMUX', [7, 8], 'vector', [2]),
  node('operation_DEMUX', 'DEMUX', [port('u', 'input', 'vector', [2])], [port('out1', 'output'), port('out2', 'output')]),
);
routingEdges.push(
  edge('edge_MUX_0', 'source_MUX_0', 'operation_MUX', 'in1'),
  edge('edge_MUX_1', 'source_MUX_1', 'operation_MUX', 'in2'),
  edge('edge_DEMUX', 'source_DEMUX', 'operation_DEMUX', 'u'),
);
routingExpected['operation_MUX:y'] = [3, 4];
routingExpected['operation_DEMUX:out1'] = 7;
routingExpected['operation_DEMUX:out2'] = 8;

const discontinuityNodes = [
  node('operation_SATURATION', 'SATURATION', [port('u', 'input')], [port('y', 'output')], { lower: -1, upper: 1 }),
  node('operation_DEADZONE', 'DEADZONE', [port('u', 'input')], [port('y', 'output')], { end: -0.5, start: 0.5 }),
  node('operation_RATE_LIMITER', 'RATE_LIMITER', [port('u', 'input')], [port('y', 'output')], {
    risingLimit: 100, fallingLimit: 100, sampleTime: 0.01,
  }),
  node('operation_RELAY', 'RELAY', [port('u', 'input')], [port('y', 'output', 'scalar', [], 'boolean')], {
    switchOn: 1, switchOff: 0, initialState: false,
  }),
];
const discontinuityMappings = ['SATURATION', 'DEADZONE', 'RATE_LIMITER', 'RELAY'].map((type) => ({
  smVarId: `input_${type}`,
  blockId: `operation_${type}`,
  portId: 'u',
  direction: 'in',
}));

const scalarCoverage = (blockType: string): XBConformanceCoverage => ({
  blockType, inputShapes: ['scalar'], outputShapes: ['scalar'],
});

export const XB_EXECUTABLE_C_CONFORMANCE_CASES: readonly XBExecutableCConformanceCase[] = Object.freeze([
  {
    id: 'logic-bitwise-family',
    conformanceCaseId: 'T10-C99-LOGIC-BITWISE',
    coverage: logicSpecs.map(([type]) => scalarCoverage(type)),
    model: embeddedModel(logicNodes, logicEdges),
    steps: [{ kind: 'step' }],
    expectedFinalSignals: logicExpected,
  },
  {
    id: 'routing-family',
    conformanceCaseId: 'T10-C99-SIGNAL-ROUTING',
    coverage: [
      scalarCoverage('SWITCH'),
      scalarCoverage('IF_ELSE'),
      { blockType: 'MUX', inputShapes: ['scalar'], outputShapes: ['vector'] },
      { blockType: 'DEMUX', inputShapes: ['vector'], outputShapes: ['scalar'] },
    ],
    model: embeddedModel(routingNodes, routingEdges),
    steps: [{ kind: 'step' }],
    expectedFinalSignals: routingExpected,
  },
  {
    id: 'trigonometry-family',
    conformanceCaseId: 'T10-C99-TRIGONOMETRY',
    coverage: trigSpecs.map(([type]) => scalarCoverage(type)),
    model: embeddedModel(trigNodes, trigEdges),
    steps: [{ kind: 'step' }],
    expectedFinalSignals: trigExpected,
  },
  {
    id: 'discontinuity-family',
    conformanceCaseId: 'T10-C99-DISCONTINUOUS',
    coverage: ['SATURATION', 'DEADZONE', 'RATE_LIMITER', 'RELAY'].map(scalarCoverage),
    model: embeddedModel(
      discontinuityNodes,
      [],
      discontinuityMappings,
      ['SATURATION', 'DEADZONE', 'RATE_LIMITER', 'RELAY'].map((type) => ({ id: `input_${type}` })),
    ),
    steps: [
      { kind: 'step', inputs: { input_SATURATION: 2, input_DEADZONE: 0.25, input_RATE_LIMITER: 2, input_RELAY: 2 } },
      { kind: 'step', inputs: { input_SATURATION: -2, input_DEADZONE: 2, input_RATE_LIMITER: -2, input_RELAY: 0.5 } },
      { kind: 'step', inputs: { input_SATURATION: 0.5, input_DEADZONE: -2, input_RATE_LIMITER: 2, input_RELAY: -1 } },
    ],
    expectedFinalSignals: {
      'operation_SATURATION:y': 0.5,
      'operation_DEADZONE:y': -1.5,
      'operation_RATE_LIMITER:y': 1,
      'operation_RELAY:y': false,
    },
    expectedFrames: [
      {
        signals: {
          'operation_RATE_LIMITER:y': 0,
          'operation_RELAY:y': false,
        },
        blockState: {
          operation_RATE_LIMITER: { prev_y: 0 },
          operation_RELAY: { current_on: false },
        },
      },
      {
        signals: {
          'operation_RATE_LIMITER:y': 1,
          'operation_RELAY:y': true,
        },
        blockState: {
          operation_RATE_LIMITER: { prev_y: 1 },
          operation_RELAY: { current_on: true },
        },
      },
      {
        signals: {
          'operation_RATE_LIMITER:y': 0,
          'operation_RELAY:y': true,
        },
        blockState: {
          operation_RATE_LIMITER: { prev_y: 0 },
          operation_RELAY: { current_on: true },
        },
      },
      {
        signals: {
          'operation_RATE_LIMITER:y': 1,
          'operation_RELAY:y': false,
        },
        blockState: {
          operation_RATE_LIMITER: { prev_y: 1 },
          operation_RELAY: { current_on: false },
        },
      },
    ],
  },
]);

export const XB_EXECUTABLE_C_CONFORMANCE_COVERAGE:
readonly XBConformanceCoverage[] = Object.freeze(
  XB_EXECUTABLE_C_CONFORMANCE_CASES.flatMap((testCase) => testCase.coverage),
);
