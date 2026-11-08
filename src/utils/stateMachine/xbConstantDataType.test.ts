/**
 * Acceptance tests: selectable output data type for the X-Bridges Constant block.
 *
 * Contract (Simulink "Output data type" on the Constant block):
 *  - Parameter `output_type`, default 'auto' (inherit: unchanged legacy behaviour, no port dataType).
 *  - Allowed: 'auto' | 'float64' | 'float32' | 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'boolean'.
 *  - The output port carries `dataType` = output_type (undefined for 'auto'), so the semantic model, the
 *    interpreter and the generated C all use that type.
 *  - Simulation (BLOCK_LIBRARY execute): integers round to nearest and saturate to the type range,
 *    boolean is value != 0 ? 1 : 0, float32 is Math.fround, float64/auto unchanged.
 *  - Embedded validation: a value that is not exactly representable is an error, not a silent cast —
 *    XB_CONSTANT_VALUE_OUT_OF_RANGE (outside the integer range) and
 *    XB_CONSTANT_VALUE_NOT_REPRESENTABLE (fractional value for an integer type).
 *  - An unknown output_type is rejected with XB_CONSTANT_TYPE_INVALID.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import type { SemanticVariable } from './smSemanticModel';
import { DEFAULT_XB_EMBEDDED_LIMITS } from './xbEmbeddedProfile';
import type {
  XBNodeV1,
  XBParameterValue,
  XBPersistedModelV1,
  XBTargetCapabilities,
} from './xbModel';
import { buildXBSemanticModel } from './xbSemanticBuilder';
import { validateXBModel } from './xbSemanticValidator';
import { createXBRuntime, stepXBState } from './xbInterpreter';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import { hybridXBridgesFixture } from './smFixtures';

const target: XBTargetCapabilities = {
  supportsFloat16: false,
  supportsFloat32: true,
  supportsFloat64: true,
  supportsMathLibrary: true,
  maxVectorLength: 16,
  maxMatrixDimension: 8,
  embeddedLimits: DEFAULT_XB_EMBEDDED_LIMITS,
};

const variables: Readonly<Record<string, SemanticVariable>> = {};

/** Converts an editor block (as the canvas creates it) into a persisted X-Bridges node. */
const fromLibrary = (id: string, params: Record<string, unknown>): XBNodeV1 => {
  const block = BLOCK_LIBRARY.Constant(id, params);
  const portOf = (port: (typeof block.outputs)[number]) => ({
    id: port.id,
    direction: port.direction,
    shape: 'scalar',
    ...(port.dataType !== undefined ? { dataType: port.dataType } : {}),
  });
  return {
    id,
    type: 'Constant',
    parameters: {
      ...(block.params as Record<string, XBParameterValue>),
      inputs: [],
      outputs: block.outputs.map(portOf),
    },
  };
};

const model = (nodes: XBNodeV1[]): XBPersistedModelV1 => ({
  schemaVersion: 1,
  nodes,
  edges: [],
  mappings: [],
  solver: { kind: 'euler', stepSeconds: 0.01 },
  policy: { memory: 'reset', numericFault: 'escalate' },
});

const build = (nodes: XBNodeV1[]) => buildXBSemanticModel({
  stateId: 'controller',
  model: model(nodes),
  variables,
  target,
  baseTickMs: 10,
});

const codes = (nodes: XBNodeV1[]) =>
  validateXBModel(model(nodes), variables, target).map((d) => d.code);

describe('Constant block output data type — block definition', () => {
  it('defaults to output_type auto with no port dataType (legacy models unchanged)', () => {
    const block = BLOCK_LIBRARY.Constant('c', { value: 3 });
    expect(block.params.output_type).toBe('auto');
    expect(block.outputs[0].dataType).toBeUndefined();
  });

  it.each(['float64', 'float32', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'boolean'])(
    'sets the output port dataType to %s',
    (type) => {
      const block = BLOCK_LIBRARY.Constant('c', { value: 1, output_type: type });
      expect(block.params.output_type).toBe(type);
      expect(block.outputs[0].dataType).toBe(type);
    },
  );

  it('keeps the value parameter unchanged when a type is chosen', () => {
    const block = BLOCK_LIBRARY.Constant('c', { value: 7, output_type: 'int16' });
    expect(block.params.value).toBe(7);
  });
});

describe('Constant block output data type — simulation', () => {
  const run = (value: unknown, output_type: string) => {
    const block = BLOCK_LIBRARY.Constant('c', { value, output_type });
    return block.execute([], block.params, undefined, 0).outputs[0];
  };

  it('auto and float64 return the value unchanged', () => {
    expect(run(2.75, 'auto')).toBe(2.75);
    expect(run(2.75, 'float64')).toBe(2.75);
  });

  it('float32 rounds to single precision', () => {
    expect(run(0.1, 'float32')).toBe(Math.fround(0.1));
  });

  it('integer types round to nearest and saturate', () => {
    expect(run(2.6, 'int16')).toBe(3);
    expect(run(-2.6, 'int16')).toBe(-3);
    expect(run(300, 'int8')).toBe(127);
    expect(run(-300, 'int8')).toBe(-128);
    expect(run(-1, 'uint8')).toBe(0);
    expect(run(70000, 'uint16')).toBe(65535);
    expect(run(5, 'uint32')).toBe(5);
  });

  it('boolean is 1 for any non-zero value and 0 for zero', () => {
    expect(run(3, 'boolean')).toBe(1);
    expect(run(-0.5, 'boolean')).toBe(1);
    expect(run(0, 'boolean')).toBe(0);
  });

  it('applies the type element-wise to vector values', () => {
    expect(run('[1.4 300 -2]', 'int8')).toEqual([1, 127, -2]);
  });
});

describe('Constant block output data type — semantic model', () => {
  it('types the output signal from output_type', () => {
    const result = build([
      fromLibrary('k8', { value: 5, output_type: 'int8' }),
      fromLibrary('ku16', { value: 500, output_type: 'uint16' }),
      fromLibrary('kb', { value: 1, output_type: 'boolean' }),
      fromLibrary('kd', { value: 1.5, output_type: 'float64' }),
      fromLibrary('kf', { value: 1.5, output_type: 'float32' }),
    ]);
    expect(result.diagnostics).toEqual([]);
    const typeOf = (id: string) => result.ir!.signals[`${id}:out`].numericType;
    expect(typeOf('k8')).toEqual({ kind: 'fixed', signed: true, wordLength: 8, fractionLength: 0 });
    expect(typeOf('ku16')).toEqual({ kind: 'fixed', signed: false, wordLength: 16, fractionLength: 0 });
    expect(typeOf('kb')).toEqual({ kind: 'boolean' });
    expect(typeOf('kd')).toEqual({ kind: 'float64' });
    expect(typeOf('kf')).toEqual({ kind: 'float32' });
  });

  it('auto keeps the legacy inherited type', () => {
    const legacy = build([{
      id: 'k',
      type: 'Constant',
      parameters: { value: 2, inputs: [], outputs: [{ id: 'out', direction: 'output', shape: 'scalar' }] },
    }]);
    const auto = build([fromLibrary('k', { value: 2, output_type: 'auto' })]);
    expect(auto.diagnostics).toEqual([]);
    expect(auto.ir!.signals['k:out'].numericType).toEqual(legacy.ir!.signals['k:out'].numericType);
  });

  it('interpreter produces the typed value', () => {
    const result = build([
      fromLibrary('k8', { value: -7, output_type: 'int8' }),
      fromLibrary('kb', { value: 1, output_type: 'boolean' }),
    ]);
    expect(result.diagnostics).toEqual([]);
    const runtime = createXBRuntime(result.ir!);
    stepXBState(runtime, {});
    expect(runtime.signals['k8:out'].map(Number)).toEqual([-7]);
    expect(runtime.signals['kb:out'].map(Number)).toEqual([1]);
  });
});

describe('Constant block output data type — embedded validation', () => {
  it('accepts values representable in the chosen type', () => {
    expect(codes([
      fromLibrary('a', { value: 127, output_type: 'int8' }),
      fromLibrary('b', { value: 0, output_type: 'uint8' }),
      fromLibrary('c', { value: '[1 2 3]', output_type: 'int16' }),
      fromLibrary('d', { value: 0.25, output_type: 'float32' }),
    ])).not.toEqual(expect.arrayContaining([
      'XB_CONSTANT_VALUE_OUT_OF_RANGE',
      'XB_CONSTANT_VALUE_NOT_REPRESENTABLE',
      'XB_CONSTANT_TYPE_INVALID',
    ]));
  });

  it('rejects a value outside the integer range', () => {
    expect(codes([fromLibrary('a', { value: 300, output_type: 'int8' })]))
      .toContain('XB_CONSTANT_VALUE_OUT_OF_RANGE');
    expect(codes([fromLibrary('b', { value: -1, output_type: 'uint16' })]))
      .toContain('XB_CONSTANT_VALUE_OUT_OF_RANGE');
  });

  it('rejects a fractional value for an integer type', () => {
    expect(codes([fromLibrary('a', { value: 2.5, output_type: 'uint8' })]))
      .toContain('XB_CONSTANT_VALUE_NOT_REPRESENTABLE');
  });

  it('checks every element of a vector value', () => {
    expect(codes([fromLibrary('a', { value: '[1 2 999]', output_type: 'int8' })]))
      .toContain('XB_CONSTANT_VALUE_OUT_OF_RANGE');
  });

  it('rejects an unknown output_type', () => {
    expect(codes([{
      id: 'a',
      type: 'Constant',
      parameters: {
        value: 1,
        output_type: 'int128',
        inputs: [],
        outputs: [{ id: 'out', direction: 'output', shape: 'scalar' }],
      },
    }])).toContain('XB_CONSTANT_TYPE_INVALID');
  });
});

describe('Constant block output data type — generated C', () => {
  const smModel = (nodes: XBNodeV1[]) => {
    const m = hybridXBridgesFixture();
    m.states[1].xBridgesModel = model(nodes);
    return m;
  };
  const generate = (nodes: XBNodeV1[]) => {
    const result = buildSemanticModel(smModel(nodes));
    expect(result.diagnostics).toEqual([]);
    return generateCArtifacts(result.ir!, { includeTestShims: true }).files;
  };

  it('declares typed storage and compiles as strict C99', () => {
    const files = generate([
      fromLibrary('k8', { value: -7, output_type: 'int8' }),
      fromLibrary('ku16', { value: 500, output_type: 'uint16' }),
      fromLibrary('kb', { value: 1, output_type: 'boolean' }),
    ]);
    const all = files.map((f) => f.content).join('\n');
    expect(all).toMatch(/\bint8_t\b/);
    expect(all).toMatch(/\buint16_t\b/);

    const workspace = createGeneratedCodeTestWorkspace('xb-constant-data-type');
    try {
      for (const file of files) writeFileSync(join(workspace.directory, file.name), file.content);
      for (const file of files.filter((f) => f.name.endsWith('.c'))) {
        execFileSync('gcc', ['-std=c99', '-Wall', '-Wextra', '-Werror', '-fsyntax-only', file.name], {
          cwd: workspace.directory,
          stdio: 'pipe',
        });
      }
    } finally {
      workspace.cleanup();
    }
  });

  it('a model without output_type generates the same code as before', () => {
    const legacy = generate([{
      id: 'k',
      type: 'Constant',
      parameters: { value: 2, inputs: [], outputs: [{ id: 'out', direction: 'output', shape: 'scalar' }] },
    }]);
    const auto = generate([fromLibrary('k', { value: 2 })]);
    const core = (files: typeof legacy) => files.find((f) => f.name === 'sm_core.c')!.content;
    expect(core(auto)).toBe(core(legacy));
  });
});
