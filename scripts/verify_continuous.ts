import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCArtifacts } from '../src/utils/stateMachine/smCGenerator';
import { createXBRuntime, stepXBState } from '../src/utils/stateMachine/xbInterpreter';
import type { SemanticModel } from '../src/utils/stateMachine/smSemanticModel';
import type { XBSemanticModel, XBSemanticOperation, XBSemanticSignal } from '../src/utils/stateMachine/xbSemanticModel';
import type { XBNumericType, XBShape, XBFixedType } from '../src/utils/stateMachine/xbNumeric';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const outDir = join(__dirname, '..', 'scratch', 'continuous_verify');
if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const scalar = { kind: 'scalar' } as const;
const float32 = { kind: 'float32' } as const;
const float64 = { kind: 'float64' } as const;

const signal = (id: string, numericType: XBNumericType, shape: XBShape = scalar): XBSemanticSignal => {
  const [nodeId, portId] = id.split(':');
  const dimensions = shape.kind === 'scalar' ? [] : shape.kind === 'vector' ? [shape.length] : [shape.rows, shape.columns];
  return {
    id, nodeId, portId, direction: 'output', sourceSignalId: null, shape, dimensions,
    elementCount: dimensions.length === 0 ? 1 : dimensions.reduce((p, v) => p * v, 1),
    layout: shape.kind === 'scalar' ? 'scalar' : shape.kind === 'vector' ? 'contiguous' : 'row-major',
    numericType, storage: numericType.kind === 'fixed' ? 'stored-integer' : 'native',
  };
};

const operation = (id: string, conversion: XBSemanticOperation['conversion'] = null): XBSemanticOperation => ({
  id, type: conversion === null ? 'GAIN' : 'NUMERIC_REPRESENTATION', inputSignalIds: [], outputSignalIds: [`${id}:y`],
  parameters: {}, directFeedthrough: true, stateful: false, conversion, state: null,
  schedule: { periodSubsteps: 1, offsetSubsteps: 0, initialCounter: 0, counterIncrement: 1, hold: 'none' },
});

const xbModel = (): XBSemanticModel => ({
  stateId: 'controller', executionOrder: ['gain', 'quantize'],
  operations: { gain: operation('gain'), quantize: operation('quantize', { destinationType: { kind: 'fixed', signed: true, wordLength: 16, fractionLength: 8 }, rounding: 'floor', overflow: 'saturate', mode: 'real-world-value' }) },
  signals: { 'gain:y': signal('gain:y', float32), 'quantize:y': signal('quantize:y', { kind: 'fixed', signed: true, wordLength: 16, fractionLength: 8 }) },
  mappings: [], solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 1 }, policy: { memory: 'reset', numericFault: 'escalate' },
});

const semanticModel = (): SemanticModel => ({
  tickMs: 10, safetyMode: false, safeStateId: null, rootLayerId: 'root',
  states: {
    controller: {
      id: 'controller', name: 'Controller', entrySource: '', duringSource: '', exitSource: '', enumName: 'SM_ST_CONTROLLER',
      parentStateId: null, layerId: 'root', depth: 0, priority: 1, activeSlot: 0, activityIndex: 0, terminal: false,
      ancestorStateIds: [], childLayerIds: [], internalTransitionIds: [], entryActions: [], duringActions: [], exitActions: [], xBridges: xbModel(),
    },
  },
  layers: {
    root: {
      id: 'root', name: 'Root', parentStateId: null, decomposition: 'OR', children: ['controller'], transitionIds: [], junctionIds: [],
      activeSlot: 0, defaultEntryId: 'controller', defaultEntryKind: 'state',
    },
  },
  junctions: {}, transitions: {}, transitionsBySource: {}, variables: {}, ioMappings: [], activeSlotCount: 1,
});

const scalarInputSignal = (id: string, sourceSignalId: string, numericType: XBNumericType = float32): XBSemanticSignal => ({
  ...signal(id, numericType), direction: 'input', sourceSignalId,
});

const scalarOperation = (id: string, type: string, inputSignalIds: readonly string[], outputSignalIds: readonly string[], parameters: XBSemanticOperation['parameters'] = {}, conversion: XBSemanticOperation['conversion'] = null): XBSemanticOperation => ({
  ...operation(id, conversion), type, inputSignalIds, outputSignalIds, parameters,
});

const statefulOperation = (id: string, type: string, inputSignalIds: readonly string[], outputSignalIds: readonly string[], initialValue: number): XBSemanticOperation => ({
  ...scalarOperation(id, type, inputSignalIds, outputSignalIds), directFeedthrough: false, stateful: true,
  state: {
    outputPhase: 'read-before-update', updatePhase: 'after-direct-feedthrough',
    slots: outputSignalIds.map((signalId) => ({
      id: `${signalId}$state`, role: signalId.slice(signalId.indexOf(':') + 1),
      signalId, numericType: float64, shape: scalar, initialValues: [initialValue],
    })),
  },
  schedule: { periodSubsteps: 1, offsetSubsteps: 0, initialCounter: 0, counterIncrement: 1, hold: 'none' },
});

const continuousSolverModel = (kind: 'euler' | 'rk4', integratorType: 'INTEGRATOR_CONTINUOUS' | 'Integrator' = 'INTEGRATOR_CONTINUOUS') => {
  const ir = semanticModel();
  const integrator = statefulOperation('integrator', integratorType, ['integrator:u'], ['integrator:y'], 0);
  const delay = { ...statefulOperation('delay', 'DELAY', ['delay:u'], ['delay:y'], 0), schedule: { periodSubsteps: 10, offsetSubsteps: 0, initialCounter: 0, counterIncrement: 1, hold: 'zero-order' as const } };
  const negative = scalarOperation('negative', 'GAIN', ['negative:u'], ['negative:y'], { gain: -1 });
  const derivative = scalarOperation('derivative', 'Sum', ['derivative:a', 'derivative:b'], ['derivative:y']);
  const downstream = scalarOperation('downstream', 'GAIN', ['downstream:u'], ['downstream:y'], { gain: 2 });
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
    mappings: [
      { variableId: 'u', signalId: 'input:y', blockId: 'input', portId: 'y', direction: 'in', numericType: float64 },
      { variableId: 'x', signalId: 'integrator:y', blockId: 'integrator', portId: 'y', direction: 'out', numericType: float64 },
      { variableId: 'd', signalId: 'delay:y', blockId: 'delay', portId: 'y', direction: 'out', numericType: float64 },
      { variableId: 'twice', signalId: 'downstream:y', blockId: 'downstream', portId: 'y', direction: 'out', numericType: float64 },
    ],
    solver: { kind, stepSeconds: 0.002, substepsPerTick: 5 },
    policy: { memory: 'reset', numericFault: 'escalate' },
  };
  return ir;
};

const kind = process.argv[2] as 'euler' | 'rk4' || 'euler';
const ir = continuousSolverModel(kind, 'INTEGRATOR_CONTINUOUS');

for (const file of generateCArtifacts(ir, { includeTestShims: true }).files) {
  if (file.name.endsWith('.c') || file.name.endsWith('.h')) {
    writeFileSync(join(outDir, file.name), file.content);
  }
}

const runtime = createXBRuntime(ir.states.controller.xBridges!);
const expected: number[][] = [];
for (let i = 0; i < 5; i++) {
  const data = { u: 1, x: 0, d: 0, twice: 0 };
  stepXBState(runtime, data);
  expected.push([Number(data.x), Number(data.d), Number(data.twice)]);
}
console.log('Interpreter expected:');
expected.forEach((row) => console.log(row.map((v) => v.toFixed(17)).join(',')));

writeFileSync(join(outDir, 'harness.c'), [
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
  '        printf("%.17g,%.17g,%.17g\\n", instance.data.x, instance.data.d, instance.data.twice);',
  '    }',
  '    return 0;',
  '}',
  '',
].join('\n'));

const executable = join(outDir, `xb_${kind}_solver.exe`);
execFileSync('gcc', [
  '-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Werror', '-I.',
  'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'sm_xbridges.c', 'mcal_dio_test_stubs.c', 'harness.c', '-lm', '-o', executable,
], { cwd: outDir, stdio: 'pipe' });
const actual = execFileSync(executable, [], { cwd: outDir, encoding: 'utf8' }).trim().split(/\r?\n/).map((line) => line.split(',').map(Number));
console.log('Generated C actual:');
actual.forEach((row) => console.log(row.map((v) => v.toFixed(17)).join(',')));

console.log(`Files written to ${outDir}`);
