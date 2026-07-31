import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import type { SemanticModel } from './smSemanticModel';
import type {
  XBSemanticModel,
  XBSemanticOperation,
  XBSemanticSignal,
} from './xbSemanticModel';
import {
  xbConvertScalar,
  type XBConversionPolicy,
  type XBFixedType,
  type XBNumericType,
  type XBShape,
} from './xbNumeric';
import { createXBRuntime, stepXBState } from './xbInterpreter';
import { generateCArtifacts } from './smCGenerator';
import {
  renderXBHeader,
  renderXBInstanceMembers,
  renderXBSource,
} from './xbCGenerator';

const scalar = { kind: 'scalar' } as const;
const float32 = { kind: 'float32' } as const;

const signal = (
  id: string,
  numericType: XBNumericType,
  shape: XBShape = scalar,
): XBSemanticSignal => {
  const [nodeId, portId] = id.split(':');
  const dimensions = shape.kind === 'scalar'
    ? []
    : shape.kind === 'vector'
      ? [shape.length]
      : [shape.rows, shape.columns];
  return {
    id,
    nodeId,
    portId,
    direction: 'output',
    sourceSignalId: null,
    shape,
    dimensions,
    elementCount: dimensions.length === 0
      ? 1
      : dimensions.reduce((product, value) => product * value, 1),
    layout: shape.kind === 'scalar'
      ? 'scalar'
      : shape.kind === 'vector'
        ? 'contiguous'
        : 'row-major',
    numericType,
    storage: numericType.kind === 'fixed' ? 'stored-integer' : 'native',
  };
};

const operation = (
  id: string,
  conversion: XBSemanticOperation['conversion'] = null,
): XBSemanticOperation => ({
  id,
  type: conversion === null ? 'GAIN' : 'NUMERIC_REPRESENTATION',
  inputSignalIds: [],
  outputSignalIds: [`${id}:y`],
  parameters: {},
  directFeedthrough: true,
  stateful: false,
  conversion,
  state: null,
  schedule: {
    periodSubsteps: 1,
    offsetSubsteps: 0,
    initialCounter: 0,
    counterIncrement: 1,
    hold: 'none',
  },
});

const fixed16Q8: XBFixedType = {
  kind: 'fixed',
  signed: true,
  wordLength: 16,
  fractionLength: 8,
};

const xbModel = (): XBSemanticModel => ({
  stateId: 'controller',
  executionOrder: ['gain', 'quantize'],
  operations: {
    gain: operation('gain'),
    quantize: operation('quantize', {
      destinationType: fixed16Q8,
      rounding: 'floor',
      overflow: 'saturate',
      mode: 'real-world-value',
    }),
  },
  signals: {
    'gain:y': signal('gain:y', float32),
    'quantize:y': signal('quantize:y', fixed16Q8),
    'vector:y': signal(
      'vector:y',
      { kind: 'fixed', signed: false, wordLength: 8, fractionLength: 0 },
      { kind: 'vector', length: 3 },
    ),
    'matrix:y': signal(
      'matrix:y',
      float32,
      { kind: 'matrix', rows: 2, columns: 2 },
    ),
  },
  mappings: [],
  solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 1 },
  policy: { memory: 'reset', numericFault: 'escalate' },
});

const semanticModel = (): SemanticModel => ({
  tickMs: 10,
  safetyMode: false,
  safeStateId: null,
  rootLayerId: 'root',
  states: {
    controller: {
      id: 'controller',
      name: 'Controller',
      entrySource: '',
      duringSource: '',
      exitSource: '',
      enumName: 'SM_ST_CONTROLLER',
      parentStateId: null,
      layerId: 'root',
      depth: 0,
      priority: 1,
      activeSlot: 0,
      activityIndex: 0,
      terminal: false,
      ancestorStateIds: [],
      childLayerIds: [],
      internalTransitionIds: [],
      entryActions: [],
      duringActions: [],
      exitActions: [],
      xBridges: xbModel(),
    },
  },
  layers: {
    root: {
      id: 'root',
      name: 'Root',
      parentStateId: null,
      decomposition: 'OR',
      children: ['controller'],
      transitionIds: [],
      junctionIds: [],
      activeSlot: 0,
      defaultEntryId: 'controller',
      defaultEntryKind: 'state',
    },
  },
  junctions: {},
  transitions: {},
  transitionsBySource: {},
  variables: {},
  ioMappings: [],
  activeSlotCount: 1,
});

const scalarInputSignal = (
  id: string,
  sourceSignalId: string,
  numericType: XBNumericType = float32,
): XBSemanticSignal => ({
  ...signal(id, numericType),
  direction: 'input',
  sourceSignalId,
});

const scalarOperation = (
  id: string,
  type: string,
  inputSignalIds: readonly string[],
  outputSignalIds: readonly string[],
  parameters: XBSemanticOperation['parameters'] = {},
  conversion: XBSemanticOperation['conversion'] = null,
): XBSemanticOperation => ({
  ...operation(id, conversion),
  type,
  inputSignalIds,
  outputSignalIds,
  parameters,
});

const statefulOperation = (
  id: string,
  type: string,
  inputSignalIds: readonly string[],
  outputSignalIds: readonly string[],
  initialValue: number,
): XBSemanticOperation => ({
  ...scalarOperation(id, type, inputSignalIds, outputSignalIds),
  directFeedthrough: false,
  stateful: true,
  state: {
    outputPhase: 'read-before-update',
    updatePhase: 'after-direct-feedthrough',
    slots: outputSignalIds.map((signalId) => ({
      id: `${signalId}$state`,
      role: signalId.slice(signalId.indexOf(':') + 1),
      signalId,
      numericType: { kind: 'float64' } as const,
      shape: scalar,
      initialValues: [initialValue],
    })),
  },
  schedule: {
    periodSubsteps: 1,
    offsetSubsteps: 0,
    initialCounter: 0,
    counterIncrement: 1,
    hold: 'none',
  },
});

const continuousSolverModel = (
  kind: 'euler' | 'rk4',
): SemanticModel => {
  const ir = semanticModel();
  const float64 = { kind: 'float64' } as const;
  const integrator = statefulOperation(
    'integrator', 'INTEGRATOR_CONTINUOUS', ['integrator:u'], ['integrator:y'], 0,
  );
  const delay = {
    ...statefulOperation('delay', 'DELAY', ['delay:u'], ['delay:y'], 0),
    schedule: {
      periodSubsteps: 10,
      offsetSubsteps: 0,
      initialCounter: 0,
      counterIncrement: 1,
      hold: 'zero-order' as const,
    },
  } satisfies XBSemanticOperation;
  const negative = scalarOperation(
    'negative', 'GAIN', ['negative:u'], ['negative:y'], { gain: -1 },
  );
  const derivative = scalarOperation(
    'derivative', 'Sum', ['derivative:a', 'derivative:b'], ['derivative:y'],
  );
  const downstream = scalarOperation(
    'downstream', 'GAIN', ['downstream:u'], ['downstream:y'], { gain: 2 },
  );
  ir.variables = {
    u: { id: 'u', name: 'u', cName: 'u', type: 'double', initialValue: 0 },
    x: { id: 'x', name: 'x', cName: 'x', type: 'double', initialValue: 0 },
    d: { id: 'd', name: 'd', cName: 'd', type: 'double', initialValue: 0 },
    twice: { id: 'twice', name: 'twice', cName: 'twice', type: 'double', initialValue: 0 },
  };
  ir.states.controller.xBridges = {
    stateId: 'controller',
    executionOrder: ['delay', 'integrator', 'negative', 'derivative', 'downstream'],
    operations: { delay, integrator, negative, derivative, downstream },
    signals: {
      'input:y': signal('input:y', float64),
      'delay:u': scalarInputSignal('delay:u', 'input:y', float64),
      'delay:y': signal('delay:y', float64),
      'integrator:u': scalarInputSignal('integrator:u', 'derivative:y', float64),
      'integrator:y': signal('integrator:y', float64),
      'negative:u': scalarInputSignal('negative:u', 'integrator:y', float64),
      'negative:y': signal('negative:y', float64),
      'derivative:a': scalarInputSignal('derivative:a', 'negative:y', float64),
      'derivative:b': scalarInputSignal('derivative:b', 'input:y', float64),
      'derivative:y': signal('derivative:y', float64),
      'downstream:u': scalarInputSignal('downstream:u', 'integrator:y', float64),
      'downstream:y': signal('downstream:y', float64),
    },
    mappings: [{
      variableId: 'u', signalId: 'input:y', blockId: 'input', portId: 'y',
      direction: 'in', numericType: float64,
    }, {
      variableId: 'x', signalId: 'integrator:y', blockId: 'integrator', portId: 'y',
      direction: 'out', numericType: float64,
    }, {
      variableId: 'd', signalId: 'delay:y', blockId: 'delay', portId: 'y',
      direction: 'out', numericType: float64,
    }, {
      variableId: 'twice', signalId: 'downstream:y', blockId: 'downstream', portId: 'y',
      direction: 'out', numericType: float64,
    }],
    solver: { kind, stepSeconds: 0.002, substepsPerTick: 5 },
    policy: { memory: 'reset', numericFault: 'escalate' },
  };
  return ir;
};

const fixedDelayModel = (): SemanticModel => {
  const ir = continuousSolverModel('euler');
  const xb = ir.states.controller.xBridges!;
  const q2 = {
    kind: 'fixed', signed: true, wordLength: 16, fractionLength: 2,
  } as const;
  const delay = xb.operations.delay;
  ir.states.controller.xBridges = {
    ...xb,
    operations: {
      ...xb.operations,
      delay: {
        ...delay,
        state: {
          ...delay.state!,
          slots: delay.state!.slots.map((slot) => ({ ...slot, numericType: q2 })),
        },
      },
    },
    signals: {
      ...xb.signals,
      'delay:y': { ...xb.signals['delay:y'], numericType: q2, storage: 'stored-integer' },
    },
    mappings: xb.mappings.map((mapping) =>
      mapping.variableId === 'd' ? { ...mapping, numericType: q2 } : mapping),
    policy: { memory: 'reset', numericFault: 'signal-only' },
  };
  return ir;
};

const combinationalSemanticModel = (): SemanticModel => {
  const ir = semanticModel();
  const booleanType = { kind: 'boolean' } as const;
  const int32 = {
    kind: 'fixed',
    signed: true,
    wordLength: 32,
    fractionLength: 0,
  } as const;
  const fixedQ2 = {
    kind: 'fixed',
    signed: true,
    wordLength: 16,
    fractionLength: 2,
  } as const;
  const fixedQ1 = {
    kind: 'fixed',
    signed: true,
    wordLength: 16,
    fractionLength: 1,
  } as const;
  const operations = [
    scalarOperation('input', 'Inport', [], ['input:y']),
    scalarOperation('constant', 'Constant', [], ['constant:y'], { value: 3 }),
    scalarOperation('step', 'Step', [], ['step:y'], {
      stepTime: 0,
      initialValue: 0,
      finalValue: 1,
    }),
    scalarOperation('gain', 'GAIN', ['gain:u'], ['gain:y'], { gain: 2 }),
    scalarOperation(
      'sum',
      'Sum',
      ['sum:u1', 'sum:u2'],
      ['sum:y'],
      { signs: '++' },
    ),
    scalarOperation(
      'product',
      'PRODUCT',
      ['product:u1', 'product:u2'],
      ['product:y'],
    ),
    scalarOperation('negate', 'UnaryNeg', ['negate:u'], ['negate:y']),
    scalarOperation('absolute', 'Abs', ['absolute:u'], ['absolute:y']),
    scalarOperation(
      'logical-and',
      'AND',
      ['logical-and:a', 'logical-and:b'],
      ['logical-and:y'],
    ),
    scalarOperation('logical-not', 'NOT', ['logical-not:u'], ['logical-not:y']),
    scalarOperation(
      'logical-xor',
      'XOR',
      ['logical-xor:a', 'logical-xor:b'],
      ['logical-xor:y'],
    ),
    scalarOperation(
      'bitwise-and',
      'BitwiseAND',
      ['bitwise-and:a', 'bitwise-and:b'],
      ['bitwise-and:y'],
    ),
    scalarOperation(
      'shift-left',
      'ShiftLeft',
      ['shift-left:u', 'shift-left:amount'],
      ['shift-left:y'],
    ),
    scalarOperation(
      'shift-right',
      'ShiftRight',
      ['shift-right:u', 'shift-right:amount'],
      ['shift-right:y'],
    ),
    scalarOperation(
      'switch',
      'SWITCH',
      ['switch:u1', 'switch:u2', 'switch:control'],
      ['switch:y'],
      { threshold: 0, criteria: '>' },
    ),
    scalarOperation(
      'convert',
      'NUMERIC_REPRESENTATION',
      ['convert:u'],
      ['convert:y', 'convert:e'],
      {},
      {
        destinationType: fixedQ2,
        rounding: 'floor',
        overflow: 'saturate',
        mode: 'real-world-value',
      },
    ),
    scalarOperation(
      'reinterpret',
      'DATA_TYPE_CONVERSION',
      ['reinterpret:u'],
      ['reinterpret:y'],
      {},
      {
        destinationType: fixedQ1,
        rounding: 'floor',
        overflow: 'saturate',
        mode: 'stored-integer-reinterpretation',
      },
    ),
    scalarOperation('output', 'Outport', ['output:u'], []),
    scalarOperation('terminator', 'TERMINATOR', ['terminator:u'], []),
  ];
  const signals: Record<string, XBSemanticSignal> = {
    'input:y': signal('input:y', float32),
    'constant:y': signal('constant:y', float32),
    'step:y': signal('step:y', int32),
    'gain:u': scalarInputSignal('gain:u', 'input:y'),
    'gain:y': signal('gain:y', float32),
    'sum:u1': scalarInputSignal('sum:u1', 'gain:y'),
    'sum:u2': scalarInputSignal('sum:u2', 'constant:y'),
    'sum:y': signal('sum:y', float32),
    'product:u1': scalarInputSignal('product:u1', 'sum:y'),
    'product:u2': scalarInputSignal('product:u2', 'constant:y'),
    'product:y': signal('product:y', float32),
    'negate:u': scalarInputSignal('negate:u', 'product:y'),
    'negate:y': signal('negate:y', float32),
    'absolute:u': scalarInputSignal('absolute:u', 'negate:y'),
    'absolute:y': signal('absolute:y', float32),
    'logical-and:a': scalarInputSignal('logical-and:a', 'absolute:y'),
    'logical-and:b': scalarInputSignal('logical-and:b', 'constant:y'),
    'logical-and:y': signal('logical-and:y', booleanType),
    'logical-not:u': scalarInputSignal('logical-not:u', 'logical-and:y', booleanType),
    'logical-not:y': signal('logical-not:y', booleanType),
    'logical-xor:a': scalarInputSignal('logical-xor:a', 'logical-and:y', booleanType),
    'logical-xor:b': scalarInputSignal('logical-xor:b', 'logical-not:y', booleanType),
    'logical-xor:y': signal('logical-xor:y', booleanType),
    'bitwise-and:a': scalarInputSignal('bitwise-and:a', 'input:y'),
    'bitwise-and:b': scalarInputSignal('bitwise-and:b', 'constant:y'),
    'bitwise-and:y': signal('bitwise-and:y', int32),
    'shift-left:u': scalarInputSignal('shift-left:u', 'bitwise-and:y', int32),
    'shift-left:amount': scalarInputSignal('shift-left:amount', 'step:y', int32),
    'shift-left:y': signal('shift-left:y', int32),
    'shift-right:u': scalarInputSignal('shift-right:u', 'shift-left:y', int32),
    'shift-right:amount': scalarInputSignal(
      'shift-right:amount',
      'step:y',
      int32,
    ),
    'shift-right:y': signal('shift-right:y', int32),
    'switch:u1': scalarInputSignal('switch:u1', 'absolute:y'),
    'switch:u2': scalarInputSignal('switch:u2', 'input:y'),
    'switch:control': scalarInputSignal(
      'switch:control',
      'logical-xor:y',
      booleanType,
    ),
    'switch:y': signal('switch:y', float32),
    'convert:u': scalarInputSignal('convert:u', 'switch:y'),
    'convert:y': signal('convert:y', fixedQ2),
    'convert:e': signal('convert:e', float32),
    'reinterpret:u': scalarInputSignal('reinterpret:u', 'convert:y', fixedQ2),
    'reinterpret:y': signal('reinterpret:y', fixedQ1),
    'output:u': scalarInputSignal('output:u', 'reinterpret:y', fixedQ1),
    'terminator:u': scalarInputSignal('terminator:u', 'shift-left:y', int32),
  };
  ir.variables = {
    u: { id: 'u', name: 'u', cName: 'u', type: 'float', initialValue: 5 },
    y: { id: 'y', name: 'y', cName: 'y', type: 'float', initialValue: 0 },
    bits: {
      id: 'bits',
      name: 'bits',
      cName: 'bits',
      type: 'int32',
      initialValue: 0,
    },
    flag: {
      id: 'flag',
      name: 'flag',
      cName: 'flag',
      type: 'bool',
      initialValue: false,
    },
    error: {
      id: 'error',
      name: 'error',
      cName: 'error',
      type: 'float',
      initialValue: -1,
    },
  };
  ir.states.controller.xBridges = {
    stateId: 'controller',
    executionOrder: operations.map(({ id }) => id),
    operations: Object.fromEntries(operations.map((entry) => [entry.id, entry])),
    signals,
    mappings: [
      {
        variableId: 'u',
        signalId: 'input:y',
        blockId: 'input',
        portId: 'y',
        direction: 'in',
        numericType: float32,
      },
      {
        variableId: 'y',
        signalId: 'output:u',
        blockId: 'output',
        portId: 'u',
        direction: 'out',
        numericType: float32,
      },
      {
        variableId: 'bits',
        signalId: 'shift-left:y',
        blockId: 'shift-left',
        portId: 'y',
        direction: 'out',
        numericType: int32,
      },
      {
        variableId: 'flag',
        signalId: 'logical-xor:y',
        blockId: 'logical-xor',
        portId: 'y',
        direction: 'out',
        numericType: booleanType,
      },
      {
        variableId: 'error',
        signalId: 'convert:e',
        blockId: 'convert',
        portId: 'e',
        direction: 'out',
        numericType: float32,
      },
    ],
    solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 1 },
    policy: { memory: 'reset', numericFault: 'escalate' },
  };
  return ir;
};

const signalOnlyNonFiniteModel = (): SemanticModel => {
  const ir = semanticModel();
  const float64 = { kind: 'float64' } as const;
  const booleanType = { kind: 'boolean' } as const;
  const fixedQ2 = {
    kind: 'fixed',
    signed: true,
    wordLength: 16,
    fractionLength: 2,
  } as const;
  const operations = [
    scalarOperation('one', 'Constant', [], ['one:y'], { value: 1 }),
    scalarOperation(
      'convert',
      'NUMERIC_REPRESENTATION',
      ['convert:u'],
      ['convert:y'],
      {},
      {
        destinationType: fixedQ2,
        rounding: 'floor',
        overflow: 'saturate',
        mode: 'real-world-value',
      },
    ),
    scalarOperation('gain', 'GAIN', ['gain:u'], ['gain:y'], { gain: 2 }),
    scalarOperation(
      'and',
      'AND',
      ['and:a', 'and:b'],
      ['and:y'],
    ),
  ];
  const signals: Record<string, XBSemanticSignal> = {
    'input:y': signal('input:y', float64),
    'one:y': signal('one:y', float64),
    'convert:u': scalarInputSignal('convert:u', 'input:y', float64),
    'convert:y': signal('convert:y', fixedQ2),
    'gain:u': scalarInputSignal('gain:u', 'convert:y', fixedQ2),
    'gain:y': signal('gain:y', float64),
    'and:a': scalarInputSignal('and:a', 'convert:y', fixedQ2),
    'and:b': scalarInputSignal('and:b', 'one:y', float64),
    'and:y': signal('and:y', booleanType),
  };
  ir.variables = {
    u: { id: 'u', name: 'u', cName: 'u', type: 'double', initialValue: 0 },
    fixed: {
      id: 'fixed',
      name: 'fixed',
      cName: 'fixed',
      type: 'double',
      initialValue: 0,
    },
    doubled: {
      id: 'doubled',
      name: 'doubled',
      cName: 'doubled',
      type: 'double',
      initialValue: 0,
    },
    truth: {
      id: 'truth',
      name: 'truth',
      cName: 'truth',
      type: 'bool',
      initialValue: false,
    },
  };
  ir.states.controller.xBridges = {
    stateId: 'controller',
    executionOrder: operations.map(({ id }) => id),
    operations: Object.fromEntries(operations.map((entry) => [entry.id, entry])),
    signals,
    mappings: [
      {
        variableId: 'u',
        signalId: 'input:y',
        blockId: 'input',
        portId: 'y',
        direction: 'in',
        numericType: float64,
      },
      {
        variableId: 'fixed',
        signalId: 'convert:y',
        blockId: 'convert',
        portId: 'y',
        direction: 'out',
        numericType: float64,
      },
      {
        variableId: 'doubled',
        signalId: 'gain:y',
        blockId: 'gain',
        portId: 'y',
        direction: 'out',
        numericType: float64,
      },
      {
        variableId: 'truth',
        signalId: 'and:y',
        blockId: 'and',
        portId: 'y',
        direction: 'out',
        numericType: booleanType,
      },
    ],
    solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 1 },
    policy: { memory: 'reset', numericFault: 'signal-only' },
  };
  return ir;
};

const truthSemanticModel = (): SemanticModel => {
  const ir = semanticModel();
  const float64 = { kind: 'float64' } as const;
  const booleanType = { kind: 'boolean' } as const;
  const gate = (
    id: string,
    type: string,
    sources: readonly string[],
  ): XBSemanticOperation => scalarOperation(
    id,
    type,
    sources.map((_, index) => `${id}:u${index + 1}`),
    [`${id}:y`],
  );
  const operations = [
    scalarOperation('input', 'Inport', [], ['input:y']),
    scalarOperation('zero', 'Constant', [], ['zero:y'], { value: 0 }),
    scalarOperation('one', 'Constant', [], ['one:y'], { value: 1 }),
    gate('and', 'AND', ['input:y', 'one:y']),
    gate('or', 'OR', ['input:y', 'zero:y']),
    gate('not', 'NOT', ['input:y']),
    gate('nand', 'NAND', ['input:y', 'one:y']),
    gate('nor', 'NOR', ['input:y', 'zero:y']),
    gate('xor', 'XOR', ['input:y', 'zero:y']),
    scalarOperation(
      'convert-bool',
      'DATA_TYPE_CONVERSION',
      ['convert-bool:u'],
      ['convert-bool:y'],
      {},
      {
        destinationType: booleanType,
        rounding: 'floor',
        overflow: 'saturate',
        mode: 'real-world-value',
      },
    ),
  ];
  const signals: Record<string, XBSemanticSignal> = {
    'input:y': signal('input:y', float64),
    'zero:y': signal('zero:y', float64),
    'one:y': signal('one:y', float64),
    'convert-bool:u': scalarInputSignal('convert-bool:u', 'input:y', float64),
    'convert-bool:y': signal('convert-bool:y', booleanType),
  };
  for (const operation of operations.filter(({ id }) =>
    ['and', 'or', 'not', 'nand', 'nor', 'xor'].includes(id))) {
    const sources = operation.id === 'not'
      ? ['input:y']
      : operation.id === 'and' || operation.id === 'nand'
        ? ['input:y', 'one:y']
        : ['input:y', 'zero:y'];
    operation.inputSignalIds.forEach((signalId, index) => {
      signals[signalId] = scalarInputSignal(signalId, sources[index], float64);
    });
    signals[`${operation.id}:y`] = signal(`${operation.id}:y`, booleanType);
  }
  const outputIds = ['and', 'or', 'not', 'nand', 'nor', 'xor', 'convert-bool'];
  ir.variables = {
    u: { id: 'u', name: 'u', cName: 'u', type: 'double', initialValue: 0 },
    ...Object.fromEntries(outputIds.map((id) => [
      id,
      {
        id,
        name: id,
        cName: `out_${id.replace('-', '_')}`,
        type: 'bool' as const,
        initialValue: false,
      },
    ])),
  };
  ir.states.controller.xBridges = {
    stateId: 'controller',
    executionOrder: operations.map(({ id }) => id),
    operations: Object.fromEntries(operations.map((entry) => [entry.id, entry])),
    signals,
    mappings: [
      {
        variableId: 'u',
        signalId: 'input:y',
        blockId: 'input',
        portId: 'y',
        direction: 'in',
        numericType: float64,
      },
      ...outputIds.map((id) => ({
        variableId: id,
        signalId: `${id}:y`,
        blockId: id,
        portId: 'y',
        direction: 'out' as const,
        numericType: booleanType,
      })),
    ],
    solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 1 },
    policy: { memory: 'reset', numericFault: 'signal-only' },
  };
  return ir;
};

const booleanConversionModel = (
  type: 'DATA_TYPE_CONVERSION' | 'NUMERIC_REPRESENTATION',
): SemanticModel => {
  const ir = semanticModel();
  const float64 = { kind: 'float64' } as const;
  const booleanType = { kind: 'boolean' } as const;
  const convert = scalarOperation(
    'convert',
    type,
    ['convert:u'],
    ['convert:y', 'convert:e'],
    {},
    {
      destinationType: booleanType,
      rounding: 'floor',
      overflow: 'saturate',
      mode: 'real-world-value',
    },
  );
  ir.variables = {
    u: { id: 'u', name: 'u', cName: 'u', type: 'double', initialValue: 0 },
    y: { id: 'y', name: 'y', cName: 'y', type: 'bool', initialValue: false },
    e: { id: 'e', name: 'e', cName: 'e', type: 'double', initialValue: 0 },
  };
  ir.states.controller.xBridges = {
    stateId: 'controller',
    executionOrder: ['convert'],
    operations: { convert },
    signals: {
      'convert:u': {
        ...signal('convert:u', float64),
        direction: 'input',
      },
      'convert:y': signal('convert:y', booleanType),
      'convert:e': signal('convert:e', float64),
    },
    mappings: [
      {
        variableId: 'u',
        signalId: 'convert:u',
        blockId: 'convert',
        portId: 'u',
        direction: 'in',
        numericType: float64,
      },
      {
        variableId: 'y',
        signalId: 'convert:y',
        blockId: 'convert',
        portId: 'y',
        direction: 'out',
        numericType: booleanType,
      },
      {
        variableId: 'e',
        signalId: 'convert:e',
        blockId: 'convert',
        portId: 'e',
        direction: 'out',
        numericType: float64,
      },
    ],
    solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 1 },
    policy: { memory: 'reset', numericFault: 'signal-only' },
  };
  return ir;
};

const reinterpretationParityModel = (): SemanticModel => {
  const ir = semanticModel();
  const float64 = { kind: 'float64' } as const;
  const fixedQ4 = {
    kind: 'fixed',
    signed: true,
    wordLength: 8,
    fractionLength: 4,
  } as const;
  const fixedQ2 = {
    kind: 'fixed',
    signed: true,
    wordLength: 8,
    fractionLength: 2,
  } as const;
  const quantize = scalarOperation(
    'quantize',
    'NUMERIC_REPRESENTATION',
    ['quantize:u'],
    ['quantize:y'],
    {},
    {
      destinationType: fixedQ4,
      rounding: 'floor',
      overflow: 'saturate',
      mode: 'real-world-value',
    },
  );
  const reinterpret = scalarOperation(
    'reinterpret',
    'DATA_TYPE_CONVERSION',
    ['reinterpret:u'],
    ['reinterpret:y', 'reinterpret:e'],
    {},
    {
      destinationType: fixedQ2,
      rounding: 'floor',
      overflow: 'saturate',
      mode: 'stored-integer-reinterpretation',
    },
  );
  ir.variables = {
    u: { id: 'u', name: 'u', cName: 'u', type: 'double', initialValue: 0 },
    y: { id: 'y', name: 'y', cName: 'y', type: 'double', initialValue: 0 },
    e: { id: 'e', name: 'e', cName: 'e', type: 'double', initialValue: 0 },
  };
  ir.states.controller.xBridges = {
    stateId: 'controller',
    executionOrder: ['quantize', 'reinterpret'],
    operations: { quantize, reinterpret },
    signals: {
      'quantize:u': {
        ...signal('quantize:u', float64),
        direction: 'input',
      },
      'quantize:y': signal('quantize:y', fixedQ4),
      'reinterpret:u': scalarInputSignal(
        'reinterpret:u',
        'quantize:y',
        fixedQ4,
      ),
      'reinterpret:y': signal('reinterpret:y', fixedQ2),
      'reinterpret:e': signal('reinterpret:e', float64),
    },
    mappings: [
      {
        variableId: 'u',
        signalId: 'quantize:u',
        blockId: 'quantize',
        portId: 'u',
        direction: 'in',
        numericType: float64,
      },
      {
        variableId: 'y',
        signalId: 'reinterpret:y',
        blockId: 'reinterpret',
        portId: 'y',
        direction: 'out',
        numericType: float64,
      },
      {
        variableId: 'e',
        signalId: 'reinterpret:e',
        blockId: 'reinterpret',
        portId: 'e',
        direction: 'out',
        numericType: float64,
      },
    ],
    solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 1 },
    policy: { memory: 'reset', numericFault: 'signal-only' },
  };
  return ir;
};

describe('X-Bridges C99 static storage', () => {
  it('T10-C99-VECTOR-MATRIX executes vector and row-major matrix operations identically to the interpreter', { timeout: 60_000 }, () => {
    const ir = semanticModel();
    const matrix23 = { kind: 'matrix', rows: 2, columns: 3 } as const;
    const matrix32 = { kind: 'matrix', rows: 3, columns: 2 } as const;
    const matrix22 = { kind: 'matrix', rows: 2, columns: 2 } as const;
    const matrix21 = { kind: 'matrix', rows: 2, columns: 1 } as const;
    const shaped = (id: string, shape: XBShape, sourceSignalId: string | null = null): XBSemanticSignal => ({
      ...signal(id, float32, shape), direction: sourceSignalId === null ? 'output' : 'input', sourceSignalId,
    });
    const matrixOperation = (id: string, type: string, inputSignalIds: readonly string[], outputSignalIds: readonly string[], parameters: XBSemanticOperation['parameters'] = {}): XBSemanticOperation => ({
      ...scalarOperation(id, type, inputSignalIds, outputSignalIds, parameters),
    });
    ir.states.controller.xBridges = {
      stateId: 'controller', executionOrder: ['add', 'subtract', 'multiply', 'divide', 'mul', 'transpose', 'concat', 'diag', 'sub', 'solve', 'singular'],
      operations: {
        add: matrixOperation('add', 'VectorAdd', ['add:a', 'add:b'], ['add:y']),
        subtract: matrixOperation('subtract', 'VectorSub', ['subtract:a', 'subtract:b'], ['subtract:y']),
        multiply: matrixOperation('multiply', 'VectorMul', ['multiply:a', 'multiply:b'], ['multiply:y']),
        divide: matrixOperation('divide', 'VectorDiv', ['divide:a', 'divide:b'], ['divide:y']),
        mul: matrixOperation('mul', 'MatrixMul', ['mul:a', 'mul:b'], ['mul:y']),
        transpose: matrixOperation('transpose', 'Transpose', ['transpose:u'], ['transpose:y']),
        concat: matrixOperation('concat', 'MatrixConcat', ['concat:a', 'concat:b'], ['concat:y'], { axis: 1 }),
        diag: matrixOperation('diag', 'MatrixDiag', ['diag:u'], ['diag:y']),
        sub: matrixOperation('sub', 'SubMatrix', ['sub:u'], ['sub:y'], { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 2 }),
        solve: matrixOperation('solve', 'MatrixSolve', ['solve:a', 'solve:b'], ['solve:y'], { maxDimension: 4 }),
        singular: matrixOperation('singular', 'MatrixSolve', ['singular:a', 'singular:b'], ['singular:y'], { maxDimension: 4 }),
      },
      signals: {
        ...Object.fromEntries(['add', 'subtract', 'multiply', 'divide'].flatMap((id) => [
          [`${id}:a`, shaped(`${id}:a`, { kind: 'vector', length: 3 })],
          [`${id}:b`, shaped(`${id}:b`, { kind: 'vector', length: 3 })],
          [`${id}:y`, shaped(`${id}:y`, { kind: 'vector', length: 3 })],
        ])),
        'mul:a': shaped('mul:a', matrix23), 'mul:b': shaped('mul:b', matrix32), 'mul:y': shaped('mul:y', matrix22),
        'transpose:u': shaped('transpose:u', matrix22, 'mul:y'), 'transpose:y': shaped('transpose:y', matrix22),
        'concat:a': shaped('concat:a', matrix22, 'mul:y'), 'concat:b': shaped('concat:b', matrix22, 'transpose:y'), 'concat:y': shaped('concat:y', { kind: 'matrix', rows: 2, columns: 4 }),
        'diag:u': shaped('diag:u', { kind: 'vector', length: 2 }), 'diag:y': shaped('diag:y', matrix22),
        'sub:u': shaped('sub:u', { kind: 'matrix', rows: 2, columns: 4 }, 'concat:y'), 'sub:y': shaped('sub:y', { kind: 'matrix', rows: 1, columns: 2 }),
        'solve:a': shaped('solve:a', matrix22), 'solve:b': shaped('solve:b', matrix21), 'solve:y': shaped('solve:y', matrix21),
        'singular:a': shaped('singular:a', matrix22), 'singular:b': shaped('singular:b', matrix21), 'singular:y': shaped('singular:y', matrix21),
      },
      mappings: [], solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 1 }, policy: { memory: 'retain', numericFault: 'escalate' },
    };
    const runtime = createXBRuntime(ir.states.controller.xBridges!);
    Object.assign(runtime.signals, {
      'add:a': [1, 2, 3], 'add:b': [4, -2, 0.5],
      'subtract:a': [1, 2, 3], 'subtract:b': [4, -2, 0.5],
      'multiply:a': [1, 2, 3], 'multiply:b': [4, -2, 0.5],
      'divide:a': [1, 2, 3], 'divide:b': [4, -2, 0.5],
      'mul:a': [1, 2, 3, 4, 5, 6], 'mul:b': [7, 8, 9, 10, 11, 12],
      'transpose:u': [1, 2, 3, 4], 'concat:a': [1, 2, 3, 4], 'concat:b': [5, 6, 7, 8],
      'diag:u': [9, 10], 'sub:u': [1, 2, 3, 4, 5, 6, 7, 8],
      'solve:a': [2, 1, 1, 3], 'solve:b': [5, 7],
      'singular:a': [1, 2, 2, 4], 'singular:b': [3, 6],
    });
    stepXBState(runtime, {});
    const expected = [
      ...['add:y', 'subtract:y', 'multiply:y', 'divide:y', 'mul:y', 'transpose:y', 'concat:y', 'diag:y', 'sub:y', 'solve:y', 'singular:y']
        .flatMap((id) => runtime.signals[id].map(Number)),
    ];
    const workspace = createGeneratedCodeTestWorkspace('xb-matrix-static-c99');
    try {
      for (const file of generateCArtifacts(ir, { includeTestShims: true }).files) writeFileSync(join(workspace.directory, file.name), file.content);
      const source = generateCArtifacts(ir).files.find((file) => file.name === 'sm_core.c')!.content;
      expect(source).toContain('#define SM_XB_MAX_SOLVE_DIMENSION 8U');
      writeFileSync(join(workspace.directory, 'harness.c'), [
        '#include "sm_core.h"', '#include <stdio.h>', '',
        'int main(void) {', '  ADIA_Instance_t instance;', '  if (SM_Init(&instance) != SM_ERR_NONE) return 1;',
        '  const double a[3] = {1, 2, 3}; const double b[3] = {4, -2, 0.5};',
        '  const double ma[6] = {1,2,3,4,5,6}; const double mb[6] = {7,8,9,10,11,12};',
        '  const double m22a[4] = {1,2,3,4}; const double m22b[4] = {5,6,7,8}; const double rhs[2] = {5,7}; const double singular[4] = {1,2,2,4};',
        '  for (unsigned i = 0; i < 3; ++i) { instance.xb_controller.add_a[i]=a[i]; instance.xb_controller.add_b[i]=b[i]; instance.xb_controller.subtract_a[i]=a[i]; instance.xb_controller.subtract_b[i]=b[i]; instance.xb_controller.multiply_a[i]=a[i]; instance.xb_controller.multiply_b[i]=b[i]; instance.xb_controller.divide_a[i]=a[i]; instance.xb_controller.divide_b[i]=b[i]; instance.xb_controller.diag_u[i < 2 ? i : 0] = i < 2 ? 9 + i : instance.xb_controller.diag_u[0]; }',
        '  for (unsigned i = 0; i < 6; ++i) { instance.xb_controller.mul_a[i / 3][i % 3]=ma[i]; instance.xb_controller.mul_b[i / 2][i % 2]=mb[i]; }',
        '  for (unsigned i = 0; i < 4; ++i) { instance.xb_controller.transpose_u[i / 2][i % 2]=m22a[i]; instance.xb_controller.concat_a[i / 2][i % 2]=m22a[i]; instance.xb_controller.concat_b[i / 2][i % 2]=m22b[i]; instance.xb_controller.solve_a[i / 2][i % 2]=(double[]){2,1,1,3}[i]; instance.xb_controller.singular_a[i / 2][i % 2]=singular[i]; }',
        '  for (unsigned i = 0; i < 2; ++i) { instance.xb_controller.sub_u[i / 4][i % 4] = 1 + i; instance.xb_controller.solve_b[i][0]=rhs[i]; instance.xb_controller.singular_b[i][0]=3 + 3 * i; }',
        '  instance.xb_controller.sub_u[0][2]=3; instance.xb_controller.sub_u[0][3]=4; instance.xb_controller.sub_u[1][0]=5; instance.xb_controller.sub_u[1][1]=6; instance.xb_controller.sub_u[1][2]=7; instance.xb_controller.sub_u[1][3]=8;',
        '  SM_XB_CONTROLLER_Step(&instance);',
        '  for (unsigned i=0;i<3;++i) { printf("%.17g,", instance.xb_controller.add_y[i]); } for (unsigned i=0;i<3;++i) { printf("%.17g,", instance.xb_controller.subtract_y[i]); } for (unsigned i=0;i<3;++i) { printf("%.17g,", instance.xb_controller.multiply_y[i]); } for (unsigned i=0;i<3;++i) { printf("%.17g,", instance.xb_controller.divide_y[i]); }',
        '  for (unsigned i=0;i<4;++i) { printf("%.17g,", instance.xb_controller.mul_y[i/2][i%2]); } for (unsigned i=0;i<4;++i) { printf("%.17g,", instance.xb_controller.transpose_y[i/2][i%2]); } for (unsigned i=0;i<8;++i) { printf("%.17g,", instance.xb_controller.concat_y[i/4][i%4]); } for (unsigned i=0;i<4;++i) { printf("%.17g,", instance.xb_controller.diag_y[i/2][i%2]); } for (unsigned i=0;i<2;++i) { printf("%.17g,", instance.xb_controller.sub_y[0][i]); } for (unsigned i=0;i<2;++i) { printf("%.17g,", instance.xb_controller.solve_y[i][0]); } for (unsigned i=0;i<2;++i) { printf("%.17g%s", instance.xb_controller.singular_y[i][0], i == 1 ? "\\n" : ","); }',
        '  return 0;', '}', '',
      ].join('\n'));
      const executable = join(workspace.directory, 'xb_matrix.exe');
      execFileSync('gcc', ['-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror', '-I.', 'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'sm_xbridges.c', 'mcal_dio_test_stubs.c', 'harness.c', '-lm', '-o', executable], { cwd: workspace.directory, stdio: 'pipe' });
      const actual = execFileSync(executable, [], { cwd: workspace.directory, encoding: 'utf8' }).trim().split(',').map(Number);
      expect(actual).toHaveLength(expected.length);
      actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 12));
      expect(expected.slice(-2)).toEqual([0, 0]);
    } finally { workspace.cleanup(); }
  });

  it('T10-C99-PID-BASIC and T10-C99-DISCRETE-REALIZATION execute public controller and vector state traces identically to the interpreter', { timeout: 60_000 }, () => {
    const ir = semanticModel();
    const publicTf = BLOCK_LIBRARY.DISCRETE_TRANSFER_FUNCTION('tf', {
      numerator: [1, 0.5, 0.25], denominator: [1, -0.75, 0.125],
      sampleTime: 0.1, x0: [1, -1],
    });
    const pid: XBSemanticOperation = {
      ...scalarOperation('pid', 'PID_BASIC', ['pid:e', 'pid:enable', 'pid:reset'], ['pid:u']), directFeedthrough: false, stateful: true,
      state: { outputPhase: 'read-before-update', updatePhase: 'after-direct-feedthrough', slots: ['i_state', 'd_state', 'last_e'].map((role) => ({ id: `pid:${role}$state`, role, signalId: null, numericType: { kind: 'float64' }, shape: scalar, initialValues: [0] })) },
      schedule: { periodSubsteps: 2, offsetSubsteps: 0, initialCounter: 0, counterIncrement: 1, hold: 'zero-order' },
    };
    const tf: XBSemanticOperation = {
      ...scalarOperation('tf', 'DISCRETE_TRANSFER_FUNCTION', ['tf:u'], ['tf:y', 'tf:x']), directFeedthrough: false, stateful: true,
      state: { outputPhase: 'read-before-update', updatePhase: 'after-direct-feedthrough', slots: [{ id: 'tf:x$state', role: 'x', signalId: 'tf:x', numericType: { kind: 'float64' }, shape: { kind: 'vector', length: 2 }, initialValues: publicTf.params.x0 as number[] }] },
      schedule: { periodSubsteps: 2, offsetSubsteps: 0, initialCounter: 0, counterIncrement: 1, hold: 'zero-order' },
    };
    const stateSpace: XBSemanticOperation = {
      ...scalarOperation('ss', 'STATE_SPACE', ['ss:u'], ['ss:y', 'ss:x']),
      directFeedthrough: false, stateful: true,
      state: {
        outputPhase: 'read-before-update', updatePhase: 'after-direct-feedthrough',
        slots: [{ id: 'ss:x$state', role: 'x', signalId: 'ss:x', numericType: { kind: 'float64' }, shape: { kind: 'vector', length: 2 }, initialValues: [1, 2] }],
      },
      schedule: { periodSubsteps: 2, offsetSubsteps: 0, initialCounter: 0, counterIncrement: 1, hold: 'zero-order' },
    };
    const direct = (id: string, type: string, inputs: string[], outputs: string[]): XBSemanticOperation =>
      scalarOperation(id, type, inputs, outputs);
    ir.states.controller.xBridges = {
      stateId: 'controller', executionOrder: ['pid', 'tf', 'ss'],
      operations: {
        pid: { ...pid, parameters: { Kp: 1.2, Ki: 4, Kd: 0.25, N: 5, mode: 'PID', method: 'trapezoidal', min: -1, max: 1, sampleTime: 0.1 } },
        tf: { ...tf, parameters: publicTf.params },
        ss: { ...stateSpace, parameters: { A: [[0.5, 1], [-1, 0.5]], B: [[1], [0.25]], C: [[2, -1]], D: [[0.5]] } },
      },
      signals: {
        ...Object.fromEntries([
        'pid:e', 'pid:enable', 'pid:reset', 'pid:u', 'tf:u', 'tf:y', 'tf:x', 'ss:u', 'ss:y', 'ss:x',
        ].map((id) => [id, { ...signal(id, { kind: 'float64' }), direction: 'output' as const }])),
        'ss:u': { ...signal('ss:u', { kind: 'float64' }, { kind: 'vector', length: 1 }), direction: 'input' },
        'ss:y': signal('ss:y', { kind: 'float64' }, { kind: 'vector', length: 1 }),
        'ss:x': signal('ss:x', { kind: 'float64' }, { kind: 'vector', length: 2 }),
        'tf:u': { ...signal('tf:u', { kind: 'float64' }, { kind: 'vector', length: 1 }), direction: 'input' },
        'tf:y': signal('tf:y', { kind: 'float64' }, { kind: 'vector', length: 1 }),
        'tf:x': signal('tf:x', { kind: 'float64' }, { kind: 'vector', length: 2 }),
      },
      mappings: [], solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 1 }, policy: { memory: 'retain', numericFault: 'escalate' },
    };
    const runtime = createXBRuntime(ir.states.controller.xBridges!);
    const inputs = [[2, 1, 0, 1, 1], [-2, 1, 0, -1, 0.5], [0, 0, 0, 0.5, 2], [3, 1, 1, 2, -0.5]];
    const expected: number[] = [];
    for (const [e, enable, reset, tfInput, ssInput] of inputs) {
      Object.assign(runtime.signals, { 'pid:e': [e], 'pid:enable': [enable], 'pid:reset': [reset], 'tf:u': [tfInput], 'ss:u': [ssInput] });
      stepXBState(runtime, {});
      expected.push(Number(runtime.signals['pid:u'][0]), Number(runtime.signals['tf:y'][0]), ...runtime.signals['tf:x'].map(Number), Number(runtime.signals['ss:y'][0]), ...runtime.signals['ss:x'].map(Number));
    }
    expect(expected[0]).toBe(1);
    expect(expected[7]).toBe(expected[0]);
    expect(expected[8]).toBe(expected[1]);
    expect(expected[14]).toBe(0);
    expect(expected[21]).toBe(0);
    const workspace = createGeneratedCodeTestWorkspace('xb-control-transform-c99');
    try {
      for (const file of generateCArtifacts(ir, { includeTestShims: true }).files) writeFileSync(join(workspace.directory, file.name), file.content);
      writeFileSync(join(workspace.directory, 'harness.c'), [
        '#include "sm_core.h"', '#include <stdio.h>', '#include <math.h>', '',
        'int main(void) {', '    ADIA_Instance_t instance;', '    if (SM_Init(&instance) != SM_ERR_NONE) return 1;',
        '    const double trace[4][5] = {{2,1,0,1,1},{-2,1,0,-1,0.5},{0,0,0,0.5,2},{3,1,1,2,-0.5}};',
        '    for (unsigned i = 0; i < 4; ++i) { instance.xb_controller.pid_e=trace[i][0]; instance.xb_controller.pid_enable=trace[i][1]; instance.xb_controller.pid_reset=trace[i][2]; instance.xb_controller.tf_u[0]=trace[i][3]; instance.xb_controller.ss_u[0]=trace[i][4]; SM_XB_CONTROLLER_Step(&instance); printf("%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g%s", instance.xb_controller.pid_u, instance.xb_controller.tf_y[0], instance.xb_controller.tf_x[0], instance.xb_controller.tf_x[1], instance.xb_controller.ss_y[0], instance.xb_controller.ss_x[0], instance.xb_controller.ss_x[1], i == 3 ? "\\n" : ","); }',
        '    return 0;', '}', '',
      ].join('\n'));
      const executable = join(workspace.directory, 'xb_control_transform.exe');
      execFileSync('gcc', ['-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror', '-I.', 'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'sm_xbridges.c', 'mcal_dio_test_stubs.c', 'harness.c', '-lm', '-o', executable], { cwd: workspace.directory, stdio: 'pipe' });
      const actual = execFileSync(executable, [], { cwd: workspace.directory, encoding: 'utf8' }).trim().split(',').map(Number);
      expect(actual).toHaveLength(expected.length);
      actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 12));
    } finally { workspace.cleanup(); }
  });

  it('T10-C99-TRANSFORMS executes Clarke, Park, and inverse transforms identically to the interpreter', { timeout: 60_000 }, () => {
    const ir = semanticModel();
    const names = ['clarke:ia', 'clarke:ib', 'clarke:ic', 'clarke:alpha', 'clarke:beta', 'park:alpha', 'park:beta', 'park:theta', 'park:d', 'park:q', 'inversePark:d', 'inversePark:q', 'inversePark:theta', 'inversePark:alpha', 'inversePark:beta', 'inverseClarke:alpha', 'inverseClarke:beta', 'inverseClarke:a', 'inverseClarke:b', 'inverseClarke:c'];
    const direct = (id: string, type: string, inputSignalIds: string[], outputSignalIds: string[]) => scalarOperation(id, type, inputSignalIds, outputSignalIds);
    ir.states.controller.xBridges = {
      stateId: 'controller', executionOrder: ['clarke', 'park', 'inversePark', 'inverseClarke'],
      operations: {
        clarke: direct('clarke', 'CLARKE_TRANSFORM', ['clarke:ia', 'clarke:ib', 'clarke:ic'], ['clarke:alpha', 'clarke:beta']),
        park: direct('park', 'PARK_TRANSFORM', ['park:alpha', 'park:beta', 'park:theta'], ['park:d', 'park:q']),
        inversePark: direct('inversePark', 'INVERSE_PARK', ['inversePark:d', 'inversePark:q', 'inversePark:theta'], ['inversePark:alpha', 'inversePark:beta']),
        inverseClarke: direct('inverseClarke', 'INVERSE_CLARKE', ['inverseClarke:alpha', 'inverseClarke:beta'], ['inverseClarke:a', 'inverseClarke:b', 'inverseClarke:c']),
      },
      signals: Object.fromEntries(names.map((id) => [id, { ...signal(id, { kind: 'float64' }), direction: 'output' as const }])), mappings: [],
      solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 1 }, policy: { memory: 'retain', numericFault: 'escalate' },
    };
    const runtime = createXBRuntime(ir.states.controller.xBridges!);
    Object.assign(runtime.signals, { 'clarke:ia': [1], 'clarke:ib': [-0.5], 'clarke:ic': [-0.5], 'park:alpha': [1], 'park:beta': [0], 'park:theta': [Math.PI / 2], 'inversePark:d': [0], 'inversePark:q': [-1], 'inversePark:theta': [Math.PI / 2], 'inverseClarke:alpha': [1], 'inverseClarke:beta': [0] });
    stepXBState(runtime, {});
    const expected = ['clarke:alpha', 'clarke:beta', 'park:d', 'park:q', 'inversePark:alpha', 'inversePark:beta', 'inverseClarke:a', 'inverseClarke:b', 'inverseClarke:c'].map((id) => Number(runtime.signals[id][0]));
    const workspace = createGeneratedCodeTestWorkspace('xb-transforms-c99');
    try {
      for (const file of generateCArtifacts(ir, { includeTestShims: true }).files) writeFileSync(join(workspace.directory, file.name), file.content);
      writeFileSync(join(workspace.directory, 'harness.c'), ['#include "sm_core.h"', '#include <stdio.h>', 'int main(void) { ADIA_Instance_t instance; if (SM_Init(&instance) != SM_ERR_NONE) return 1;', 'instance.xb_controller.clarke_ia=1; instance.xb_controller.clarke_ib=-0.5; instance.xb_controller.clarke_ic=-0.5; instance.xb_controller.park_alpha=1; instance.xb_controller.park_beta=0; instance.xb_controller.park_theta=1.5707963267948966; instance.xb_controller.inversePark_d=0; instance.xb_controller.inversePark_q=-1; instance.xb_controller.inversePark_theta=1.5707963267948966; instance.xb_controller.inverseClarke_alpha=1; instance.xb_controller.inverseClarke_beta=0;', 'SM_XB_CONTROLLER_Step(&instance); printf("%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g\\n", instance.xb_controller.clarke_alpha, instance.xb_controller.clarke_beta, instance.xb_controller.park_d, instance.xb_controller.park_q, instance.xb_controller.inversePark_alpha, instance.xb_controller.inversePark_beta, instance.xb_controller.inverseClarke_a, instance.xb_controller.inverseClarke_b, instance.xb_controller.inverseClarke_c); return 0; }'].join('\n'));
      const executable = join(workspace.directory, 'xb_transforms.exe');
      execFileSync('gcc', ['-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror', '-I.', 'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'sm_xbridges.c', 'mcal_dio_test_stubs.c', 'harness.c', '-lm', '-o', executable], { cwd: workspace.directory, stdio: 'pipe' });
      const actual = execFileSync(executable, [], { cwd: workspace.directory, encoding: 'utf8' }).trim().split(',').map(Number);
      actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 12));
    } finally { workspace.cleanup(); }
  });

  it('T10-C99-DISCRETE-REALIZATION executes a target-valid 9-state vector realization identically to the interpreter', { timeout: 60_000 }, () => {
    const ir = semanticModel(); const vector9 = { kind: 'vector', length: 9 } as const;
    const identity = Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, column) => row === column ? 1 : 0));
    const ss: XBSemanticOperation = { ...scalarOperation('ss9', 'STATE_SPACE', ['ss9:u'], ['ss9:y', 'ss9:x']), directFeedthrough: false, stateful: true, parameters: { A: identity, B: identity, C: [Array(9).fill(1)], D: [Array(9).fill(1)], representation: 'discrete' }, state: { outputPhase: 'read-before-update', updatePhase: 'after-direct-feedthrough', slots: [{ id: 'ss9:x$state', role: 'x', signalId: 'ss9:x', numericType: { kind: 'float64' }, shape: vector9, initialValues: [1,2,3,4,5,6,7,8,9] }] }, schedule: { periodSubsteps: 1, offsetSubsteps: 0, initialCounter: 0, counterIncrement: 1, hold: 'none' } };
    ir.states.controller.xBridges = { stateId: 'controller', executionOrder: ['ss9'], operations: { ss9: ss }, signals: { 'ss9:u': { ...signal('ss9:u', { kind: 'float64' }, vector9), direction: 'input' }, 'ss9:y': signal('ss9:y', { kind: 'float64' }, { kind: 'vector', length: 1 }), 'ss9:x': signal('ss9:x', { kind: 'float64' }, vector9) }, mappings: [], solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 1 }, policy: { memory: 'retain', numericFault: 'escalate' } };
    const runtime = createXBRuntime(ir.states.controller.xBridges!); runtime.signals['ss9:u'] = Array(9).fill(1); stepXBState(runtime, {});
    const expected = [Number(runtime.signals['ss9:y'][0]), ...runtime.signals['ss9:x'].map(Number), ...runtime.stateSlots['ss9:x$state'].map(Number)];
    const workspace = createGeneratedCodeTestWorkspace('xb-9state-c99');
    try { for (const file of generateCArtifacts(ir, { includeTestShims: true }).files) writeFileSync(join(workspace.directory, file.name), file.content);
      writeFileSync(join(workspace.directory, 'harness.c'), ['#include "sm_core.h"', '#include <stdio.h>', 'int main(void) { ADIA_Instance_t instance; if (SM_Init(&instance) != SM_ERR_NONE) return 1; for (unsigned i=0;i<9;++i) { instance.xb_controller.ss9_u[i]=1; } SM_XB_CONTROLLER_Step(&instance); printf("%.17g,", instance.xb_controller.ss9_y[0]); for(unsigned i=0;i<9;++i) { printf("%.17g,", instance.xb_controller.ss9_x[i]); } for(unsigned i=0;i<9;++i) { printf("%.17g%s", instance.xb_controller.state_ss9_x_state[i], i==8 ? "\\n" : ","); } return 0; }'].join('\n'));
      const executable = join(workspace.directory, 'xb_9state.exe'); execFileSync('gcc', ['-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror', '-I.', 'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'sm_xbridges.c', 'mcal_dio_test_stubs.c', 'harness.c', '-lm', '-o', executable], { cwd: workspace.directory, stdio: 'pipe' });
      const actual = execFileSync(executable, [], { cwd: workspace.directory, encoding: 'utf8' }).trim().split(',').map(Number); actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 12));
    } finally { workspace.cleanup(); }
  });

  it('renders exact scalar, vector, matrix, and explicit fault storage', () => {
    const header = renderXBHeader(semanticModel());

    expect(header).toContain('typedef struct {');
    expect(header).toContain('float gain_y;');
    expect(header).toContain('int16_t quantize_y;');
    expect(header).toContain('bool quantize_y_has_stored_integer;');
    expect(header).toContain('double quantize_y_real_value;');
    expect(header).toContain('uint8_t vector_y[3];');
    expect(header).toContain('float matrix_y[2][2];');
    expect(header).toContain('bool quantize_error;');
    expect(header).toContain('} SM_XB_CONTROLLER_t;');
    expect(renderXBInstanceMembers(semanticModel())).toEqual([
      'SM_XB_CONTROLLER_t xb_controller;',
    ]);
  });

  it('uses bounded static C99 and widened integer arithmetic only', () => {
    const source = renderXBSource(semanticModel());
    const generated = `${renderXBHeader(semanticModel())}\n${source}`;

    expect(generated).not.toMatch(/\b(?:malloc|calloc|realloc|free)\s*\(/);
    expect(generated).not.toMatch(/\b(?:node_table|operation_table|dispatch_table)\b/i);
    expect(generated).not.toMatch(/\(\s*\*\s*[A-Za-z_]\w*\s*\)\s*\(/);
    expect(generated).not.toMatch(/\[[A-Za-z_]\w*\]/);
    expect(generated).toContain('int64_t');
    expect(generated).toContain('uint64_t');
    expect(generated).toContain('SM_XB_MAX_SAFE_INTEGER');
    expect(source).toContain('#include <float.h>');
    expect(source).toContain('fabs(value) > (double)FLT_MAX');
  });

  it('preserves every field when normalized signal and fault names collide', () => {
    const ir = semanticModel();
    const xb = ir.states.controller.xBridges!;
    ir.states.controller.xBridges = {
      ...xb,
      signals: {
        ...xb.signals,
        'quantize:error': signal('quantize:error', float32),
        'quantize:y_has_stored_integer': signal(
          'quantize:y_has_stored_integer',
          float32,
        ),
        'quantize:y_real_value': signal('quantize:y_real_value', float32),
      },
    };

    const header = renderXBHeader(ir);
    expect(header).toContain('float quantize_error;');
    expect(header).toContain('bool quantize_error_fault;');
    expect(header).toContain('float quantize_y_has_stored_integer_signal;');
    expect(header).toContain('float quantize_y_real_value_signal;');
  });

  it('emits distinct wrappers when operation IDs normalize to the same C name', () => {
    const ir = semanticModel();
    const xb = ir.states.controller.xBridges!;
    const conversion = xb.operations.quantize.conversion;
    ir.states.controller.xBridges = {
      ...xb,
      executionOrder: ['convert-a', 'convert_a'],
      operations: {
        'convert-a': operation('convert-a', conversion),
        convert_a: operation('convert_a', conversion),
      },
    };

    const wrapperPattern = /SM_XB_CONTROLLER_[A-Z0-9_]+_Convert/g;
    const headerWrappers = renderXBHeader(ir).match(wrapperPattern) ?? [];
    const sourceWrappers = renderXBSource(ir).match(wrapperPattern) ?? [];
    expect(headerWrappers).toHaveLength(2);
    expect(new Set(headerWrappers).size).toBe(2);
    expect(sourceWrappers).toEqual(headerWrappers);
  });

  it('emits distinct instance members when state IDs normalize to the same C name', () => {
    const ir = semanticModel();
    const controller = ir.states.controller;
    const xb = controller.xBridges!;
    ir.states = {
      'controller-a': {
        ...controller,
        id: 'controller-a',
        enumName: 'SM_ST_CONTROLLER_DASH',
        xBridges: { ...xb, stateId: 'controller-a' },
      },
      controller_a: {
        ...controller,
        id: 'controller_a',
        enumName: 'SM_ST_CONTROLLER_UNDERSCORE',
        activityIndex: 1,
        xBridges: { ...xb, stateId: 'controller_a' },
      },
    };

    const members = renderXBInstanceMembers(ir);
    const memberNames = members.map((member) =>
      member.match(/\s([A-Za-z_]\w*);$/)?.[1]);
    expect(members).toHaveLength(2);
    expect(new Set(memberNames).size).toBe(2);
  });
});

describe('X-Bridges scalar combinational execution', { timeout: 60_000 }, () => {
  it.each([
    { signs: '++', expected: '78,2,1,0' },
    { signs: '+-', expected: '42,2,1,0' },
  ])('compiles dedicated combinational emitters with Sum "$signs"', ({
    signs,
    expected,
  }) => {
    const ir = combinationalSemanticModel();
    const xb = ir.states.controller.xBridges!;
    ir.states.controller.xBridges = {
      ...xb,
      operations: {
        ...xb.operations,
        sum: {
          ...xb.operations.sum,
          parameters: { ...xb.operations.sum.parameters, signs },
        },
      },
    };
    const workspace = createGeneratedCodeTestWorkspace('xb-combinational-c99');

    try {
      for (const file of generateCArtifacts(ir, { includeTestShims: true }).files) {
        writeFileSync(join(workspace.directory, file.name), file.content);
      }
      writeFileSync(
        join(workspace.directory, 'harness.c'),
        [
          '#include "sm_core.h"',
          '#include <stdio.h>',
          '',
          'int main(void)',
          '{',
          '    ADIA_Instance_t instance;',
          '    if (SM_Init(&instance) != SM_ERR_NONE) return 1;',
          '    if (SM_Step(&instance, SM_TICK_MS) != SM_ERR_NONE) return 2;',
          '    (void)printf("%.9g,%ld,%u,%.9g\\n",',
          '        (double)instance.data.y,',
          '        (long)instance.data.bits,',
          '        instance.data.flag ? 1U : 0U,',
          '        (double)instance.data.error);',
          '    return 0;',
          '}',
          '',
        ].join('\n'),
      );
      const executable = join(workspace.directory, 'xb_combinational.exe');
      execFileSync('gcc', [
        '-std=c99',
        '-pedantic-errors',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I.',
        'sm_core.c',
        'sm_safety.c',
        'sm_user_logic.c',
        'sm_xbridges.c',
        'mcal_dio_test_stubs.c',
        'harness.c',
        '-lm',
        '-o',
        executable,
      ], { cwd: workspace.directory, stdio: 'pipe' });

      expect(execFileSync(executable, [], {
        cwd: workspace.directory,
        encoding: 'utf8',
      }).trim()).toBe(expected);
    } finally {
      workspace.cleanup();
    }
  });

  it('matches JavaScript numeric truth for every logic emitter and boolean conversion', () => {
    const ir = truthSemanticModel();
    const workspace = createGeneratedCodeTestWorkspace('xb-truth-c99');

    try {
      for (const file of generateCArtifacts(ir, { includeTestShims: true }).files) {
        writeFileSync(join(workspace.directory, file.name), file.content);
      }
      writeFileSync(
        join(workspace.directory, 'harness.c'),
        [
          '#include "sm_core.h"',
          '#include <math.h>',
          '#include <stdio.h>',
          '',
          'static int run_case(ADIA_Instance_t *instance, double value)',
          '{',
          '    instance->data.u = value;',
          '    if (SM_Step(instance, SM_TICK_MS) != SM_ERR_NONE) return 1;',
          '    (void)printf("%u,%u,%u,%u,%u,%u,%u\\n",',
          '        instance->data.out_and ? 1U : 0U,',
          '        instance->data.out_or ? 1U : 0U,',
          '        instance->data.out_not ? 1U : 0U,',
          '        instance->data.out_nand ? 1U : 0U,',
          '        instance->data.out_nor ? 1U : 0U,',
          '        instance->data.out_xor ? 1U : 0U,',
          '        instance->data.out_convert_bool ? 1U : 0U);',
          '    return 0;',
          '}',
          '',
          'int main(void)',
          '{',
          '    ADIA_Instance_t instance;',
          '    if (SM_Init(&instance) != SM_ERR_NONE) return 1;',
          '    if (run_case(&instance, NAN) != 0) return 2;',
          '    if (run_case(&instance, INFINITY) != 0) return 3;',
          '    if (run_case(&instance, -INFINITY) != 0) return 4;',
          '    if (run_case(&instance, 0.0) != 0) return 5;',
          '    if (run_case(&instance, -0.0) != 0) return 6;',
          '    if (run_case(&instance, 2.0) != 0) return 7;',
          '    return 0;',
          '}',
          '',
        ].join('\n'),
      );
      const executable = join(workspace.directory, 'xb_truth.exe');
      execFileSync('gcc', [
        '-std=c99',
        '-pedantic-errors',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I.',
        'sm_core.c',
        'sm_safety.c',
        'sm_user_logic.c',
        'sm_xbridges.c',
        'mcal_dio_test_stubs.c',
        'harness.c',
        '-lm',
        '-o',
        executable,
      ], { cwd: workspace.directory, stdio: 'pipe' });

      expect(execFileSync(executable, [], {
        cwd: workspace.directory,
        encoding: 'utf8',
      }).trim().split(/\r?\n/)).toEqual([
        '0,0,1,1,1,0,0',
        '1,1,0,0,0,1,0',
        '1,1,0,0,0,1,0',
        '0,0,1,1,1,0,0',
        '0,0,1,1,1,0,0',
        '1,1,0,0,0,1,1',
      ]);
    } finally {
      workspace.cleanup();
    }
  });

  it.each([
    'DATA_TYPE_CONVERSION',
    'NUMERIC_REPRESENTATION',
  ] as const)('matches interpreter Boolean conversion semantics for %s', (type) => {
    const ir = booleanConversionModel(type);
    const workspace = createGeneratedCodeTestWorkspace(
      `xb-boolean-${type.toLowerCase()}-c99`,
    );
    const inputs = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0,
      -0,
      2,
    ];
    const runtime = createXBRuntime(ir.states.controller.xBridges!);
    const expected = inputs.map((u) => {
      const data: Record<string, number | boolean> = { u, y: true, e: -1 };
      const faults = stepXBState(runtime, data);
      return { data, faults };
    });

    try {
      for (const file of generateCArtifacts(ir, { includeTestShims: true }).files) {
        writeFileSync(join(workspace.directory, file.name), file.content);
      }
      writeFileSync(
        join(workspace.directory, 'harness.c'),
        [
          '#include "sm_core.h"',
          '#include <math.h>',
          '#include <stdio.h>',
          '',
          'static int run_case(ADIA_Instance_t *instance, double value)',
          '{',
          '    const SM_XB_NumericResult_t result =',
          '        SM_XB_CONTROLLER_CONVERT_Convert(value);',
          '    instance->data.u = value;',
          '    if (SM_Step(instance, SM_TICK_MS) != SM_ERR_NONE) return 1;',
          '    (void)printf("%u,%.17g,%u,%u,%u\\n",',
          '        instance->data.y ? 1U : 0U,',
          '        instance->data.e,',
          '        instance->xb_controller.convert_error ? 1U : 0U,',
          '        result.has_stored_integer ? 1U : 0U,',
          '        (unsigned)result.fault);',
          '    return 0;',
          '}',
          '',
          'int main(void)',
          '{',
          '    ADIA_Instance_t instance;',
          '    if (SM_Init(&instance) != SM_ERR_NONE) return 1;',
          '    if (run_case(&instance, NAN) != 0) return 2;',
          '    if (run_case(&instance, INFINITY) != 0) return 3;',
          '    if (run_case(&instance, -INFINITY) != 0) return 4;',
          '    if (run_case(&instance, 0.0) != 0) return 5;',
          '    if (run_case(&instance, -0.0) != 0) return 6;',
          '    if (run_case(&instance, 2.0) != 0) return 7;',
          '    return 0;',
          '}',
          '',
        ].join('\n'),
      );
      const executable = join(
        workspace.directory,
        `xb_boolean_${type.toLowerCase()}.exe`,
      );
      execFileSync('gcc', [
        '-std=c99',
        '-pedantic-errors',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I.',
        'sm_core.c',
        'sm_safety.c',
        'sm_user_logic.c',
        'sm_xbridges.c',
        'mcal_dio_test_stubs.c',
        'harness.c',
        '-lm',
        '-o',
        executable,
      ], { cwd: workspace.directory, stdio: 'pipe' });
      const rows = execFileSync(executable, [], {
        cwd: workspace.directory,
        encoding: 'utf8',
      }).trim().split(/\r?\n/).map((line) => line.split(',').map(Number));

      expected.forEach(({ data, faults }, index) => {
        const nonFinite = !Number.isFinite(inputs[index]);
        expect(rows[index][0]).toBe(data.y ? 1 : 0);
        expect(rows[index][1]).toBe(Number(data.e));
        expect(rows[index][2]).toBe(nonFinite ? 1 : 0);
        expect(rows[index][3]).toBe(nonFinite ? 0 : 1);
        expect(rows[index][4] === 0).toBe(!nonFinite);
        expect(faults.includes('non-finite')).toBe(nonFinite);
      });
    } finally {
      workspace.cleanup();
    }
  });

  it('rejects missing stored metadata like the interpreter and preserves finite raw bits', () => {
    const ir = reinterpretationParityModel();
    const workspace = createGeneratedCodeTestWorkspace(
      'xb-reinterpret-validity-c99',
    );
    const inputs = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      1.5,
    ];
    const interpreter = inputs.map((u) => {
      const runtime = createXBRuntime(ir.states.controller.xBridges!);
      const data: Record<string, number | boolean> = { u, y: 0, e: -1 };
      try {
        const faults = stepXBState(runtime, data);
        return {
          rejected: false,
          data,
          faults,
          stored: runtime.storedIntegers['reinterpret:y'][0],
        };
      } catch (error) {
        return {
          rejected: true,
          message: error instanceof Error ? error.message : String(error),
          data,
          faults: [] as string[],
          stored: null,
        };
      }
    });
    const classify = (value: number): number => Number.isNaN(value)
      ? 2
      : value === Number.POSITIVE_INFINITY
        ? 1
        : value === Number.NEGATIVE_INFINITY
          ? -1
          : 0;

    try {
      for (const file of generateCArtifacts(ir, { includeTestShims: true }).files) {
        writeFileSync(join(workspace.directory, file.name), file.content);
      }
      writeFileSync(
        join(workspace.directory, 'harness.c'),
        [
          '#include "sm_core.h"',
          '#include <math.h>',
          '#include <stdio.h>',
          '',
          'static int classify(double value)',
          '{',
          '    if (isnan(value)) return 2;',
          '    if (isinf(value)) return signbit(value) ? -1 : 1;',
          '    return 0;',
          '}',
          '',
          'static int run_case(ADIA_Instance_t *instance, double value)',
          '{',
          '    instance->data.u = value;',
          '    if (SM_Step(instance, SM_TICK_MS) != SM_ERR_NONE) return 1;',
          '    (void)printf("%d,%.17g,%.17g,%u,%u,%d\\n",',
          '        classify(instance->data.y),',
          '        instance->data.y,',
          '        instance->data.e,',
          '        instance->xb_controller.reinterpret_error ? 1U : 0U,',
          '        instance->xb_controller.reinterpret_y_has_stored_integer',
          '            ? 1U : 0U,',
          '        (int)instance->xb_controller.reinterpret_y);',
          '    return 0;',
          '}',
          '',
          'int main(void)',
          '{',
          '    ADIA_Instance_t instance;',
          '    if (SM_Init(&instance) != SM_ERR_NONE) return 1;',
          '    if (run_case(&instance, NAN) != 0) return 2;',
          '    if (run_case(&instance, INFINITY) != 0) return 3;',
          '    if (run_case(&instance, -INFINITY) != 0) return 4;',
          '    if (run_case(&instance, 1.5) != 0) return 5;',
          '    return 0;',
          '}',
          '',
        ].join('\n'),
      );
      const executable = join(workspace.directory, 'xb_reinterpret_validity.exe');
      execFileSync('gcc', [
        '-std=c99',
        '-pedantic-errors',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I.',
        'sm_core.c',
        'sm_safety.c',
        'sm_user_logic.c',
        'sm_xbridges.c',
        'mcal_dio_test_stubs.c',
        'harness.c',
        '-lm',
        '-o',
        executable,
      ], { cwd: workspace.directory, stdio: 'pipe' });
      const rows = execFileSync(executable, [], {
        cwd: workspace.directory,
        encoding: 'utf8',
      }).trim().split(/\r?\n/).map((line) => line.split(','));

      interpreter.forEach((result, index) => {
        if (result.rejected) {
          expect(result.message).toContain('requires stored-integer input metadata');
          expect(Number(rows[index][0])).toBe(classify(inputs[index]));
          expect(Number(rows[index][2])).toBe(0);
          expect(Number(rows[index][3])).toBe(1);
          expect(Number(rows[index][4])).toBe(0);
        } else {
          expect(result.faults).toEqual([]);
          expect(Number(rows[index][0])).toBe(0);
          expect(Number(rows[index][1])).toBe(Number(result.data.y));
          expect(Number(rows[index][2])).toBe(Number(result.data.e));
          expect(Number(rows[index][3])).toBe(0);
          expect(Number(rows[index][4])).toBe(1);
          expect(Number(rows[index][5])).toBe(result.stored);
          expect(Number(rows[index][5])).toBe(24);
        }
      });
    } finally {
      workspace.cleanup();
    }
  });

  it('matches interpreter signal-only fixed semantics for NaN, infinities, and finite storage', () => {
    const ir = signalOnlyNonFiniteModel();
    const workspace = createGeneratedCodeTestWorkspace('xb-fixed-non-finite-c99');
    const inputs = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      1.75,
    ];
    const runtime = createXBRuntime(ir.states.controller.xBridges!);
    const expected = inputs.map((u) => {
      const data: Record<string, number | boolean> = {
        u,
        fixed: 0,
        doubled: 0,
        truth: false,
      };
      stepXBState(runtime, data);
      return data;
    });
    const classify = (value: number): number => Number.isNaN(value)
      ? 2
      : value === Number.POSITIVE_INFINITY
        ? 1
        : value === Number.NEGATIVE_INFINITY
          ? -1
          : 0;

    try {
      for (const file of generateCArtifacts(ir, { includeTestShims: true }).files) {
        writeFileSync(join(workspace.directory, file.name), file.content);
      }
      writeFileSync(
        join(workspace.directory, 'harness.c'),
        [
          '#include "sm_core.h"',
          '#include <math.h>',
          '#include <stdio.h>',
          '',
          'static int classify(double value)',
          '{',
          '    if (isnan(value)) return 2;',
          '    if (isinf(value)) return signbit(value) ? -1 : 1;',
          '    return 0;',
          '}',
          '',
          'static int run_case(ADIA_Instance_t *instance, double value)',
          '{',
          '    instance->data.u = value;',
          '    if (SM_Step(instance, SM_TICK_MS) != SM_ERR_NONE) return 1;',
          '    (void)printf("%d,%d,%u,%.17g,%.17g\\n",',
          '        classify(instance->data.fixed),',
          '        classify(instance->data.doubled),',
          '        instance->data.truth ? 1U : 0U,',
          '        instance->data.fixed,',
          '        instance->data.doubled);',
          '    return 0;',
          '}',
          '',
          'int main(void)',
          '{',
          '    ADIA_Instance_t instance;',
          '    if (SM_Init(&instance) != SM_ERR_NONE) return 1;',
          '    if (run_case(&instance, NAN) != 0) return 2;',
          '    if (run_case(&instance, INFINITY) != 0) return 3;',
          '    if (run_case(&instance, -INFINITY) != 0) return 4;',
          '    if (run_case(&instance, 1.75) != 0) return 5;',
          '    return 0;',
          '}',
          '',
        ].join('\n'),
      );
      const executable = join(workspace.directory, 'xb_fixed_non_finite.exe');
      execFileSync('gcc', [
        '-std=c99',
        '-pedantic-errors',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I.',
        'sm_core.c',
        'sm_safety.c',
        'sm_user_logic.c',
        'sm_xbridges.c',
        'mcal_dio_test_stubs.c',
        'harness.c',
        '-lm',
        '-o',
        executable,
      ], { cwd: workspace.directory, stdio: 'pipe' });
      const rows = execFileSync(executable, [], {
        cwd: workspace.directory,
        encoding: 'utf8',
      }).trim().split(/\r?\n/).map((line) => line.split(','));

      expected.forEach((data, index) => {
        const fixed = Number(data.fixed);
        const doubled = Number(data.doubled);
        expect(
          Number(rows[index][0]),
          `fixed classification for case ${index}`,
        ).toBe(classify(fixed));
        expect(
          Number(rows[index][1]),
          `doubled classification for case ${index}`,
        ).toBe(classify(doubled));
        expect(
          Number(rows[index][2]),
          `truth for case ${index}`,
        ).toBe(data.truth ? 1 : 0);
        if (classify(fixed) === 0) {
          expect(Number(rows[index][3])).toBe(fixed);
        }
        if (classify(doubled) === 0) {
          expect(Number(rows[index][4])).toBe(doubled);
        }
      });
    } finally {
      workspace.cleanup();
    }
  });

  it.each([
    1e18,
    -0.001,
    0.0005,
    4294967.296,
  ])('rejects Step stepTime %s when it is not an exact uint32 millisecond threshold', (
    stepTime,
  ) => {
    const ir = combinationalSemanticModel();
    const xb = ir.states.controller.xBridges!;
    ir.states.controller.xBridges = {
      ...xb,
      operations: {
        ...xb.operations,
        step: {
          ...xb.operations.step,
          parameters: { ...xb.operations.step.parameters, stepTime },
        },
      },
    };

    expect(() => generateCArtifacts(ir)).toThrow(
      new RegExp(
        "X-Bridges Step operation 'step' requires stepTime to be finite, "
          + 'nonnegative, and exactly representable as uint32_t milliseconds; '
          + `received ${stepTime}`,
      ),
    );
  });

  it('strictly compiles the maximum uint32 millisecond Step threshold', () => {
    const ir = combinationalSemanticModel();
    const xb = ir.states.controller.xBridges!;
    ir.states.controller.xBridges = {
      ...xb,
      operations: {
        ...xb.operations,
        step: {
          ...xb.operations.step,
          parameters: {
            ...xb.operations.step.parameters,
            stepTime: 4294967.295,
          },
        },
      },
    };
    const workspace = createGeneratedCodeTestWorkspace('xb-step-max-c99');

    try {
      const core = generateCArtifacts(ir).files
        .find((file) => file.name === 'sm_core.c')!.content;
      writeFileSync(join(workspace.directory, 'sm_core.c'), core);
      for (const file of generateCArtifacts(ir).files) {
        if (file.name !== 'sm_core.c') {
          writeFileSync(join(workspace.directory, file.name), file.content);
        }
      }
      expect(core).toContain('UINT32_C(4294967295)');
      execFileSync('gcc', [
        '-std=c99',
        '-pedantic-errors',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I.',
        '-c',
        'sm_core.c',
        '-o',
        'sm_core.o',
      ], { cwd: workspace.directory, stdio: 'pipe' });
    } finally {
      workspace.cleanup();
    }
  });

  it('stops generation for an operation without a dedicated emitter', () => {
    const ir = combinationalSemanticModel();
    const xb = ir.states.controller.xBridges!;
    ir.states.controller.xBridges = {
      ...xb,
      executionOrder: [...xb.executionOrder, 'unknown'],
      operations: {
        ...xb.operations,
        unknown: {
          ...scalarOperation('unknown', 'NOT_REGISTERED', [], []),
          directFeedthrough: false,
          stateful: true,
        },
      },
    };

    expect(() => renderXBSource(ir)).toThrow(
      "X-Bridges operation 'unknown' has unsupported type 'NOT_REGISTERED'",
    );
  });

  it('renders bitwise shifts without signed-shift undefined behavior', () => {
    const core = generateCArtifacts(combinationalSemanticModel()).files
      .find((file) => file.name === 'sm_core.c')!.content;

    expect(core).toContain('SM_XB_ShiftLeft32(');
    expect(core).toContain('SM_XB_ShiftRight32(');
    expect(core).not.toMatch(/\(int32_t\)[^\n;]*<</);
    expect(core).not.toMatch(/\(int32_t\)[^\n;]*>>/);
  });

  it('emits reset-policy lifecycle calls in interpreter execution order', () => {
    const core = generateCArtifacts(combinationalSemanticModel()).files
      .find((file) => file.name === 'sm_core.c')!.content;

    expect(core).toMatch(
      /SM_Error_t SM_Init[\s\S]*SM_XB_CONTROLLER_Init\(instance\);/,
    );
    expect(core).toContain([
      '    SM_XB_CONTROLLER_Enter(instance);',
      '    SM_ST_CONTROLLER_Entry(instance);',
    ].join('\n'));
    expect(core).toContain([
      '    SM_ST_CONTROLLER_During(instance);',
      '    SM_XB_CONTROLLER_Step(instance);',
      '    if (instance->error_status != SM_ERR_NONE) {',
    ].join('\n'));
  });

  it('preserves non-finite float32 payloads before escalating numeric faults', () => {
    const core = generateCArtifacts(combinationalSemanticModel()).files
      .find((file) => file.name === 'sm_core.c')!.content;

    expect(core).toMatch(
      /if \(!isfinite\((xb_value_\d+_\d+)\)\) \{\n\s+\S+ = \(float\)\1;\n[\s\S]*?\} else if \(fabs\(\1\) > \(double\)FLT_MAX\) \{/,
    );
  });

  it('compiles finite constants that JavaScript formats with exponents', () => {
    const ir = combinationalSemanticModel();
    const xb = ir.states.controller.xBridges!;
    ir.states.controller.xBridges = {
      ...xb,
      operations: {
        ...xb.operations,
        constant: {
          ...xb.operations.constant,
          parameters: {
            ...xb.operations.constant.parameters,
            value: 1e21,
          },
        },
      },
    };
    const workspace = createGeneratedCodeTestWorkspace('xb-exponent-c99');

    try {
      for (const file of generateCArtifacts(ir).files) {
        writeFileSync(join(workspace.directory, file.name), file.content);
      }
      execFileSync('gcc', [
        '-std=c99',
        '-pedantic-errors',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I.',
        '-c',
        'sm_core.c',
        '-o',
        'sm_core.o',
      ], { cwd: workspace.directory, stdio: 'pipe' });
    } finally {
      workspace.cleanup();
    }
  });
});

describe('X-Bridges stateful solver parity', { timeout: 60_000 }, () => {
  it.each(['euler', 'rk4'] as const)(
    'matches interpreter ticks for dx/dt = -x + u using %s',
    (kind) => {
      const ir = continuousSolverModel(kind);
      const runtime = createXBRuntime(ir.states.controller.xBridges!);
      const expected = Array.from({ length: 5 }, () => {
        const data: Record<string, number | boolean> = { u: 1, x: 0, d: 0, twice: 0 };
        stepXBState(runtime, data);
        return [Number(data.x), Number(data.d), Number(data.twice)];
      });
      const workspace = createGeneratedCodeTestWorkspace(`xb-${kind}-solver-c99`);

      try {
        for (const file of generateCArtifacts(ir, { includeTestShims: true }).files) {
          writeFileSync(join(workspace.directory, file.name), file.content);
        }
        writeFileSync(join(workspace.directory, 'harness.c'), [
          '#include "sm_core.h"',
          '#include <stdio.h>',
          '',
          'int main(void)',
          '{',
          '    ADIA_Instance_t instance;',
          '    if (SM_Init(&instance) != SM_ERR_NONE) return 1;',
          '    for (unsigned tick = 0U; tick < 5U; ++tick) {',
          '        instance.data.u = 1.0;',
          '        if (SM_Step(&instance, SM_TICK_MS) != SM_ERR_NONE) return 2;',
          '        (void)printf("%.17g,%.17g,%.17g\\n", instance.data.x, instance.data.d, instance.data.twice);',
          '    }',
          '    return 0;',
          '}',
          '',
        ].join('\n'));
        const executable = join(workspace.directory, `xb_${kind}_solver.exe`);
        execFileSync('gcc', [
          '-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror', '-I.',
          'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'sm_xbridges.c',
          'mcal_dio_test_stubs.c', 'harness.c', '-lm', '-o', executable,
        ], { cwd: workspace.directory, stdio: 'pipe' });
        const actual = execFileSync(executable, [], {
          cwd: workspace.directory,
          encoding: 'utf8',
        }).trim().split(/\r?\n/).map((line) => line.split(',').map(Number));

        expect(actual).toHaveLength(expected.length);
        actual.forEach((values, index) => {
          values.forEach((value, valueIndex) => {
            expect(value).toBeCloseTo(expected[index][valueIndex], 12);
          });
        });
      } finally {
        workspace.cleanup();
      }
    },
  );
});

describe('X-Bridges fixed-point state parity', { timeout: 60_000 }, () => {
  it('matches Q2 delay conversion for fractional input and saturation', () => {
    const ir = fixedDelayModel();
    const runtime = createXBRuntime(ir.states.controller.xBridges!);
    const inputs = [0.5, 100000, 100000];
    const expected = inputs.map((u) => {
      const data: Record<string, number | boolean> = { u, x: 0, d: 0, twice: 0 };
      stepXBState(runtime, data);
      return Number(data.d);
    });
    const workspace = createGeneratedCodeTestWorkspace('xb-fixed-delay-c99');
    try {
      for (const file of generateCArtifacts(ir, { includeTestShims: true }).files) {
        writeFileSync(join(workspace.directory, file.name), file.content);
      }
      writeFileSync(join(workspace.directory, 'harness.c'), [
        '#include "sm_core.h"', '#include <stdio.h>', '',
        'int main(void) {',
        '    ADIA_Instance_t instance;',
        '    if (SM_Init(&instance) != SM_ERR_NONE) return 1;',
        '    instance.data.u = 0.5;',
        '    if (SM_Step(&instance, SM_TICK_MS) != SM_ERR_NONE) return 2;',
        '    (void)printf("%.17g\\n", instance.data.d);',
        '    instance.data.u = 100000.0;',
        '    if (SM_Step(&instance, SM_TICK_MS) != SM_ERR_NONE) return 3;',
        '    instance.data.u = 100000.0;',
        '    if (SM_Step(&instance, SM_TICK_MS) != SM_ERR_NONE) return 4;',
        '    (void)printf("%.17g\\n", instance.data.d);',
        '    return 0;', '}', '',
      ].join('\n'));
      const executable = join(workspace.directory, 'xb_fixed_delay.exe');
      execFileSync('gcc', [
        '-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror', '-I.',
        'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'sm_xbridges.c',
        'mcal_dio_test_stubs.c', 'harness.c', '-lm', '-o', executable,
      ], { cwd: workspace.directory, stdio: 'pipe' });
      const actual = execFileSync(executable, [], {
        cwd: workspace.directory, encoding: 'utf8',
      }).trim().split(/\r?\n/).map(Number);
      expect(actual).toEqual([expected[0], expected[2]]);
      // ZOH publishes the state sampled at the prior hit; the saturated update
      // becomes observable on the following sample hit.
      expect(actual).toEqual([0, 0.5]);
    } finally {
      workspace.cleanup();
    }
  });
});

describe('X-Bridges generated numeric helpers', { timeout: 60_000 }, () => {
  it('matches xbNumeric for rounding, saturation, wrap, faults, and float capabilities', () => {
    const ir = semanticModel();
    const workspace = createGeneratedCodeTestWorkspace('xb-numeric-c99');
    const fixedType: XBFixedType = {
      kind: 'fixed',
      signed: true,
      wordLength: 8,
      fractionLength: 2,
    };
    const cases: Array<{
      value: number;
      policy: XBConversionPolicy;
      cRounding: string;
      cOverflow: string;
    }> = [
      {
        value: 0.375,
        policy: { rounding: 'floor', overflow: 'saturate' },
        cRounding: 'SM_XB_ROUND_FLOOR',
        cOverflow: 'SM_XB_OVERFLOW_SATURATE',
      },
      {
        value: -0.375,
        policy: { rounding: 'ceiling', overflow: 'saturate' },
        cRounding: 'SM_XB_ROUND_CEILING',
        cOverflow: 'SM_XB_OVERFLOW_SATURATE',
      },
      {
        value: -0.375,
        policy: { rounding: 'zero', overflow: 'saturate' },
        cRounding: 'SM_XB_ROUND_ZERO',
        cOverflow: 'SM_XB_OVERFLOW_SATURATE',
      },
      {
        value: 0.375,
        policy: { rounding: 'nearest', overflow: 'saturate' },
        cRounding: 'SM_XB_ROUND_NEAREST',
        cOverflow: 'SM_XB_OVERFLOW_SATURATE',
      },
      {
        value: -0.375,
        policy: { rounding: 'round', overflow: 'saturate' },
        cRounding: 'SM_XB_ROUND_AWAY',
        cOverflow: 'SM_XB_OVERFLOW_SATURATE',
      },
      {
        value: 0.625,
        policy: { rounding: 'convergent', overflow: 'saturate' },
        cRounding: 'SM_XB_ROUND_CONVERGENT',
        cOverflow: 'SM_XB_OVERFLOW_SATURATE',
      },
      {
        value: 1000,
        policy: { rounding: 'floor', overflow: 'saturate' },
        cRounding: 'SM_XB_ROUND_FLOOR',
        cOverflow: 'SM_XB_OVERFLOW_SATURATE',
      },
      {
        value: 1000,
        policy: { rounding: 'floor', overflow: 'wrap' },
        cRounding: 'SM_XB_ROUND_FLOOR',
        cOverflow: 'SM_XB_OVERFLOW_WRAP',
      },
      {
        value: 1000,
        policy: { rounding: 'floor', overflow: 'error' },
        cRounding: 'SM_XB_ROUND_FLOOR',
        cOverflow: 'SM_XB_OVERFLOW_ERROR',
      },
    ];

    try {
      writeFileSync(join(workspace.directory, 'sm_xbridges.h'), renderXBHeader(ir));
      writeFileSync(join(workspace.directory, 'sm_xbridges.c'), renderXBSource(ir));
      writeFileSync(
        join(workspace.directory, 'harness.c'),
        [
          '#include "sm_xbridges.h"',
          '#include <math.h>',
          '#include <stdio.h>',
          '',
          'static void print_result(SM_XB_NumericResult_t result)',
          '{',
          '    (void)printf("%lld,%.17g,%.17g,%u,%u\\n",',
          '        (long long)result.stored_integer,',
          '        result.real_value,',
          '        result.quantization_error,',
          '        (unsigned)result.fault,',
          '        result.has_stored_integer ? 1U : 0U);',
          '}',
          '',
          'int main(void)',
          '{',
          ...cases.map(({ value, cRounding, cOverflow }) =>
            `    print_result(SM_XB_ConvertFixed(${value}, true, 8U, 2, ${cRounding}, ${cOverflow}));`),
          '    print_result(SM_XB_ConvertFloat32(0.1));',
          '    print_result(SM_XB_ConvertFloat64(0.1));',
          '    print_result(SM_XB_ConvertFloat32(INFINITY));',
          '    print_result(SM_XB_ConvertFloat64(INFINITY));',
          '    print_result(SM_XB_ConvertFloat32(1.0e300));',
          '    print_result(SM_XB_ConvertFloat32(-1.0e300));',
          '    return 0;',
          '}',
          '',
        ].join('\n'),
      );
      const executable = join(workspace.directory, 'xb_numeric.exe');
      execFileSync('gcc', [
        '-std=c99',
        '-pedantic-errors',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I.',
        'sm_xbridges.c',
        'harness.c',
        '-lm',
        '-o',
        executable,
      ], { cwd: workspace.directory, stdio: 'pipe' });
      const rows = execFileSync(executable, [], {
        cwd: workspace.directory,
        encoding: 'utf8',
      }).trim().split(/\r?\n/).map((line) => line.split(',').map(Number));

      cases.forEach(({ value, policy }, index) => {
        const expected = xbConvertScalar(value, fixedType, policy);
        expect(rows[index][0]).toBe(expected.storedInteger);
        expect(rows[index][1]).toBeCloseTo(Number(expected.value), 12);
        expect(rows[index][2]).toBeCloseTo(expected.quantizationError, 12);
        expect(rows[index][3]).toBe(expected.fault === null ? 0 : 1);
        expect(rows[index][4]).toBe(1);
      });

      const float32Result = xbConvertScalar(0.1, float32, {
        rounding: 'floor',
        overflow: 'saturate',
      });
      expect(rows[cases.length][1]).toBe(float32Result.value);
      expect(rows[cases.length][2]).toBeCloseTo(float32Result.quantizationError, 12);
      expect(rows[cases.length][3]).toBe(0);
      expect(rows[cases.length + 1]).toEqual([0, 0.1, 0, 3, 0]);
      expect(rows[cases.length + 2][3]).toBe(2);
      expect(rows[cases.length + 3][3]).toBe(3);
      expect(rows[cases.length + 4][3]).toBe(2);
      expect(rows[cases.length + 5][3]).toBe(2);
    } finally {
      workspace.cleanup();
    }
  });
});
