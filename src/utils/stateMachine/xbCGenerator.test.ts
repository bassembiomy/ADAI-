import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
  solver: { kind: 'euler', substepsPerTick: 1 },
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

describe('X-Bridges C99 static storage', () => {
  it('renders exact scalar, vector, matrix, and explicit fault storage', () => {
    const header = renderXBHeader(semanticModel());

    expect(header).toContain('typedef struct {');
    expect(header).toContain('float gain_y;');
    expect(header).toContain('int16_t quantize_y;');
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
      },
    };

    const header = renderXBHeader(ir);
    expect(header).toContain('float quantize_error;');
    expect(header).toContain('bool quantize_error_fault;');
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
